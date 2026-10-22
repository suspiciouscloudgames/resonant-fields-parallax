"""Exercise the actual launcher through Chromium with two virtual monitors."""
import base64
import functools
import http.server
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import threading
import uuid
import sys
import time
import hashlib
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location("launcher", str(ROOT / "exhibition-launcher.py"))
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


def run(screen_info, screenshot=False):
    profile = Path(tempfile.mkdtemp(prefix="exhibition-test-"))
    token = uuid.uuid4().hex
    server = launcher.ExhibitionServer(ROOT,token,host="127.0.0.1")
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = "http://127.0.0.1:" + str(server.server_port)
    browser = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    cdp = process = None
    try:
        process, cdp = launcher.connect_browser(browser, profile,
            origin + "/exhibition.html?run=" + token,
            ["--headless=new", "--screen-info=" + screen_info])
        print("Connected:", screen_info, flush=True)
        hub, outputs = launcher.launch_outputs(cdp, origin, token)
        print("Both outputs fullscreen; controller minimized", flush=True)
        expected_config = json.loads((ROOT / "dist/window-installation.json").read_text())
        for name in ("landscape", "portrait"):
            rect = cdp.evaluate(hub, "Installation.rect(" + json.dumps(name) + ")")
            assert all(rect[axis] == expected_config["regions"][name][axis] for axis in ("x", "y"))
        assert len({o["window"] for o in outputs.values()}) == 2
        for name, output in outputs.items():
            bounds = cdp.call("Browser.getWindowBounds", {"windowId": output["window"]})
            assert bounds["bounds"]["windowState"] == "fullscreen", bounds
            check = cdp.evaluate(output["session"], """(()=>{
              const c=document.getElementById('screen'),b=c.getBoundingClientRect();
              return {inner:[innerWidth,innerHeight],screen:[screen.width,screen.height],
                canvas:[b.x,b.y,b.width,b.height],backing:[c.width,c.height],dpr:devicePixelRatio,
                controlsHidden:document.getElementById('controls').classList.contains('hidden'),
                errorHidden:document.getElementById('error').hidden,
                nativeFullscreen:!!document.fullscreenElement,
                density:opener.Installation.engine.density,
                hasStudio:!!document.querySelector('.studio')};
            })()""")
            assert check["canvas"] == [0, 0] + check["inner"], check
            assert check["inner"] == check["screen"], check
            assert check["controlsHidden"] and check["errorHidden"] and not check["hasStudio"], check
            assert check["density"] == 3
            assert check["backing"] == [round(n * check["dpr"]) for n in check["inner"]], check
            print(name, json.dumps(check), flush=True)
        # The launcher starts the playlist without any interaction.
        assert cdp.evaluate(hub, "Installation.playback.started")
        launcher.wait_for(lambda: cdp.evaluate(hub, "Installation.playback.status.elapsed > 200"))
        cdp.evaluate(hub, "Installation.playback.pause(true)")
        for name, output in outputs.items():
            session = output["session"]
            # Wait until a visible output has painted the paused frame.
            cdp.evaluate(session, "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))")
            check = cdp.evaluate(session, """(()=>{
              const c=document.getElementById('screen'),expected=document.createElement('canvas');
              const app=opener.Installation,id=new URLSearchParams(location.search).get('screen');
              PixelOutput.paint(expected,app.engine.canvas,app.rect(id),c.width,c.height,app.engine.density);
              app.paintCaption(expected,id);
              const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
              const b=expected.getContext('2d').getImageData(0,0,c.width,c.height).data;
              let different=0,transparent=0;
              for(let i=0;i<a.length;i++){if(a[i]!==b[i])different++;if(i%4===3&&a[i]!==255)transparent++;}
              return {different,transparent,state:app.engine.status.state,time:app.engine.status.animationTime};
            })()""")
            assert check["different"] == 0 and check["transparent"] == 0, check
            print(name, "crop matches shared scene:", check, flush=True)
            if screenshot:
                destination = ROOT / "output/exhibition-validation"
                destination.mkdir(parents=True, exist_ok=True)
                data = cdp.call("Page.captureScreenshot", {"format": "png"}, session)
                (destination / (name + ".png")).write_bytes(base64.b64decode(data["data"]))
        # Inspect every phase of every complete clip, not just the first 8 seconds
        # of the old interactive scene. Then inspect the actual output captions.
        phases = cdp.evaluate(hub, """(()=>{
          const p=Installation.playback,results=[];let start=0;
          for(let i=0;i<p.cues.length;i++){
            const cue=p.cues[i];let offset=0;
            for(const phase of cue.phases){
              const t=start+offset+phase.duration/2;
              p.start(0);p.advance(t);p.pause(true,t);
              results.push({expected:phase.state,actual:SceneGame.status.state,
                elapsed:SceneGame.status.elapsed,want:phase.duration/2});
              offset+=phase.duration;
            }
            start+=cue.duration;
          }
          return results;
        })()""")
        assert all(p["actual"] == p["expected"] and abs(p["elapsed"] - p["want"]) < .01 for p in phases), phases
        print("Verified all", len(phases), "action/transition phases", flush=True)
        starts = [0,50000,165000,265000,460000,690000]
        for index in range(6):
            t = starts[index] + 1000
            cdp.evaluate(hub, "Installation.playback.start(0);Installation.playback.advance(%d);Installation.playback.pause(true,%d)" % (t, t))
            cue = cdp.evaluate(hub, "Installation.playback.status.current")
            assert [cue["side"],cue["number"]] == [["indoor",1],["outdoor",3],["indoor",2],["outdoor",1],["indoor",3],["outdoor",2]][index]
            for name, output in outputs.items():
                session = output["session"]
                cdp.evaluate(session, "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))")
                caption = cdp.evaluate(session, """(()=>{
                  const app=opener.Installation,c=document.getElementById('screen');
                  const id=new URLSearchParams(location.search).get('screen'),raw=document.createElement('canvas');
                  PixelOutput.paint(raw,app.engine.canvas,app.rect(id),c.width,c.height,app.engine.density);
                  const actual=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
                  const plain=raw.getContext('2d').getImageData(0,0,c.width,c.height).data;
                  let different=0;for(let i=0;i<actual.length;i++)if(actual[i]!==plain[i])different++;
                  const layout=opener.SceneCaptions.layout(id,c.width,c.height);
                  const pixels=layout.canvas.getContext('2d').getImageData(0,0,layout.w,layout.h).data;
                  let letters=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>180&&pixels[i+1]>180)letters++;
                  return {different,letters,text:opener.SceneCaptions.text,inside:layout.x>=0&&layout.y>=0&&layout.x+layout.w<=c.width&&layout.y+layout.h<=c.height};
                })()""")
                active = name == cue["captionScreen"]
                assert caption["different"] > 1000 if active else caption["different"] == 0, (index, name, caption)
                assert caption["inside"] and caption["letters"] > 100
                assert caption["text"] == "테스트"
                if screenshot and active:
                    data = cdp.call("Page.captureScreenshot", {"format": "png"}, session)
                    (ROOT / "output/exhibition-validation" / ("autoplay-%d-%s.png" % (index+1,name))).write_bytes(base64.b64decode(data["data"]))
            print("Caption confirmed:", cue["side"], cue["number"], flush=True)
        # The print plate must be byte-for-byte identical to the pre-edit renderer.
        plate = cdp.evaluate(hub, "SceneGame.background.toDataURL().split(',')[1]")
        assert base64.b64decode(plate) == (ROOT / 'output/mobile-baseline/background.png').read_bytes(), 'Printed plate changed'
        for relative, digest in json.loads((ROOT / 'output/mobile-baseline/hashes.json').read_text()).items():
            assert hashlib.sha256((ROOT / relative).read_bytes()).hexdigest() == digest, relative
        print('PASS: all 54 protected files and rendered print background unchanged', flush=True)
        phone = cdp.call('Target.createTarget', {'url':origin+'/phone.html?key='+token,'newWindow':True})
        phone_session = launcher.target_session(cdp, phone['targetId'])
        launcher.wait_for(lambda: cdp.evaluate(phone_session, '!!window.PhoneView?.connected'))
        assert cdp.evaluate(phone_session, 'window.opener===null'), 'Phone must sync independently over HTTP'
        cdp.call('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':1,'mobile':True},phone_session)
        checks=[(10000,'clock'),(51000,'clock'),(166000,'clock'),(180000,'youtube'),(264500,'clock'),(280000,'clock'),(461000,'clock'),(475000,'game'),(689000,'clock'),(700000,'clock'),(975000,'clock')]
        for t,mode in checks:
            cdp.evaluate(hub, 'Installation.playback.start(0);Installation.playback.advance(%d);Installation.playback.pause(true,%d)' % (t,t))
            def synced():
                cdp.evaluate(hub, 'Installation.publish(true)')
                return cdp.evaluate(phone_session, 'PhoneView.state.mode===%s && Math.abs(PhoneView.state.elapsed-%d)<1' % (json.dumps(mode), (t-166800 if mode=='youtube' else t-461800 if mode=='game' else 0)))
            launcher.wait_for(synced,timeout=10)
            assert cdp.evaluate(hub,'DeviceScreen.state.mode')==mode
            if mode=='game':
                launcher.wait_for(lambda: cdp.evaluate(phone_session,'!!PhoneView.game'))
                assert cdp.evaluate(hub,'DeviceScreen.game.board') == cdp.evaluate(phone_session,'PhoneView.game.board')
                assert cdp.evaluate(hub,'SceneGame.status.state')=='gaming'
            if mode=='youtube':
                launcher.wait_for(lambda: cdp.evaluate(phone_session,"document.getElementById('phone-video').readyState>=2"))
                assert cdp.evaluate(phone_session,"(()=>{const v=document.getElementById('phone-video');return v.videoWidth===480&&v.videoHeight===854&&v.muted})()")
            if screenshot and mode in ('youtube','game'):
                shot=cdp.call('Page.captureScreenshot',{'format':'png'},phone_session)
                (ROOT/'output/exhibition-validation'/('phone-'+mode+'.png')).write_bytes(base64.b64decode(shot['data']))
                shot=cdp.call('Page.captureScreenshot',{'format':'png'},outputs['landscape']['session'])
                (ROOT/'output/exhibition-validation'/('indoor-'+mode+'.png')).write_bytes(base64.b64decode(shot['data']))
        # While running, the independent phone should remain close to the host clock.
        # Set a deterministic resumed clock rather than jumping from epoch zero.
        cdp.evaluate(hub,'(()=>{const p=Installation.playback,n=Date.now();p.start(n-395000);p.advance(n)})()')
        time.sleep(1)
        host_time=cdp.evaluate(hub,'Installation.playback.status.current.phone.elapsed')
        phone_time=cdp.evaluate(phone_session,'PhoneView.state.elapsed')
        assert abs(host_time-phone_time)<400,(host_time,phone_time)
        # Stop publishing; stale mobile state must fall back to the clock, then recover.
        cdp.evaluate(hub,'window.savedAdvance=Installation.advance;Installation.advance=now=>Installation.playback.advance(now)')
        launcher.wait_for(lambda: cdp.evaluate(phone_session,"!PhoneView.connected&&PhoneView.state.mode==='clock'"),timeout=10)
        cdp.evaluate(hub,'Installation.advance=savedAdvance')
        launcher.wait_for(lambda: cdp.evaluate(phone_session,"PhoneView.connected&&PhoneView.state.mode==='game'"),timeout=10)
        try:
            urllib.request.urlopen(origin+'/api/state?key=wrong')
            raise AssertionError('Unpaired request accepted')
        except urllib.error.HTTPError as error:
            assert error.code==403
        print('PASS: independent phone clock/video/game sync, video decode, reconnect and key checks',flush=True)

        if screenshot:
            # Real touchscreen events must change the host-owned board, not a local mock.
            launcher.wait_for(lambda: cdp.evaluate(phone_session,'PhoneView.playable'))
            def touch(x,y):
                cdp.call('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1,'radiusX':4,'radiusY':4,'force':1}]},phone_session)
                cdp.call('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]},phone_session)
            def center(cell):
                return cdp.evaluate(phone_session,'(()=>{const g=BlitzView.geometry(innerWidth,innerHeight),i=%d;return [g.x+(i%%8*56+28)*g.scale,g.y+(64+Math.floor(i/8)*56+28)*g.scale]})()'%cell)
            before=cdp.evaluate(phone_session,'PhoneView.game')
            move=cdp.evaluate(phone_session,'BlitzGame.moves(PhoneView.game.board)[0]')
            touch(*center(move[0]))
            launcher.wait_for(lambda: cdp.evaluate(phone_session,'PhoneView.selected===%d'%move[0]))
            touch(*center(move[1]))
            launcher.wait_for(lambda: cdp.evaluate(phone_session,'PhoneView.game.score>%d && PhoneView.playable'%before['score']))
            cdp.evaluate(hub,'Installation.playback.pause(true)')
            launcher.wait_for(lambda: cdp.evaluate(phone_session,'PhoneView.state.paused && !PhoneView.playable'))
            assert cdp.evaluate(hub,'DeviceScreen.game.board')==cdp.evaluate(phone_session,'PhoneView.game.board')
            assert cdp.evaluate(hub,'DeviceScreen.game.score')==cdp.evaluate(phone_session,'PhoneView.game.score')
            assert not cdp.evaluate(phone_session,'BlitzAudio.status.playing')
            cdp.evaluate(hub,'Installation.playback.pause(false)')
            launcher.wait_for(lambda: cdp.evaluate(phone_session,'PhoneView.playable'))
            # A swipe is also accepted; the source's pause and hint pictures do nothing.
            move=cdp.evaluate(phone_session,'BlitzGame.moves(PhoneView.game.board)[0]')
            a,b=center(move[0]),center(move[1]);score=cdp.evaluate(phone_session,'PhoneView.game.score')
            cdp.call('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':a[0],'y':a[1],'id':1}]},phone_session)
            cdp.call('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':b[0],'y':b[1],'id':1}]},phone_session)
            cdp.call('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]},phone_session)
            launcher.wait_for(lambda: cdp.evaluate(phone_session,'PhoneView.game.score>%d && PhoneView.playable'%score))
            launcher.wait_for(lambda: cdp.evaluate(phone_session,"BlitzAudio.status.ready&&BlitzAudio.status.context==='running'&&BlitzAudio.status.playing"))
            stable=cdp.evaluate(phone_session,'PhoneView.game.revision')
            for x,y in [(225,630),(400,575)]:
                point=cdp.evaluate(phone_session,'(()=>{const g=BlitzView.geometry(innerWidth,innerHeight);return [g.x+%d*g.scale,g.y+%d*g.scale]})()'%(x,y))
                touch(*point)
            time.sleep(.4)
            assert cdp.evaluate(phone_session,'PhoneView.game.revision')==stable
            assert cdp.evaluate(hub,'Installation.playback.status.paused') is False
            for name,session in [('phone-playable',phone_session),('character-live-game',outputs['landscape']['session'])]:
                shot=cdp.call('Page.captureScreenshot',{'format':'png'},session)
                (ROOT/'output/exhibition-validation'/(name+'.png')).write_bytes(base64.b64decode(shot['data']))
            old_round=cdp.evaluate(phone_session,'PhoneView.state.round')
            cdp.evaluate(hub,'(()=>{const p=Installation.playback,n=Date.now();p.start(n-573950);p.advance(n)})()')
            launcher.wait_for(lambda: cdp.evaluate(phone_session,"PhoneView.state.mode==='clock'&&!PhoneView.playable&&!BlitzAudio.status.playing"))
            cdp.evaluate(hub,'(()=>{const p=Installation.playback,n=Date.now();p.start(n-395000);p.advance(n)})()')
            launcher.wait_for(lambda: cdp.evaluate(phone_session,'PhoneView.playable && PhoneView.game.score===0'))
            assert cdp.evaluate(phone_session,'PhoneView.state.round')!=old_round
            print('PASS: touch swaps, swipes, score/cascade reflection on character, inert menus, original audio decode/play, pause, cutoff and new-round reset',flush=True)

        # Normal preview sizing remains unchanged outside exhibition mode.
        normal = cdp.call("Target.createTarget", {"url": origin + "/display.html?screen=landscape"})
        normal_session = launcher.target_session(cdp, normal["targetId"])
        launcher.wait_for(lambda: cdp.evaluate(normal_session, "!!document.getElementById('error')"))
        launcher.wait_for(lambda: cdp.evaluate(normal_session,
            "document.getElementById('error').hidden === false"))
    finally:
        if cdp:
            try:
                cdp.call("Browser.close")
            except Exception:
                pass
            cdp.close()
        if process:
            try:
                process.wait(timeout=5)
            except Exception:
                process.terminate()
        server.shutdown()
        server.server_close()
        shutil.rmtree(str(profile), ignore_errors=True)


for screens in (
    [{"width": 1920, "height": 1080}],
    [{"width": 1920, "height": 1080}, {"width": 1920, "height": 1080}],
):
    try:
        launcher.choose_screens(screens)
        raise AssertionError("Invalid monitor layout accepted")
    except RuntimeError:
        pass

run("{0,0 1024x600}{1024,0 600x1024}", screenshot=True)
run("{0,0 800x1280 devicePixelRatio=2.0}{-1280,100 1280x800}")
print("PASS: automatic fullscreen, complete six-scene autoplay, Korean caption pixels, shared clock, mixed DPI")
