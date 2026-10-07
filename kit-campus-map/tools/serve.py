"""site/ 를 로컬에서 미리 본다.

ES 모듈과 fetch 는 file:// 로 열면 브라우저가 막는다. 학교 서버에 올리기 전
확인은 이 서버로 한다.

    python tools/serve.py          # http://127.0.0.1:8800/
    python tools/serve.py 9000
"""
import functools
import http.server
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parents[1] / "site"


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".json": "application/json",
        ".geojson": "application/json",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        # 정상 요청까지 찍으면 콘솔이 묻힌다. 실패만 보여 준다.
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8800
    handler = functools.partial(Handler, directory=str(SITE))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"http://127.0.0.1:{port}/")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
