"""Build the minimal portable Windows exhibition with its verified Python runtime."""
from pathlib import Path
import hashlib
import re
import zipfile

ROOT=Path(__file__).resolve().parent
RUNTIME=Path('/private/tmp/exhibition-python-3.13.16-amd64.zip')
EXPECTED='97dae5274cc54867065e8d5a3226e48c35017ed332a0fdb0e27d5b5821961297'
assert hashlib.sha256(RUNTIME.read_bytes()).hexdigest()==EXPECTED
name='Exhibition-Mobile-Loop'
files={'dist/exhibition-events.js','integration/event-contract.json','dist/exhibition.html','dist/display.html','dist/phone.html','dist/window-installation.json','dist/scene-messages.json',
       'exhibition-launcher.py','exhibition-manager.py','exhibition_discovery.py','exhibition_server.py','exhibition_store.py','version.json','install-exhibition.ps1','dist/media/youtube-short.json','dist/media/ambience/sources.json'}
queue=list(files)
while queue:
    relative=queue.pop()
    p=ROOT/relative
    if p.suffix not in ('.js','.html','.css'):continue
    text=p.read_text()
    refs=re.findall(r'(?:src|href)=["\']([^"\']+)["\']',text)
    refs+=re.findall(r'["\']((?:assets|media)/[^"\']+)["\']',text)
    for ref in refs:
        ref=ref.split('?')[0]
        target=p.parent/ref
        if not target.is_file() or target.suffix==".html":continue
        entry=str(target.relative_to(ROOT))
        if entry not in files:files.add(entry);queue.append(entry)
output=ROOT.parent/(name+'.zip')
with zipfile.ZipFile(str(output),'w',zipfile.ZIP_DEFLATED) as z:
    start='@echo off\r\ncd /d "%~dp0"\r\nstart "" "%~dp0runtime\\pythonw.exe" "%~dp0exhibition-launcher.py"'
    z.writestr(name+'/START.bat',start+'\r\n')
    z.writestr(name+'/TEST-THREE-SCREENS.bat',start+' --preview\r\n')
    for relative in sorted(files):z.write(str(ROOT/relative),name+'/'+relative)
    with zipfile.ZipFile(str(RUNTIME)) as runtime:
        for entry in runtime.infolist():
            z.writestr(name+'/runtime/'+entry.filename,runtime.read(entry))
with zipfile.ZipFile(str(output)) as z:
    assert z.testzip() is None
    names=z.namelist()
    assert not any('photographic' in p or 'README' in p for p in names)
    assert any(p.endswith('/exhibition_server.py') for p in names)
    assert any(p.endswith('/media/youtube-short.mp4') for p in names)
print(str(output))
print('{} application files; {:.1f} MB'.format(len(files),output.stat().st_size/1e6))
manifest={'schema':1,'version':__import__('json').loads((ROOT/'version.json').read_text())['version'],
          'asset':output.name,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}
(ROOT/'output/exhibition-update.json').write_text(__import__('json').dumps(manifest,indent=2)+'\n')
