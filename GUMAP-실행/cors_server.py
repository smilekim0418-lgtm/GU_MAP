"""
CORS-enabled HTTP server for G-map GIS data
USAGE: py cors_server.py <port> <directory>
"""
import sys
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler


class CORSRequestHandler(SimpleHTTPRequestHandler):
    """HTTP server with CORS headers for local GIS tile serving."""

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        # 간결한 로그
        print(f"[Port {self.server.server_address[1]}] {args[0]} {args[1]}")


def run(port, directory):
    os.chdir(directory)
    server = HTTPServer(('', port), CORSRequestHandler)
    print(f"[GIS Server] 포트 {port} | 디렉토리: {directory}")
    print(f"[GIS Server] http://localhost:{port}/")
    print("[GIS Server] CORS 활성화 (Access-Control-Allow-Origin: *)")
    print("[GIS Server] Ctrl+C 로 종료")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print(f"\n[GIS Server] 포트 {port} 종료")


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("사용법: py cors_server.py <포트> <디렉토리>")
        sys.exit(1)
    port = int(sys.argv[1])
    directory = sys.argv[2]
    run(port, directory)
