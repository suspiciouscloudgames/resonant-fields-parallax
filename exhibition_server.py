"""Exhibition clock, authoritative-host game input queue, and Android companion."""
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
        self.inputs = []
        self.input_serial = 0
        self.seen_inputs = {}
        self.state_lock = threading.Lock()
        super().__init__((host, port), functools.partial(Handler, directory=str(Path(root) / 'dist')))
        self.phone_url = 'http://{}:{}/phone.html?key={}'.format(lan_address(), self.server_port, token)

    def active_round(self):
        value = self.state
        if not value or not value['started'] or value['paused'] or time.monotonic()-self.state_received >= 3:
            return None
        elapsed = value['elapsed'] + max(0, time.time()*1000-value['observedAt'])
        cycle = sum(c['duration'] for c in value['cues'])
        if cycle <= 0:
            return None
        lap, within = divmod(elapsed, cycle)
        for index, cue in enumerate(value['cues']):
            if within >= cue['duration']:
                within -= cue['duration']
                continue
            for phase in cue['phases']:
                if within >= phase['duration']:
                    within -= phase['duration']
                    continue
                return value['runId']+':'+str(int(lap)*len(value['cues'])+index) if phase['state']=='gaming' else None
        return None


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
            allowed = {'/phone.html', '/phone.js', '/phone.css', '/device-screen.js', '/exhibition-playback.js', '/media/blank-video.webm',
                       '/blitz-game.js', '/blitz-view.js', '/blitz-audio.js', '/media/blitz/frame.png', '/media/blitz/board.png', '/media/blitz/gems.png',
                       '/media/blitz/recording.m4a', '/media/blitz/match.m4a', '/media/blitz/swap.m4a', '/media/blitz/power.m4a'}
            if parsed.path not in allowed:
                return self.reply({'error': 'Not found'}, 404)
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path == '/api/game/input':
            return self.game_input(parsed)
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
            ack = value.get('inputAck', 0)
            value = {k: value[k] for k in ('started', 'paused', 'elapsed', 'cues', 'runId', 'game')}
            value['observedAt'] = observed
            with self.server.state_lock:
                self.server.state = value
                self.server.state_received = time.monotonic()
                if isinstance(ack, int):
                    self.server.inputs = [i for i in self.server.inputs if i['id'] > ack]
                inputs = list(self.server.inputs)
            return self.reply({'ok': True, 'inputs': inputs})
        except (ValueError, KeyError, TypeError):
            return self.reply({'error': 'Invalid state'}, 400)

    def game_input(self, parsed):
        key = urllib.parse.parse_qs(parsed.query).get('key', [''])[0]
        if key != self.server.token:
            return self.reply({'error': 'Pairing key required'}, 403)
        try:
            size = int(self.headers.get('Content-Length', 0))
            if not 0 < size <= 1024:
                raise ValueError()
            value = json.loads(self.rfile.read(size))
            a, b = value['from'], value['to']
            request_id = value['requestId']
            if type(a) is not int or type(b) is not int or not (0 <= a < 64 and 0 <= b < 64):
                raise ValueError()
            if abs(a%8-b%8)+abs(a//8-b//8) != 1 or not isinstance(request_id, str) or not 1 <= len(request_id) <= 100:
                raise ValueError()
            with self.server.state_lock:
                round_id = self.server.active_round()
                state = self.server.state or {}
                game = state.get('game') or {}
                if not round_id or value.get('round') != round_id or game.get('round') != round_id:
                    return self.reply({'error': 'Game scene is not active'}, 409)
                previous = self.server.seen_inputs.get((round_id, request_id))
                if previous:
                    return self.reply({'accepted': True, 'id': previous})
                if value.get('revision') != game.get('revision') or game.get('phase') != 'idle':
                    return self.reply({'error': 'Wait for the board'}, 409)
                if len(self.server.inputs) >= 8:
                    return self.reply({'error': 'Input queue full'}, 429)
                self.server.input_serial += 1
                item = {'id': self.server.input_serial, 'round': round_id, 'from': a, 'to': b, 'revision': value['revision']}
                self.server.inputs.append(item)
                self.server.seen_inputs[(round_id, request_id)] = item['id']
                if len(self.server.seen_inputs) > 256:
                    del self.server.seen_inputs[next(iter(self.server.seen_inputs))]
            return self.reply({'accepted': True, 'id': item['id']})
        except (ValueError, KeyError, TypeError):
            return self.reply({'error': 'Invalid move'}, 400)
