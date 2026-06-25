from io import BytesIO
from typing import Optional

from minio import Minio
from minio.error import S3Error

from app.config import settings

_client: Optional[Minio] = None


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


def ensure_bucket() -> None:
    client = get_client()
    bucket = settings.MINIO_BUCKET
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)


def upload_file(file_path: str, object_name: str) -> str:
    client = get_client()
    client.fput_object(settings.MINIO_BUCKET, object_name, file_path)
    return object_name


def upload_bytes(
    data: bytes, object_name: str, content_type: str = "application/octet-stream"
) -> str:
    client = get_client()
    stream = BytesIO(data)
    length = len(data)
    client.put_object(settings.MINIO_BUCKET, object_name, stream, length, content_type=content_type)
    return object_name


from datetime import timedelta

def get_presigned_url(object_name: str, expires: int = 3600) -> str:
    client = get_client()
    return client.presigned_get_object(
        settings.MINIO_BUCKET, object_name, expires=timedelta(seconds=expires)
    )


def get_presigned_upload_url(object_name: str, expires: int = 3600) -> str:
    client = get_client()
    return client.presigned_put_object(
        settings.MINIO_BUCKET, object_name, expires=timedelta(seconds=expires)
    )


def delete_file(object_name: str) -> None:
    client = get_client()
    try:
        client.remove_object(settings.MINIO_BUCKET, object_name)
    except S3Error:
        pass


def delete_prefix(prefix: str) -> None:
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
    client = get_client()
    client.fget_object(settings.MINIO_BUCKET, object_name, file_path)
