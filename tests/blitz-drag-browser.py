"""Real mobile touch dragging and uninterrupted play during SMS delivery/reading."""
import base64, importlib.util, json, shutil, sys, tempfile, threading
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
spec=importlib.util.spec_from_file_location('launcher',str(ROOT/'exhibition-launcher.py'))
L=importlib.util.module_from_spec(spec);spec.loader.exec_module(L)
folder=Path(tempfile.mkdtemp(prefix='blitz-drag-'))
server=L.ExhibitionServer(ROOT,'drag-test',host='127.0.0.1',storage_path=folder/'test.sqlite3')
threading.Thread(target=server.serve_forever,daemon=True).start()
origin='http://127.0.0.1:'+str(server.server_port);process=cdp=None
try:
 process,cdp=L.connect_browser('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',folder/'chrome',origin+'/exhibition.html?run=drag-test',['--headless=new','--screen-info={0,0 1024x600}{1024,0 600x1024}'])
 hub,outputs=L.launch_outputs(cdp,origin,'drag-test')
 target=cdp.call('Target.createTarget',{'url':origin+'/phone.html?key=drag-test','newWindow':True})
 p=L.target_session(cdp,target['targetId'])
 cdp.call('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':2,'mobile':True},p)
 ev=lambda js:cdp.evaluate(p,js)
 L.wait_for(lambda:ev('!!window.PhoneView&&!!window.BlitzView'))
 ev("window.dragFrames=[];window.seenPhases=[];const originalRender=BlitzView.render;BlitzView.render=(canvas,game,elapsed,options)=>{if(game){seenPhases.push(game.phase);if(options.drag)dragFrames.push({...options.drag});}return originalRender(canvas,game,elapsed,options)}")
 cdp.evaluate(hub,'Installation.playback.start(Date.now()-483800);Installation.playback.advance(Date.now());Installation.publish(true)')
 L.wait_for(lambda:ev('PhoneView.playable&&PhoneView.messages.banner'))
 ev("window.firstSwapLatency=null;window.firstClearLatency=null;document.getElementById('phone-screen').addEventListener('pointerup',()=>window.releasedAt=performance.now(),true);const originalFetch=window.fetch;window.fetch=(url,...args)=>String(url).includes('/api/game/input')?new Promise(resolve=>setTimeout(resolve,600)).then(()=>originalFetch(url,...args)):originalFetch(url,...args);const measuredRender=BlitzView.render;BlitzView.render=(canvas,game,elapsed,options)=>{if(window.releasedAt&&game?.phase==='swap'&&firstSwapLatency===null)firstSwapLatency=performance.now()-releasedAt;if(window.releasedAt&&game?.phase==='clear'&&firstClearLatency===null)firstClearLatency=performance.now()-releasedAt;return measuredRender(canvas,game,elapsed,options)}")
 before=ev('PhoneView.game.elapsed')
 L.wait_for(lambda:ev('PhoneView.game.elapsed')>before+350)
 assert not ev('PhoneView.state.paused')
 def point(cell):
  return ev("(()=>{const r=document.getElementById('phone-screen').getBoundingClientRect(),g=BlitzView.geometry(r.width,r.height),i="+str(cell)+";return {x:r.x+g.x+(i%8*56+28)*g.scale,y:r.y+g.y+(64+Math.floor(i/8)*56+28)*g.scale}})()")
 def touch(kind,at=None):
  cdp.call('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[] if at is None else [{'id':1,**at}]},p)
 def tap(selector):
  q=ev('(()=>{const r=document.querySelector('+json.dumps(selector)+').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
  touch('touchStart',q);touch('touchEnd')
 def shot(name):
  out=ROOT/'output/exhibition-validation';out.mkdir(parents=True,exist_ok=True)
  (out/(name+'.png')).write_bytes(base64.b64decode(cdp.call('Page.captureScreenshot',{'format':'png'},p)['data']))
 pair=ev('BlitzGame.moves(PhoneView.game.board).find(([a,b])=>a>=16&&b>=16)||BlitzGame.moves(PhoneView.game.board)[0]')
 a,b=map(point,pair);revision=ev('PhoneView.game.revision');score=ev('PhoneView.game.score')
 touch('touchStart',a)
 touch('touchMove',{'x':a['x']+(b['x']-a['x'])*.55,'y':a['y']+(b['y']-a['y'])*.55})
 L.wait_for(lambda:ev('dragFrames.some(d=>d.progress>.5&&d.progress<.6)'))
 assert ev('PhoneView.game.revision')==revision,'Dragging must not commit before release'
 shot('game-drag-following-finger')
 touch('touchEnd')
 L.wait_for(lambda:ev('PhoneView.game.score')>score)
 latency=ev('({swap:firstSwapLatency,clear:firstClearLatency})');assert latency['swap']<100 and latency['clear']<300,latency
 assert ev('PhoneView.pending'),'Animation must start before the deliberately delayed host response'
 print('Touch release to animation / clear (ms), with 600 ms artificial network delay:',latency,flush=True)
 L.wait_for(lambda:ev('PhoneView.playable'))
 assert ev("seenPhases.includes('clear')&&seenPhases.includes('fall')"),'Matching gems clear and new gems fall'
 shot('game-after-drag-match')
 # Invalid adjacent moves visibly return to the original board.
 pair=ev('(()=>{const board=PhoneView.game.board,legal=BlitzGame.moves(board);for(let a=16;a<63;a++)if(BlitzGame.adjacent(a,a+1)&&!legal.some(([x,y])=>x===a&&y===a+1))return [a,a+1]})()')
 original=ev('PhoneView.game.board');revision=ev('PhoneView.game.revision');ev('seenPhases.length=0')
 a,b=map(point,pair);touch('touchStart',a);touch('touchMove',b);touch('touchEnd')
 L.wait_for(lambda:ev('PhoneView.game.revision')>revision and ev('PhoneView.playable'))
 assert ev('PhoneView.game.board')==original
 assert ev("seenPhases.includes('revert')")
 # Cancellation and outward drags at the edge do not submit moves.
 for cell,dx,cancel in [(32,20,True),(31,80,False)]:
  revision=ev('PhoneView.game.revision');a=point(cell)
  touch('touchStart',a);touch('touchMove',{'x':a['x']+dx,'y':a['y']});touch('touchCancel' if cancel else 'touchEnd')
  assert ev('PhoneView.game.revision')==revision
 # Opening the inbox hides the board but must not stop the authoritative timer.
 tap('.pm-banner:not(.pm-lock)')
 L.wait_for(lambda:ev('PhoneView.messages.open'))
 before=ev('PhoneView.game.elapsed')
 L.wait_for(lambda:ev('PhoneView.game.elapsed')>before+500)
 assert not ev('PhoneView.state.paused')
 tap('.pm-back');L.wait_for(lambda:ev('PhoneView.messages.conversationId===null'))
 tap('.pm-back');L.wait_for(lambda:ev('PhoneView.playable'))
 # Two taps still swap, independently of dragging.
 pair=ev('BlitzGame.moves(PhoneView.game.board).find(([a,b])=>a>=16&&b>=16)||BlitzGame.moves(PhoneView.game.board)[0]');score=ev('PhoneView.game.score')
 for cell in pair:touch('touchStart',point(cell));touch('touchEnd')
 L.wait_for(lambda:ev('PhoneView.game.score')>score)
 print('PASS: real touch tracking, match/clear/fall, invalid swap return, cancellation, edge guards, tap swap, notifications and inbox never pause the game.',flush=True)
finally:
 if cdp:
  try:cdp.call('Browser.close')
  except Exception:pass
  cdp.close()
 if process:
  try:process.wait(timeout=5)
  except Exception:process.terminate()
 server.shutdown();server.server_close();shutil.rmtree(folder,ignore_errors=True)
