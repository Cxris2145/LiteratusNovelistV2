import http.server
import socketserver
import urllib.request
import urllib.error

TARGET = "https://literatusnovelistv2.onrender.com"

class DevProxyHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Concise logging
        print(f"[Proxy] {self.command} {self.path} -> {args[0] if args else ''}")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Credentials', 'true')
        self.send_header('Access-Control-Max-Age', '86400')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_proxy(self):
        url = TARGET + self.path
        content_len = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_len) if content_len > 0 else None

        req_headers = {}
        for k, v in self.headers.items():
            if k.lower() not in ['host', 'origin', 'referer', 'content-length', 'connection']:
                req_headers[k] = v
        req_headers['Host'] = 'literatusnovelistv2.onrender.com'

        req = urllib.request.Request(url, data=body, headers=req_headers, method=self.command)
        try:
            with urllib.request.urlopen(req) as resp:
                self.send_response(resp.status)
                for k, v in resp.getheaders():
                    if k.lower() not in ['transfer-encoding', 'content-length', 'content-encoding', 'access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers', 'access-control-allow-credentials']:
                        self.send_header(k, v)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
                self.send_header('Access-Control-Allow-Headers', '*')
                self.send_header('Access-Control-Allow-Credentials', 'true')
                data = resp.read()
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            for k, v in e.headers.items():
                if k.lower() not in ['transfer-encoding', 'content-length', 'content-encoding', 'access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers', 'access-control-allow-credentials']:
                    self.send_header(k, v)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', '*')
            self.send_header('Access-Control-Allow-Credentials', 'true')
            data = e.read()
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as ex:
            self.send_response(502)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(f"Proxy error: {ex}".encode('utf-8'))

    do_GET = do_proxy
    do_POST = do_proxy
    do_PUT = do_proxy
    do_PATCH = do_proxy
    do_DELETE = do_proxy

class ReusableThreadingServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True

if __name__ == '__main__':
    port = 8000
    print(f"Starting proxy on http://127.0.0.1:{port} -> {TARGET}...")
    with ReusableThreadingServer(('127.0.0.1', port), DevProxyHandler) as httpd:
        print(f"Proxy active on port {port}")
        httpd.serve_forever()
