"""Real browser checks for touch isolation, operator exit and output recovery."""
import importlib.util
from pathlib import Path
import shutil
import sys
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location('launcher', str(ROOT/'exhibition-launcher.py'))
L = importlib.util.module_from_spec(spec)
spec.loader.exec_module(L)


def run(layout):
    server = L.ExhibitionServer(ROOT, 'kiosk-test', host='127.0.0.1')
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = 'http://127.0.0.1:'+str(server.server_port)
    profile = Path(tempfile.mkdtemp(prefix='exhibition-kiosk-test-'))
    process = cdp = None
    try:
        process, cdp = L.connect_browser(L.find_browser(), profile,
            origin+'/exhibition.html?run=kiosk-test', ['--headless=new', '--screen-info='+layout])
        hub, outputs = L.launch_outputs(cdp, origin, 'kiosk-test')
        cdp.evaluate(hub, 'Installation.playback.pause(true)')
        def key(session, name, code):
            for kind in ['keyDown', 'keyUp']:
                cdp.call('Input.dispatchKeyEvent', {'type':kind,'key':name,'code':name,'windowsVirtualKeyCode':code}, session)
        for name, output in outputs.items():
            s = output['session']
            cdp.evaluate(s, 'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
            pixels = cdp.evaluate(s, "document.getElementById('screen').toDataURL()")
            elapsed = cdp.evaluate(hub, 'Installation.playback.status.elapsed')
            for x,y in [(10,10),(100,100),(200,180)]:
                cdp.call('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]},s)
                cdp.call('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':x+60,'y':y+60,'id':1}]},s)
                cdp.call('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]},s)
                cdp.call('Input.dispatchMouseEvent',{'type':'mousePressed','x':x,'y':y,'button':'right','clickCount':1},s)
                cdp.call('Input.dispatchMouseEvent',{'type':'mouseReleased','x':x,'y':y,'button':'right','clickCount':1},s)
            # Pinch, wheel, H, restart and pause shortcuts are inert on outputs.
            for points in [[{'x':100,'y':100,'id':1},{'x':180,'y':180,'id':2}],
                           [{'x':60,'y':60,'id':1},{'x':220,'y':220,'id':2}], []]:
                cdp.call('Input.dispatchTouchEvent',{'type':'touchEnd' if not points else 'touchStart' if points[0]['x']==100 else 'touchMove','touchPoints':points},s)
            cdp.call('Input.dispatchMouseEvent',{'type':'mouseWheel','x':100,'y':100,'deltaY':200,'deltaX':0},s)
            for k,c in [('h',72),('r',82),(' ',32),('f',70)]:key(s,k,c)
            assert cdp.evaluate(hub,'Installation.playback.status.elapsed') == elapsed
            assert cdp.evaluate(hub,'Installation.playback.status.paused')
            assert cdp.evaluate(s,"document.getElementById('screen').toDataURL()") == pixels
            assert cdp.evaluate(s,"document.getElementById('exit-menu').hidden && getComputedStyle(document.getElementById('controls')).display==='none' && visualViewport.scale===1")
            # Escape toggles only the exit menu, without changing fullscreen.
            key(s,'Escape',27)
            assert cdp.evaluate(s,"!document.getElementById('exit-menu').hidden")
            assert L.supervise_outputs(cdp,hub,outputs,origin,'kiosk-test')
            assert cdp.call('Browser.getWindowBounds',{'windowId':output['window']})['bounds']['windowState']=='fullscreen'
            key(s,'Escape',27)
            assert cdp.evaluate(s,"document.getElementById('exit-menu').hidden")
            cdp.call('Browser.setWindowBounds',{'windowId':output['window'],'bounds':{'windowState':'normal'}})
            assert L.supervise_outputs(cdp,hub,outputs,origin,'kiosk-test')
            assert cdp.call('Browser.getWindowBounds',{'windowId':output['window']})['bounds']['windowState']=='fullscreen'
        # Closing a single output must restore it without resetting the clock.
        elapsed = cdp.evaluate(hub,'Installation.playback.status.elapsed')
        old = outputs['portrait']['target']
        cdp.call('Target.closeTarget',{'targetId':old})
        assert L.supervise_outputs(cdp,hub,outputs,origin,'kiosk-test')
        assert outputs['portrait']['target'] != old
        assert cdp.evaluate(hub,'Installation.playback.status.elapsed') == elapsed
        # Exit is available only after Escape and terminates supervision.
        s=outputs['portrait']['session'];key(s,'Escape',27)
        assert cdp.evaluate(s,"!document.getElementById('exit-menu').hidden && document.activeElement.id==='exit-game'")
        x,y=cdp.evaluate(s,"(()=>{const r=document.getElementById('exit-game').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()")
        cdp.call('Input.dispatchMouseEvent',{'type':'mousePressed','x':x,'y':y,'button':'left','clickCount':1},s)
        cdp.call('Input.dispatchMouseEvent',{'type':'mouseReleased','x':x,'y':y,'button':'left','clickCount':1},s)
        assert cdp.evaluate(hub,'Installation.exitRequested')
        cdp.evaluate(hub,'Installation.exitRequested=false')
        cdp.evaluate(s,"document.getElementById('exit-game').disabled=false")
        key(s,'Enter',13)
        assert cdp.evaluate(hub,'Installation.exitRequested')
        assert not L.supervise_outputs(cdp,hub,outputs,origin,'kiosk-test')
        print('PASS: fullscreen, touch/pinch isolation, Escape exit, closed-window recovery:',layout,flush=True)
    finally:
        if cdp:
            try:cdp.call('Browser.close')
            except Exception:pass
            cdp.close()
        if process:
            try:process.wait(timeout=5)
            except Exception:process.terminate()
        server.shutdown();server.server_close()
        shutil.rmtree(str(profile),ignore_errors=True)


run('{0,0 1024x600}{1024,0 600x1024}')
run('{0,0 800x1280 devicePixelRatio=2.0}{-1280,100 1280x800}')
