"""보정 화면용 로컬 서버.

정적 파일과 work/ 산출물을 서빙하고, POST 로 저장을 받는다.
정사영상 타일은 기존 8765 포트 서버를 그대로 쓴다.

실행: python serve_editor.py   →  http://localhost:8790/floorplan-editor.html
"""
import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8")

from fp import config  # noqa: E402

TOOL_DIR = Path(__file__).resolve().parent
PORT = 8790
ALLOWED_SAVE = {"labeled", "georef"}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(TOOL_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        try:
            kind = self.path.strip("/").split("/")[-1]
            if kind not in ALLOWED_SAVE:
                self.send_error(404, "unknown save target")
                return
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))

            if kind == "labeled":
                floor = payload.get("floor")
                if floor not in config.FLOORS:
                    self.send_error(400, "bad floor")
                    return
                target = config.WORK_DIR / f"{floor}_labeled.json"
            else:
                target = config.GEOREF_PATH

            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

            body = json.dumps({"ok": True, "path": str(target)}, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            print(f"저장: {target}")
        except Exception as exc:  # noqa: BLE001
            self.send_error(500, str(exc))


if __name__ == "__main__":
    print(f"보정 화면: http://localhost:{PORT}/floorplan-editor.html")
    print("정사영상 타일이 필요하면 기존 8765 포트 서버도 함께 켜 둘 것.")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
