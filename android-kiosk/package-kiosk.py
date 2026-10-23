"""Package an operator-run mobile-only update; no PC update manifest is emitted."""
from pathlib import Path
import hashlib
import json
import os
import zipfile
ROOT=Path(__file__).resolve().parent
adb=Path(os.environ.get('EXHIBITION_WINDOWS_ADB','/tmp/resonant-platform-tools-windows.zip'))
python=Path(os.environ.get('EXHIBITION_WINDOWS_PYTHON','/private/tmp/exhibition-python-3.13.16-amd64.zip'))
output=ROOT.parent/'output/Exhibition-Mobile-Kiosk-Windows.zip'
base='Exhibition-Mobile-Kiosk/'
sources={'platform-tools':{'url':'https://dl.google.com/android/repository/platform-tools-latest-windows.zip','sha256':hashlib.sha256(adb.read_bytes()).hexdigest()},
         'python':{'url':'https://www.python.org/ftp/python/3.13.16/python-3.13.16-embed-amd64.zip','sha256':hashlib.sha256(python.read_bytes()).hexdigest()}}
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as bundle:
    for name in ['install-kiosk.py','INSTALL-KIOSK.md']:bundle.write(ROOT/name,base+name)
    bundle.write(ROOT.parent/'output/Exhibition-Mobile.apk',base+'Exhibition-Mobile.apk')
    for archive,prefix in [(adb,''),(python,'runtime/')]:
        with zipfile.ZipFile(archive) as source:
            for name in source.namelist():
                if not name.endswith('/'):bundle.writestr(base+prefix+name,source.read(name))
    for action in ['install','verify','pause','resume']:
        script='@echo off\r\ncd /d "%~dp0"\r\n"runtime\\python.exe" "install-kiosk.py" '+action+'\r\nset "RESULT=%ERRORLEVEL%"\r\necho.\r\npause\r\nexit /b %RESULT%\r\n'
        bundle.writestr(base+action.upper()+'.bat',script)
    bundle.writestr(base+'SOURCES.json',json.dumps(sources,indent=2)+'\n')
print(output)
print(hashlib.sha256(output.read_bytes()).hexdigest())
