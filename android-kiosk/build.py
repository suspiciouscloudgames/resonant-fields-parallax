"""Build the small native Android shell using an existing Android SDK + JDK."""
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import zipfile

ROOT=Path(__file__).resolve().parent
SDK=Path(os.environ.get('ANDROID_SDK_ROOT',str(Path.home()/'Library/Android/sdk')))
JDK=Path(os.environ.get('EXHIBITION_JDK','/Applications/Unity/Hub/Editor/2019.3.9f1/PlaybackEngines/AndroidPlayer/OpenJDK'))
TOOLS=SDK/'build-tools/30.0.3';ANDROID=SDK/'platforms/android-30/android.jar'
PRIVATE=ROOT.parent/'private';PRIVATE.mkdir(exist_ok=True)
KEY=PRIVATE/'android-kiosk.keystore';PASSWORD=PRIVATE/'android-kiosk-password'
if not PASSWORD.exists():PASSWORD.write_text(secrets.token_urlsafe(32));PASSWORD.chmod(0o600)
env=dict(os.environ,JAVA_HOME=str(JDK),PATH=str(JDK/'bin')+os.pathsep+os.environ['PATH'])
env['EXHIBITION_KEY_PASSWORD']=PASSWORD.read_text().strip()
def run(*args):subprocess.run([str(a) for a in args],check=True,env=env)
if not KEY.exists():
    run(JDK/'bin/keytool','-genkeypair','-keystore',KEY,'-storepass:env','EXHIBITION_KEY_PASSWORD',
        '-keypass:env','EXHIBITION_KEY_PASSWORD','-alias','exhibition','-keyalg','RSA','-keysize','3072',
        '-validity','10000','-dname','CN=Resonant Fields Exhibition')
    KEY.chmod(0o600)
output=ROOT.parent/'output/Exhibition-Mobile.apk';output.parent.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='exhibition-apk-') as temp:
    build=Path(temp);classes=build/'classes';classes.mkdir();dex=build/'dex';dex.mkdir()
    run(JDK/'bin/javac','-encoding','UTF-8','-source','8','-target','8','-classpath',ANDROID,'-d',classes,*ROOT.glob('src/**/*.java'))
    run(TOOLS/'d8','--lib',ANDROID,'--min-api','26','--output',dex,*classes.glob('**/*.class'))
    unsigned=build/'unsigned.apk';aligned=build/'aligned.apk'
    run(TOOLS/'aapt','package','-f','-M',ROOT/'AndroidManifest.xml','-S',ROOT/'res','-I',ANDROID,'-F',unsigned)
    with zipfile.ZipFile(unsigned,'a') as z:
        for file in dex.glob('*.dex'):z.write(file,file.name)
    run(TOOLS/'zipalign','-f','4',unsigned,aligned)
    run(TOOLS/'apksigner','sign','--ks',KEY,'--ks-pass','file:'+str(PASSWORD),'--out',output,aligned)
    run(TOOLS/'apksigner','verify','--verbose',output)
print(output)
