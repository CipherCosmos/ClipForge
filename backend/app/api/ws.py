"""WebSocket endpoint for real-time pipeline progress streaming."""

import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter()


class ConnectionManager:
    """Manages WebSocket connections per video_id."""

    def __init__(self):
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, video_id: str, websocket: WebSocket):
        await websocket.accept()
        if video_id not in self._connections:
            self._connections[video_id] = []
        self._connections[video_id].append(websocket)
        logger.debug("WebSocket connected for video %s", video_id)

    def disconnect(self, video_id: str, websocket: WebSocket):
        if video_id in self._connections:
            self._connections[video_id] = [
                ws for ws in self._connections[video_id] if ws != websocket
            ]
            if not self._connections[video_id]:
                del self._connections[video_id]

    async def broadcast_progress(
        self,
        video_id: str,
        job_type: str,
        progress: float,
        status: str,
        message: str = "",
    ):
        """Send progress update to all connected clients for a video."""
        if video_id not in self._connections:
            return

        payload = json.dumps(
            {
                "type": "progress",
                "job_type": job_type,
                "progress": progress,
                "status": status,
                "message": message,
            }
        )

        stale = []
        for ws in self._connections[video_id]:
            try:
                await ws.send_text(payload)
            except Exception:
                stale.append(ws)

        for ws in stale:
            self.disconnect(video_id, ws)


manager = ConnectionManager()


def broadcast_sync(video_id: str, job_type: str, progress: float, status: str, message: str = ""):
    """Synchronous wrapper for Celery workers to broadcast progress."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(
                manager.broadcast_progress(video_id, job_type, progress, status, message)
            )
        else:
            loop.run_until_complete(
                manager.broadcast_progress(video_id, job_type, progress, status, message)
            )
    except Exception as e:
        logger.debug("Broadcast failed: %s", e)


@router.websocket("/ws/progress/{video_id}")
async def websocket_progress(
    websocket: WebSocket,
    video_id: str,
    token: Optional[str] = Query(None),
):
    """WebSocket endpoint for real-time pipeline progress.

    Connect with: ws://host:8000/ws/progress/{video_id}?token={jwt}
    Receives JSON messages: {"type": "progress", "job_type": "...", "progress": 0.5, ...}
    """
    if not token:
        await websocket.close(code=4001)
        return

    try:
        from app.core.security import decode_token

        payload = decode_token(token)
        if payload is None:
            await websocket.close(code=4001)
            return
    except Exception:
        await websocket.close(code=4001)
        return

    await manager.connect(video_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(video_id, websocket)
    except Exception:
        manager.disconnect(video_id, websocket)
