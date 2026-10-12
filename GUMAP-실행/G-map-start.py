# -*- coding: utf-8 -*-
"""
G-map Background Server Launcher
- Starts all servers as HIDDEN background processes (no visible windows)
- Servers survive even if this launcher window is closed
- Logs written to G-map-logs/ folder
- Opens a public https address with a Cloudflare quick tunnel (skip: --no-tunnel)
- Run: py G-map-start.py
"""
import json
import re
import shutil
import subprocess
import sys
import os
import time
import socket
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Locate server.py (check parent dir, 新GUMAP, or current dir)
_server_candidates = [
    os.path.join(os.path.dirname(SCRIPT_DIR), "server.py"),
    os.path.join(os.path.dirname(SCRIPT_DIR), "新GUMAP", "server.py"),
    os.path.join(SCRIPT_DIR, "server.py"),
]
SERVER_SCRIPT = next((p for p in _server_candidates if os.path.isfile(p)), None)
SERVER_DIR    = os.path.dirname(SERVER_SCRIPT) if SERVER_SCRIPT else os.path.dirname(SCRIPT_DIR)

_cors_candidates = [
    os.path.join(SCRIPT_DIR, "cors_server.py"),
    os.path.join(SERVER_DIR, "cors_server.py"),
]
CORS_SCRIPT   = next((p for p in _cors_candidates if os.path.isfile(p)), os.path.join(SCRIPT_DIR, "cors_server.py"))

BASE = os.path.join(os.path.dirname(SCRIPT_DIR), "GIS_DATA", "금오공대_최종산출물")
LOG_DIR = os.path.join(SCRIPT_DIR, "G-map-logs")
os.makedirs(LOG_DIR, exist_ok=True)

TILE_SERVERS = [
    (8765, "ortho",   os.path.join(BASE, "2. 정사영상")),
    (8766, "tiles3d", os.path.join(BASE, "5. 3Dtile")),
    (8767, "dem",     os.path.join(BASE, "1. DEM", "kumoh_DEM")),
]

CREATE_NO_WINDOW = 0x08000000
DETACHED_PROCESS  = 0x00000008
MY_PID = os.getpid()

# 외부 접속 주소. 계정 없이 https://xxx.trycloudflare.com 을 받는 quick tunnel 을 쓴다.
# G-map-종료.bat 은 이 대상 주소로 우리 터널을 골라 끈다. 바꾸면 거기도 같이 바꾼다.
TUNNEL_TARGET = "http://127.0.0.1:3000"
TUNNEL_LOG    = os.path.join(LOG_DIR, "tunnel.log")
TUNNEL_STATE  = os.path.join(LOG_DIR, "tunnel.json")
# 실패 로그에 나오는 api.trycloudflare.com 은 발급 주소가 아니다
TUNNEL_URL_RE = re.compile(r"https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com")


def is_port_open(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            return True
    except OSError:
        return False


def kill_port(port):
    """Kill only the process listening on this specific port (not self)."""
    try:
        result = subprocess.run(
            ["netstat", "-ano"], capture_output=True, text=True
        )
        for line in result.stdout.splitlines():
            if f":{port} " in line and "LISTENING" in line:
                parts = line.split()
                pid = int(parts[-1])
                if pid != MY_PID and pid > 0:
                    subprocess.run(
                        ["taskkill", "/F", "/PID", str(pid), "/T"],
                        capture_output=True
                    )
                    print(f"  [STOP] Port {port} PID={pid} killed")
    except Exception as e:
        pass


def kill_existing():
    """Kill existing servers on our ports only."""
    for port in [3000, 8765, 8766, 8767]:
        if is_port_open(port):
            kill_port(port)
    time.sleep(2)


def start_hidden(cmd, cwd, log_name):
    """Start a process completely hidden, output → log file."""
    log_path = os.path.join(LOG_DIR, log_name + ".log")
    log_f = open(log_path, "a", encoding="utf-8", errors="replace")
    p = subprocess.Popen(
        cmd,
        cwd=cwd,
        stdout=log_f,
        stderr=log_f,
        stdin=subprocess.DEVNULL,
        creationflags=CREATE_NO_WINDOW | DETACHED_PROCESS,
    )
    return p


def wait_for_port(port, timeout=60):
    """Wait until port is open.

    1초 간격으로 보면 서버가 이미 떠 있어도 최대 1초를 더 기다린다.
    기동이 3초 남짓이라 그 1초가 체감으로 꽤 크다. 촘촘히 본다.
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        if is_port_open(port):
            return True
        time.sleep(0.1)
    return False


def find_cloudflared():
    found = shutil.which("cloudflared")
    if found:
        return found
    for base in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles")):
        if base and os.path.isfile(os.path.join(base, "cloudflared", "cloudflared.exe")):
            return os.path.join(base, "cloudflared", "cloudflared.exe")
    return None


def is_cloudflared(pid):
    out = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                         capture_output=True, text=True).stdout
    return out.strip().lower().startswith('"cloudflared.exe"')


def url_alive(url):
    # HEAD 는 안 된다: 서버의 "/" 는 GET 라우트라 HEAD 가 정적 마운트로 빠져 403 이 난다
    req = urllib.request.Request(url + "/", headers={"User-Agent": "G-map-launcher"})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return r.status == 200
    except Exception:
        return False


def running_tunnel():
    """지난번에 띄운 터널이 아직 살아 있으면 (pid, url), 아니면 (None, None)."""
    try:
        with open(TUNNEL_STATE, encoding="utf-8") as f:
            state = json.load(f)
        pid, url = int(state["pid"]), state["url"]
    except Exception:
        return None, None
    return (pid, url) if is_cloudflared(pid) else (None, None)


def stop_tunnel(pid):
    subprocess.run(["taskkill", "/F", "/PID", str(pid), "/T"], capture_output=True)


def start_tunnel():
    """외부 접속 주소를 (url, 상태) 로 돌려준다. 상태: reused / new / missing / failed.

    quick tunnel 주소는 cloudflared 를 새로 띄울 때마다 바뀐다. 서버만 다시 켠 경우엔
    살아 있는 터널이 새 서버에 그대로 붙으므로 그 터널을 계속 써서, 이미 나눠 준 주소가
    런처를 다시 돌려도 바뀌지 않게 한다.
    """
    old_pid, old_url = running_tunnel()
    if old_pid:
        if url_alive(old_url):
            return old_url, "reused"
        stop_tunnel(old_pid)

    exe = find_cloudflared()
    if not exe:
        return None, "missing"
    with open(TUNNEL_LOG, "w", encoding="utf-8") as log_f:
        p = subprocess.Popen(
            [exe, "tunnel", "--no-autoupdate", "--url", TUNNEL_TARGET],
            stdout=log_f,
            stderr=log_f,
            stdin=subprocess.DEVNULL,
            creationflags=CREATE_NO_WINDOW | DETACHED_PROCESS,
        )
    deadline = time.time() + 30
    while time.time() < deadline and p.poll() is None:
        with open(TUNNEL_LOG, encoding="utf-8", errors="replace") as f:
            found = TUNNEL_URL_RE.search(f.read())
        if found:
            with open(TUNNEL_STATE, "w", encoding="utf-8") as f:
                json.dump({"pid": p.pid, "url": found.group(0)}, f)
            return found.group(0), "new"
        time.sleep(0.3)
    return None, "failed"


if __name__ == "__main__":
    import webbrowser
    py = sys.executable
    want_tunnel = "--no-tunnel" not in sys.argv

    print("=" * 52)
    print("  G-map Server Launcher")
    print("=" * 52)

    print("\n[1/6] Stopping old servers...")
    kill_existing()

    print("[2/6] Starting main server (port 3000)...")
    if SERVER_SCRIPT:
        start_hidden([py, SERVER_SCRIPT], SERVER_DIR, "server-3000")
        print(f"       {SERVER_SCRIPT}")
    else:
        print("  WARNING: server.py not found!")

    print("[3/6] Starting GIS tile servers...")
    for port, name, directory in TILE_SERVERS:
        if os.path.isdir(directory):
            start_hidden([py, CORS_SCRIPT, str(port), directory], SERVER_DIR, f"gis-{port}")
            print(f"       Port {port} ({name}) OK")
        else:
            print(f"       Port {port} SKIP: dir not found")
            print(f"         {directory}")

    # G-Route AI 그래프·ONNX 로딩 포함 실측 약 3초. 예전 "~25s" 안내는 낡았다.
    print("[4/6] Waiting for port 3000 (G-Route AI loading, ~3s)...")
    ok3000 = wait_for_port(3000, timeout=90)
    print(f"       Port 3000: {'READY' if ok3000 else 'TIMEOUT - check G-map-logs/server-3000.log'}")

    for port, name, _ in TILE_SERVERS:
        up = is_port_open(port)
        print(f"       Port {port} ({name}): {'OK' if up else 'not up yet'}")

    public_url = None
    print("[5/6] Public address (Cloudflare tunnel)...")
    if not want_tunnel:
        old_pid, _ = running_tunnel()
        if old_pid:
            stop_tunnel(old_pid)
        print("       SKIP (--no-tunnel)" + (" - old tunnel stopped" if old_pid else ""))
    elif not ok3000:
        print("       SKIP: server on port 3000 is not up")
    else:
        public_url, how = start_tunnel()
        if how == "reused":
            print("       Same address as before (tunnel was still running)")
        elif how == "new":
            print("       New address created")
        elif how == "missing":
            print("       SKIP: cloudflared not installed")
            print("         install: winget install Cloudflare.cloudflared")
        else:
            print("       FAILED - check G-map-logs/tunnel.log")
        if public_url:
            # 메신저에 바로 붙여 넣을 수 있게 클립보드에도 넣는다
            subprocess.run(["clip"], input=public_url.encode("ascii"), capture_output=True)

    print("[6/6] Opening browser...")
    webbrowser.open("http://localhost:3000/")

    print()
    print("=" * 52)
    print("  All servers running in BACKGROUND.")
    print("  This window can be closed safely.")
    print("  Logs: G-map-logs/ folder")
    if public_url:
        print()
        print("  Public URL (copied to clipboard):")
        print(f"  {public_url}")
        if how == "new":
            print("  New addresses may take ~10s to start working.")
        print("  Stop everything: G-map-종료.bat")
    print("=" * 52)
    input("\nPress Enter to close...")
