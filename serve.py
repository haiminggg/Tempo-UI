"""Serve the Tempo UI reference as static files.

Locally:  python serve.py            (http://127.0.0.1:5176)
In CML:   create an Application with this file as the script. CML sets CDSW_APP_PORT.
Standard library only.
"""
import functools
import http.server
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("CDSW_APP_PORT", "5176"))
HOST = "127.0.0.1"

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
with http.server.ThreadingHTTPServer((HOST, PORT), handler) as server:
    print(f"Tempo UI on http://{HOST}:{PORT}")
    server.serve_forever()
