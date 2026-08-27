# -*- coding: utf-8 -*-
"""
G-map Background Server Launcher
- Starts all servers as HIDDEN background processes (no visible windows)
- Servers survive even if this launcher window is closed
- Logs written to G-map-logs/ folder
- Run: py G-map-start.py
"""
import subprocess
import sys
import os
import time
import socket

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


if __name__ == "__main__":
    import webbrowser
    py = sys.executable

    print("=" * 52)
    print("  G-map Server Launcher")
    print("=" * 52)

    print("\n[1/5] Stopping old servers...")
    kill_existing()

    print("[2/5] Starting main server (port 3000)...")
    if SERVER_SCRIPT:
        start_hidden([py, SERVER_SCRIPT], SERVER_DIR, "server-3000")
        print(f"       {SERVER_SCRIPT}")
    else:
        print("  WARNING: server.py not found!")

    print("[3/5] Starting GIS tile servers...")
    for port, name, directory in TILE_SERVERS:
        if os.path.isdir(directory):
            start_hidden([py, CORS_SCRIPT, str(port), directory], SERVER_DIR, f"gis-{port}")
            print(f"       Port {port} ({name}) OK")
        else:
            print(f"       Port {port} SKIP: dir not found")
            print(f"         {directory}")

    # G-Route AI 그래프·ONNX 로딩 포함 실측 약 3초. 예전 "~25s" 안내는 낡았다.
    print("[4/5] Waiting for port 3000 (G-Route AI loading, ~3s)...")
    ok3000 = wait_for_port(3000, timeout=90)
    print(f"       Port 3000: {'READY' if ok3000 else 'TIMEOUT - check G-map-logs/server-3000.log'}")

    for port, name, _ in TILE_SERVERS:
        up = is_port_open(port)
        print(f"       Port {port} ({name}): {'OK' if up else 'not up yet'}")

    print("[5/5] Opening browser...")
    webbrowser.open("http://localhost:3000/")

    print()
    print("=" * 52)
    print("  All servers running in BACKGROUND.")
    print("  This window can be closed safely.")
    print("  Logs: G-map-logs/ folder")
    print("=" * 52)
    input("\nPress Enter to close...")
