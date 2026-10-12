#!/usr/bin/env python3
import argparse, functools, http.server, os, socketserver, sys

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control','no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma','no-cache')
        self.send_header('Expires','0')
        super().end_headers()
    def log_message(self, fmt, *args):
        sys.stdout.write('[slice12] '+fmt%args+'\n'); sys.stdout.flush()

class Server(socketserver.TCPServer):
    allow_reuse_address=True

ap=argparse.ArgumentParser()
ap.add_argument('--port',type=int,default=0)
ap.add_argument('--dir',default=os.path.dirname(os.path.abspath(__file__)))
ap.add_argument('--port-file')
args=ap.parse_args()
root=os.path.abspath(args.dir)
os.chdir(root)
handler=functools.partial(Handler,directory=root)
with Server(('127.0.0.1',args.port),handler) as httpd:
    port=httpd.server_address[1]
    if args.port_file:
        with open(args.port_file,'w',encoding='utf-8') as f: f.write(str(port))
    print(f'HOTLINE ABAKAN SLICE 12: http://127.0.0.1:{port}',flush=True)
    try: httpd.serve_forever()
    except KeyboardInterrupt: pass
