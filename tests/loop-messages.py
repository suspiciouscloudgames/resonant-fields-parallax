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
 starts=[0,45000,125000,225000,385000,575000];lengths=[45000,80000,100000,160000,190000,145000];ids=['smoking','rain','youtube','police','game','dog']
 for i,(start,duration,name) in enumerate(zip(starts,lengths,ids)):
  jump(start+duration//2-1);assert get()['phoneState']['total']==i
  before=time.time()*1000;jump(start+duration//2);s=get();assert s['current']['id']==name
  msg=s['phoneState']['messages'][-1];assert msg['text']==str(i+1)+'씬 테스트';assert before-100<=msg['receivedAt']<=time.time()*1000+100
  L.wait_for(lambda:cdp.evaluate(p,'PhoneView.messages.items.length')==i+1)
  base='youtube' if i==2 else 'game' if i==4 else 'clock';assert cdp.evaluate(p,'PhoneView.state.mode')==base
  selector='.pm-banner:not(.pm-lock)' if base!='clock' else '.pm-lock'
  L.wait_for(lambda:cdp.evaluate(p,'!document.querySelector('+json.dumps(selector)+').hidden'))
  if i in (0,2,4):shot('loop-'+base+'-notification')
  tap(selector);wait_messages(True)
  L.wait_for(lambda:cdp.evaluate(hub,"DeviceScreen.pixels().some(v=>v==='rgb(255,255,255)')"))
  label=cdp.evaluate(p,"document.querySelector('.pm-back').textContent");assert ('잠금화면' if base=='clock' else '영상' if base=='youtube' else '게임') in label
  assert cdp.evaluate(p,"document.querySelectorAll('.pm-row time').length")==i+1
  if i==4:shot('loop-messages');assert not cdp.evaluate(p,'PhoneView.playable')
  tap('.pm-back');wait_messages(False);assert cdp.evaluate(p,'PhoneView.state.mode')==base
  jump(start+duration-1200)
  assert get()['phoneState']['total']==i+1
 # Third game ended at 573900, clock during stow; dog begins exactly at 575000.
 jump(720000);assert get()['current']['id']=='smoking';assert get()['lastCycleMilliseconds']==720000;assert get()['phoneState']['total']==6
 # Real power gems in every round: the host extends the scene until settlement finishes.
 cdp.evaluate(hub,"(()=>{const original=BlitzGame.create;BlitzGame.create=seed=>{const board=Array.from({length:64},(_,i)=>((i/8|0)*2+i%8)%7);board[27]=24;return original(seed,board)}})()")
 for start,duration in zip(starts[:4],lengths[:4]):jump(720000+start+duration//2)
 jump(720000+385000+95000);assert get()['game']['roundNumber']==2
 settlement=cdp.evaluate(hub,'BlitzSession.create(Installation.playback.status.current.instance).advance(1000000).completeAt');game_end=720000+385000+1800+settlement+1100
 jump(720000+575000);assert get()['current']['id']=='game';assert get()['current']['phone']['mode']=='game'
 jump(game_end-1100);s=get();assert s['game']['complete'];assert len(s['game']['roundResults'])==3;assert s['current']['phone']['mode']=='clock';assert all(r['score']>0 for r in s['game']['roundResults'])
 jump(game_end);assert get()['current']['id']=='dog';jump(game_end+72500);jump(game_end+145000);assert get()['current']['id']=='smoking';assert get()['lastCycleMilliseconds']==game_end+145000-720000;assert get()['phoneState']['total']==12
 # Phone reload retains history; late subscribers replay exactly the same durable events.
 cdp.call('Page.reload',{},p);L.wait_for(lambda:cdp.evaluate(p,'window.PhoneView?.messages.items.length')==12)
 events=get('/api/events')['events'];received=[e for e in events if e['type']=='message.received'];assert len(received)==12;assert len({e['id'] for e in events})==len(events)
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
 print('PASS: two complete real host loops (720000ms / dynamic length with power settlements), 12 actual-time SMS, lock/video/game cards, Messages + character sync, three final scores, clock at game end, reload persistence, durable SSE replay, unchanged printed plate.',flush=True)
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
 if 'saved_cursor' in locals():assert store.messages()['total']==12;assert store.cursor()==saved_cursor;print('PASS: message/event history survives PC server restart.',flush=True)
 store.close();shutil.rmtree(str(folder),ignore_errors=True)
