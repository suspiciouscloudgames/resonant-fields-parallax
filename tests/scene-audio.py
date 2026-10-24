"""Decode and measure real ambient output from the hidden two-display host."""
import importlib.util,json,shutil,sys,tempfile,threading
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
spec=importlib.util.spec_from_file_location('launcher',str(ROOT/'exhibition-launcher.py'));L=importlib.util.module_from_spec(spec);spec.loader.exec_module(L)
folder=Path(tempfile.mkdtemp(prefix='scene-audio-'))
server=L.ExhibitionServer(ROOT,'audio-test',host='127.0.0.1',storage_path=folder/'test.sqlite3')
threading.Thread(target=server.serve_forever,daemon=True).start()
origin='http://127.0.0.1:'+str(server.server_port);process=cdp=None
try:
 process,cdp=L.connect_browser('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',folder/'chrome',origin+'/exhibition.html?run=audio-test',['--headless=new','--screen-info={0,0 1024x600}{1024,0 600x1024}'])
 hub=L.target_session(cdp,next(t['targetId'] for t in cdp.call('Target.getTargets')['targetInfos'] if '/exhibition.html' in t.get('url','')))
 cdp.call('Page.enable',{},hub)
 cdp.call('Page.addScriptToEvaluateOnNewDocument',{'source':'''const NativeAudio=window.AudioContext;window.audioMeters=[];
 window.AudioContext=class extends NativeAudio{
  constructor(...args){super(...args);const meter=this.createAnalyser();meter.fftSize=2048;meter.connect(this.destination);window.audioMeter=meter;window.audioMeters.push(meter);
   const create=this.createGain.bind(this);this.createGain=()=>{const gain=create(),connect=gain.connect.bind(gain);gain.connect=(target,...args)=>connect(target===this.destination?meter:target,...args);return gain;};}
 };'''},hub)
 cdp.call('Page.reload',{},hub)
 L.wait_for(lambda:cdp.evaluate(hub,'!!window.audioMeter'))
 hub,outputs=L.launch_outputs(cdp,origin,'audio-test')
 def ev(script,session=hub):
  r=cdp.call('Runtime.evaluate',{'expression':script,'awaitPromise':True,'returnByValue':True,'userGesture':False},session)
  if 'exceptionDetails' in r:raise AssertionError(r['exceptionDetails'])
  return r.get('result',{}).get('value')
 def status():return ev('SceneAudio.status')
 def rms():return ev('(()=>{return Math.sqrt(audioMeters.reduce((sum,meter)=>{const a=new Float32Array(meter.fftSize);meter.getFloatTimeDomainData(a);return sum+a.reduce((s,v)=>s+v*v,0)/a.length},0))})()')
 L.wait_for(lambda:ev('!!window.SceneAudio&&SceneAudio.status.ready'))
 assert status()['context']=='running',status()
 assert status()['targets']=={'music':.42,'traffic':0,'rain':0}
 L.wait_for(lambda:rms()>.0001)
 cues=ev('Installation.playback.cues');starts={};cursor=0
 for cue in cues:starts[cue['id']]=cursor;cursor+=cue['duration']
 def at(scene,phase,offset=1000):
  cue=next(c for c in cues if c['id']==scene);time=starts[scene]
  for p in cue['phases']:
   if p['state']==phase:break
   time+=p['duration']
  time+=offset
  ev('Installation.playback.start(Date.now()-'+str(time)+');Installation.playback.advance(Date.now());Installation.advance(Date.now())')
  L.wait_for(lambda:ev('Installation.playback.status.current.phase')==phase)
 at('rain','outside')
 L.wait_for(lambda:status()['targets']['traffic']==.6 and rms()>.0001)
 assert status()['targets']['rain']==0,'No rain before the visual rainfall'
 at('rain','rain_encounter',1900)
 L.wait_for(lambda:status()['targets']['rain']==.85 and rms()>.0001)
 assert status()['targets']['traffic']==.32
 at('rain','return_wait');assert status()['targets']['rain']==.85
 at('rain','return_enter')
 L.wait_for(lambda:status()['targets']=={'music':.42,'traffic':0,'rain':0} and rms()>.0001)
 for scene,phase in [('police','encounter'),('dog','dog_encounter')]:
  at(scene,phase);L.wait_for(lambda:rms()>.0001)
  assert status()['targets']=={'music':0,'traffic':.6,'rain':0}
 assert status()['sources']==3,'Only one set of loops across both display windows'
 for output in outputs.values():assert ev('typeof window.SceneAudio',output['session'])=='undefined'
 ev('Installation.playback.pause(true);Installation.advance(Date.now()+40)')
 L.wait_for(lambda:rms()<.00001)
 assert status()['targets']=={'music':0,'traffic':0,'rain':0}
 ev('Installation.playback.pause(false);Installation.advance(Date.now()+80)')
 L.wait_for(lambda:rms()>.0001)
 at('youtube','read');L.wait_for(lambda:status()['targets']['music']==.42 and rms()>.0001)
 assert status()['targets']=={'music':.42,'traffic':0,'rain':0}
 assert ev("document.getElementById('source-video').volume")==0
 assert ev("document.getElementById('source-video').muted") is True
 assert not status()['error']
 print('PASS: actual decoded indoor music and traffic/rain output, unattended autoplay, visible rain timing, indoor fade and music-only muted video, pause/resume, single host mix for two displays.',flush=True)
finally:
 if cdp:
  try:cdp.call('Browser.close')
  except Exception:pass
  cdp.close()
 if process:
  try:process.wait(timeout=5)
  except Exception:process.terminate()
 server.shutdown();server.server_close();shutil.rmtree(folder,ignore_errors=True)
