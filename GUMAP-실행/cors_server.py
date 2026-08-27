"""
CORS-enabled HTTP server for G-map GIS data
USAGE: py cors_server.py <port> <directory>
"""
import socket
import sys
import os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


class CORSRequestHandler(SimpleHTTPRequestHandler):
    """HTTP server with CORS headers for local GIS tile serving."""

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'public, max-age=86400')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        # 간결한 로그
        print(f"[Port {self.server.server_address[1]}] {args[0]} {args[1]}")


class DualStackHTTPServer(ThreadingHTTPServer):
    """IPv4 와 IPv6 를 한 소켓으로 받는 서버.

    'localhost' 는 윈도우에서 IPv6(::1)로 먼저 풀린다. IPv4 로만 들으면
    ::1 연결이 거부되는데 윈도우는 그 거부에 약 2초를 쓴다. 타일 서버는
    지도를 움직일 때마다 새 연결을 받으므로 그 지연이 그대로 체감된다.
    """
    address_family = socket.AF_INET6

    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except OSError:
            pass                      # 듀얼스택 불가 환경이면 IPv6 전용으로 계속
        super().server_bind()


def make_server(port):
    try:
        return DualStackHTTPServer(('::', port), CORSRequestHandler)
    except OSError as error:
        print(f"[GIS Server] 듀얼스택 바인드 실패({error}). IPv4 전용으로 계속한다.")
        return ThreadingHTTPServer(('', port), CORSRequestHandler)


def run(port, directory):
    os.chdir(directory)
    server = make_server(port)
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
