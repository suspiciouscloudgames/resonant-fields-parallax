"""Interactive Windows supervisor. Updates are verified and applied immediately after download."""
import argparse
import hashlib
import http.server
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path, PurePosixPath
import queue
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import zipfile

ROOT=Path(__file__).resolve().parent
REPO='suspiciouscloudgames/resonant-fields-parallax'
CONTROL_PORT=8772
log=logging.getLogger('manager')


def read_json(path,default=None):
    try:return json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError:return default


def write_json(path,value):
    temporary=path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value),encoding='utf-8');os.replace(str(temporary),str(path))


def request_json(url,timeout=5):
    request=urllib.request.Request(url,headers={'User-Agent':'Resonant-Fields-Exhibition/1','Accept':'application/json'})
    with urllib.request.urlopen(request,timeout=timeout) as response:
        return json.loads(response.read(2*1024*1024).decode('utf-8'))


def validate_manifest(value):
    if value.get('schema')!=1 or not re.fullmatch(r'v[0-9A-Za-z._-]{1,90}',value.get('version','')):
        raise ValueError('Invalid update manifest')
    if not re.fullmatch(r'[0-9a-f]{64}',value.get('sha256','')):raise ValueError('Invalid update digest')
    if value.get('asset')!='Exhibition-Mobile-Loop.zip':raise ValueError('Unexpected update asset')
    return value


def extract_release(archive,destination,digest):
    if hashlib.sha256(archive.read_bytes()).hexdigest()!=digest:raise ValueError('Update checksum mismatch')
    with zipfile.ZipFile(str(archive)) as bundle:
        entries=bundle.infolist()
        if len(entries)>3000 or sum(e.file_size for e in entries)>300*1024*1024:
            raise ValueError('Update archive too large')
        for entry in entries:
            path=PurePosixPath(entry.filename)
            if not path.parts or path.parts[0]!='Exhibition-Mobile-Loop' or '..' in path.parts or '\\' in entry.filename:
                raise ValueError('Invalid archive path')
            parts=path.parts[1:]
            if not parts:continue
            if any(':' in p for p in parts) or parts[0] in ('runtime-data','private'):
                raise ValueError('Protected archive path')
            if (entry.external_attr>>16)&0o170000==0o120000:raise ValueError('Symlink in update')
            # Keep the verified interpreter outside releases; updates replace content only.
            if parts[0]=='runtime':continue
            target=destination.joinpath(*parts)
            if entry.is_dir():target.mkdir(parents=True,exist_ok=True);continue
            target.parent.mkdir(parents=True,exist_ok=True)
            with bundle.open(entry) as source,target.open('wb') as output:shutil.copyfileobj(source,output)
    for required in ('exhibition-launcher.py','exhibition_server.py','exhibition_discovery.py',
                     'dist/exhibition.html','dist/display.html','dist/phone.html','version.json'):
        if not (destination/required).is_file():raise ValueError('Incomplete update: '+required)


def is_loop_boundary(previous,current):
    """Use the host's actual cycle, including game settlement, rather than wall time."""
    if not previous or not current:return False
    return (previous.get('instance','').rsplit(':',1)[0]==current.get('instance','').rsplit(':',1)[0]
            and current.get('cycle',0)>previous.get('cycle',0))


class Manager:
    def __init__(self,root=ROOT,app_port=8770):
        self.root=root;self.data=root/'runtime-data';self.data.mkdir(parents=True,exist_ok=True)
        self.app_port=app_port
        self.commands=queue.Queue();self.enabled=True;self.child=None;self.previous_scene=None
        self.pending=None;self.candidate=None;self.previous=None;self.confirmed=False
        self.launched=0;self.last_live=0;self.next_launch=0;self.failures=0;self.check_now=threading.Event()
        self.active=read_json(root/'active.json')
        if not self.active:raise ValueError('No installed exhibition release')
        self.interpreter=root/'runtime'/('pythonw.exe' if os.name=='nt' else 'python3')

    def status(self):
        return {'enabled':self.enabled,'version':self.active['version'],
                'running':self.child is not None and self.child.poll() is None,
                'ready':self.confirmed,'pending':self.pending and self.pending['version'],
                'candidate':self.candidate is not None,'updatePolicy':'immediate'}

    def launch(self):
        (self.data/'stop-request').unlink(missing_ok=True)
        app=self.root/'releases'/self.active['version']
        self.child=subprocess.Popen([str(self.interpreter),str(app/'exhibition-launcher.py'),
            '--managed','--data-dir',str(self.data),'--port',str(self.app_port)],cwd=str(app),
            stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        self.launched=time.monotonic();self.last_live=self.launched;self.confirmed=False;self.previous_scene=None
        log.info('Launched %s pid=%s',self.active['version'],self.child.pid)

    def stop(self):
        if self.child and self.child.poll() is None:
            (self.data/'stop-request').touch()
            try:self.child.wait(timeout=20)
            except subprocess.TimeoutExpired:
                log.warning('Stopping unresponsive exhibition process tree')
                if os.name=='nt':subprocess.run(['taskkill','/PID',str(self.child.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                else:self.child.terminate();self.child.wait(timeout=5)
        self.child=None;self.confirmed=False;self.previous_scene=None

    def activate(self):
        candidate=self.pending
        if not candidate:return
        self.stop();self.previous=dict(self.active);self.candidate=candidate;self.pending=None
        self.active=candidate;write_json(self.root/'active.json',self.active)
        # Persist recovery in case Windows loses power during a candidate's first boot.
        write_json(self.root/'recovery.json',self.previous)
        log.info('Applying staged update %s',self.active['version']);self.next_launch=0

    def rollback(self):
        self.stop()
        if not self.previous:return
        failed=self.active['version'];self.active=self.previous;self.previous=None;self.candidate=None
        write_json(self.root/'active.json',self.active)
        write_json(self.root/'rejected.json',{'version':failed})
        (self.root/'recovery.json').unlink(missing_ok=True)
        log.error('Rolled back failed update %s to %s',failed,self.active['version']);self.next_launch=0

    def fetch_update(self):
        release=request_json('https://api.github.com/repos/'+REPO+'/releases/latest',timeout=15)
        assets={a['name']:a for a in release.get('assets',[])}
        if 'exhibition-update.json' not in assets:return
        manifest=validate_manifest(request_json(assets['exhibition-update.json']['browser_download_url'],timeout=15))
        version=manifest['version']
        if version!=release['tag_name']:raise ValueError('Release version mismatch')
        if version==self.active['version'] or version==(self.pending or {}).get('version') or version==(read_json(self.root/'rejected.json',{}) or {}).get('version'):return
        asset=assets[manifest['asset']]
        expected='https://github.com/'+REPO+'/releases/download/'+version+'/'
        if not asset['browser_download_url'].startswith(expected):raise ValueError('Unexpected update origin')
        if not 0<asset['size']<=150*1024*1024:raise ValueError('Invalid download size')
        staging=Path(tempfile.mkdtemp(prefix='update-',dir=str(self.root)))
        try:
            archive=staging/'release.zip'
            request=urllib.request.Request(asset['browser_download_url'],headers={'User-Agent':'Resonant-Fields-Exhibition/1'})
            with urllib.request.urlopen(request,timeout=30) as response,archive.open('wb') as output:
                received=0
                while True:
                    block=response.read(128*1024)
                    if not block:break
                    received+=len(block)
                    if received>asset['size']:raise ValueError('Download exceeds expected size')
                    output.write(block)
            if archive.stat().st_size!=asset['size']:raise ValueError('Incomplete download')
            app=staging/'app';app.mkdir();extract_release(archive,app,manifest['sha256'])
            if read_json(app/'version.json')['version']!=version:raise ValueError('Application version mismatch')
            target=self.root/'releases'/version;target.parent.mkdir(exist_ok=True)
            if target.exists():shutil.rmtree(str(target))
            shutil.move(str(app),str(target))
            self.pending={'version':version};log.info('Verified update staged: %s',version)
        finally:shutil.rmtree(str(staging),ignore_errors=True)

    def updater(self):
        while True:
            try:self.fetch_update()
            except Exception:log.exception('Update check failed; keeping installed release')
            self.check_now.wait(60);self.check_now.clear()

    def step(self):
        while not self.commands.empty():
            command=self.commands.get_nowait()
            if command=='stop':self.enabled=False;self.stop()
            elif command=='start':self.enabled=True;self.next_launch=0
            elif command=='update':self.check_now.set()
        if not self.enabled:return
        now=time.monotonic()
        if self.child and self.child.poll() is not None:
            code=self.child.returncode;log.warning('Exhibition exited: %s',code);self.child=None
            if code==20:self.enabled=False;self.confirmed=False;return
            if self.candidate:self.rollback()
            else:self.failures+=1;self.next_launch=now+min(60,5*self.failures)
        if not self.child:
            if self.pending:self.activate()
            if now>=self.next_launch:self.launch()
            return
        try:
            token=(self.data/'pairing-key').read_text(encoding='ascii').strip()
            state=request_json('http://127.0.0.1:'+str(self.app_port)+'/api/state?key='+token,timeout=2)
            if state.get('connected'):
                self.last_live=now;self.failures=0
                if not self.confirmed:
                    self.confirmed=True;log.info('Healthy release: %s',self.active['version'])
                    if self.candidate:
                        self.candidate=None;self.previous=None;(self.root/'recovery.json').unlink(missing_ok=True)
                current=state.get('current')
                if self.pending and not self.candidate:self.activate();return
                self.previous_scene=current
        except Exception:pass
        if now-self.last_live>(20 if self.confirmed else 100):
            log.error('Exhibition heartbeat lost')
            if self.candidate:self.rollback()
            else:self.stop();self.next_launch=now+10

    def run(self):
        recovery=read_json(self.root/'recovery.json')
        if recovery:
            self.previous=recovery;self.candidate=dict(self.active);self.rollback()
        threading.Thread(target=self.updater,daemon=True).start()
        try:
            while True:
                try:self.step()
                except Exception:
                    log.exception('Supervisor step failed');self.next_launch=time.monotonic()+15
                time.sleep(1)
        finally:self.stop()


class Control(http.server.BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def reply(self,value):
        body=json.dumps(value).encode('utf-8');self.send_response(200)
        self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)))
        self.end_headers();self.wfile.write(body)
    def do_GET(self):self.reply(self.server.manager.status())
    def do_POST(self):
        # Only the local control command can enqueue an action; disallow browser CSRF.
        command=self.path.lstrip('/')
        if self.headers.get('X-Exhibition-Control')!='1' or command not in ('start','stop','update'):
            self.send_error(403);return
        self.server.manager.commands.put(command);self.reply({'accepted':True})


def control(command):
    request=urllib.request.Request('http://127.0.0.1:'+str(CONTROL_PORT)+'/'+command,
        data=b'',headers={'X-Exhibition-Control':'1'})
    with urllib.request.urlopen(request,timeout=3) as response:return json.loads(response.read())


def main():
    parser=argparse.ArgumentParser();parser.add_argument('command',choices=['run','start','stop','shutdown','update','status'],nargs='?',default='start')
    args=parser.parse_args()
    if args.command=='shutdown':
        if os.name!='nt':return 1
        import ctypes
        if ctypes.windll.user32.MessageBoxW(None,'전시를 종료하고 컴퓨터를 끌까요?','전시 종료',0x24)!=6:return 0
        try:
            control('stop')
            for _ in range(25):
                if not request_json('http://127.0.0.1:'+str(CONTROL_PORT)).get('running'):break
                time.sleep(1)
        except OSError:pass
        subprocess.run(['shutdown','/s','/t','5']);return 0
    if args.command=='status':print(json.dumps(request_json('http://127.0.0.1:'+str(CONTROL_PORT))));return 0
    if args.command!='run':
        try:control(args.command);return 0
        except OSError:
            if args.command!='start':return 1
            subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'run'],cwd=str(ROOT));return 0
    server=http.server.HTTPServer(('127.0.0.1',CONTROL_PORT),Control)
    records=ROOT/'runtime-data';records.mkdir(exist_ok=True)
    handler=RotatingFileHandler(str(records/'manager.log'),maxBytes=1024*1024,backupCount=3,encoding='utf-8')
    handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(message)s'));log.addHandler(handler);log.setLevel(logging.INFO)
    server.manager=Manager();threading.Thread(target=server.serve_forever,daemon=True).start()
    log.info('Supervisor started');server.manager.run()


if __name__=='__main__':sys.exit(main())
