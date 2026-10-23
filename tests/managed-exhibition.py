"""Real child-process lifecycle, safe update extraction, rollback and mobile reload."""
import hashlib
import importlib.util
import json
import logging
from pathlib import Path
import shutil
import socket
import sys
import tempfile
import threading
import time
import zipfile

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,str(ROOT/file));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
M=load('manager','exhibition-manager.py');L=load('launcher','exhibition-launcher.py')
logging.basicConfig(level=logging.CRITICAL)

FAKE='''import argparse,http.server,json,pathlib,threading,time
p=argparse.ArgumentParser();p.add_argument('--managed',action='store_true');p.add_argument('--data-dir');p.add_argument('--port',type=int);a=p.parse_args()
d=pathlib.Path(a.data_dir)
(d/'pairing-key').write_text('a'*32)
class H(http.server.BaseHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_GET(self):
  cycle=int((d/'cycle').read_text()) if (d/'cycle').exists() else 0
  value={'connected':not (d/'offline').exists(),'current':{'instance':'run:'+str(cycle*6),'cycle':cycle}}
  body=json.dumps(value).encode();self.send_response(200);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
s=http.server.ThreadingHTTPServer(('127.0.0.1',a.port),H);threading.Thread(target=s.serve_forever,daemon=True).start()
while not (d/'stop-request').exists():
 if (d/'operator-exit').exists():raise SystemExit(20)
 time.sleep(.02)
s.shutdown();s.server_close()
'''

def eventually(check,seconds=8):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        if check():return
        time.sleep(.05)
    raise AssertionError('Timed out')

def lifecycle():
    with tempfile.TemporaryDirectory() as directory:
        root=Path(directory);(root/'releases/v1').mkdir(parents=True);(root/'releases/v1/exhibition-launcher.py').write_text(FAKE)
        M.write_json(root/'active.json',{'version':'v1'})
        with socket.socket() as probe:probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
        manager=M.Manager(root,app_port=port);manager.interpreter=Path(sys.executable)
        def ready():manager.step();return manager.confirmed
        try:
            eventually(ready);first=manager.child.pid
            manager.commands.put('stop');manager.step();assert manager.child is None and not manager.enabled
            manager.step();assert manager.child is None
            manager.commands.put('start');eventually(ready);assert manager.child.pid!=first
            # A verified release switches in the same cycle, without waiting for the loop.
            (root/'releases/v2').mkdir();(root/'releases/v2/exhibition-launcher.py').write_text(FAKE)
            manager.pending={'version':'v2'};manager.step()
            assert manager.active['version']=='v2' and (root/'recovery.json').exists()
            eventually(ready);assert not (root/'recovery.json').exists()
            # A bad update exits: automatically roll back to the working version.
            (root/'releases/v3').mkdir();(root/'releases/v3/exhibition-launcher.py').write_text('raise SystemExit(9)')
            manager.pending={'version':'v3'};(manager.data/'cycle').write_text('2');manager.step()
            assert manager.active['version']=='v3'
            manager.step();time.sleep(.2);manager.step()
            eventually(ready);assert manager.active['version']=='v2'
            assert M.read_json(root/'rejected.json')['version']=='v3'
            # A frozen publisher causes restart; an intentional Escape exit stays stopped.
            old=manager.child.pid;(manager.data/'offline').touch();manager.last_live=time.monotonic()-25;manager.step()
            assert manager.child is None
            (manager.data/'offline').unlink();manager.next_launch=0;eventually(ready);assert manager.child.pid!=old
            (manager.data/'operator-exit').touch();eventually(lambda:manager.child.poll() is not None)
            manager.step();assert not manager.enabled and manager.child is None
            print('PASS: start/stop, immediate same-cycle update activation, failed-update rollback, freeze recovery and operator exit')
        finally:manager.stop()

def archives_and_pairing():
    with tempfile.TemporaryDirectory() as directory:
        root=Path(directory);key=L.pairing_key(root);assert L.pairing_key(root)==key
        (root/'pairing-key').write_text('invalid!')
        try:L.pairing_key(root);raise AssertionError('Invalid pairing accepted')
        except ValueError:pass
        package=ROOT.parent/'Exhibition-Mobile-Loop.zip';destination=root/'good';destination.mkdir()
        M.extract_release(package,destination,hashlib.sha256(package.read_bytes()).hexdigest())
        assert (destination/'dist/phone.js').exists() and not (destination/'runtime').exists()
        for name in ('Exhibition-Mobile-Loop/../../escape','Exhibition-Mobile-Loop/runtime-data/pairing-key','Exhibition-Mobile-Loop/C:/escape'):
            bad=root/'bad.zip'
            with zipfile.ZipFile(str(bad),'w') as bundle:bundle.writestr(name,'bad')
            try:M.extract_release(bad,root/'bad',hashlib.sha256(bad.read_bytes()).hexdigest());raise AssertionError('Unsafe archive accepted')
            except ValueError:pass
        try:M.extract_release(package,root/'wrong','0'*64);raise AssertionError('Wrong checksum accepted')
        except ValueError:pass
        from exhibition_discovery import Discovery
        discovery=Discovery(key,8770,port=0);port=discovery.socket.getsockname()[1];discovery.start()
        try:
            with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as client:
                client.settimeout(.2);query={'service':'resonant-fields','key':'wrong','nonce':'test'}
                client.sendto(json.dumps(query).encode(),('127.0.0.1',port))
                try:client.recv(2048);raise AssertionError('Unpaired discovery accepted')
                except socket.timeout:pass
                query['key']=key;client.sendto(json.dumps(query).encode(),('127.0.0.1',port))
                response=json.loads(client.recv(2048));assert response=={'service':'resonant-fields','nonce':'test','port':8770}
        finally:discovery.close()
        print('PASS: persistent pairing, paired LAN discovery, ZIP checksum and path protection')

def mobile_reload():
    from exhibition_server import ExhibitionServer
    server=ExhibitionServer(ROOT,'a'*32,host='127.0.0.1');port=server.server_port
    threading.Thread(target=server.serve_forever,daemon=True).start()
    profile=Path(tempfile.mkdtemp(prefix='mobile-reload-'));process=cdp=None
    try:
        browser=L.find_browser()
        process,cdp=L.connect_browser(browser,profile,'http://127.0.0.1:'+str(port)+'/phone.html?key='+'a'*32,['--headless=new'])
        target=L.wait_for(lambda:next((t for t in cdp.call('Target.getTargets')['targetInfos'] if '/phone.html?' in t['url']),None))
        session=L.target_session(cdp,target['targetId'])
        L.wait_for(lambda:cdp.evaluate(session,'window.PhoneView?.serverId')==server.server_id)
        cdp.evaluate(session,'window.beforeServerRestart=true')
        server.shutdown();server.server_close()
        server=ExhibitionServer(ROOT,'a'*32,host='127.0.0.1',port=port)
        threading.Thread(target=server.serve_forever,daemon=True).start()
        L.wait_for(lambda:cdp.evaluate(session,'window.PhoneView?.serverId')==server.server_id)
        assert cdp.evaluate(session,'window.beforeServerRestart===undefined')
        print('PASS: already-open mobile reloads fresh web content after server update without app replacement')
    finally:
        if cdp:
            try:cdp.call('Browser.close')
            except Exception:pass
            cdp.close()
        if process:process.wait(timeout=10)
        server.shutdown();server.server_close();shutil.rmtree(str(profile),ignore_errors=True)

def update_download():
    with tempfile.TemporaryDirectory() as directory:
        root=Path(directory);M.write_json(root/'active.json',{'version':'v1'})
        manager=M.Manager(root)
        manifest=json.loads((ROOT/'output/exhibition-update.json').read_text())
        version=manifest['version'];base='https://github.com/'+M.REPO+'/releases/download/'+version+'/'
        release={'tag_name':version,'assets':[{'name':'exhibition-update.json','browser_download_url':base+'exhibition-update.json'},
            {'name':manifest['asset'],'browser_download_url':base+manifest['asset'],'size':(ROOT.parent/manifest['asset']).stat().st_size}]}
        old_json=M.request_json;old_open=M.urllib.request.urlopen
        try:
            M.request_json=lambda url,**kw:release if url.endswith('/latest') else manifest
            M.urllib.request.urlopen=lambda request,**kw:(ROOT.parent/manifest['asset']).open('rb')
            manager.fetch_update()
            assert manager.pending=={'version':version} and manager.active=={'version':'v1'}
            assert (root/'releases'/version/'dist/phone.js').read_bytes()==(ROOT/'dist/phone.js').read_bytes()
            manager.pending=None;manifest['sha256']='0'*64
            try:manager.fetch_update();raise AssertionError('Corrupt download accepted')
            except ValueError:pass
            assert manager.active=={'version':'v1'} and manager.pending is None
        finally:M.request_json=old_json;M.urllib.request.urlopen=old_open
        print('PASS: complete release download/staging and corrupt-download rejection without switching the active installation')

def legacy_update_handoff():
    status={'enabled':True,'running':True,'ready':True,'candidate':False,'version':'v1','pending':'v2'}
    assert L.update_ready(status,'v1')
    for changes in [{'enabled':False},{'running':False},{'ready':False},{'candidate':True},{'version':'other'},{'pending':None},{'pending':'v1'}]:
        assert not L.update_ready({**status,**changes},'v1'),changes
    # Exercise the existing supervisor's child-exit path, used by v0.3.18 launcher.
    with tempfile.TemporaryDirectory() as directory:
        root=Path(directory);(root/'releases/v1').mkdir(parents=True);(root/'releases/v1/exhibition-launcher.py').write_text(FAKE)
        (root/'releases/v2').mkdir();(root/'releases/v2/exhibition-launcher.py').write_text(FAKE)
        M.write_json(root/'active.json',{'version':'v1'})
        with socket.socket() as probe:probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
        manager=M.Manager(root,app_port=port);manager.interpreter=Path(sys.executable)
        def ready():manager.step();return manager.confirmed
        try:
            eventually(ready);manager.pending={'version':'v2'}
            (manager.data/'stop-request').touch();eventually(lambda:manager.child.poll() is not None)
            manager.step();eventually(ready);assert manager.active['version']=='v2'
        finally:manager.stop()
    print('PASS: legacy supervisor handoff, enabled/healthy/candidate guards, clean child exit activates staged release')

archives_and_pairing();lifecycle();legacy_update_handoff();mobile_reload();update_download()
