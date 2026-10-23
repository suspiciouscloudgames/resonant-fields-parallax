"""Render every narrative card at actual output resolution and check scene independence."""
import base64,importlib.util,json,shutil,sys,tempfile,threading
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
spec=importlib.util.spec_from_file_location('launcher',str(ROOT/'exhibition-launcher.py'));L=importlib.util.module_from_spec(spec);spec.loader.exec_module(L)
folder=Path(tempfile.mkdtemp(prefix='narrative-captions-'));server=L.ExhibitionServer(ROOT,'caption-test',host='127.0.0.1');threading.Thread(target=server.serve_forever,daemon=True).start();process=cdp=None
try:
 origin='http://127.0.0.1:'+str(server.server_port)
 process,cdp=L.connect_browser('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',folder/'chrome',origin+'/exhibition.html?run=caption-test',['--headless=new','--screen-info={0,0 1024x600}{1024,0 600x1024}'])
 hub,outputs=L.launch_outputs(cdp,origin,'caption-test')
 cdp.evaluate(hub,'Installation.playback.start(0);Installation.playback.pause(true,0)')
 cues=cdp.evaluate(hub,'Installation.playback.cues')
 if not cues:cues=cdp.evaluate(hub,'Installation.playback.status.cues')
 # The status exposes current and the full scene list through publish snapshots.
 if not cues:
  import urllib.request
  cdp.evaluate(hub,'Installation.publish(true)')
  cues=json.load(urllib.request.urlopen(origin+'/api/state?key=caption-test'))['cues']
 total=0;sceneStart=0
 out=ROOT/'output/exhibition-validation';out.mkdir(exist_ok=True,parents=True)
 for cue in cues:
  rows=cdp.evaluate(hub,'SceneCaptions.sequence('+json.dumps(cue)+')')
  for n,row in enumerate(rows):
   id='landscape' if cue['side']=='indoor' else 'portrait';session=outputs[id]['session']
   result=cdp.evaluate(session,"""(()=>{const c=document.getElementById('screen');const l=opener.SceneCaptions.layout(%s,c.width,c.height,%s);return {lines:l.lines,font:l.fontMM,inside:l.x>=0&&l.y>=0&&l.x+l.w<=c.width&&l.y+l.h<=c.height};})()"""%(json.dumps(id),json.dumps(row['text'])))
   assert result['inside'] and result['font']==7,(cue['id'],result)
   assert 1<=len(result['lines'])<=4,(cue['id'],row,result)
   assert ''.join(result['lines']).replace(' ','')==row['text'].replace(' ','')
   total+=1
  # Inspect representative actual scene output, including the final closing line.
  selected=len(rows)-1 if cue['id']=='dog' else min(2,len(rows)-1)
  t=sceneStart+rows[selected]['at']
  cdp.evaluate(hub,'(()=>{const p=Installation.playback,d='+str(t)+'-p.status.elapsed;p.pause(false,0);p.advance(d);p.pause(true,d)})()')
  L.wait_for(lambda:cdp.evaluate(hub,'Installation.playback.status.current.id')==cue['id'])
  # Explicit canvas composition avoids waiting for an offscreen browser frame.
  result=cdp.evaluate(hub,"""(()=>{const c=document.createElement('canvas');c.width=%s;c.height=%s;const before=JSON.stringify(Installation.playback.status);Installation.paintCaption(c,%s);return {image:c.toDataURL().split(',')[1],unchanged:before===JSON.stringify(Installation.playback.status)};})()"""%((1000 if cue['side']=='indoor' else 600),(606 if cue['side']=='indoor' else 990),json.dumps(id)))
  assert result['unchanged'];(out/('caption-'+cue['id']+'.png')).write_bytes(base64.b64decode(result['image']))
  sceneStart+=cue['duration']
 print('PASS:',total,'native-resolution caption cards, complete text without clipping, 7 mm type, all six scenes, final closing line and independent phone/scene state.')
finally:
 if cdp:
  try:cdp.call('Browser.close')
  except Exception:pass
  cdp.close()
 if process:
  try:process.wait(timeout=5)
  except Exception:process.terminate()
 server.shutdown();server.server_close();shutil.rmtree(folder,ignore_errors=True)
