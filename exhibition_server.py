"""Artwork HTTP server and read-only Android companion synchronization."""
import functools
import http.server
import json
import math
from pathlib import Path
import socket
import threading
import time
import urllib.parse


def lan_address():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(('192.0.2.1', 9))
            return probe.getsockname()[0]
    except OSError:
        return '127.0.0.1'


class ExhibitionServer(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, root, token, port=0, host='0.0.0.0'):
        self.token = token
        self.state = None
        self.state_received = 0
        self.state_lock = threading.Lock()
        super().__init__((host, port), functools.partial(Handler, directory=str(Path(root) / 'dist')))
        self.phone_url = 'http://{}:{}/phone.html?key={}'.format(lan_address(), self.server_port, token)


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def reply(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        key = urllib.parse.parse_qs(parsed.query).get('key', [''])[0]
        if parsed.path.startswith('/api/'):
            if key != self.server.token:
                return self.reply({'error': 'Pairing key required'}, 403)
            if parsed.path == '/api/info':
                return self.reply({'phoneUrl': self.server.phone_url})
            if parsed.path != '/api/state':
                return self.reply({'error': 'Not found'}, 404)
            with self.server.state_lock:
                data = dict(self.server.state or {'started': False, 'paused': True, 'elapsed': 0, 'observedAt': 0, 'cues': []})
                data['connected'] = self.server.state is not None and time.monotonic() - self.server.state_received < 3
            data['serverTime'] = time.time() * 1000
            return self.reply(data)
        if self.client_address[0] not in ('127.0.0.1', '::1'):
            allowed = {'/phone.html', '/phone.js', '/phone.css', '/device-screen.js', '/exhibition-playback.js', '/media/blank-video.webm'}
            if parsed.path not in allowed:
                return self.reply({'error': 'Not found'}, 404)
        return super().do_GET()

    def do_POST(self):
        if self.path != '/api/state':
            return self.reply({'error': 'Not found'}, 404)
        if self.client_address[0] not in ('127.0.0.1', '::1') or self.headers.get('X-Exhibition-Token') != self.server.token:
            return self.reply({'error': 'Publisher denied'}, 403)
        try:
            size = int(self.headers.get('Content-Length', 0))
            if not 0 < size <= 32768:
                raise ValueError('Invalid body')
            value = json.loads(self.rfile.read(size))
            if not isinstance(value.get('elapsed'), (int, float)) or not math.isfinite(value['elapsed']) or value['elapsed'] < 0:
                raise ValueError('Invalid clock')
            if not isinstance(value.get('cues'), list) or len(value['cues']) != 6:
                raise ValueError('Invalid playlist')
            observed = value.get('observedAt', time.time() * 1000)
            if not isinstance(observed, (int, float)) or not math.isfinite(observed):
                raise ValueError('Invalid timestamp')
            if abs(time.time() * 1000 - observed) > 5000:
                observed = time.time() * 1000
            value = {k: value[k] for k in ('started', 'paused', 'elapsed', 'cues')}
            value['observedAt'] = observed
            with self.server.state_lock:
                self.server.state = value
                self.server.state_received = time.monotonic()
            return self.reply({'ok': True})
        except (ValueError, KeyError, TypeError):
            return self.reply({'error': 'Invalid state'}, 400)
