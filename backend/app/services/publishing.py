"""Social media publishing service for direct platform uploads."""
import json, logging, httpx, os, tempfile, re
from typing import Any
from app.config import settings

logger = logging.getLogger(__name__)

# Platform configurations
PLATFORMS = {
    "youtube_shorts": {
        "label": "YouTube Shorts",
        "upload_url": "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status",
        "auth_header": "Authorization",
        "auth_prefix": "Bearer ",
    },
    "tiktok": {
        "label": "TikTok",
        "upload_url": "https://open-api.tiktok.com/share/video/upload/",
        "auth_header": "access-token",
        "auth_prefix": "",
    },
    "instagram_reels": {
        "label": "Instagram Reels",
        "upload_url": "https://graph.facebook.com/v18.0/{ig_user_id}/media",
        "auth_header": "Authorization",
        "auth_prefix": "Bearer ",
    },
}

async def publish_clip(
    clip_file_url: str,
    platform: str,
    title: str,
    description: str,
    hashtags: str,
    access_token: str,
    platform_user_id: str | None = None,
) -> dict[str, Any]:
    """Publish a clip to a social media platform."""
    
    if platform not in PLATFORMS:
        return {"success": False, "error": f"Unsupported platform: {platform}"}
    
    cfg = PLATFORMS[platform]
    
    # Download clip to temp file
    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    try:
        tmp.close()
        # Download from presigned URL
        async with httpx.AsyncClient(timeout=60.0) as download_client:
            resp = await download_client.get(clip_file_url)
            resp.raise_for_status()
            with open(tmp.name, "wb") as f:
                f.write(resp.content)
        
        tags = " ".join(
            t.strip().lstrip("#") for t in re.split(r'[\s,]+', hashtags) if t.strip()
        )
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            if platform == "youtube_shorts":
                return await _publish_youtube(client, cfg, tmp.name, title, description, tags, access_token)
            elif platform == "tiktok":
                return await _publish_tiktok(client, cfg, tmp.name, title, description, tags, access_token)
            elif platform == "instagram_reels":
                return await _publish_instagram(client, cfg, tmp.name, title, description, tags, access_token, platform_user_id)
    finally:
        os.unlink(tmp.name)
    
    return {"success": False, "error": "Unknown platform"}


async def _publish_youtube(client, cfg, file_path, title, description, tags, token):
    """Upload to YouTube."""
    try:
        with open(file_path, "rb") as f:
            files = {"file": ("video.mp4", f, "video/mp4")}
            data = {
                "snippet": json.dumps({
                    "title": title[:100],
                    "description": f"{description}\n\n{tags}",
                    "tags": tags.split(),
                    "categoryId": "22",  # Entertainment
                }),
                "status": json.dumps({
                    "privacyStatus": "public",
                    "selfDeclaredMadeForKids": False,
                }),
            }
            headers = {"Authorization": f"Bearer {token}"}
            resp = await client.post(cfg["upload_url"], data=data, files=files, headers=headers)
            result = resp.json()
            if resp.status_code in (200, 201):
                video_id = result.get("id", "")
                return {
                    "success": True,
                    "platform_url": f"https://youtu.be/{video_id}",
                    "platform_id": video_id,
                }
            return {"success": False, "error": result.get("error", {}).get("message", str(resp.text))}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def _publish_tiktok(client, cfg, file_path, title, description, tags, token):
    """Upload to TikTok."""
    try:
        headers = {"access-token": token}
        # Step 1: Initialize upload
        init_resp = await client.post(
            "https://open-api.tiktok.com/share/video/upload/init/",
            json={"source_info": {"source": "FILE_UPLOAD"}},
            headers=headers,
        )
        init_data = init_resp.json()
        upload_url = init_data.get("data", {}).get("upload_url")
        if not upload_url:
            return {"success": False, "error": "Failed to init TikTok upload"}
        
        # Step 2: Upload file
        with open(file_path, "rb") as f:
            upload_resp = await client.put(upload_url, content=f.read())
            if upload_resp.status_code != 200:
                return {"success": False, "error": "TikTok upload failed"}
        
        return {"success": True, "platform_url": "", "platform_id": init_data.get("data", {}).get("publish_id", "")}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def _publish_instagram(client, cfg, file_path, title, description, tags, token, ig_user_id):
    """Upload to Instagram Reels."""
    try:
        if not ig_user_id:
            return {"success": False, "error": "Instagram user ID required"}
        headers = {"Authorization": f"Bearer {token}"}
        
        # Step 1: Create media container
        with open(file_path, "rb") as f:
            files = {"video": ("reel.mp4", f, "video/mp4")}
            data = {
                "media_type": "REELS",
                "caption": f"{title}\n\n{description}\n\n{tags}",
            }
            create_resp = await client.post(
                f"https://graph.facebook.com/v18.0/{ig_user_id}/media",
                data=data, files=files, headers=headers,
            )
            create_data = create_resp.json()
            container_id = create_data.get("id")
            if not container_id:
                return {"success": False, "error": str(create_data)}
            
            # Step 2: Publish container
            pub_resp = await client.post(
                f"https://graph.facebook.com/v18.0/{ig_user_id}/media_publish",
                json={"creation_id": container_id},
                headers=headers,
            )
            pub_data = pub_resp.json()
            return {
                "success": True,
                "platform_url": f"https://instagram.com/reel/{pub_data.get('id', '')}",
                "platform_id": pub_data.get("id", ""),
            }
    except Exception as e:
        return {"success": False, "error": str(e)}
