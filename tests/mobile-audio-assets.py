"""Exercise the non-loopback phone allowlist using a remote-client fixture."""
import sys,threading,urllib.request,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from exhibition_server import ExhibitionServer,Handler
original=Handler.do_GET
def remote_get(self):
 self.client_address=('192.0.2.10',12345)
 return original(self)
Handler.do_GET=remote_get
server=ExhibitionServer(ROOT,'asset-test',host='127.0.0.1');threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 for path in ['/phone.html','/exhibition-hours.js','/scene-audio.js','/rain-encounter.js','/blitz-audio.js','/media/music/to-the-star.mp3','/media/ambience/traffic.m4a','/media/ambience/rain.m4a','/media/blitz/recording.m4a','/media/blitz/match.m4a']:
  with urllib.request.urlopen('http://127.0.0.1:'+str(server.server_port)+path) as r:assert r.status==200 and r.read(),path
 try:urllib.request.urlopen('http://127.0.0.1:'+str(server.server_port)+'/exhibition.html');raise AssertionError('Host page exposed to phone')
 except urllib.error.HTTPError as e:assert e.code==404
 print('PASS: all mobile audio dependencies served to non-loopback phones; host-only pages remain unavailable.')
finally:server.shutdown();server.server_close()
