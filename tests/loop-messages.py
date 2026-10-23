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
  L.wait_for(lambda:cdp.evaluate(p,'!!PhoneView.state.sceneLock')==bool(get()['current']['phone'].get('sceneLock')))
 def tap(selector):
  box=cdp.evaluate(p,'(()=>{const r=document.querySelector('+json.dumps(selector)+').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
  for kind in ['mousePressed','mouseReleased']:cdp.call('Input.dispatchMouseEvent',{'type':kind,'button':'left','clickCount':1,**box},p)
 def wait_messages(opened):L.wait_for(lambda:cdp.evaluate(p,'PhoneView.messages.open')==opened and cdp.evaluate(hub,'PhoneMessages.project('+json.dumps(get()['phoneState'])+',DeviceScreen.state).open')==opened)
 def leave_inbox():
  if get()['current']['phone']['mode']=='clock':
   assert cdp.evaluate(p,"document.querySelector('.pm-back').hidden")
   # Fixture cleanup only: visitors have no clock exit; the next scene closes it.
   body={'action':'messages.back','instance':get()['current']['instance']}
   request=urllib.request.Request(origin+'/api/phone/action?key=loop-test',data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
   urllib.request.urlopen(request).close()
  else:tap('.pm-back')
  wait_messages(False)
 def shot(name):
  out=ROOT/'output/exhibition-validation';out.mkdir(parents=True,exist_ok=True);(out/(name+'.png')).write_bytes(base64.b64decode(cdp.call('Page.captureScreenshot',{'format':'png'},p)['data']))
 cdp.evaluate(hub,'Installation.playback.start(0);Installation.playback.pause(true,0)');jump(0)
 presets=get()['phoneState']['messages'];assert len(presets)==3
 assert all(m['preset'] and m['conversationId']=='daughter' for m in presets)
 assert [m['incoming'] for m in presets]==[True,False,True]
 assert [c['id'] for c in get()['phoneState']['conversations']]==['daughter']
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
 lengths=[c['duration'] for c in get()['cues']];starts=[sum(lengths[:i]) for i in range(6)];ids=[c['id'] for c in get()['cues']];counts=[len(server.scene_messages[name]) for name in ids];loop=sum(lengths)
 for i,(start,duration,name) in enumerate(zip(starts,lengths,ids)):
  jump(start);wait_messages(False)
  assert get()['current']['phone']['mode']=='clock' and get()['current']['phone']['sceneLock']
  assert cdp.evaluate(p,"document.activeElement!==document.querySelector('.pm-input')&&!PhoneView.messages.lock&&!PhoneView.messages.banner")
  message_at=server.scene_messages[name][0]['at']
  jump(start+message_at-1);assert get()['phoneState']['total']==3+sum(counts[:i])
  before=time.time()*1000;jump(start+message_at);s=get();assert s['current']['id']==name
  msg=s['phoneState']['messages'][-1];assert msg['conversationId']==('neighbor' if i==5 else 'daughter');assert msg['sender']==('저장되지 않은 번호' if i==5 else '딸');assert msg['text']==server.scene_messages[name][0]['text'];assert before-100<=msg['receivedAt']<=time.time()*1000+100
  L.wait_for(lambda:cdp.evaluate(p,'PhoneView.messages.items.length')==4+sum(counts[:i]))
  base='youtube' if i==2 else 'game' if i==4 else 'clock';assert cdp.evaluate(p,'PhoneView.state.mode')==base
  selector='.pm-banner:not(.pm-lock)' if base!='clock' else '.pm-lock'
  L.wait_for(lambda:cdp.evaluate(p,'!document.querySelector('+json.dumps(selector)+').hidden'))
  if i in (0,2,4):shot('loop-'+base+'-notification')
  tap(selector);wait_messages(True)
  L.wait_for(lambda:cdp.evaluate(hub,"DeviceScreen.pixels().some(v=>v==='rgb(255,255,255)')"))
  assert cdp.evaluate(p,"document.querySelector('.pm-contact strong').textContent")==('저장되지 않은 번호' if i==5 else '딸')
  assert cdp.evaluate(p,"document.querySelectorAll('.pm-row time').length")== (1 if i==5 else 4+sum(counts[:i]))
  if i==4:shot('loop-messages');assert not cdp.evaluate(p,'PhoneView.playable')
  tap('.pm-back');L.wait_for(lambda:cdp.evaluate(p,'PhoneView.messages.open&&PhoneView.messages.conversationId===null'));assert cdp.evaluate(p,"document.querySelectorAll('.pm-conversation').length")== (2 if i==5 else 1)
  if i==5:shot('loop-two-conversations')
  leave_inbox();assert cdp.evaluate(p,'PhoneView.state.mode')==base
  for n,delivery in enumerate(server.scene_messages[name][1:],1):
   jump(start+delivery['at']-1);assert get()['phoneState']['total']==3+sum(counts[:i])+n
   before=time.time()*1000;jump(start+delivery['at']);received=get()['phoneState']['messages'][-1]
   assert received['incoming']==delivery.get('incoming',True)
   assert received['sender']==('나' if not delivery.get('incoming',True) else '저장되지 않은 번호' if i==5 else '딸')
   assert received['text']==delivery['text'] and before-100<=received['receivedAt']<=time.time()*1000+100
   L.wait_for(lambda:cdp.evaluate(p,'PhoneView.messages.items.length')==4+sum(counts[:i])+n)
   if i==5 and n==2:
    tap('.pm-lock');wait_messages(True)
    assert cdp.evaluate(p,"document.querySelector('.pm-thread').scrollTop")==0
    assert cdp.evaluate(p,"document.querySelector('.pm-thread').scrollHeight>document.querySelector('.pm-thread').clientHeight+100")
   if i==5 and n==3:
    assert cdp.evaluate(p,"document.querySelector('.pm-thread').scrollTop")==0,'Incoming long SMS must not move a reader at the beginning'
    shot('neighbor-reading');tap('.pm-back');L.wait_for(lambda:cdp.evaluate(p,'PhoneView.messages.conversationId===null'));leave_inbox()
  if i==5:shot('neighbor-lock')
  preview=cdp.evaluate(p,"(()=>{const e=document.querySelector('.pm-lock .pm-preview'),s=getComputedStyle(e);return {height:e.clientHeight,line:parseFloat(s.lineHeight),full:e.textContent}})()")
  assert preview['height']<=preview['line']*2+1 and preview['full']==next(m['text'] for m in reversed(server.scene_messages[name]) if m.get('incoming',True))
  if i==4:
   before=get()['game']['elapsed'];assert before>18200 and not get()['current']['phone']['paused']
   # The single game message was already read; reopen via API for timer regression.
   body={'action':'messages.open','conversationId':'daughter','instance':get()['current']['instance']}
   urllib.request.urlopen(urllib.request.Request(origin+'/api/phone/action?key=loop-test',data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})).close();wait_messages(True)
   jump(start+59999);assert get()['game']['elapsed']==58199 and get()['phoneState']['ui']['open']
   jump(start+60000);wait_messages(True);assert not get()['current']['phone']['paused']
   jump(start+61000);assert get()['game']['elapsed']==59200
   tap('.pm-back');L.wait_for(lambda:cdp.evaluate(p,'PhoneView.messages.conversationId===null'));tap('.pm-back');wait_messages(False)
  jump(start+duration-1200)
  assert get()['phoneState']['total']==3+sum(counts[:i+1])
  if i<5:
   body={'action':'messages.open','conversationId':'daughter','instance':get()['current']['instance']}
   request=urllib.request.Request(origin+'/api/phone/action?key=loop-test',data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
   urllib.request.urlopen(request).close();wait_messages(True)
   L.wait_for(lambda:cdp.evaluate(p,"document.querySelectorAll('.pm-row').length")==3+sum(counts[:i+1]))
   expected_outgoing=1+sum(not m.get('incoming',True) for name in ids[:i+1] for m in server.scene_messages[name])
   assert cdp.evaluate(p,"document.querySelectorAll('.pm-outgoing').length")==expected_outgoing
   cdp.evaluate(p,"document.querySelector('.pm-input').focus();document.querySelector('.pm-input').value='unfinished reply'")
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
 shot('loop-neighbor-thread');tap('.pm-back');L.wait_for(lambda:cdp.evaluate(p,'PhoneView.messages.conversationId===null'));leave_inbox()
 # The final round ends at 648900; after stowing, the dog scene starts at 635000.
 jump(960000);assert get()['current']['id']=='smoking';assert get()['lastCycleMilliseconds']==960000;assert get()['phoneState']['total']==3;assert get()['phoneState']['messages']==presets
 jump(961800);tap('.pm-lock');wait_messages(True);assert cdp.evaluate(p,"Array.from(document.querySelectorAll('.pm-bubble'),e=>e.textContent)")==[m['text'] for m in presets];tap('.pm-back');L.wait_for(lambda:cdp.evaluate(p,'PhoneView.messages.conversationId===null'));leave_inbox()
 # Real power gems in every round: the host extends the scene until settlement finishes.
 cdp.evaluate(hub,"(()=>{const original=BlitzGame.create;BlitzGame.create=seed=>{const board=Array.from({length:64},(_,i)=>((i/8|0)*2+i%8)%7);board[27]=24;return original(seed,board)}})()")
 for start,duration in zip(starts[:4],lengths[:4]):jump(960000+start+server.scene_messages[ids[starts.index(start)]] [-1]['at'])
 jump(960000+445000+115000);assert get()['game']['roundNumber']==2
 settlement=cdp.evaluate(hub,'BlitzSession.create(Installation.playback.status.current.instance).advance(1000000).completeAt');game_end=960000+445000+1800+settlement+1100
 jump(960000+635000);assert get()['current']['id']=='game';assert get()['current']['phone']['mode']=='game'
 jump(game_end-1100);s=get();assert s['game']['complete'];assert len(s['game']['roundResults'])==3;assert s['current']['phone']['mode']=='clock';assert all(r['score']>0 for r in s['game']['roundResults'])
 jump(game_end);assert get()['current']['id']=='dog';jump(game_end+server.scene_messages['dog'][-1]['at']);jump(game_end+325000);assert get()['current']['id']=='smoking';assert get()['lastCycleMilliseconds']==game_end+325000-960000;assert get()['phoneState']['total']==3;assert get()['phoneState']['messages']==presets
 # Phone reload retains history; late subscribers replay exactly the same durable events.
 cdp.call('Page.reload',{},p);L.wait_for(lambda:cdp.evaluate(p,'window.PhoneView?.messages.items.length')==3)
 events=[];cursor=0
 while True:
  page=get('/api/events?after='+str(cursor));events.extend(page['events']);cursor=page['cursor']
  if cursor>=page['latestCursor']:break
 received=[e for e in events if e['type']=='message.received'];assert len(received)==26;assert len({e['id'] for e in events})==len(events)
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
 print('PASS: two complete real host loops (960000ms / dynamic length with power settlements), 26 incoming and 6 scripted outgoing events, two separate conversations, daughter scenes 1–5 / unknown sender scene 6, selected-thread replies, three exchanged presets after each loop, lock/video/game cards, Messages + character sync, three final scores, clock at game end, reload persistence, durable SSE replay, unchanged printed plate.',flush=True)
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
 if 'saved_cursor' in locals():assert store.messages()['total']==3;assert store.messages()['items']==presets;assert store.cursor()==saved_cursor;print('PASS: current-loop inbox and event history survive PC server restart.',flush=True)
 store.close();shutil.rmtree(str(folder),ignore_errors=True)
