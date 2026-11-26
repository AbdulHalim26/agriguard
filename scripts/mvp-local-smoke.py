#!/usr/bin/env python3
"""Phase H: real loopback Next.js + EfficientNet HTTP smoke, NOT authenticated E2E.

No target URL/DSN/credential arguments. Supabase points at closed loopback port 1;
SMS/weather/demo/YOLO are disabled. No browser, DB emulation or real farmer data.
Requires an existing npm build and the existing AI virtualenv; installs nothing.
"""
import io
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        return None


def port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def multipart(data, mime="image/png"):
    boundary = "agriguard-local-synthetic-smoke"
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="synthetic.png"\r\n'
            f'Content-Type: {mime}\r\n\r\n').encode() + data + f"\r\n--{boundary}--\r\n".encode()
    return body, {"Content-Type": f"multipart/form-data; boundary={boundary}"}


def main():
    if not __debug__:
        raise RuntimeError("Assertions must be enabled")
    if not (ROOT / ".next/BUILD_ID").is_file():
        raise RuntimeError("Run the safe local npm build first; no build was created automatically")
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node unavailable")
    parent = Path("/var/folders/rq/5bcwgxx16_df8lrrvt_vb5hw0000gn/T/opencode") if os.uname().sysname == "Darwin" else Path("/tmp")
    web_port, ai_port = port(), port()
    while ai_port == web_port:
        ai_port = port()
    web, ai = f"http://127.0.0.1:{web_port}", f"http://127.0.0.1:{ai_port}"
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    passed = 0

    def http(base, path, data=None, headers=None):
        assert base in (web, ai) and path.startswith("/") and not path.startswith("//")
        request = urllib.request.Request(base + path, data=data, headers=headers or {})
        try:
            response = opener.open(request, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, response.headers, response.read()

    def check(name, condition):
        nonlocal passed
        assert condition, name
        passed += 1
        print(f"PASS {passed}: {name}", flush=True)

    with tempfile.TemporaryDirectory(prefix="mvp-h-", dir=parent) as temporary:
        env = {"PATH": os.environ.get("PATH", os.defpath), "HOME": temporary, "TMPDIR": temporary,
            "LANG": "en_US.UTF-8", "TZ": "UTC", "NODE_ENV": "production", "NEXT_TELEMETRY_DISABLED": "1",
            "NEXT_PUBLIC_SUPABASE_URL": "http://127.0.0.1:1", "NEXT_PUBLIC_SUPABASE_ANON_KEY": "local-build-placeholder",
            "SUPABASE_SERVICE_ROLE_KEY": "local-build-placeholder", "NEXT_PUBLIC_APP_URL": web, "AI_API_URL": ai,
            "AUTH_PHONE_OTP_ENABLED": "false", "EWS_DEMO_ENABLED": "false", "OPENWEATHER_API_KEY": "",
            "AGRIGUARD_YOLO_ENABLED": "false", "AGRIGUARD_YOLO_MODEL_PATH": "", "PYTHONDONTWRITEBYTECODE": "1",
            "EWS_WEATHER_MAX_AGE_MINUTES": "20", "EWS_WATER_MAX_AGE_MINUTES": "60", "EWS_CLOCK_SKEW_SECONDS": "120"}
        processes = []
        with open(Path(temporary) / "web.log", "w+") as web_log, open(Path(temporary) / "ai.log", "w+") as ai_log:
            try:
                processes.append(subprocess.Popen([node, "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", str(web_port)], cwd=ROOT, env=env, stdout=web_log, stderr=subprocess.STDOUT))
                processes.append(subprocess.Popen([str(ROOT / "ai-service/.venv/bin/python"), "-m", "uvicorn", "main:app", "--app-dir", "ai-service", "--host", "127.0.0.1", "--port", str(ai_port)], cwd=ROOT, env=env, stdout=ai_log, stderr=subprocess.STDOUT))
                for base, path, process in ((web, "/login", processes[0]), (ai, "/health", processes[1])):
                    deadline = time.monotonic() + 35
                    while True:
                        if process.poll() is not None:
                            raise RuntimeError("Owned local service exited before readiness")
                        try:
                            if http(base, path)[0] == 200:
                                break
                        except (OSError, urllib.error.URLError):
                            pass
                        if time.monotonic() >= deadline:
                            raise RuntimeError("Owned local service readiness timeout")
                        time.sleep(.15)

                for path, text in (("/login", b"OTP"), ("/daftar", b"OTP"), ("/fitur", b"AgriGuard")):
                    status, _, body = http(web, path)
                    check(f"public page {path}", status == 200 and text in body)
                for path in ("/dashboard", "/lahan", "/scan", "/laporan", "/peta", "/verifikasi", "/audit", "/notifikasi", "/settings", "/onboarding"):
                    status, headers, _ = http(web, path, headers={"Cookie": 'agriguard_mock_user=forged; agriguard_mock_role=dinas'})
                    check(f"anonymous/forged mock cookie denied {path}", status in (302, 303, 307, 308) and headers.get("Location", "").endswith("/login"))
                for path in ("/api/auth/session", "/api/lahan", "/api/water-levels"):
                    status, _, _ = http(web, path)
                    check(f"anonymous data denied {path}", status == 401)
                for path in ("/api/sync", "/api/ai/analyze"):
                    for from_origin, expected in (("http://unrelated.invalid", 403), (web, 401)):
                        body, headers = multipart(b"synthetic bytes")
                        status, _, _ = http(web, path, body, {**headers, "Origin": from_origin})
                        check(f"origin/session guard {path} expected {expected}, received {status}", status == expected)
                status, _, body = http(web, "/api/auth/otp", json.dumps({"phone": "6280000000001", "mode": "login"}).encode(), {"Origin": web, "Content-Type": "application/json"})
                check("OTP disabled is explicit 503, no password/mock fallback", status == 503 and b"OTP" in body)
                status, _, body = http(web, "/api/ai/detect")
                check("web YOLO disabled", status == 200 and json.loads(body) == {"enabled": False})
                for path, status_expected, quality in (("/api/weather?lat=-6.312&lon=107.285", 200, "MISSING"),
                        ("/api/weather?lat=bad&lon=107.285", 400, "INVALID"), ("/api/weather?demo=1", 200, "INVALID")):
                    status, _, body = http(web, path)
                    result = json.loads(body)
                    check(f"truthful EWS {quality} {path}", status == status_expected and result["quality"] == quality and result["rain_3h_mm"] is None and result["source"] != "mock")
                status, _, body = http(ai, "/health")
                check("real EfficientNet loaded", status == 200 and json.loads(body)["model_loaded"] is True)
                status, _, body = http(ai, "/model-info")
                check("real classifier metadata endpoint", status == 200 and json.loads(body)["loaded"] is True)
                image = io.BytesIO(); Image.new("RGB", (100, 50), "green").save(image, format="PNG")
                data, headers = multipart(image.getvalue())
                status, _, body = http(ai, "/predict", data, headers)
                result = json.loads(body)
                check("real EfficientNet HTTP inference contract (synthetic, NOT accuracy/area proof)", status == 200 and set(result) == {"status", "confidence", "damage_pct"} and result["status"] in ("aman", "rusak_ringan", "rusak_berat") and 0 <= result["confidence"] <= 1 and 0 <= result["damage_pct"] <= 100)
                bad, bad_headers = multipart(b"not an image")
                check("corrupt AI image rejected", http(ai, "/predict", bad, bad_headers)[0] == 400)
                status, _, body = http(ai, "/predict/detect", data, headers)
                result = json.loads(body)
                check("AI detector unavailable, no fake boxes", status == 503 and result["inference_status"] == "UNAVAILABLE" and "detections" not in result)
                print(f"SUMMARY: {passed}/{passed} loopback HTTP checks PASS. Authenticated browser/Supabase/IndexedDB/verification transaction E2E NOT_TESTED.", flush=True)
            finally:
                for process in reversed(processes):
                    if process.poll() is None:
                        process.terminate()
                        try:
                            process.wait(timeout=8)
                        except subprocess.TimeoutExpired:
                            process.kill(); process.wait(timeout=5)


if __name__ == "__main__":
    main()
