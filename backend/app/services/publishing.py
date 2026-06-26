"""Social media publishing service for direct platform uploads."""
import json
import logging
import os
import re
import tempfile
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_REFRESH_TOKEN_PREFIXES = ("1//",)


async def _resolve_token(token: str, platform: str, client_id: str | None = None, client_secret: str | None = None) -> str:
    """Exchange a refresh token for an access token if needed.
    YouTube refresh tokens start with '1//'. Auto-exchanges for short-lived tokens.
    Returns a fresh access token on success, or raises ValueError on failure.
    """
    if platform == "youtube_shorts" and any(token.startswith(p) for p in _REFRESH_TOKEN_PREFIXES):
        cid = client_id or getattr(settings, "YOUTUBE_CLIENT_ID", None)
        csec = client_secret or getattr(settings, "YOUTUBE_CLIENT_SECRET", None)
        if not cid or not csec:
            raise ValueError("YouTube refresh token requires Client ID and Client Secret. Add them in Settings → Connected Accounts.")
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "client_id": cid,
                        "client_secret": csec,
                        "refresh_token": token,
                        "grant_type": "refresh_token",
                    },
                )
                if resp.status_code != 200:
                    err_body = await resp.aread()
                    raise ValueError(f"Google OAuth token exchange failed ({resp.status_code}): {err_body.decode(errors='replace')[:200]}")
                data = resp.json()
                new_token = data.get("access_token", "")
                if not new_token:
                    raise ValueError("Google OAuth returned no access_token")
                logger.info("Exchanged YouTube refresh token for access token successfully")
                return new_token
        except ValueError:
            raise
        except Exception as e:
            raise ValueError(f"Failed to exchange YouTube refresh token: {e}")
    return token

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
    "linkedin": {
        "label": "LinkedIn Video",
        "upload_url": "https://api.linkedin.com/rest/videos",
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
    client_id: str | None = None,
    client_secret: str | None = None,
    privacy: str = "public",
) -> dict[str, Any]:
    """Publish a clip to a social media platform."""

    if platform not in PLATFORMS:
        return {"success": False, "error": f"Unsupported platform: {platform}"}

    cfg = PLATFORMS[platform]

    # Resolve token — exchange refresh token for access token if needed
    resolved_token = await _resolve_token(access_token, platform, client_id, client_secret)

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
                return await _publish_youtube(client, cfg, tmp.name, title, description, tags, resolved_token, privacy)
            elif platform == "tiktok":
                return await _publish_tiktok(client, cfg, tmp.name, title, description, tags, resolved_token)
            elif platform == "instagram_reels":
                return await _publish_instagram(client, cfg, tmp.name, title, description, tags, resolved_token, platform_user_id)
            elif platform == "linkedin":
                return await _publish_linkedin(client, cfg, tmp.name, title, description, tags, resolved_token)
    finally:
        os.unlink(tmp.name)

    return {"success": False, "error": "Unknown platform"}


async def _publish_youtube(client, cfg, file_path, title, description, tags, token, privacy="public"):
    """Upload to YouTube as a Short."""
    try:
        with open(file_path, "rb") as f:
            # Append #Shorts for proper Shorts classification
            short_title = (title[:80] + " #Shorts") if not title.lower().endswith("#shorts") else title[:100]
            full_description = description or ""
            if tags:
                tag_list = [t.strip() for t in tags.split() if t.strip()]
                if tag_list:
                    full_description += f"\n\n{', '.join('#' + t for t in tag_list)}"
            # YouTube API expects single metadata JSON + video file (2 parts total)
            metadata = json.dumps({
                "snippet": {
                    "title": short_title,
                    "description": full_description[:5000],
                    "tags": tags.split() if tags else ["Shorts"],
                    "categoryId": "22",
                },
                "status": {
                    "privacyStatus": privacy,
                    "selfDeclaredMadeForKids": False,
                },
            })
            files = {
                "metadata": ("metadata.json", metadata.encode(), "application/json; charset=UTF-8"),
                "file": ("video.mp4", f, "video/mp4"),
            }
            headers = {"Authorization": f"Bearer {token}"}
            resp = await client.post(cfg["upload_url"], files=files, headers=headers)
            if resp.status_code in (200, 201):
                try:
                    result = resp.json()
                    video_id = result.get("id", "")
                    return {
                        "success": True,
                        "platform_url": f"https://youtu.be/{video_id}",
                        "platform_id": video_id,
                    }
                except Exception:
                    return {"success": False, "error": f"YouTube returned {resp.status_code} with non-JSON response"}
            elif resp.status_code in (401, 403):
                return {"success": False, "error": "YouTube rejected the access token. It may be expired or invalid. Reconnect your account in Settings."}
            else:
                body = await resp.aread()
                body_text = body.decode(errors="replace")[:500]
                try:
                    result = json.loads(body_text)
                    return {"success": False, "error": result.get("error", {}).get("message", f"YouTube API error ({resp.status_code}): {body_text}")}
                except Exception:
                    return {"success": False, "error": f"YouTube API returned {resp.status_code}: {body_text}"}
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


async def _publish_linkedin(client, cfg, file_path, title, description, tags, token):
    """Upload to LinkedIn Video (2-step upload + post creation)."""
    try:
        headers = {
            "Authorization": f"Bearer {token}",
            "LinkedIn-Version": "202401",
            "X-Restli-Protocol-Version": "2.0.0",
            "Content-Type": "application/json",
        }

        owner = f"urn:li:person:{token.split(':')[-1] if ':' in token else 'me'}"

        # Step 1: Register upload
        register_payload = {
            "initializeUploadRequest": {
                "owner": owner,
            }
        }
        register_resp = await client.post(
            "https://api.linkedin.com/rest/videos",
            json=register_payload,
            headers=headers,
        )
        if register_resp.status_code not in (200, 201):
            return {"success": False, "error": f"LinkedIn upload registration failed: {register_resp.text}"}
        register_data = register_resp.json()
        upload_url = (
            register_data.get("value", {})
            .get("uploadMechanism", {})
            .get("com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest", {})
            .get("uploadUrl")
        )
        video_urn = register_data.get("value", {}).get("video", "")
        if not upload_url or not video_urn:
            return {"success": False, "error": "LinkedIn upload URL or URN missing from registration response"}

        # Step 2: Upload binary
        with open(file_path, "rb") as f:
            upload_headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "video/mp4",
            }
            upload_resp = await client.put(upload_url, content=f.read(), headers=upload_headers)
            if upload_resp.status_code not in (200, 201):
                return {"success": False, "error": f"LinkedIn binary upload failed: {upload_resp.text}"}

        # Step 3: Create post
        post_payload = {
            "author": owner,
            "lifecycleState": "PUBLISHED",
            "visibility": "PUBLIC",
            "content": {
                "media": {
                    "title": title[:100],
                    "id": video_urn,
                }
            },
            "commentary": f"{description}\n\n{tags}".strip(),
        }
        post_headers = {**headers, "Content-Type": "application/json"}
        post_resp = await client.post(
            "https://api.linkedin.com/rest/posts",
            json=post_payload,
            headers=post_headers,
        )
        if post_resp.status_code not in (200, 201):
            return {"success": False, "error": f"LinkedIn post creation failed: {post_resp.text}"}

        post_data = post_resp.json()
        post_id = post_data.get("id", "")
        return {
            "success": True,
            "platform_url": f"https://linkedin.com/feed/update/{post_id}",
            "platform_id": post_id,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
