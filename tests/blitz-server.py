"""The phone can submit adjacent moves only during the active game round."""
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
server=ExhibitionServer(root,'test-key',host='127.0.0.1')
threading.Thread(target=server.serve_forever,daemon=True).start()
origin='http://127.0.0.1:'+str(server.server_port)
cues=[{'duration':d,'phases':[{'state':'home','duration':d}]} for d in [45000,80000,45000,160000,65000,145000]]
cues[4]['phases']=[{'state':'tablet','duration':1800},{'state':'gaming','duration':60000},{'state':'stow','duration':1100},{'state':'home','duration':2100}]
def call(path,body,token=False):
 headers={'Content-Type':'application/json'}
 if token:headers['X-Exhibition-Token']='test-key'
 request=urllib.request.Request(origin+path,data=json.dumps(body).encode(),headers=headers)
 try:
  with urllib.request.urlopen(request,timeout=3) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
def publish(**updates):
 value={'started':True,'paused':False,'elapsed':340000,'observedAt':time.time()*1000,'runId':'test','cues':cues,'game':{'round':'test:4','revision':0,'phase':'idle','stage':'play','roundNumber':1},'inputAck':0}
 value.update(updates)
 mode='clock' if value['elapsed']==391800 else 'game'
 value['lastCycleMilliseconds']=None
 value['current']={'id':'game','index':4,'instance':'test:4','phase':'gaming','phaseTime':8200,'elapsed':10000,'messageAt':95000,'phone':{'mode':mode,'round':'test:4','elapsed':8200}}
 return call('/api/state',value,True)
def move(**updates):
 value={'round':'test:4','revision':0,'from':0,'to':1,'requestId':'phone:1'};value.update(updates)
 return call('/api/game/input?key=test-key',value)
try:
 assert move()[0]==409
 assert publish()[0]==200
 code,first=move();assert code==200
 assert move()[1]['id']==first['id']
 assert len(publish()[1]['inputs'])==1
 assert publish(inputAck=first['id'])[1]['inputs']==[]
 assert move(**{'from':7,'to':8})[0]==400
 assert move(**{'from':0,'to':9})[0]==400
 assert move(round='old:4')[0]==409
 assert move(revision=10,requestId='phone:2')[0]==409
 assert call('/api/game/input?key=wrong',{})[0]==403
 assert call('/api/state',{})[0]==403
 assert publish(paused=True)[0]==200
 assert move(requestId='phone:3')[0]==409
 publish(elapsed=391800)
 assert move(requestId='phone:4')[0]==409
 publish(game={'round':'test:4','revision':0,'phase':'fall','stage':'play','roundNumber':1})
 assert move(requestId='phone:5')[0]==409
 publish()
 assert call('/api/phone/action?key=test-key',{'action':'messages.open','instance':'test:4'})[0]==200
 assert call('/api/phone/action?key=test-key',{'action':'messages.back','instance':'test:4'})[0]==200
 with server.state_lock:
  server.store.message('5씬 테스트',True,server.state['current'])
 assert call('/api/phone/action?key=test-key',{'action':'messages.open','instance':'test:4'})[0]==200
 assert move(requestId='phone:messages')[0]==409
 assert call('/api/phone/action?key=test-key',{'action':'messages.back','instance':'old'})[0]==409
 assert call('/api/phone/action?key=test-key',{'action':'messages.back','instance':'test:4'})[0]==200
 with server.state_lock:server.state_received=time.monotonic()-4
 assert move(requestId='phone:6')[0]==409
 print('PASS: scene/round/pause/deadline gating, adjacency, authentication, stale-state rejection, idempotent input, host acknowledgement.')
finally:
 server.shutdown();server.server_close()
