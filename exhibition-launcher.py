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

ROOT = Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
from exhibition_server import ExhibitionServer


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


def connect_browser(browser, profile, url, extra_args=()):
    args = [
        browser, "--user-data-dir=" + str(profile),
        "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
        "--no-first-run", "--no-default-browser-check",
        "--disable-popup-blocking", "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
        "--disable-features=msEdgeSidebarV2", "--app=" + url,
    ] + list(extra_args)
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
        url = origin + "/display.html?screen=" + name + "&exhibition=1&run=" + token
        opened = cdp.evaluate(session, """(()=>{
          const s=%s;
          return !!window.open(%s,%s,`popup,left=${s.availLeft},top=${s.availTop},width=${Math.min(800,s.availWidth)},height=${Math.min(600,s.availHeight)}`);
        })()""" % (json.dumps(screen), json.dumps(url), json.dumps("exhibition-" + name)))
        if not opened:
            raise RuntimeError("출력 창을 열지 못했습니다.")
        def find_output():
            return next((t for t in cdp.call("Target.getTargets")["targetInfos"]
                         if t["url"] == url), None)
        target = wait_for(find_output)
        target_id = target["targetId"]
        output_session = target_session(cdp, target_id)
        wait_for(lambda: cdp.evaluate(output_session,
            "!!window.opener?.Installation?.engine.ready && !!document.getElementById('screen')"))
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
        results[name] = {"target": target_id, "session": output_session,
                         "window": window_id, "screen": screen}
    hub_window = cdp.call("Browser.getWindowForTarget", {"targetId": hub["targetId"]})["windowId"]
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
    parser.add_argument('--start-scene',choices=['smoking','rain','youtube','police','game','dog'])
    args=parser.parse_args()
    server = None
    cdp = None
    process = None
    profile = None
    try:
        if os.name != "nt" and not args.preview:
            raise RuntimeError("이 실행 파일은 Windows 전시 PC용입니다.")
        browser = find_browser()
        # The browser profile is temporary and never touches the user's browser.
        profile = Path(tempfile.mkdtemp(prefix="resonant-exhibition-"))
        token = uuid.uuid4().hex[:12]
        for port in range(args.port,args.port+10):
            try:
                server = ExhibitionServer(ROOT,token,port=port)
                break
            except OSError:
                if port==args.port+9:raise
        threading.Thread(target=server.serve_forever, daemon=True).start()
        origin = "http://127.0.0.1:" + str(server.server_port)
        print('PHONE: '+server.phone_url,flush=True)
        process, cdp = connect_browser(
            browser, profile, origin + "/exhibition.html?run=" + token)
        _, outputs = launch_outputs(cdp, origin, token,preview=args.preview,start_scene=args.start_scene)
        print('READY: '+', '.join(outputs),flush=True)
        # Closing either output ends this exhibition browser and its local server.
        ids = {o["target"] for o in outputs.values()}
        while process.poll() is None:
            current = {t["targetId"] for t in cdp.call("Target.getTargets")["targetInfos"]}
            if not ids.issubset(current):
                break
            time.sleep(1)
    except (ConnectionError, OSError) as error:
        if process is None or process.poll() is None:
            show_error(str(error))
    except Exception as error:
        show_error(str(error))
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
        if profile:
            shutil.rmtree(str(profile), ignore_errors=True)


def show_error(message):
    if os.name == "nt":
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, message, "전시 화면 실행", 0x10)
    else:
        print(message)


if __name__ == "__main__":
    main()
