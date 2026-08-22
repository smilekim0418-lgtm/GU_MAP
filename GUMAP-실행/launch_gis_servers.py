# -*- coding: utf-8 -*-
"""
G-map All-in-One Server Launcher
Starts:
  - Main G-map server  : http://localhost:3000  (FastAPI + uvicorn)
  - Orthophoto tiles   : http://localhost:8765  (CORS)
  - 3D Tiles (Cesium)  : http://localhost:8766  (CORS)
  - DEM terrain        : http://localhost:8767  (CORS)

Run: py launch_gis_servers.py
(Works from either gumap/ or 新GUMAP/ folder)
"""
import subprocess
import sys
import os
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CORS = os.path.join(SCRIPT_DIR, "cors_server.py")

# Auto-detect server.py: check parent dir, 新GUMAP, or same dir
_candidates = [
    os.path.join(os.path.dirname(SCRIPT_DIR), "server.py"),
    os.path.join(os.path.dirname(SCRIPT_DIR), "新GUMAP", "server.py"),
    os.path.join(SCRIPT_DIR, "server.py"),
]
SERVER_SCRIPT = next((p for p in _candidates if os.path.isfile(p)), None)
SERVER_DIR = os.path.dirname(SERVER_SCRIPT) if SERVER_SCRIPT else os.path.dirname(SCRIPT_DIR)

BASE = os.path.join(os.path.dirname(SCRIPT_DIR), "GIS_DATA", "금오공대_최종산출물")

TILE_SERVERS = [
    (8765, "정사영상",  os.path.join(BASE, "2. 정사영상")),
    (8766, "3DTiles",   os.path.join(BASE, "5. 3Dtile")),
    (8767, "DEM",       os.path.join(BASE, "1. DEM", "kumoh_DEM")),
]

procs = []

def start_main_server():
    """Start the FastAPI G-map server on port 3000 (hardcoded in server.py)."""
    if not SERVER_SCRIPT:
        print("  [WARN] server.py not found! Skipping main server.")
        return
    py = sys.executable
    p = subprocess.Popen(
        [py, SERVER_SCRIPT],
        cwd=SERVER_DIR,
        creationflags=subprocess.CREATE_NEW_CONSOLE,
    )
    procs.append(("3000", "G-map Main", p))
    print(f"  [OK] Port 3000 (G-map Main) started  PID={p.pid}")
    print(f"       {SERVER_SCRIPT}")
    time.sleep(2)  # Wait for AI model loading to begin

def start_tile_servers():
    """Start the 3 CORS tile servers."""
    py = sys.executable
    for port, name, directory in TILE_SERVERS:
        if not os.path.isdir(directory):
            print(f"  [WARN] Directory not found: {directory}")
            continue
        cmd = [py, CORS, str(port), directory]
        p = subprocess.Popen(
            cmd,
            creationflags=subprocess.CREATE_NEW_CONSOLE,
        )
        procs.append((str(port), name, p))
        print(f"  [OK] Port {port} ({name}) started  PID={p.pid}")
        time.sleep(0.5)

def stop_all():
    for port, name, p in procs:
        try:
            p.terminate()
        except Exception:
            pass

if __name__ == "__main__":
    print("=" * 54)
    print("  G-map All-in-One Server Launcher")
    print("=" * 54)
    print()

    start_main_server()
    start_tile_servers()

    print()
    print("  G-map Main   : http://localhost:3000")
    print("  Orthophoto   : http://localhost:8765  (CORS)")
    print("  3D Tiles     : http://localhost:8766  (CORS)")
    print("  DEM          : http://localhost:8767  (CORS)")
    print()
    print("  Press Ctrl+C to stop all servers.")
    print("=" * 54)

    try:
        while True:
            time.sleep(5)
            # Auto-restart any crashed server
            for i, (port, name, p) in enumerate(procs):
                if p.poll() is not None:
                    print(f"  [RESTART] Port {port} ({name}) crashed, restarting...")
                    py = sys.executable
                    if port == "3000":
                        new_p = subprocess.Popen(
                            [py, SERVER_SCRIPT],
                            cwd=SERVER_DIR,
                            creationflags=subprocess.CREATE_NEW_CONSOLE,
                        )
                    else:
                        # Find dir for this port
                        port_int = int(port)
                        directory = next(d for p2, _, d in TILE_SERVERS if p2 == port_int)
                        new_p = subprocess.Popen(
                            [py, CORS, port, directory],
                            creationflags=subprocess.CREATE_NEW_CONSOLE,
                        )
                    procs[i] = (port, name, new_p)
    except KeyboardInterrupt:
        print("\n  Stopping all servers...")
        stop_all()
