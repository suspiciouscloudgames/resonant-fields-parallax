"""Real host renderer and independent mobile client decode and seek the same video."""
import base64
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
import threading
import time
import urllib.request
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
spec=importlib.util.spec_from_file_location('launcher',str(ROOT/'exhibition-launcher.py'))
L=importlib.util.module_from_spec(spec);spec.loader.exec_module(L)
server=L.ExhibitionServer(ROOT,'video-browser-test',host='127.0.0.1')
threading.Thread(target=server.serve_forever,daemon=True).start()
origin='http://127.0.0.1:'+str(server.server_port)
profile=Path(tempfile.mkdtemp(prefix='video-sync-'));process=cdp=None
try:
 process,cdp=L.connect_browser('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',profile,origin+'/exhibition.html?run=video-browser-test',['--headless=new','--screen-info={0,0 1024x600}{1024,0 600x1024}'])
 hub,outputs=L.launch_outputs(cdp,origin,'video-browser-test')
 phone=cdp.call('Target.createTarget',{'url':origin+'/phone.html?key=video-browser-test','newWindow':True});p=L.target_session(cdp,phone['targetId'])
 cdp.call('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':1,'mobile':True},p)
 cdp.evaluate(hub,'Installation.playback.start(0);Installation.playback.advance(136800);Installation.playback.pause(true,136800)')
 L.wait_for(lambda:cdp.evaluate(p,"window.PhoneView?.state.mode==='youtube'&&document.getElementById('phone-video').readyState>=2"),timeout=15)
 L.wait_for(lambda:cdp.evaluate(hub,"document.getElementById('source-video').readyState>=2"),timeout=15)
 L.wait_for(lambda:abs(cdp.evaluate(p,"document.getElementById('phone-video').currentTime")-10)<.3)
 assert cdp.evaluate(p,"(()=>{const v=document.getElementById('phone-video');return v.videoWidth===480&&v.videoHeight===854&&!v.controls})()")
 assert cdp.evaluate(p,"document.querySelectorAll('.video-timeline input[type=range]').length") == 1
 assert cdp.evaluate(p,"Array.from(document.querySelectorAll('button,a')).filter(e=>e.getBoundingClientRect().height>0).length") == 0
 # A real touch on the sole control, rather than directly setting playback time.
 box=cdp.evaluate(p,"(()=>{const r=document.querySelector('.video-timeline input').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()")
 x=box['x']+box['w']*.6;y=box['y']+box['h']/2
 cdp.call('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]},p)
 cdp.call('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]},p)
 def synced():
  a=cdp.evaluate(hub,"document.getElementById('source-video').currentTime");b=cdp.evaluate(p,"document.getElementById('phone-video').currentTime")
  return a>50 and abs(a-b)<.3
 L.wait_for(synced,timeout=15)
 assert cdp.evaluate(hub,'Installation.playback.status.elapsed')==136800
 # Both clients draw the actual decoded video, preserving the printed backdrop.
 L.wait_for(lambda:cdp.evaluate(p,"!document.getElementById('phone-video').seeking") and cdp.evaluate(hub,"!document.getElementById('source-video').seeking") and abs(cdp.evaluate(p,"document.getElementById('phone-video').currentTime")-cdp.evaluate(hub,"document.getElementById('source-video').currentTime"))<.001)
 a=cdp.evaluate(hub,"(()=>{const c=document.createElement('canvas');c.width=36;c.height=24;DeviceScreen.render(c);return c.toDataURL()})()")
 b=cdp.evaluate(p,"(()=>{const c=document.createElement('canvas');c.width=36;c.height=24;DeviceScreen.render(c);return c.toDataURL()})()")
 assert a==b,'Phone and character device pixels differ after seek'
 plate=cdp.evaluate(hub,"SceneGame.background.toDataURL().split(',')[1]")
 assert base64.b64decode(plate)==(ROOT/'output/mobile-baseline/background.png').read_bytes(),'Printed backdrop changed'
 out=ROOT/'output/exhibition-validation';out.mkdir(parents=True,exist_ok=True)
 for name,session in [('phone-shorts',p),('character-shorts',outputs['landscape']['session'])]:
  shot=cdp.call('Page.captureScreenshot',{'format':'png'},session);(out/(name+'.png')).write_bytes(base64.b64decode(shot['data']))
 # Verify that a fresh cue clears the seek and leaving it removes the slider.
 cdp.evaluate(hub,'Installation.playback.start(0);Installation.playback.advance(136800);Installation.playback.pause(true,136800)')
 L.wait_for(lambda:abs(cdp.evaluate(p,"document.getElementById('phone-video').currentTime")-10)<.3)
 cdp.evaluate(hub,'Installation.playback.start(0);Installation.playback.advance(230000);Installation.playback.pause(true,230000)')
 L.wait_for(lambda:cdp.evaluate(p,"PhoneView.state.mode==='clock'&&document.querySelector('.video-timeline').hidden&&document.getElementById('phone-video').paused"))
 print('PASS: real 480×854 video, only timeline accepts touch, both screens seek together, identical device pixels, cue reset, inactive-video stop, unchanged print background.',flush=True)
finally:
 if cdp:
  try:cdp.call('Browser.close')
  except Exception:pass
  cdp.close()
 if process:
  try:process.wait(timeout=5)
  except Exception:process.terminate()
 server.shutdown();server.server_close();shutil.rmtree(str(profile),ignore_errors=True)
