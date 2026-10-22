"""Portable Windows launcher: one shared scene, two automatically fullscreen outputs."""
import base64
import functools
import hashlib
import http.server
import json
import os
from pathlib import Path
import shutil
import socket
import struct
import subprocess
import tempfile
import threading
import time
import urllib.parse
import uuid
import argparse
import sys
import logging
import re
from logging.handlers import RotatingFileHandler

log = logging.getLogger('exhibition')

ROOT = Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
from exhibition_server import ExhibitionServer
from exhibition_discovery import Discovery


def pairing_key(records):
    """Keep mobile pairing across restarts and application releases."""
    path = records / 'pairing-key'
    if path.exists():
        value = path.read_text(encoding='ascii').strip()
        if not re.fullmatch(r'[a-f0-9]{12,64}', value):
            raise ValueError('Invalid saved mobile pairing key')
        return value
    value = uuid.uuid4().hex
    path.write_text(value, encoding='ascii')
    return value


class CDP:
    """Small synchronous, loopback-only DevTools WebSocket client (no dependencies)."""

    def __init__(self, url):
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != "ws" or parsed.hostname not in ("127.0.0.1", "localhost"):
            raise ValueError("DevTools must use loopback.")
        self.socket = socket.create_connection((parsed.hostname, parsed.port), 20)
        self.socket.settimeout(20)
        self.buffer = bytearray()
        self.serial = 0
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        request = (
            "GET {} HTTP/1.1\r\nHost: {}:{}\r\nUpgrade: websocket\r\n"
            "Connection: Upgrade\r\nSec-WebSocket-Key: {}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        ).format(parsed.path, parsed.hostname, parsed.port, key)
        self.socket.sendall(request.encode("ascii"))
        while b"\r\n\r\n" not in self.buffer:
            data = self.socket.recv(4096)
            if not data:
                raise ConnectionError("DevTools handshake closed.")
            self.buffer.extend(data)
        headers, rest = bytes(self.buffer).split(b"\r\n\r\n", 1)
        self.buffer = bytearray(rest)
        expected = base64.b64encode(hashlib.sha1(
            (key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode("ascii")
        ).digest())
        if b" 101 " not in headers.split(b"\r\n")[0] or expected not in headers:
            raise ConnectionError("Invalid DevTools handshake.")

    def read(self, size):
        while len(self.buffer) < size:
            data = self.socket.recv(max(4096, size - len(self.buffer)))
            if not data:
                raise ConnectionError("Browser closed.")
            self.buffer.extend(data)
        result = bytes(self.buffer[:size])
        del self.buffer[:size]
        return result

    def send(self, payload, opcode=1):
        mask = os.urandom(4)
        size = len(payload)
        header = bytes([0x80 | opcode])
        if size < 126:
            header += bytes([0x80 | size])
        elif size < 65536:
            header += bytes([0x80 | 126]) + struct.pack("!H", size)
        else:
            header += bytes([0x80 | 127]) + struct.pack("!Q", size)
        self.socket.sendall(header + mask + bytes(
            byte ^ mask[i % 4] for i, byte in enumerate(payload)))

    def receive(self):
        message = bytearray()
        while True:
            a, b = self.read(2)
            opcode, size = a & 15, b & 127
            if size == 126:
                size = struct.unpack("!H", self.read(2))[0]
            elif size == 127:
                size = struct.unpack("!Q", self.read(8))[0]
            mask = self.read(4) if b & 128 else None
            payload = self.read(size)
            if mask:
                payload = bytes(v ^ mask[i % 4] for i, v in enumerate(payload))
            if opcode == 8:
                raise ConnectionError("Browser closed.")
            if opcode == 9:
                self.send(payload, 10)
                continue
            if opcode == 10:
                continue
            if opcode not in (0, 1):
                raise ConnectionError("Unexpected DevTools frame.")
            message.extend(payload)
            if a & 128:
                return json.loads(message)

    def call(self, method, params=None, session=None):
        self.serial += 1
        request = {"id": self.serial, "method": method, "params": params or {}}
        if session:
            request["sessionId"] = session
        self.send(json.dumps(request).encode("utf-8"))
        while True:
            response = self.receive()
            if response.get("id") != self.serial:
                continue
            if "error" in response:
                raise RuntimeError("{}: {}".format(method, response["error"]))
            return response.get("result", {})

    def evaluate(self, session, expression):
        result = self.call("Runtime.evaluate", {
            "expression": expression, "awaitPromise": True,
            "returnByValue": True, "userGesture": True,
        }, session)
        if "exceptionDetails" in result:
            raise RuntimeError(str(result["exceptionDetails"]))
        return result.get("result", {}).get("value")

    def close(self):
        self.socket.close()


def wait_for(function, timeout=30):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = function()
        if result:
            return result
        time.sleep(.15)
    raise RuntimeError("화면 준비 시간이 초과되었습니다. START.bat을 다시 실행해 주세요.")


def choose_screens(screens):
    landscape = [s for s in screens if s["width"] > s["height"]]
    portrait = [s for s in screens if s["height"] > s["width"]]
    if len(screens) != 2 or len(landscape) != 1 or len(portrait) != 1:
        raise RuntimeError(
            "Windows 디스플레이 설정에서 두 화면을 '확장'으로 설정하고, "
            "하나는 가로, 하나는 세로로 설정한 뒤 다시 실행해 주세요.\n"
            "현재 인식된 화면: " +
            ", ".join("{}×{}".format(s["width"], s["height"]) for s in screens))
    return {"landscape": landscape[0], "portrait": portrait[0]}


def find_browser():
    if os.name!='nt':
        candidate='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        if Path(candidate).is_file():return candidate
    for root in ("PROGRAMFILES(X86)", "PROGRAMFILES", "LOCALAPPDATA"):
        base = os.environ.get(root)
        if not base:
            continue
        for relative in ("Microsoft/Edge/Application/msedge.exe",
                         "Google/Chrome/Application/chrome.exe"):
            candidate = Path(base) / relative
            if candidate.is_file():
                return str(candidate)
    raise RuntimeError("Microsoft Edge 또는 Google Chrome이 필요합니다.")


def connect_browser(browser, profile, url, extra_args=(), kiosk=False):
    args = [
        browser, "--user-data-dir=" + str(profile),
        "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
        "--no-first-run", "--no-default-browser-check",
        "--disable-popup-blocking", "--disable-background-timer-throttling", "--autoplay-policy=no-user-gesture-required",
        "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
        "--disable-features=msEdgeSidebarV2",
    ]
    if kiosk:
        # Browser-level kiosk suppresses native top-edge/fullscreen exit controls.
        args += ["--kiosk", "--app=" + url]
        if Path(browser).name.lower() == 'msedge.exe':
            args += ["--edge-kiosk-type=fullscreen", "--kiosk-idle-timeout-minutes=0"]
    else:
        args += ["--app=" + url]
    args += list(extra_args)
    process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    active_port = profile / "DevToolsActivePort"
    def endpoint():
        if process.poll() is not None:
            raise RuntimeError("브라우저를 실행하지 못했습니다.")
        if active_port.is_file():
            lines = active_port.read_text().splitlines()
            if len(lines) >= 2:
                return "ws://127.0.0.1:{}{}".format(lines[0], lines[1])
    try:
        return process, CDP(wait_for(endpoint, timeout=60))
    except Exception:
        process.terminate()
        raise


def target_session(cdp, target):
    return cdp.call("Target.attachToTarget", {
        "targetId": target, "flatten": True})["sessionId"]


def keep_awake(enabled):
    if os.name == 'nt':
        import ctypes
        # Applied only while this process runs; do not change the PC power plan.
        flags = 0x80000000 | (0x00000003 if enabled else 0)
        if not ctypes.windll.kernel32.SetThreadExecutionState(flags):
            log.warning('Windows did not accept the display/sleep prevention request')


def supervise_outputs(cdp, session, outputs, origin, token, preview=False):
    if cdp.evaluate(session, '!!window.Installation?.exitRequested'):
        log.info('Operator requested exit using Escape menu')
        return False
    current = {t['targetId'] for t in cdp.call('Target.getTargets')['targetInfos']}
    for name, output in list(outputs.items()):
        if output['target'] not in current:
            if preview:
                log.info('Preview window closed: %s', name)
                return False
            log.warning('Output closed unexpectedly; restoring %s without resetting the loop', name)
            outputs[name] = open_output(cdp, session, origin, token, name, output['screen'])
        elif not preview:
            bounds = cdp.call('Browser.getWindowBounds', {'windowId': output['window']})['bounds']
            covers_screen = cdp.evaluate(output['session'],
                "Math.abs(innerWidth-screen.width)<=1 && Math.abs(innerHeight-screen.height)<=1")
            if bounds.get('windowState') != 'fullscreen' or not covers_screen:
                log.warning('Restoring fullscreen: %s', name)
                # A stale fullscreen flag can survive a DPI/display-size change.
                if bounds.get('windowState') == 'fullscreen':
                    cdp.call('Browser.setWindowBounds', {
                        'windowId': output['window'], 'bounds': {'windowState': 'normal'}})
                cdp.call('Browser.setWindowBounds', {
                    'windowId': output['window'], 'bounds': {'windowState': 'fullscreen'}})
    return True


def open_output(cdp, session, origin, token, name, screen, preview=False):
    url = origin + "/display.html?screen=" + name + "&exhibition=1&run=" + token
    opened = cdp.evaluate(session, """(()=>{
      const s=%s;
      return !!window.open(%s,%s,`popup,left=${s.availLeft},top=${s.availTop},width=${Math.min(800,s.availWidth)},height=${Math.min(600,s.availHeight)}`);
    })()""" % (json.dumps(screen), json.dumps(url), json.dumps("exhibition-" + name + '-' + uuid.uuid4().hex[:8])))
    if not opened:
        raise RuntimeError("출력 창을 열지 못했습니다.")
    def find_output():
        return next((t for t in cdp.call("Target.getTargets")["targetInfos"]
                     if t["url"] == url), None)
    target = wait_for(find_output)
    target_id = target["targetId"]
    output_session = target_session(cdp, target_id)
    wait_for(lambda: cdp.evaluate(output_session,
        "!!window.opener?.Installation?.engine.ready && !!window.ExhibitionDisplay && !!document.getElementById('screen')"))
    window_id = cdp.call("Browser.getWindowForTarget", {"targetId": target_id})["windowId"]
    cdp.call("Browser.setWindowBounds", {
        "windowId": window_id, "bounds": {"windowState": "normal"}})
    cdp.call("Browser.setWindowBounds", {
        "windowId": window_id, "bounds": {
            "left": screen["availLeft"], "top": screen["availTop"],
            "width": min(800, screen["availWidth"]),
            "height": min(600, screen["availHeight"])}})
    if not preview:
        wait_for(lambda: cdp.evaluate(output_session,
            "screen.availLeft === %d && screen.availTop === %d" %
            (screen["availLeft"], screen["availTop"])))
        cdp.call("Browser.setWindowBounds", {
            "windowId": window_id, "bounds": {"windowState": "fullscreen"}})
        wait_for(lambda: cdp.evaluate(output_session,
            "Math.abs(innerWidth-screen.width)<=1 && Math.abs(innerHeight-screen.height)<=1"))
    return {"target": target_id, "session": output_session,
                     "window": window_id, "screen": screen}


def launch_outputs(cdp, origin, token, preview=False, start_scene=None):
    hub_url = origin + "/exhibition.html?run=" + token
    def find_hub():
        return next((t for t in cdp.call("Target.getTargets")["targetInfos"]
                     if t["url"] == hub_url), None)
    hub = wait_for(find_hub)
    session = target_session(cdp, hub["targetId"])
    wait_for(lambda: cdp.evaluate(session, """(()=>{
      if(window.Installation?.error)throw Error(Installation.error);
      return !!window.Installation?.engine.ready && !!Installation.placementReady;
    })()"""))
    cdp.call("Browser.setPermission", {
        "permission": {"name": "window-management"},
        "setting": "granted", "origin": origin,
    })
    screens = cdp.evaluate(session, """(async()=>{
      const details=await window.getScreenDetails();
      return details.screens.map(s=>({left:s.left,top:s.top,width:s.width,height:s.height,
        availLeft:s.availLeft,availTop:s.availTop,availWidth:s.availWidth,availHeight:s.availHeight}));
    })()""")
    if preview:
        s=next((s for s in screens if s['left']==0 and s['top']==0),screens[0])
        cell=max(240,min(460,int(s['availWidth']/3)))
        assignments={
            'landscape':{'availLeft':s['availLeft'],'availTop':s['availTop']+30,'availWidth':cell,'availHeight':max(200,round(cell*100/165))},
            'portrait':{'availLeft':s['availLeft']+cell,'availTop':s['availTop']+30,'availWidth':max(260,round(cell*.75)),'availHeight':min(680,s['availHeight']-60)}}
    else:
        assignments = choose_screens(screens)
    results = {}
    for name, screen in assignments.items():
        results[name] = open_output(cdp, session, origin, token, name, screen, preview)
    hub_window = cdp.call("Browser.getWindowForTarget", {"targetId": hub["targetId"]})["windowId"]
    if cdp.call("Browser.getWindowBounds", {"windowId": hub_window})['bounds'].get('windowState') == 'fullscreen':
        cdp.call("Browser.setWindowBounds", {
            "windowId": hub_window, "bounds": {"windowState": "normal"}})
    cdp.call("Browser.setWindowBounds", {
        "windowId": hub_window, "bounds": {"windowState": "minimized"}})
    cdp.evaluate(session, """(()=>{
      const p=Installation.playback,id=%s;let offset=0;
      if(id)for(const cue of p.cues){if(cue.id===id)break;offset+=cue.duration;}
      const now=Date.now();p.start(now-offset);p.advance(now);
    })()""" % json.dumps(start_scene if preview else None))
    cdp.evaluate(session, "Installation.publish(true)")
    if preview:
        phone_url=origin+'/phone.html?key='+token
        cdp.evaluate(session,'window.open(%s,"exhibition-phone","popup,width=390,height=700")!==null' % json.dumps(phone_url))
        phone=wait_for(lambda:next((t for t in cdp.call('Target.getTargets')['targetInfos'] if t['url']==phone_url),None))
        phone_session=target_session(cdp,phone['targetId'])
        phone_window=cdp.call('Browser.getWindowForTarget',{'targetId':phone['targetId']})['windowId']
        cdp.call('Browser.setWindowBounds',{'windowId':phone_window,'bounds':{
            'left':s['availLeft']+cell+max(260,round(cell*.75)), 'top':s['availTop']+30,
            'width':max(300,min(390,s['availWidth']-cell-max(260,round(cell*.75)))), 'height':min(760,s['availHeight']-60)}})
        results['phone']={'target':phone['targetId'],'session':phone_session,'window':phone_window}
    return session, results


class LocalHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--preview',action='store_true')
    parser.add_argument('--port',type=int,default=8770)
    parser.add_argument('--event-origin',action='append',default=[])
    parser.add_argument('--start-scene',choices=['smoking','rain','youtube','police','game','dog'])
    parser.add_argument('--data-dir',type=Path,default=ROOT/'runtime-data')
    parser.add_argument('--managed',action='store_true')
    args=parser.parse_args()
    records=args.data_dir.resolve()
    records.mkdir(parents=True,exist_ok=True)
    handler=RotatingFileHandler(str(records/'exhibition.log'),maxBytes=1024*1024,backupCount=3,encoding='utf-8')
    handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(message)s'))
    log.addHandler(handler);log.setLevel(logging.INFO)
    log.info('Starting exhibition: pid=%s preview=%s',os.getpid(),args.preview)
    server = None
    cdp = None
    process = None
    profile = None
    discovery = None
    exit_code = 1
    try:
        if os.name != "nt" and not args.preview:
            raise RuntimeError("이 실행 파일은 Windows 전시 PC용입니다.")
        browser = find_browser()
        keep_awake(True)
        # The browser profile is temporary and never touches the user's browser.
        profile = Path(tempfile.mkdtemp(prefix="resonant-exhibition-"))
        token = pairing_key(records)
        # Managed installations always use the paired port, never silently move.
        for port in range(args.port,args.port+(1 if args.managed else 10)):
            try:
                server = ExhibitionServer(ROOT,token,port=port,storage_path=records/'messages.sqlite3',event_origins=args.event_origin)
                break
            except OSError:
                if args.managed or port==args.port+9:raise
        threading.Thread(target=server.serve_forever, daemon=True).start()
        if not args.preview:
            discovery=Discovery(token,server.server_port)
            discovery.start()
        origin = "http://127.0.0.1:" + str(server.server_port)
        print('PHONE: '+server.phone_url,flush=True)
        log.info('Phone connection: %s; browser=%s',server.phone_url,browser)
        process, cdp = connect_browser(
            browser, profile, origin + "/exhibition.html?run=" + token,kiosk=not args.preview)
        session, outputs = launch_outputs(cdp, origin, token,preview=args.preview,start_scene=args.start_scene)
        print('READY: '+', '.join(outputs),flush=True)
        log.info('READY: %s',', '.join(outputs))
        last_heartbeat=time.monotonic();failures=0
        while process.poll() is None:
            try:
                if (records/'stop-request').exists():
                    log.info('Managed stop requested');exit_code=0;break
                if not supervise_outputs(cdp,session,outputs,origin,token,args.preview):
                    exit_code=20;break
                failures=0
                if time.monotonic()-last_heartbeat>=60:
                    state=server.state or {}
                    log.info('RUNNING scene=%s state_age=%.1fs',state.get('current',{}).get('id'),time.monotonic()-server.state_received)
                    last_heartbeat=time.monotonic()
            except (ConnectionError,OSError,RuntimeError):
                failures+=1;log.exception('Output supervision failed (%s/3)',failures)
                if failures>=3:raise
            time.sleep(.5)
        if process.poll() is not None:
            log.error('Browser exited unexpectedly: code=%s',process.returncode)
    except (ConnectionError, OSError) as error:
        log.exception('Exhibition connection or OS error')
        if not args.managed and (process is None or process.poll() is None):
            show_error(str(error))
    except Exception as error:
        log.exception('Exhibition failed')
        if not args.managed:show_error(str(error))
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
            except subprocess.TimeoutExpired:
                process.terminate()
        if server:
            server.shutdown()
            server.server_close()
        if discovery:discovery.close()
        if profile:
            shutil.rmtree(str(profile), ignore_errors=True)
        keep_awake(False)
        log.info('Exhibition stopped')
        handler.close();log.removeHandler(handler)
    return exit_code


def show_error(message):
    if os.name == "nt":
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, message, "전시 화면 실행", 0x10)
    else:
        print(message)


if __name__ == "__main__":
    sys.exit(main())
