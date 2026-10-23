"""Real host/phone regression for old SMS cards flashing during media scene exits."""
import importlib.util,json,sys,tempfile,threading,shutil,urllib.request,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
spec=importlib.util.spec_from_file_location('launcher',ROOT/'exhibition-launcher.py');L=importlib.util.module_from_spec(spec);spec.loader.exec_module(L)
folder=Path(tempfile.mkdtemp(prefix='phone-transition-'));server=L.ExhibitionServer(ROOT,'transition-test',host='127.0.0.1',storage_path=folder/'test.sqlite3');threading.Thread(target=server.serve_forever,daemon=True).start()
origin='http://127.0.0.1:'+str(server.server_port);process=cdp=None
try:
 process,cdp=L.connect_browser('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',folder/'chrome',origin+'/exhibition.html?run=transition-test',['--headless=new','--screen-info={0,0 1024x600}{1024,0 600x1024}'])
 hub,outputs=L.launch_outputs(cdp,origin,'transition-test')
 target=cdp.call('Target.createTarget',{'url':origin+'/phone.html?key=transition-test'});phone=L.target_session(cdp,target['targetId'])
 cdp.evaluate(hub,'window.testClock=Date.now();Installation.playback.start(testClock);Installation.playback.pause(true,testClock)')
 previous=0
 def ev(code):return cdp.evaluate(phone,code)
 def get():return json.load(urllib.request.urlopen(origin+'/api/state?key=transition-test'))
 def jump(t):
  global previous
  cdp.evaluate(hub,'(()=>{const p=Installation.playback;p.pause(false,testClock+'+str(previous)+');p.advance(testClock+'+str(t)+');p.pause(true,testClock+'+str(t)+');Installation.advance(testClock+'+str(t+1)+')})()');previous=t
  L.wait_for(lambda:abs(get()['elapsed']-t)<1)
  state=get();L.wait_for(lambda:ev('window.PhoneView?.state.instance')==state['current']['instance'] and ev('!!PhoneView.state.sceneLock')==bool(state['current']['phone'].get('sceneLock')))
  return state
 def action(name):
  req=urllib.request.Request(origin+'/api/phone/action?key=transition-test',data=json.dumps({'action':'messages.'+name,'conversationId':'daughter','instance':get()['current']['instance']}).encode(),headers={'Content-Type':'application/json'})
  try:
   with urllib.request.urlopen(req) as r:return r.status
  except urllib.error.HTTPError as e:return e.code
 def hidden():
  assert ev('!PhoneView.messages.open&&!PhoneView.messages.banner&&!PhoneView.messages.lock')
  assert ev("document.querySelector('.pm-messages').hidden&&document.querySelector('.pm-lock-list').hidden&&document.querySelector('.pm-banner').hidden")
  assert not ev("document.activeElement===document.querySelector('.pm-input')")
  assert action('open')==409,'Late taps must not reopen old messages during closing animation'
 for name,start in [('youtube',160000),('game',445000)]:
  jump(start+30000);assert action('open')==200
  L.wait_for(lambda:ev('PhoneView.messages.open'))
  ev("document.querySelector('.pm-input').focus()")
  if name=='youtube':closing=start+97800;end=start+100000
  else:
   complete=cdp.evaluate(hub,'BlitzSession.create(Installation.playback.status.current.instance).advance(250000).completeAt')
   closing=start+1800+complete;end=closing+1100
  for t in [closing,closing+500,end-1,end,end+500,end+1799]:jump(t);hidden()
  jump(end+1800);L.wait_for(lambda:ev('PhoneView.messages.lock'))
  print('PASS: '+name+' exit and next-scene opening never show old cards/panel; late taps rejected; history available afterward.',flush=True)
finally:
 if cdp:
  try:cdp.call('Browser.close')
  except Exception:pass
  cdp.close()
 if process:
  try:process.wait(timeout=5)
  except Exception:process.terminate()
 server.shutdown();server.server_close();shutil.rmtree(folder,ignore_errors=True)
