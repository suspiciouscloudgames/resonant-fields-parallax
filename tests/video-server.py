"""Validate authoritative video seeking and HTTP byte ranges used by Android."""
import json
from pathlib import Path
import sys
import threading
import time
import urllib.request
import urllib.error
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from exhibition_server import ExhibitionServer
root=Path(__file__).resolve().parents[1]
server=ExhibitionServer(root,'video-test',host='127.0.0.1')
threading.Thread(target=server.serve_forever,daemon=True).start()
origin='http://127.0.0.1:'+str(server.server_port)
cues=[{'duration':d,'phases':[{'state':'home','duration':d}]} for d in [45000,80000,100000,160000,65000,145000]]
cues[2]['phases']=[{'state':'tablet','duration':1800},{'state':'read','duration':96000},{'state':'stow','duration':1100},{'state':'home','duration':1100}]
def request(path,body=None,headers=None):
 req=urllib.request.Request(origin+path,data=None if body is None else json.dumps(body).encode(),headers=headers or {})
 try:
  with urllib.request.urlopen(req,timeout=3) as r:return r.status,r.headers,r.read()
 except urllib.error.HTTPError as e:return e.code,e.headers,e.read()
def post(path,body):
 code,_,data=request(path,body,{'Content-Type':'application/json','X-Exhibition-Token':'video-test'});return code,json.loads(data)
def publish(**kw):
 state={'started':True,'paused':True,'elapsed':136800,'observedAt':time.time()*1000,'runId':'test','cues':cues,'game':None,'inputAck':0};state.update(kw)
 state['lastCycleMilliseconds']=None
 state['current']={'id':'youtube' if state['elapsed']<225000 else 'police','index':2,'instance':state['runId']+':2','phase':'read','phaseTime':10000,'elapsed':11800,'messageAt':50000,'phone':{'mode':'youtube' if state['elapsed']<225000 else 'clock','round':state['runId']+':2','elapsed':10000}}
 return post('/api/state',state)
def seek(position=55,round='test:2',key='video-test'):return post('/api/video/seek?key='+key,{'position':position,'round':round})
try:
 assert seek()[0]==409;assert seek(key='wrong')[0]==403
 publish();code,data=seek();assert code==200;assert abs(data['videoSeek']['offset']-45)<.01
 assert publish()[1]['videoSeek']==data['videoSeek']
 assert json.loads(request('/api/state?key=video-test')[2])['videoSeek']==data['videoSeek']
 assert seek(-1)[0]==400;assert seek(96)[0]==400;assert seek(True)[0]==400;assert seek(float('nan'))[0]==400;assert seek(round='old:2')[0]==409
 second=seek(80)[1]['videoSeek'];assert second['revision']>data['videoSeek']['revision'];assert second['offset']==70
 publish(elapsed=225000);assert seek()[0]==409;assert publish(elapsed=225000)[1]['videoSeek'] is None
 publish(runId='new');assert publish(runId='new')[1]['videoSeek'] is None
 publish();server.state_received=time.monotonic()-4;assert seek()[0]==409
 video=(root/'dist/media/youtube-short.mp4').read_bytes()
 for header,expected in [('bytes=0-99',video[:100]),('bytes=100-199',video[100:200]),('bytes=-50',video[-50:])]:
  code,headers,body=request('/media/youtube-short.mp4',headers={'Range':header});assert code==206;assert body==expected;assert headers['Accept-Ranges']=='bytes'
 assert request('/media/youtube-short.mp4',headers={'Range':'bytes=999999999-'})[0]==416
 print('PASS: shared seek positions, revision ordering, scene/reset/stale/auth bounds and MP4 byte-range seeking.')
finally:server.shutdown();server.server_close()
