"""Measure actual phone rendering during round entry and variable state-response delay."""
import importlib.util, json, shutil, sys, tempfile, threading
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
spec=importlib.util.spec_from_file_location('launcher',str(ROOT/'exhibition-launcher.py'));L=importlib.util.module_from_spec(spec);spec.loader.exec_module(L)
folder=Path(tempfile.mkdtemp(prefix='blitz-fall-'));server=L.ExhibitionServer(ROOT,'fall-test',host='127.0.0.1',storage_path=folder/'test.sqlite3')
threading.Thread(target=server.serve_forever,daemon=True).start();origin='http://127.0.0.1:'+str(server.server_port);process=cdp=None
try:
 process,cdp=L.connect_browser('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',folder/'chrome',origin+'/exhibition.html?run=fall-test',['--headless=new','--screen-info={0,0 1024x600}{1024,0 600x1024}'])
 hub,outputs=L.launch_outputs(cdp,origin,'fall-test')
 target=cdp.call('Target.createTarget',{'url':origin+'/phone.html?key=fall-test','newWindow':True});p=L.target_session(cdp,target['targetId'])
 cdp.call('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':2,'mobile':True},p)
 ev=lambda js:cdp.evaluate(p,js)
 L.wait_for(lambda:ev('!!window.PhoneView&&!!window.BlitzView'))
 ev("""window.fallFrames=[];const render=BlitzView.render;BlitzView.render=(canvas,game,elapsed,options)=>{if(game)fallFrames.push({at:performance.now(),round:game.round,stage:game.stage,phase:game.phase,revision:game.revision,elapsed,progress:options.transition?.progress});return render(canvas,game,elapsed,options)};
 const fetchOriginal=window.fetch;let n=0;window.fetch=async(...args)=>{const r=await fetchOriginal(...args);if(String(args[0]).includes('/api/state'))await new Promise(resolve=>setTimeout(resolve,++n%2?15:110));return r};""")
 # 460s scene start + 1.8s tablet + 60s game + 0.9s score + 1s exit.
 cdp.evaluate(hub,'Installation.playback.start(Date.now()-523700);Installation.playback.advance(Date.now());Installation.publish(true)')
 L.wait_for(lambda:ev("fallFrames.some(f=>f.stage==='entry')"))
 L.wait_for(lambda:ev("PhoneView.game?.roundNumber===2&&PhoneView.playable"))
 frames=ev("fallFrames.filter(f=>f.stage==='entry'&&f.progress>.05&&f.progress<.95)")
 pairs=list(zip(frames,frames[1:]));stalls=sum(abs(b['progress']-a['progress'])<1e-7 for a,b in pairs);back=sum(b['progress']<a['progress']-1e-7 for a,b in pairs)
 print('Round-entry rendered frames:',len(frames),'frozen:',stalls,'backward:',back,flush=True)
 if '--baseline' not in sys.argv:
  assert len(frames)>=20,frames
  assert stalls==0 and back==0,'Round entry must move every rendered frame despite irregular network updates'
 # External authoritative input exercises refills without the local-input prediction path.
 ev('fallFrames.length=0')
 ev("(()=>{const g=PhoneView.game,[from,to]=BlitzGame.moves(g.board)[0];fetch('/api/game/input?key=fall-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({round:g.round,revision:g.revision,from,to,requestId:'fall-regression:1'})})})()")
 # Keep monitoring a normal round clock across jittery responses.
 before=ev('fallFrames.length');L.wait_for(lambda:ev('fallFrames.length')>before+60)
 frames=ev("fallFrames.filter(f=>f.stage==='play')")
 falls=[f for f in frames if f['phase']=='fall']
 assert len(falls)>=2,'The test must render actual replacement gems falling'
 back=sum(b['elapsed']<a['elapsed']-0.01 for a,b in zip(frames,frames[1:]))
 print('Playing rendered frames:',len(frames),'refill frames:',len(falls),'clock reversals:',back,flush=True)
 if '--baseline' not in sys.argv:assert back==0,'Falling animation time must never rewind on receipt of an older snapshot'
 print(('BASELINE' if '--baseline' in sys.argv else 'PASS')+': continuous round entry and monotonic animation clock under 15/110ms response jitter.',flush=True)
finally:
 if cdp:
  try:cdp.call('Browser.close')
  except Exception:pass
  cdp.close()
 if process:
  try:process.wait(timeout=5)
  except Exception:process.terminate()
 server.shutdown();server.server_close();shutil.rmtree(folder,ignore_errors=True)
