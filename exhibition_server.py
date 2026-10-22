"""Exhibition clock, authoritative-host game input queue, and Android companion."""
import functools
import http.server
import json
import math
import re
from pathlib import Path
import socket
import threading
import time
import urllib.parse
from exhibition_store import ExhibitionStore, CONVERSATIONS


def lan_address():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(('192.0.2.1', 9))
            return probe.getsockname()[0]
    except OSError:
        return '127.0.0.1'


class ExhibitionServer(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, root, token, port=0, host='0.0.0.0', storage_path=None, event_origins=()):
        self.token = token
        self.state = None
        self.state_received = 0
        self.inputs = []
        self.input_serial = 0
        self.seen_inputs = {}
        self.video_seek = None
        self.video_revision = 0
        self.video_duration = json.loads((Path(root)/"dist/media/youtube-short.json").read_text())["duration"]
        self.scene_messages = json.loads((Path(root)/'dist/scene-messages.json').read_text(encoding='utf-8'))
        self.state_lock = threading.RLock()
        self.changed = threading.Condition(self.state_lock)
        self.store = ExhibitionStore(storage_path)
        self.event_origins = set(event_origins)
        self.ui = {'open':False,'conversationId':None,'readThroughByConversation':self.store.meta('readThroughByConversation',{}),'readThrough':self.store.meta('readThrough',0),'dismissed':0,'revision':0}
        self.last_scene = None
        self.last_base_mode = 'clock'
        self.stopping = False
        super().__init__((host, port), functools.partial(Handler, directory=str(Path(root) / 'dist')))
        self.phone_url = 'http://{}:{}/phone.html?key={}'.format(lan_address(), self.server_port, token)

    def active_phase(self):
        value = self.state
        if not value or not value['started'] or time.monotonic()-self.state_received >= 3:
            return None
        c=value.get('current')
        if not c:return None
        dt=0 if value['paused'] else max(0,time.time()*1000-value['observedAt'])
        return {'round':c['phone']['round'],'instance':c['instance'],'phase':c['phase'],
                'elapsed':c['phaseTime']+dt,'phoneElapsed':c['phone']['elapsed']+dt,'baseMode':c['phone']['mode']}

    def active_round(self):
        phase=self.active_phase()
        game=(self.state or {}).get('game') or {}
        return phase['round'] if phase and phase['baseMode']=='game' and not self.state['paused'] and game.get('stage')=='play' and phase['phoneElapsed']<60000 and not self.ui['open'] else None

    def current_video_seek(self):
        phase=self.active_phase()
        return self.video_seek if phase and phase['baseMode']=='youtube' and self.video_seek and self.video_seek['round']==phase['instance'] else None

    def phone_state(self):
        histories={key:self.store.messages(limit=100,conversation_id=key) for key in CONVERSATIONS}
        return {'ui':dict(self.ui),'messages':sorted([item for h in histories.values() for item in h['items']],key=lambda item:item['id']),
                'conversations':self.store.conversations(self.ui['readThroughByConversation']),
                'total':sum(h['total'] for h in histories.values()),'hasMore':any(h['hasMore'] for h in histories.values()),
                'hasMoreByConversation':{k:h['hasMore'] for k,h in histories.items()},'sceneInstance':self.last_scene,'loopId':self.store.meta('loopId')}

    def read_conversation(self,conversation_id):
        history=self.store.messages(limit=1,conversation_id=conversation_id)
        through=history['items'][-1]['id'] if history['items'] else 0
        self.ui['readThroughByConversation']={**self.ui['readThroughByConversation'],conversation_id:through}
        self.store.set_meta('readThroughByConversation',self.ui['readThroughByConversation'])

    def receive_state(self,value):
        self.state=value;self.state_received=time.monotonic()
        c=value['current'];now=int(time.time()*1000);mode=c['phone']['mode']
        loop_id=value['runId']+':'+str(c.get('cycle',0))
        if self.store.begin_loop(loop_id,c,now=now):
            self.ui.update(open=False,conversationId=None,readThroughByConversation=self.store.meta('readThroughByConversation',{}),readThrough=self.store.meta('readThrough',0),dismissed=0,revision=self.ui['revision']+1)
        if c['instance']!=self.last_scene:
            self.last_scene=c['instance'];self.ui.update(open=False,conversationId=None,dismissed=0,revision=self.ui['revision']+1)
            self.store.emit('scene.started',{'scene':self.store.scene(c),'baseMode':mode},key=c['instance']+':scene',now=now)
        if mode!=self.last_base_mode:
            # Scene-owned transitions win over a conversation left open by a visitor.
            self.ui.update(open=False,conversationId=None,revision=self.ui['revision']+1)
            self.last_base_mode=mode
        deliveries=self.scene_messages.get(c['id'],[{'id':'midpoint','at':c['messageAt'],'text':str(c['index']+1)+'씬 테스트'}])
        for delivery in deliveries:
            if c['elapsed']<delivery['at']:continue
            item=self.store.message(delivery['text'],True,c,key=c['instance']+':'+delivery['id'],now=now,conversation_id=delivery.get('conversationId'))
            if item:
                self.ui['revision']+=1
                if self.ui['open'] and self.ui['conversationId']==item['conversationId']:self.read_conversation(item['conversationId'])
        game=value.get('game') or {}
        if game.get('stage')=='play':
            self.store.emit('game.round.started',{'scene':self.store.scene(c),'round':game['round'],'number':game['roundNumber']},key=game['round']+':start',now=now)
        for result in game.get('roundResults',[]):
            self.store.emit('game.round.ended',{'scene':self.store.scene(c),**result},key=result['round']+':end',now=now)
        if game.get('complete'):
            self.store.emit('game.completed',{'scene':self.store.scene(c),'rounds':game['roundResults'],'durationMs':game['completeAt']},key=c['instance']+':complete',now=now)
        self.changed.notify_all()

    def server_close(self):
        self.stopping=True
        with self.changed:self.changed.notify_all()
        super().server_close()
        with self.state_lock:self.store.close()


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        origin=self.headers.get('Origin')
        if origin in self.server.event_origins and urllib.parse.urlsplit(self.path).path.startswith('/api/events'):
            self.send_header('Access-Control-Allow-Origin',origin)
            self.send_header('Vary','Origin')
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
            if parsed.path == '/api/events/stream':
                return self.event_stream(parsed)
            if parsed.path == '/api/events':
                try:after=max(0,int(urllib.parse.parse_qs(parsed.query).get('after',['0'])[0]))
                except ValueError:return self.reply({'error':'Invalid cursor'},400)
                with self.server.state_lock:events=self.server.store.events(after);cursor=self.server.store.cursor()
                return self.reply({'events':events,'cursor':events[-1]['id'] if events else after,'latestCursor':cursor})
            if parsed.path == '/api/messages':
                try:before=int(urllib.parse.parse_qs(parsed.query).get('before',['9223372036854775807'])[0])
                except ValueError:return self.reply({'error':'Invalid cursor'},400)
                conversation=urllib.parse.parse_qs(parsed.query).get('conversationId',[None])[0]
                if conversation is not None and conversation not in CONVERSATIONS:return self.reply({'error':'Unknown conversation'},400)
                with self.server.state_lock:history=self.server.store.messages(before=before,conversation_id=conversation)
                return self.reply(history)
            if parsed.path == '/api/info':
                return self.reply({'phoneUrl':self.server.phone_url,'eventSource':'dual-display','eventSchemaVersion':1,'eventStream':'/api/events/stream','nominalLoopMs':720000})
            if parsed.path != '/api/state':
                return self.reply({'error': 'Not found'}, 404)
            with self.server.state_lock:
                data = dict(self.server.state or {'started': False, 'paused': True, 'elapsed': 0, 'observedAt': 0, 'cues': []})
                data['phoneState'] = self.server.phone_state()
                data['eventCursor'] = self.server.store.cursor()
                data['videoSeek'] = self.server.current_video_seek()
                data['connected'] = self.server.state is not None and time.monotonic() - self.server.state_received < 3
            data['serverTime'] = time.time() * 1000
            return self.reply(data)
        if self.client_address[0] not in ('127.0.0.1', '::1'):
            allowed = {'/phone.html', '/phone.js', '/phone.css', '/device-screen.js', '/exhibition-playback.js', '/media/blank-video.webm', '/media/youtube-short.mp4', '/video-controls.js', '/video-controls.css',
                       '/phone-messages.js', '/phone-messages.css', '/blitz-session.js', '/exhibition-events.js', '/blitz-game.js', '/blitz-view.js', '/blitz-audio.js', '/media/blitz/frame.png', '/media/blitz/board.png', '/media/blitz/gems.png',
                       '/media/blitz/recording.m4a', '/media/blitz/match.m4a', '/media/blitz/swap.m4a', '/media/blitz/power.m4a'}
            if parsed.path not in allowed:
                return self.reply({'error': 'Not found'}, 404)
        return super().do_GET()

    def send_head(self):
        self.range_remaining = None
        requested = self.headers.get('Range')
        if urllib.parse.urlsplit(self.path).path != '/media/youtube-short.mp4' or not requested:
            return super().send_head()
        path = Path(self.translate_path(self.path))
        size = path.stat().st_size
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', requested)
        if not match or not any(match.groups()):
            self.send_error(416)
            return None
        first,last = match.groups()
        start = int(first) if first else max(0,size-int(last))
        end = min(size-1,int(last)) if first and last else size-1
        if not 0 <= start <= end < size:
            self.send_response(416)
            self.send_header('Content-Range','bytes */'+str(size))
            self.send_header('Content-Length','0')
            self.end_headers()
            return None
        stream = path.open('rb')
        stream.seek(start)
        self.range_remaining = end-start+1
        self.send_response(206)
        self.send_header('Content-Type','video/mp4')
        self.send_header('Accept-Ranges','bytes')
        self.send_header('Content-Range','bytes {}-{}/{}'.format(start,end,size))
        self.send_header('Content-Length',str(self.range_remaining))
        self.end_headers()
        return stream

    def copyfile(self, source, outputfile):
        remaining = getattr(self,'range_remaining',None)
        if remaining is None:
            return super().copyfile(source,outputfile)
        while remaining:
            chunk = source.read(min(65536,remaining))
            if not chunk:
                break
            try:
                outputfile.write(chunk)
            except (BrokenPipeError,ConnectionResetError):
                return
            remaining -= len(chunk)

    def do_POST(self):
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path == '/api/phone/action':
            return self.phone_action(parsed)
        if parsed.path == '/api/video/seek':
            return self.video_seek(parsed)
        if parsed.path == '/api/game/input':
            return self.game_input(parsed)
        if self.path != '/api/state':
            return self.reply({'error': 'Not found'}, 404)
        if self.client_address[0] not in ('127.0.0.1', '::1') or self.headers.get('X-Exhibition-Token') != self.server.token:
            return self.reply({'error': 'Publisher denied'}, 403)
        try:
            size = int(self.headers.get('Content-Length', 0))
            if not 0 < size <= 131072:
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
            c=value.get('current')
            if not isinstance(c,dict) or not isinstance(c.get('phone'),dict) or c.get('id') not in ('smoking','rain','youtube','police','game','dog'):
                raise ValueError('Invalid current cue')
            if c['phone'].get('mode') not in ('clock','youtube','game') or not isinstance(c.get('instance'),str):
                raise ValueError('Invalid phone cue')
            ack = value.get('inputAck', 0)
            value = {k: value[k] for k in ('started', 'paused', 'elapsed', 'cues', 'runId', 'game', 'current', 'lastCycleMilliseconds')}
            value['observedAt'] = observed
            with self.server.state_lock:
                self.server.receive_state(value)
                if isinstance(ack, int):
                    self.server.inputs = [i for i in self.server.inputs if i['id'] > ack]
                inputs = list(self.server.inputs)
                video_seek = self.server.current_video_seek()
                phone_state = self.server.phone_state()
            return self.reply({'ok': True, 'inputs': inputs, 'videoSeek':video_seek, 'phoneState':phone_state})
        except (ValueError, KeyError, TypeError):
            return self.reply({'error': 'Invalid state'}, 400)

    def event_stream(self, parsed):
        try:cursor=max(0,int(self.headers.get('Last-Event-ID') or urllib.parse.parse_qs(parsed.query).get('after',['0'])[0]))
        except ValueError:return self.reply({'error':'Invalid cursor'},400)
        self.send_response(200);self.send_header('Content-Type','text/event-stream; charset=utf-8');self.send_header('X-Accel-Buffering','no');self.end_headers()
        try:
            self.wfile.write(b': connected\n\n');self.wfile.flush()
            while not self.server.stopping:
                with self.server.changed:
                    events=self.server.store.events(cursor)
                    if not events:self.server.changed.wait(timeout=15)
                    if self.server.stopping:break
                    if not events:events=self.server.store.events(cursor)
                if events:
                    for event in events:
                        data='id: {}\ndata: {}\n\n'.format(event['id'],json.dumps(event,ensure_ascii=False))
                        self.wfile.write(data.encode('utf-8'));cursor=event['id']
                else:self.wfile.write(b': heartbeat\n\n')
                self.wfile.flush()
        except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):pass
        self.close_connection=True

    def phone_action(self, parsed):
        key=urllib.parse.parse_qs(parsed.query).get('key',[''])[0]
        if key!=self.server.token:return self.reply({'error':'Pairing key required'},403)
        try:
            size=int(self.headers.get('Content-Length',0))
            if not 0<size<=4096:raise ValueError()
            value=json.loads(self.rfile.read(size));action=value['action']
            if action not in ('messages.open','messages.select','messages.list','messages.back','messages.dismiss','messages.reply'):raise ValueError()
            with self.server.changed:
                phase=self.server.active_phase()
                if not phase or value.get('instance')!=phase['instance']:return self.reply({'error':'Scene changed'},409)
                ui=self.server.ui;c=self.server.state['current'];history=self.server.store.messages(limit=1)
                if action in ('messages.open','messages.select'):
                    conversation=value.get('conversationId')
                    if conversation is None and action=='messages.open':
                        latest=next((m for m in reversed(self.server.store.messages()['items']) if m['incoming']),None)
                        conversation=latest['conversationId'] if latest else 'daughter'
                    if conversation not in CONVERSATIONS:raise ValueError()
                    ui.update(open=True,conversationId=conversation);self.server.read_conversation(conversation)
                elif action=='messages.list':ui.update(open=True,conversationId=None)
                elif action=='messages.back':ui.update(open=False,conversationId=None)
                elif action=='messages.dismiss':ui['dismissed']=history['items'][-1]['id'] if history['items'] else 0
                elif action=='messages.reply':
                    text=value.get('text','');conversation=value.get('conversationId')
                    if not ui['open'] or conversation!=ui['conversationId'] or conversation not in CONVERSATIONS or not isinstance(text,str) or not 0<len(text.strip())<=500:raise ValueError()
                    self.server.store.message(text.strip(),False,c,conversation_id=conversation)
                ui['revision']+=1
                self.server.store.emit('phone.screen.changed',{'scene':self.server.store.scene(c),'screen':'messages' if ui['open'] else phase['baseMode'],'action':action,'conversationId':ui['conversationId']})
                self.server.changed.notify_all();state=self.server.phone_state()
            return self.reply({'phoneState':state})
        except (ValueError,KeyError,TypeError):return self.reply({'error':'Invalid phone action'},400)

    def video_seek(self, parsed):
        key = urllib.parse.parse_qs(parsed.query).get('key', [''])[0]
        if key != self.server.token:
            return self.reply({'error':'Pairing key required'}, 403)
        try:
            size = int(self.headers.get('Content-Length',0))
            if not 0 < size <= 1024:
                raise ValueError()
            value = json.loads(self.rfile.read(size))
            position = value['position']
            if type(position) not in (int,float) or not math.isfinite(position) or not 0 <= position <= self.server.video_duration:
                raise ValueError()
            with self.server.state_lock:
                phase = self.server.active_phase()
                if not phase or phase['baseMode']!='youtube' or self.server.ui['open'] or value.get('round')!=phase['instance']:
                    return self.reply({'error':'Video scene is not active'},409)
                self.server.video_revision += 1
                seek = {'round':phase['instance'],'offset':position-phase['elapsed']/1000,'revision':self.server.video_revision}
                self.server.video_seek = seek
                self.server.store.emit('video.seek',{'scene':self.server.store.scene(self.server.state['current']),'position':position})
                self.server.changed.notify_all()
            return self.reply({'videoSeek':seek})
        except (ValueError,KeyError,TypeError):
            return self.reply({'error':'Invalid seek'},400)

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
