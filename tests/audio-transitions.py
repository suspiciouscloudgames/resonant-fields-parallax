"""PC and mobile must each produce the full mix, without unmuting YouTube."""
import importlib.util,json,sys,tempfile,threading,shutil,urllib.request,urllib.error,time,base64,io
from PIL import Image
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
spec=importlib.util.spec_from_file_location('launcher',ROOT/'exhibition-launcher.py');L=importlib.util.module_from_spec(spec);spec.loader.exec_module(L)
folder=Path(tempfile.mkdtemp(prefix='dual-audio-'));server=L.ExhibitionServer(ROOT,'dual-audio',host='127.0.0.1',storage_path=folder/'test.sqlite3');threading.Thread(target=server.serve_forever,daemon=True).start()
origin='http://127.0.0.1:'+str(server.server_port);process=cdp=None
meter='''const NativeAudio=window.AudioContext;window.audioMeters=[];window.AudioContext=class extends NativeAudio{constructor(...args){super(...args);const meter=this.createAnalyser();meter.fftSize=2048;meter.connect(this.destination);audioMeters.push(meter);const create=this.createGain.bind(this);this.createGain=()=>{const gain=create(),connect=gain.connect.bind(gain);gain.connect=(target,...args)=>connect(target===this.destination?meter:target,...args);return gain;};}};'''
try:
 process,cdp=L.connect_browser('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',folder/'chrome',origin+'/exhibition.html?run=dual-audio',['--headless=new','--screen-info={0,0 1024x600}{1024,0 600x1024}'])
 hub=L.target_session(cdp,next(t['targetId'] for t in cdp.call('Target.getTargets')['targetInfos'] if '/exhibition.html' in t.get('url','')))
 cdp.call('Page.enable',{},hub);cdp.call('Page.addScriptToEvaluateOnNewDocument',{'source':meter+";addEventListener('DOMContentLoaded',()=>{ExhibitionHours.isOpen=()=>true;ExhibitionHours.setSleeping(false);});"},hub);cdp.call('Page.reload',{},hub)
 L.wait_for(lambda:cdp.evaluate(hub,'(window.audioMeters?.length||0)>=2'))
 hub,outputs=L.launch_outputs(cdp,origin,'dual-audio')
 target=cdp.call('Target.createTarget',{'url':'about:blank'});phone=L.target_session(cdp,target['targetId']);cdp.call('Page.enable',{},phone);cdp.call('Page.addScriptToEvaluateOnNewDocument',{'source':meter+";addEventListener('DOMContentLoaded',()=>{ExhibitionHours.isOpen=()=>true;ExhibitionHours.setSleeping(false);});"},phone);cdp.call('Page.navigate',{'url':origin+'/phone.html?key=dual-audio'},phone)
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
 # Every animation phase has a bed, and exit audio follows the rendered actor.
 boundaries=ev(hub,"""(()=>{
 const result=[];
 for(const original of Installation.playback.cues.filter(c=>c.side==='outdoor')){
  let elapsed=0,seenGone=false,firstGone=null;
  for(const phase of original.phases){
   const samples=phase.state==='exit'?Array.from({length:Math.ceil(phase.duration/50)},(_,i)=>i*50):[0,Math.max(0,phase.duration-1)];
   for(const t of samples){
    const cue={...original,phase:phase.state,phaseTime:t,phaseRemaining:phase.duration-t,clock:elapsed+t,phone:{mode:'clock',paused:false}};
    SceneGame.renderExhibition(cue.side,cue.number,elapsed+t,elapsed+t,cue);
    const mix=SceneAudio.mix(cue);
    if(mix.music+mix.traffic+mix.rain<=0)throw Error('Silent phase '+cue.id+'/'+cue.phase);
    if(cue.indoorVisible&&(mix.traffic!==0||mix.rain!==0))throw Error('Outdoor sound over visible indoor actor');
    if(phase.state==='exit'){
     if(cue.indoorVisible&&seenGone)throw Error('Actor reappeared after audio departure '+cue.id+' '+t);
     if(!cue.indoorVisible){if(firstGone===null)firstGone=t;seenGone=true;if(mix.traffic<=0)throw Error('Late outdoor sound');}
    }
   }
   elapsed+=phase.duration;
  }
  if(firstGone===null)throw Error('Exit visibility never cleared '+original.id);
  result.push({id:original.id,firstGone});
 }
 return result;
})()""")
 print('PASS: real rendered departure boundaries and audible mix in every phase:',boundaries,flush=True)
 # Real-time crossings: monitor both devices for silence while each transition plays.
 for scene in ['rain','police','dog']:
  cue=next(c for c in cues if c['id']==scene)
  departure=next(b['firstGone'] for b in boundaries if b['id']==scene)
  for phase,offset in [('exit',max(0,departure-400)),('return_wait',3500)]:
   at(scene,phase,offset)
   samples=[];deadline=time.monotonic()+2.0
   while time.monotonic()<deadline:
    samples.append([rms(hub),rms(phone)]);time.sleep(.08)
   assert min(min(s) for s in samples)>.00001,(scene,phase,'silent output',samples)
   print('PASS: uninterrupted PC/mobile output across',scene,phase,flush=True)
 at('rain','return_enter',2500)
 levels({'music':.42,'traffic':0,'rain':0})
 assert status(hub)['scene']['volume']==1.2 and status(phone)['scene']['volume']==1
 print('PASS: returning indoor music, strict outdoor mute, PC +20%, mobile unchanged.',flush=True)

finally:
 if cdp:
  try:cdp.call('Browser.close')
  except Exception:pass
  cdp.close()
 if process:
  try:process.wait(timeout=5)
  except Exception:process.terminate()
 server.shutdown();server.server_close();shutil.rmtree(folder,ignore_errors=True)
