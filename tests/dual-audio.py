"""PC and mobile must each produce the full mix, without unmuting YouTube."""
import importlib.util,json,sys,tempfile,threading,shutil,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
spec=importlib.util.spec_from_file_location('launcher',ROOT/'exhibition-launcher.py');L=importlib.util.module_from_spec(spec);spec.loader.exec_module(L)
folder=Path(tempfile.mkdtemp(prefix='dual-audio-'));server=L.ExhibitionServer(ROOT,'dual-audio',host='127.0.0.1',storage_path=folder/'test.sqlite3');threading.Thread(target=server.serve_forever,daemon=True).start()
origin='http://127.0.0.1:'+str(server.server_port);process=cdp=None
meter='''const NativeAudio=window.AudioContext;window.audioMeters=[];window.AudioContext=class extends NativeAudio{constructor(...args){super(...args);const meter=this.createAnalyser();meter.fftSize=2048;meter.connect(this.destination);audioMeters.push(meter);const create=this.createGain.bind(this);this.createGain=()=>{const gain=create(),connect=gain.connect.bind(gain);gain.connect=(target,...args)=>connect(target===this.destination?meter:target,...args);return gain;};}};'''
try:
 process,cdp=L.connect_browser('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',folder/'chrome',origin+'/exhibition.html?run=dual-audio',['--headless=new','--screen-info={0,0 1024x600}{1024,0 600x1024}'])
 hub=L.target_session(cdp,next(t['targetId'] for t in cdp.call('Target.getTargets')['targetInfos'] if '/exhibition.html' in t.get('url','')))
 cdp.call('Page.enable',{},hub);cdp.call('Page.addScriptToEvaluateOnNewDocument',{'source':meter},hub);cdp.call('Page.reload',{},hub)
 L.wait_for(lambda:cdp.evaluate(hub,'(window.audioMeters?.length||0)>=2'))
 hub,outputs=L.launch_outputs(cdp,origin,'dual-audio')
 target=cdp.call('Target.createTarget',{'url':'about:blank'});phone=L.target_session(cdp,target['targetId']);cdp.call('Page.enable',{},phone);cdp.call('Page.addScriptToEvaluateOnNewDocument',{'source':meter},phone);cdp.call('Page.navigate',{'url':origin+'/phone.html?key=dual-audio'},phone)
 def ev(session,code):return cdp.evaluate(session,code)
 def status(session):return ev(session,'({scene:SceneAudio.status,game:BlitzAudio.status})')
 def rms(session):return ev(session,'Math.sqrt(audioMeters.reduce((sum,m)=>{const a=new Float32Array(m.fftSize);m.getFloatTimeDomainData(a);return sum+a.reduce((s,v)=>s+v*v,0)/a.length},0))')
 L.wait_for(lambda:ev(phone,'!!window.PhoneView?.connected&&!!window.SceneAudio?.status.ready'))
 ev(phone,'Promise.all([SceneAudio.unlock(),BlitzAudio.unlock()])')
 for session in [hub,phone]:L.wait_for(lambda:status(session)['scene']['ready'] and status(session)['game']['ready'])
 cues=ev(hub,'Installation.playback.cues');starts={};cursor=0
 for cue in cues:starts[cue['id']]=cursor;cursor+=cue['duration']
 def at(scene,phase,offset=2500):
  cue=next(c for c in cues if c['id']==scene);t=starts[scene]
  for p in cue['phases']:
   if p['state']==phase:break
   t+=p['duration']
  t+=offset;ev(hub,'(()=>{const now=Date.now();Installation.playback.start(now-'+str(t)+');Installation.playback.advance(now);Installation.publish(true)})()')
  L.wait_for(lambda:ev(phone,'PhoneView.state.instance')==ev(hub,'Installation.playback.status.current.instance'))
 def levels(expected):
  for session in [hub,phone]:
   try:L.wait_for(lambda:status(session)['scene']['targets']==expected)
   except Exception:
    print('Audio failure',session,expected,status(session),flush=True);raise
   L.wait_for(lambda:rms(session)>.0001)
 at('smoking','smoke');levels({'music':.42,'traffic':0,'rain':0})
 at('rain','outside');levels({'music':0,'traffic':.6,'rain':0})
 at('rain','rain_encounter');levels({'music':0,'traffic':.32,'rain':.85})
 at('game','gaming');levels({'music':.1,'traffic':0,'rain':0})
 for session in [hub,phone]:L.wait_for(lambda:status(session)['game']['playing'])
 def action(name):
  instance=ev(hub,'Installation.playback.status.current.instance');req=urllib.request.Request(origin+'/api/phone/action?key=dual-audio',data=json.dumps({'action':'messages.'+name,'conversationId':'daughter','instance':instance}).encode(),headers={'Content-Type':'application/json'});urllib.request.urlopen(req).close()
 action('open');levels({'music':.42,'traffic':0,'rain':0})
 for session in [hub,phone]:L.wait_for(lambda:not status(session)['game']['playing'])
 action('back');levels({'music':.1,'traffic':0,'rain':0})
 at('youtube','read');levels({'music':.42,'traffic':0,'rain':0})
 for session in [hub,phone]:
  ev(session,'DeviceScreen.unlockVideo()')
  assert ev(session,"document.querySelector('video').muted&&document.querySelector('video').volume===0")
  assert not status(session)['game']['playing']
 ev(hub,'Installation.playback.pause(true)')
 for session in [hub,phone]:
  L.wait_for(lambda:status(session)['scene']['targets']=={'music':0,'traffic':0,'rain':0})
  L.wait_for(lambda:rms(session)<.00001)
 print('PASS: actual PC and mobile audio output for music, street, rain and game; shared game duck/recovery, pause, and permanently muted YouTube.',flush=True)
finally:
 if cdp:
  try:cdp.call('Browser.close')
  except Exception:pass
  cdp.close()
 if process:
  try:process.wait(timeout=5)
  except Exception:process.terminate()
 server.shutdown();server.server_close();shutil.rmtree(folder,ignore_errors=True)
