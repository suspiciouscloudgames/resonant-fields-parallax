"""Scene sender routing, independent reads/replies, fixed daughter history and loop reset."""
import json,sys,threading,time,urllib.request,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from exhibition_server import ExhibitionServer
server=ExhibitionServer(ROOT,'conversations-test',host='127.0.0.1');threading.Thread(target=server.serve_forever,daemon=True).start()
origin='http://127.0.0.1:'+str(server.server_port)
def request(path,body=None):
 req=urllib.request.Request(origin+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json','X-Exhibition-Token':'conversations-test'})
 try:
  with urllib.request.urlopen(req,timeout=3) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
def publish(i,cycle=0,locked=False,elapsed=None):
 scene={'id':['smoking','rain','youtube','police','game','dog'][i],'index':i,'cycle':cycle,'instance':'run:'+str(cycle*6+i),'elapsed':server.scene_messages[['smoking','rain','youtube','police','game','dog'][i]][0]['at'],'messageAt':50,'phase':'home','phaseTime':50,'phone':{'sceneLock':locked,'mode':'clock','round':'run:'+str(cycle*6+i),'elapsed':0}}
 if elapsed is not None:scene['elapsed']=elapsed
 return request('/api/state',{'started':True,'paused':True,'elapsed':50,'observedAt':time.time()*1000,'runId':'run','cues':[{}]*6,'game':None,'current':scene,'lastCycleMilliseconds':None})
def action(action,conversation=None,text=None):return request('/api/phone/action?key=conversations-test',{'action':'messages.'+action,'conversationId':conversation,'text':text,'instance':server.last_scene})
try:
 for i in range(6):
  code,result=publish(i);assert code==200
  state=result['phoneState'];item=state['messages'][-1]
  assert item['conversationId']==('neighbor' if i==5 else 'daughter')
  assert item['sender']==('저장되지 않은 번호' if i==5 else '딸')
  assert [c['id'] for c in state['conversations']]==(['daughter','neighbor'] if i==5 else ['daughter'])
  if i==5:assert state['conversations'][1]['total']==1
  assert publish(i)[1]['phoneState']['total']==4+i
 publish(5,locked=True)
 assert action('open','neighbor')[0]==409
 publish(5)
 assert action('select','invalid')[0]==400
 assert not [e for e in server.store.events() if e['type']=='message.read']
 state=action('select','daughter')[1]['phoneState'];assert state['ui']['conversationId']=='daughter'
 assert state['conversations'][0]['unread']==0 and state['conversations'][1]['unread']==1
 assert action('reply','neighbor','잘못된 대상')[0]==400
 assert action('reply','daughter','딸에게 답장')[0]==200
 state=action('list')[1]['phoneState'];assert state['ui']['open'] and state['ui']['conversationId'] is None
 state=action('select','neighbor')[1]['phoneState'];assert state['conversations'][1]['unread']==0
 assert action('reply','neighbor','이웃에게 답장')[0]==200
 for _ in range(3):action('back');action('open','neighbor')
 reads=[e for e in server.store.events() if e['type']=='message.read']
 assert len(reads)==1 and reads[0]['payload']['scene']['instance']=='run:5'
 assert reads[0]['payload']['conversationId']=='neighbor'
 # Replayed state and duplicate calls cannot issue another read signal.
 publish(5);action('select','neighbor')
 assert len([e for e in server.store.events() if e['type']=='message.read'])==1
 _,page=request('/api/messages?key=conversations-test&conversationId=neighbor')
 assert [m['text'] for m in page['items']]==[server.scene_messages['dog'][0]['text'],'이웃에게 답장']
 assert all(m['conversationId']=='neighbor' for m in page['items'])
 _,page=request('/api/messages?key=conversations-test&conversationId=daughter')
 assert page['total']==9 and page['items'][-1]['text']=='딸에게 답장'
 assert request('/api/messages?key=conversations-test&conversationId=invalid')[0]==400
 publish(0,1,elapsed=0);action('open','daughter')
 assert len([e for e in server.store.events() if e['type']=='message.read'])==1
 publish(0,1);state=request('/api/state?key=conversations-test')[1]['phoneState']
 assert state['total']==4 and [c['id'] for c in state['conversations']]==['daughter']
 assert [m['incoming'] for m in state['messages'][:3]]==[True,False,True]
 action('open','daughter');action('open','daughter')
 assert len([e for e in server.store.events() if e['type']=='message.read'])==2
 events=request('/api/events?key=conversations-test')[1]['events'];incoming=[e for e in events if e['type']=='message.received'];assert len(incoming)==7
 assert incoming[5]['payload']['message']['sender']=='저장되지 않은 번호'
 print('PASS: once-per-scene read signal, repeated opens, wrong/old conversation, already-open arrival, next loop; two threads, only scene six from unknown sender, independent unread state, selected-thread replies, filtered pagination, preset exchange and loop reset.')
finally:server.shutdown();server.server_close()
