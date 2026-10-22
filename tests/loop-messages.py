"""Exercise the real two-screen host, companion UI, persistent SMS and SSE replay."""
import base64,importlib.util,json,shutil,sys,tempfile,threading,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
spec=importlib.util.spec_from_file_location('launcher',str(ROOT/'exhibition-launcher.py'));L=importlib.util.module_from_spec(spec);spec.loader.exec_module(L)
folder=Path(tempfile.mkdtemp(prefix='loop-messages-'));db=folder/'history.sqlite3'
server=L.ExhibitionServer(ROOT,'loop-test',host='127.0.0.1',storage_path=db,event_origins=['https://other-installation.test']);threading.Thread(target=server.serve_forever,daemon=True).start()
origin='http://127.0.0.1:'+str(server.server_port);process=cdp=None
try:
 process,cdp=L.connect_browser('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',folder/'chrome',origin+'/exhibition.html?run=loop-test',['--headless=new','--screen-info={0,0 1024x600}{1024,0 600x1024}'])
 hub,outputs=L.launch_outputs(cdp,origin,'loop-test');phone=cdp.call('Target.createTarget',{'url':origin+'/phone.html?key=loop-test','newWindow':True});p=L.target_session(cdp,phone['targetId'])
 cdp.call('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':1,'mobile':True},p)
 def get(route='/api/state'):
  return json.load(urllib.request.urlopen(origin+route+('&' if '?' in route else '?')+'key=loop-test'))
 def jump(t):
  cdp.evaluate(hub,'(()=>{const p=Installation.playback,d='+str(t)+'-p.status.elapsed;p.pause(false,0);p.advance(d);p.pause(true,d)})()');cdp.evaluate(hub,'Installation.publish(true)');L.wait_for(lambda:abs(get()['elapsed']-t)<1)
  L.wait_for(lambda:cdp.evaluate(p,'window.PhoneView?.state.instance')==get()['current']['instance'])
 def tap(selector):
  box=cdp.evaluate(p,'(()=>{const r=document.querySelector('+json.dumps(selector)+').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
  for kind in ['mousePressed','mouseReleased']:cdp.call('Input.dispatchMouseEvent',{'type':kind,'button':'left','clickCount':1,**box},p)
 def wait_messages(opened):L.wait_for(lambda:cdp.evaluate(p,'PhoneView.messages.open')==opened and cdp.evaluate(hub,'PhoneMessages.project('+json.dumps(get()['phoneState'])+',DeviceScreen.state).open')==opened)
 def shot(name):
  out=ROOT/'output/exhibition-validation';out.mkdir(parents=True,exist_ok=True);(out/(name+'.png')).write_bytes(base64.b64decode(cdp.call('Page.captureScreenshot',{'format':'png'},p)['data']))
 cdp.evaluate(hub,'Installation.playback.start(0);Installation.playback.pause(true,0)');jump(1)
 presets=get()['phoneState']['messages'];assert len(presets)==5
 assert all(m['preset'] and m['conversationId']=='daughter' for m in presets)
 assert [m['incoming'] for m in presets]==[True,False,True,False,True]
 assert len(get()['phoneState']['conversations'])==2
 for m in presets:
  import datetime
  stamp=datetime.datetime.fromtimestamp(m['receivedAt']/1000)
  assert stamp.date()==datetime.datetime.now().date()-datetime.timedelta(days=7) and stamp.hour==14
 assert not any(e['type']=='message.received' for e in get('/api/events')['events'])
 for cue in get()['cues']:
  for delivery in server.scene_messages[cue['id']]:
   allowed='outside' if cue['side']=='outdoor' else {'smoking':'smoke','youtube':'read','game':'gaming'}[cue['id']]
   for at in [delivery['at'],delivery['readUntil']]:
    remaining=at
    for phase in cue['phases']:
     if remaining<phase['duration']:break
     remaining-=phase['duration']
    assert phase['state']==allowed,(cue['id'],at,phase['state'])
 starts=[0,50000,165000,265000,460000,690000];lengths=[50000,115000,100000,195000,230000,285000];ids=['smoking','rain','youtube','police','game','dog']
 for i,(start,duration,name) in enumerate(zip(starts,lengths,ids)):
  message_at=server.scene_messages[name][0]['at']
  jump(start+message_at-1);assert get()['phoneState']['total']==5+4*i
  before=time.time()*1000;jump(start+message_at);s=get();assert s['current']['id']==name
  msg=s['phoneState']['messages'][-1];assert msg['conversationId']==('neighbor' if i==5 else 'daughter');assert msg['sender']==('저장되지 않은 번호' if i==5 else '딸');assert msg['text']==server.scene_messages[name][0]['text'];assert before-100<=msg['receivedAt']<=time.time()*1000+100
  L.wait_for(lambda:cdp.evaluate(p,'PhoneView.messages.items.length')==6+4*i)
  base='youtube' if i==2 else 'game' if i==4 else 'clock';assert cdp.evaluate(p,'PhoneView.state.mode')==base
  selector='.pm-banner:not(.pm-lock)' if base!='clock' else '.pm-lock'
  L.wait_for(lambda:cdp.evaluate(p,'!document.querySelector('+json.dumps(selector)+').hidden'))
  if i in (0,2,4):shot('loop-'+base+'-notification')
  tap(selector);wait_messages(True)
  L.wait_for(lambda:cdp.evaluate(hub,"DeviceScreen.pixels().some(v=>v==='rgb(255,255,255)')"))
  assert cdp.evaluate(p,"document.querySelector('.pm-contact strong').textContent")==('저장되지 않은 번호' if i==5 else '딸')
  assert cdp.evaluate(p,"document.querySelectorAll('.pm-row time').length")== (1 if i==5 else 6+4*i)
  if i==4:shot('loop-messages');assert not cdp.evaluate(p,'PhoneView.playable')
  tap('.pm-back');L.wait_for(lambda:cdp.evaluate(p,'PhoneView.messages.open&&PhoneView.messages.conversationId===null'));assert cdp.evaluate(p,"document.querySelectorAll('.pm-conversation').length")==2
  if i==5:shot('loop-two-conversations')
  tap('.pm-back');wait_messages(False);assert cdp.evaluate(p,'PhoneView.state.mode')==base
  for n,delivery in enumerate(server.scene_messages[name][1:],1):
   jump(start+delivery['at']-1);assert get()['phoneState']['total']==5+4*i+n
   before=time.time()*1000;jump(start+delivery['at']);received=get()['phoneState']['messages'][-1]
   assert received['text']==delivery['text'] and before-100<=received['receivedAt']<=time.time()*1000+100
   L.wait_for(lambda:cdp.evaluate(p,'PhoneView.messages.items.length')==6+4*i+n)
   if i==5 and n==2:
    tap('.pm-lock');wait_messages(True)
    assert cdp.evaluate(p,"document.querySelector('.pm-thread').scrollTop")==0
    assert cdp.evaluate(p,"document.querySelector('.pm-thread').scrollHeight>document.querySelector('.pm-thread').clientHeight+100")
   if i==5 and n==3:
    assert cdp.evaluate(p,"document.querySelector('.pm-thread').scrollTop")==0,'Incoming long SMS must not move a reader at the beginning'
    shot('neighbor-reading');tap('.pm-back');L.wait_for(lambda:cdp.evaluate(p,'PhoneView.messages.conversationId===null'));tap('.pm-back');wait_messages(False)
  if i==5:shot('neighbor-lock')
  preview=cdp.evaluate(p,"(()=>{const e=document.querySelector('.pm-lock .pm-preview'),s=getComputedStyle(e);return {height:e.clientHeight,line:parseFloat(s.lineHeight),full:e.textContent}})()")
  assert preview['height']<=preview['line']*2+1 and preview['full']==server.scene_messages[name][-1]['text']
  if i==4:
   held=get()['game']['elapsed'];assert held==18200 and get()['current']['phone']['reading']
   tap('.pm-banner:not(.pm-lock)');wait_messages(True)
   jump(start+59999);assert get()['game']['elapsed']==held and get()['phoneState']['ui']['open']
   jump(start+60000);wait_messages(False);assert not get()['current']['phone']['reading']
   jump(start+61000);assert get()['game']['elapsed']==held+1000
  jump(start+duration-1200)
  assert get()['phoneState']['total']==(30 if i==5 else 9+4*i)
  print('Verified scene '+name+': safe reading windows, staged delivery and phone routing',flush=True)
 # During scene six, a reply to the daughter must stay in her thread.
 tap('.pm-lock');wait_messages(True);tap('.pm-back');L.wait_for(lambda:cdp.evaluate(p,'PhoneView.messages.conversationId===null'))
 tap('[data-conversation="daughter"]');L.wait_for(lambda:cdp.evaluate(p,"PhoneView.messages.conversationId==='daughter'"))
 tap('.pm-input');cdp.call('Input.insertText',{'text':'딸에게 답장 테스트'},p);tap('.pm-send')
 L.wait_for(lambda:get()['phoneState']['messages'][-1]['text']=='딸에게 답장 테스트')
 assert get()['phoneState']['messages'][-1]['conversationId']=='daughter'
 tap('.pm-back');L.wait_for(lambda:cdp.evaluate(p,'PhoneView.messages.conversationId===null'))
 tap('[data-conversation="neighbor"]');L.wait_for(lambda:cdp.evaluate(p,"PhoneView.messages.conversationId==='neighbor'"))
 assert cdp.evaluate(p,"Array.from(document.querySelectorAll('.pm-bubble'),e=>e.textContent)")==[m['text'] for m in server.scene_messages['dog']]
 shot('loop-neighbor-thread');tap('.pm-back');L.wait_for(lambda:cdp.evaluate(p,'PhoneView.messages.conversationId===null'));tap('.pm-back');wait_messages(False)
 # The final round ends at 688900; after stowing, the dog scene starts at 690000.
 jump(975000);assert get()['current']['id']=='smoking';assert get()['lastCycleMilliseconds']==975000;assert get()['phoneState']['total']==5;assert get()['phoneState']['messages']==presets
 tap('.pm-lock');wait_messages(True);assert cdp.evaluate(p,"Array.from(document.querySelectorAll('.pm-bubble'),e=>e.textContent)")==[m['text'] for m in presets];tap('.pm-back');L.wait_for(lambda:cdp.evaluate(p,'PhoneView.messages.conversationId===null'));tap('.pm-back');wait_messages(False)
 # Real power gems in every round: the host extends the scene until settlement finishes.
 cdp.evaluate(hub,"(()=>{const original=BlitzGame.create;BlitzGame.create=seed=>{const board=Array.from({length:64},(_,i)=>((i/8|0)*2+i%8)%7);board[27]=24;return original(seed,board)}})()")
 for start,duration in zip(starts[:4],lengths[:4]):jump(975000+start+server.scene_messages[ids[starts.index(start)]] [-1]['at'])
 jump(975000+460000+115000);assert get()['game']['roundNumber']==2
 settlement=cdp.evaluate(hub,'BlitzSession.create(Installation.playback.status.current.instance).advance(1000000).completeAt');game_end=975000+460000+1800+40000+settlement+1100
 jump(975000+690000);assert get()['current']['id']=='game';assert get()['current']['phone']['mode']=='game'
 jump(game_end-1100);s=get();assert s['game']['complete'];assert len(s['game']['roundResults'])==3;assert s['current']['phone']['mode']=='clock';assert all(r['score']>0 for r in s['game']['roundResults'])
 jump(game_end);assert get()['current']['id']=='dog';jump(game_end+150000);jump(game_end+285000);assert get()['current']['id']=='smoking';assert get()['lastCycleMilliseconds']==game_end+285000-975000;assert get()['phoneState']['total']==5;assert get()['phoneState']['messages']==presets
 # Phone reload retains history; late subscribers replay exactly the same durable events.
 cdp.call('Page.reload',{},p);L.wait_for(lambda:cdp.evaluate(p,'window.PhoneView?.messages.items.length')==5)
 events=[];cursor=0
 while True:
  page=get('/api/events?after='+str(cursor));events.extend(page['events']);cursor=page['cursor']
  if cursor>=page['latestCursor']:break
 received=[e for e in events if e['type']=='message.received'];assert len(received)==50;assert len({e['id'] for e in events})==len(events)
 req=urllib.request.Request(origin+'/api/events/stream?key=loop-test&after='+str(received[-1]['id']-1),headers={'Origin':'https://other-installation.test'})
 with urllib.request.urlopen(req,timeout=5) as stream:
  assert stream.headers['Access-Control-Allow-Origin']=='https://other-installation.test'
  for _ in range(10):
   line=stream.readline().decode()
   if line.startswith('data: '):assert json.loads(line[6:])==received[-1];break
  else:raise AssertionError('SSE replay missing')
 plate=cdp.evaluate(hub,"SceneGame.background.toDataURL().split(',')[1]");assert base64.b64decode(plate)==(ROOT/'output/mobile-baseline/background.png').read_bytes()
 assert cdp.evaluate(hub,'DeviceScreen.pixelHeight>DeviceScreen.pixelWidth')
 saved_cursor=get()['eventCursor']
 print('PASS: two complete real host loops (975000ms / dynamic length with power settlements), 50 actual-time SMS events, two separate conversations, daughter scenes 1–5 / unknown sender scene 6, selected-thread replies, five exchanged presets after each loop, lock/video/game cards, Messages + character sync, three final scores, clock at game end, reload persistence, durable SSE replay, unchanged printed plate.',flush=True)
finally:
 if cdp:
  try:cdp.call('Browser.close')
  except Exception:pass
  cdp.close()
 if process:
  try:process.wait(timeout=5)
  except Exception:process.terminate()
 server.shutdown();server.server_close()
 # Restart persistence uses the same database and event IDs.
 from exhibition_store import ExhibitionStore
 store=ExhibitionStore(db)
 if 'saved_cursor' in locals():assert store.messages()['total']==5;assert store.messages()['items']==presets;assert store.cursor()==saved_cursor;print('PASS: current-loop inbox and event history survive PC server restart.',flush=True)
 store.close();shutil.rmtree(str(folder),ignore_errors=True)
