"""Test every single API endpoint end-to-end.

Usage: python scripts/test_all_endpoints.py

Requires the backend to be running on http://localhost:8000.
Creates a test user, hits every endpoint, then cleans up.
"""

import sys
import uuid

import httpx

BASE = "http://localhost:8000"
API = f"{BASE}/api"

passed = 0
failed = 0


def test(
    method: str,
    path: str,
    token: str | None = None,
    json_body: dict | None = None,
    params: dict | None = None,
    expect: int | list[int] = 200,
    label: str = "",
):
    global passed, failed
    url = f"{BASE}{path}" if path.startswith("/") else f"{BASE}/{path}"
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        if method == "GET":
            r = httpx.get(url, headers=headers, params=params, timeout=10)
        elif method == "POST":
            r = httpx.post(url, headers=headers, json=json_body, params=params, timeout=30)
        elif method == "PUT":
            r = httpx.put(url, headers=headers, json=json_body, timeout=10)
        elif method == "PATCH":
            r = httpx.patch(url, headers=headers, json=json_body, timeout=10)
        elif method == "DELETE":
            r = httpx.delete(url, headers=headers, params=params, timeout=10)
        else:
            print(f"  UNSUPPORTED METHOD: {method}")
            return
        expected = expect if isinstance(expect, list) else [expect]
        status = "✓" if r.status_code in expected else "✗"
        if r.status_code in expected:
            passed += 1
        else:
            failed += 1
        label = label or path
        detail = ""
        if r.status_code not in expected and r.status_code >= 400:
            try:
                detail = r.json().get("detail", "")
            except Exception:
                detail = r.text[:100]
        print(f"  {status} {method:6s} {label:50s} {r.status_code} {detail}")
    except Exception as e:
        failed += 1
        print(f"  ✗ {method:6s} {label:50s} ERROR: {e}")


def main():
    global passed, failed
    print(f"\n{'=' * 70}")
    print("  ClipForge — Complete API Endpoint Test")
    print(f"  Server: {BASE}")
    print(f"{'=' * 70}\n")

    # ── Health (no auth) ──
    print("── Health ──")
    test("GET", "/health", expect=200)

    # ── Auth (no auth) ──
    print("\n── Auth (Public) ──")
    test(
        "POST",
        "/api/auth/register",
        json_body={"email": "test-endpoints@test.com", "password": "TestPass123!"},
        expect=[200, 201, 409],
    )
    test(
        "POST",
        "/api/auth/login",
        json_body={"email": "test-endpoints@test.com", "password": "TestPass123!"},
        label="/auth/login (get token)",
    )
    test("POST", "/api/auth/forgot-password", json_body={"email": "test-endpoints@test.com"})
    test("GET", "/api/videos/platforms", label="/videos/platforms (public)")

    # ── Login again to capture token ──
    r = httpx.post(
        f"{API}/auth/login",
        json={"email": "test-endpoints@test.com", "password": "TestPass123!"},
        timeout=10,
    )
    if r.status_code != 200:
        print("\n  LOGIN FAILED — cannot proceed with auth tests")
        sys.exit(1)
    data = r.json()
    token = data["access_token"]
    refresh_token = data.get("refresh_token", "")
    print("  ✓ Logged in, token acquired")

    # ── Auth (authenticated) ──
    print("\n── Auth (Authenticated) ──")
    test("GET", "/api/auth/me", token)
    test(
        "POST",
        "/api/auth/refresh",
        json_body={"refresh_token": refresh_token},
        expect=[200, 401],
        label="/auth/refresh",
    )
    test("POST", "/api/auth/logout", token)
    # Re-login after logout for remaining tests
    r = httpx.post(
        f"{API}/auth/login",
        json={"email": "test-endpoints@test.com", "password": "TestPass123!"},
        timeout=10,
    )
    token = r.json()["access_token"]

    # ── Settings ──
    print("\n── Settings ──")
    test("GET", "/api/settings", token)
    test("PUT", "/api/settings", token, json_body={"theme": "dark", "research_location": "US"})

    # ── Keys ──
    print("\n── API Keys ──")
    test("GET", "/api/keys", token)
    test("POST", "/api/keys/generate", token, json_body={"name": "Test Key"})
    test(
        "DELETE",
        f"/api/keys/{uuid.uuid4()}",
        token,
        expect=[401, 403, 404],
        label="/keys/{id} (revoke — expect 404)",
    )

    # ── Branding (public) ──
    print("\n── Branding ──")
    test("GET", "/api/branding/caption-styles")
    test("GET", "/api/branding/music")
    test("GET", "/api/branding/music/search", params={"query": "upbeat"})

    # ── Billing ──
    print("\n── Billing ──")
    test("GET", "/api/billing/plans", expect=[200, 501])
    test("GET", "/api/billing/subscription", token)
    test(
        "POST",
        "/api/billing/cancel",
        token,
        expect=[200, 400, 501],
        label="/billing/cancel (expect 200, 400, or 501 if no Stripe)",
    )

    # ── Videos ──
    print("\n── Videos ──")
    test("GET", "/api/videos", token)
    test(
        "GET", f"/api/videos/{uuid.uuid4()}", token, expect=404, label="/videos/{id} (non-existent)"
    )
    test(
        "DELETE",
        f"/api/videos/{uuid.uuid4()}",
        token,
        expect=404,
        label="/videos/{id} (delete non-existent)",
    )
    test(
        "POST",
        "/api/videos/batch-delete",
        token,
        json_body={"ids": [str(uuid.uuid4())]},
        expect=[200, 204, 207],
        label="/videos/batch-delete",
    )
    test(
        "POST",
        "/api/videos/import",
        token,
        json_body={
            "source_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "platform": "youtube_shorts",
        },
        expect=[200, 201, 400, 409, 422],
        label="/videos/import (may be duplicate or fail)",
    )

    # ── Transcript (needs video_id — expect 404) ──
    vid = str(uuid.uuid4())
    print("\n── Transcript ──")
    test(
        "GET",
        f"/api/videos/{vid}/transcript",
        token,
        expect=404,
        label="/api/videos/{id}/transcript (no video)",
    )
    test(
        "PUT",
        f"/api/videos/{vid}/transcript",
        token,
        json_body={"segments": []},
        expect=404,
        label="/api/videos/{id}/transcript (update no video)",
    )
    test(
        "POST",
        f"/api/videos/{vid}/transcript/regenerate",
        token,
        expect=404,
        label="/api/videos/{id}/transcript/regenerate (no video)",
    )
    test(
        "GET",
        f"/api/videos/{vid}/transcript/export-srt",
        token,
        expect=404,
        label="/api/videos/{id}/transcript/export-srt (no video)",
    )
    test(
        "POST",
        f"/api/videos/{vid}/transcript/import-srt",
        token,
        expect=[404, 422],
        label="/api/videos/{id}/transcript/import-srt (no video)",
    )

    # ── Video ZIP export (no video) ──
    print("\n── Video Export ──")
    test(
        "GET",
        f"/api/videos/{vid}/export",
        token,
        expect=404,
        label="/videos/{id}/export (no video)",
    )

    # ── Clips (no video) ──
    print("\n── Clips ──")
    test(
        "GET",
        "/api/clips",
        token,
        params={"video_id": vid},
        expect=[200, 404],
        label="/clips?video_id= (no video)",
    )
    test("GET", f"/api/clips/{uuid.uuid4()}", token, expect=404)
    test("PATCH", f"/api/clips/{uuid.uuid4()}", token, json_body={"title": "test"}, expect=404)

    # ── Jobs (no video) ──
    print("\n── Jobs ──")
    test("GET", "/api/jobs", token, params={"video_id": vid}, expect=[200, 404])
    test("GET", f"/api/jobs/{uuid.uuid4()}", token, expect=404)
    test("POST", f"/api/jobs/{uuid.uuid4()}/retry", token, expect=404)

    # ── Publish (no clip) ──
    print("\n── Publishing ──")
    test(
        "POST",
        "/api/publish/clip",
        token,
        json_body={
            "clip_id": str(uuid.uuid4()),
            "platform": "youtube_shorts",
            "access_token": "test-token",
        },
        expect=[404, 422],
        label="/publish/clip (no clip)",
    )

    # ── Webhooks (no video) ──
    vid2 = str(uuid.uuid4())
    test("GET", f"/api/publish/webhook/{vid2}", token, label="/publish/webhook/{id} (list)")
    test(
        "POST",
        "/api/publish/webhook",
        token,
        json_body={
            "video_id": vid2,
            "url": "https://example.com/hook",
        },
        expect=[200, 404],
        label="/publish/webhook (register)",
    )
    test(
        "DELETE",
        f"/api/publish/webhook/{vid2}",
        token,
        params={"url": "https://example.com/hook"},
        expect=[200, 404],
        label="/publish/webhook/{id} (unregister)",
    )

    # ── Schedule (no clip) ──
    print("\n── Schedule ──")
    test("GET", "/api/schedule", token)
    test(
        "POST",
        "/api/schedule",
        token,
        json_body={
            "clip_id": str(uuid.uuid4()),
            "platform": "youtube_shorts",
            "access_token": "test-token",
            "scheduled_at": "2030-01-01T00:00:00Z",
        },
        expect=[404, 422],
        label="/schedule (create — no clip)",
    )
    test("DELETE", f"/api/schedule/{uuid.uuid4()}", token, expect=404)

    # ── Research ──
    print("\n── Research ──")
    test("GET", "/api/research/trends", token, params={"source": "google", "geo": "US"})
    test(
        "POST",
        "/api/research/analyze",
        token,
        json_body={"topic": "AI technology", "tone": "viral"},
    )
    test(
        "POST",
        "/api/research/crawl",
        token,
        json_body={"query": "AI shorts", "video_type": "short"},
    )

    # ── Video reprocess (no video) ──
    print("\n── Video Reprocess ──")
    test("POST", f"/api/videos/{vid}/reprocess", token, expect=404)

    # ── Video dub (no video) ──
    print("\n── Video Dub ──")
    test("POST", f"/api/videos/{vid}/dub", token, json_body={"target_langs": ["es"]}, expect=404)

    # ── Clip dub (no clip) ──
    print("\n── Clip Dub ──")
    test(
        "POST", f"/api/clips/{uuid.uuid4()}/dub", token, json_body={"target_lang": "es"}, expect=404
    )

    # ── Cleanup: delete test user ──
    print("\n── Cleanup ──")
    r = httpx.post(
        f"{API}/auth/login",
        json={"email": "test-endpoints@test.com", "password": "TestPass123!"},
        timeout=10,
    )
    if r.status_code == 200:
        t = r.json()["access_token"]
        # Find and delete test videos
        vr = httpx.get(f"{API}/videos", headers={"Authorization": f"Bearer {t}"}, timeout=10)
        if vr.status_code == 200:
            for v in vr.json().get("items", []):
                httpx.delete(
                    f"{API}/videos/{v['id']}", headers={"Authorization": f"Bearer {t}"}, timeout=10
                )
        httpx.delete(f"{API}/auth/me", headers={"Authorization": f"Bearer {t}"}, timeout=10)
        print("  ✓ Test user cleaned up")

    # ── Summary ──
    total = passed + failed
    print(f"\n{'=' * 70}")
    print(f"  RESULTS: {passed}/{total} passed, {failed} failed")
    print(f"{'=' * 70}\n")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
