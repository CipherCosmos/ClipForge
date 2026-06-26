from io import BytesIO
from typing import Optional, List
import logging
import time
from datetime import timedelta
import httpx
from minio import Minio
from minio.error import S3Error

from app.config import settings

logger = logging.getLogger(__name__)

_client: Optional[Minio] = None
_supabase_http: Optional[httpx.Client] = None
_presigned_cache: dict[str, tuple[str, float]] = {}
_PRESIGNED_CACHE_TTL = 1800


def get_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=False,
        )
    return _client


minio_client: Minio = get_client()


def get_supabase_http() -> httpx.Client:
    global _supabase_http
    if _supabase_http is None:
        headers = {
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        }
        _supabase_http = httpx.Client(headers=headers, timeout=None)
    return _supabase_http


def _supabase_request(method: str, path: str, **kwargs) -> httpx.Response:
    url = f"{settings.SUPABASE_STORAGE_URL}/{path.lstrip('/')}"
    headers = {}
    if "headers" in kwargs:
        headers.update(kwargs["headers"])
        del kwargs["headers"]
    client = get_supabase_http()
    return client.request(method, url, headers=headers, **kwargs)


def ensure_bucket() -> None:
    if settings.SUPABASE_STORAGE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
        bucket = settings.MINIO_BUCKET
        try:
            resp = _supabase_request("GET", f"bucket/{bucket}")
            if resp.status_code in (404, 400):
                _supabase_request(
                    "POST",
                    "bucket",
                    json={"id": bucket, "name": bucket, "public": True},
                )
        except Exception as e:
            logger.error("Failed to ensure Supabase bucket exists: %s", e)
    else:
        client = get_client()
        bucket = settings.MINIO_BUCKET
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)


def upload_file(file_path: str, object_name: str) -> str:
    if settings.SUPABASE_STORAGE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
        bucket = settings.MINIO_BUCKET
        import mimetypes

        content_type, _ = mimetypes.guess_type(file_path)
        if not content_type:
            content_type = "application/octet-stream"

        with open(file_path, "rb") as f:
            data = f.read()

        resp = _supabase_request(
            "POST",
            f"object/{bucket}/{object_name}",
            content=data,
            headers={"Content-Type": content_type},
        )
        if resp.status_code != 200:
            raise RuntimeError(
                f"Failed to upload to Supabase: {resp.status_code} - {resp.text}"
            )
        return object_name
    else:
        client = get_client()
        client.fput_object(settings.MINIO_BUCKET, object_name, file_path)
        return object_name


def upload_bytes(
    data: bytes, object_name: str, content_type: str = "application/octet-stream"
) -> str:
    if settings.SUPABASE_STORAGE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
        bucket = settings.MINIO_BUCKET
        resp = _supabase_request(
            "POST",
            f"object/{bucket}/{object_name}",
            content=data,
            headers={"Content-Type": content_type},
        )
        if resp.status_code != 200:
            raise RuntimeError(
                f"Failed to upload bytes to Supabase: {resp.status_code} - {resp.text}"
            )
        return object_name
    else:
        client = get_client()
        stream = BytesIO(data)
        length = len(data)
        client.put_object(
            settings.MINIO_BUCKET,
            object_name,
            stream,
            length,
            content_type=content_type,
        )
        return object_name


def get_presigned_url(object_name: str, expires: int = 3600) -> str:
    now = time.time()
    cached = _presigned_cache.get(object_name)
    if cached and (now - cached[1]) < _PRESIGNED_CACHE_TTL:
        return cached[0]

    if settings.SUPABASE_STORAGE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
        bucket = settings.MINIO_BUCKET
        for attempt in range(3):
            resp = _supabase_request(
                "POST",
                f"object/sign/{bucket}/{object_name}",
                json={"expiresIn": min(expires, 3600)},
            )
            if resp.status_code == 200:
                data = resp.json()
                from urllib.parse import urlparse
                parsed = urlparse(settings.SUPABASE_STORAGE_URL)
                url = f"{parsed.scheme}://{parsed.netloc}{data['signedURL']}"
                _presigned_cache[object_name] = (url, now)
                return url
            if attempt < 2 and resp.status_code in (404, 429):
                time.sleep(0.5 * (attempt + 1))
                continue
            break
        logger.warning("Failed to sign URL on Supabase: %s", resp.text)
        url = f"{settings.SUPABASE_STORAGE_URL}/object/public/{bucket}/{object_name}"
    else:
        client = get_client()
        url = client.presigned_get_object(
            settings.MINIO_BUCKET, object_name, expires=timedelta(seconds=expires)
        )

    _presigned_cache[object_name] = (url, now)
    return url


def get_presigned_upload_url(object_name: str, expires: int = 3600) -> str:
    if settings.SUPABASE_STORAGE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
        bucket = settings.MINIO_BUCKET
        resp = _supabase_request(
            "POST", f"object/upload/sign/{bucket}/{object_name}"
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Failed to get upload URL: {resp.text}")
        data = resp.json()
        from urllib.parse import urlparse

        parsed = urlparse(settings.SUPABASE_STORAGE_URL)
        return f"{parsed.scheme}://{parsed.netloc}{data['url']}"
    else:
        client = get_client()
        return client.presigned_put_object(
            settings.MINIO_BUCKET, object_name, expires=timedelta(seconds=expires)
        )


def delete_file(object_name: str) -> None:
    if settings.SUPABASE_STORAGE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
        bucket = settings.MINIO_BUCKET
        _supabase_request("DELETE", f"object/{bucket}/{object_name}")
    else:
        client = get_client()
        try:
            client.remove_object(settings.MINIO_BUCKET, object_name)
        except S3Error:
            pass


def list_files(prefix: str) -> List[str]:
    if settings.SUPABASE_STORAGE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
        bucket = settings.MINIO_BUCKET
        resp = _supabase_request(
            "POST", f"object/list/{bucket}", json={"prefix": prefix}
        )
        if resp.status_code == 200:
            return [f"{prefix}{item['name']}" for item in resp.json()]
        return []
    else:
        client = get_client()
        try:
            objects = client.list_objects(settings.MINIO_BUCKET, prefix=prefix)
            return [obj.object_name for obj in objects]
        except Exception:
            return []


def delete_prefix(prefix: str) -> None:
    if settings.SUPABASE_STORAGE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
        bucket = settings.MINIO_BUCKET
        files = list_files(prefix)
        if files:
            _supabase_request(
                "DELETE", f"object/{bucket}", json={"prefixes": files}
            )
    else:
        client = get_client()
        try:
            objects = client.list_objects(
                settings.MINIO_BUCKET, prefix=prefix, recursive=True
            )
            for obj in objects:
                client.remove_object(settings.MINIO_BUCKET, obj.object_name)
        except S3Error:
            pass


def download_file(object_name: str, file_path: str) -> None:
    if settings.SUPABASE_STORAGE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
        bucket = settings.MINIO_BUCKET
        resp = _supabase_request("GET", f"object/{bucket}/{object_name}")
        if resp.status_code != 200:
            raise RuntimeError(
                f"Failed to download from Supabase: {resp.status_code} - {resp.text}"
            )
        with open(file_path, "wb") as f:
            f.write(resp.content)
    else:
        client = get_client()
        client.fget_object(settings.MINIO_BUCKET, object_name, file_path)
