# Workers are imported directly where needed (e.g. from app.workers.render import run_render)
# This avoids pulling heavy dependencies (cv2, scenedetect) at import time.
