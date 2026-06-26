"""
MinIO to Supabase Storage migration script.
- Uses x-upsert to safely resume (already uploaded files are skipped by Supabase)
- Small files (<10MB) are batched with 5 parallel workers
- Large files (>=10MB) are uploaded sequentially to avoid timeout issues
"""
import os
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv
from minio import Minio
import httpx

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_STORAGE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
BUCKET = "clipforge-media"
SMALL_FILE_THRESHOLD = 10 * 1024 * 1024  # 10 MB

AUTH_HEADERS = {
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "apikey": SUPABASE_KEY,
}


def upload_object(local_client, obj_name, size):
    try:
        import mimetypes
        content_type, _ = mimetypes.guess_type(obj_name)
        if not content_type:
            content_type = "application/octet-stream"

        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = os.path.join(tmp_dir, "file")
            local_client.fget_object(BUCKET, obj_name, tmp_path)
            with open(tmp_path, "rb") as f:
                data = f.read()

        with httpx.Client(headers=AUTH_HEADERS, timeout=None) as client:
            resp = client.post(
                f"{SUPABASE_URL}/object/{BUCKET}/{obj_name}",
                content=data,
                headers={"Content-Type": content_type, "x-upsert": "true"},
            )
            if resp.status_code == 200:
                print(f"  ✓ {obj_name} ({size // 1024}KB)")
                return True
            else:
                print(f"  ✗ {obj_name}: {resp.status_code} - {resp.text[:120]}")
                return False
    except Exception as e:
        print(f"  ✗ {obj_name}: {e}")
        return False


def main():
    print("=== MinIO → Supabase Storage Migration ===\n")

    local_client = Minio(
        "localhost:9000",
        access_key="clipforge",
        secret_key="clipforge_dev",
        secure=False,
    )

    if not local_client.bucket_exists(BUCKET):
        print(f"Local bucket '{BUCKET}' not found. Exiting.")
        return

    objects = list(local_client.list_objects(BUCKET, recursive=True))
    print(f"Found {len(objects)} objects to migrate.\n")

    # Ensure remote bucket exists
    with httpx.Client(headers=AUTH_HEADERS, timeout=30) as client:
        r = client.get(f"{SUPABASE_URL}/bucket/{BUCKET}")
        if r.status_code in (404, 400):
            client.post(f"{SUPABASE_URL}/bucket",
                        json={"id": BUCKET, "name": BUCKET, "public": True})
            print(f"Created remote bucket: {BUCKET}\n")
        else:
            print(f"Remote bucket '{BUCKET}' already exists.\n")

    small = [(o.object_name, o.size) for o in objects if o.size < SMALL_FILE_THRESHOLD]
    large = [(o.object_name, o.size) for o in objects if o.size >= SMALL_FILE_THRESHOLD]

    print(f"Small files (<10MB): {len(small)}")
    print(f"Large files (>=10MB): {len(large)}\n")

    success = 0
    failed = 0

    # --- Small files: 5 parallel workers ---
    print("--- Uploading small files in parallel (5 workers) ---")
    with ThreadPoolExecutor(max_workers=5) as pool:
        futs = {pool.submit(upload_object, local_client, name, size): name
                for name, size in small}
        for fut in as_completed(futs):
            if fut.result():
                success += 1
            else:
                failed += 1

    # --- Large files: sequential ---
    print(f"\n--- Uploading large files sequentially ({len(large)} files) ---")
    for name, size in large:
        print(f"Uploading {name} ({size // (1024*1024)}MB)...")
        if upload_object(local_client, name, size):
            success += 1
        else:
            failed += 1

    print(f"\n=== Done: {success} uploaded, {failed} failed (out of {len(objects)}) ===")


if __name__ == "__main__":
    main()
