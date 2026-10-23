"""Operator-run Android installation. Never resets a device or removes accounts/data."""
import argparse
from pathlib import Path
import re
import subprocess
import sys
import time

PACKAGE='org.resonantfields.exhibition'
ADMIN=PACKAGE+'/.KioskAdmin'
ACTIVITY=PACKAGE+'/.MainActivity'
ROOT=Path(__file__).resolve().parent


def is_owner(text):
    return bool(re.search(r'Device Owner:\s*admin=ComponentInfo\{'+re.escape(PACKAGE)+
                         r'/(?:'+re.escape(PACKAGE)+r')?\.KioskAdmin\}',text))


def is_locked(text):
    return bool(re.search(r'mLockTaskModeState=LOCKED\b',text) and
                re.search(r'(?:mResumedActivity|topResumedActivity)[^\n]*'+re.escape(PACKAGE)+r'/',text))


class Installer:
    def __init__(self,adb,serial=None):self.adb=str(adb);self.serial=serial
    def run(self,*args,check=True):
        command=[self.adb]+(['-s',self.serial] if self.serial else [])+list(args)
        result=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,
                              encoding='utf-8',errors='replace',timeout=90)
        if check and result.returncode:raise RuntimeError(result.stdout.strip())
        return result.stdout
    def select(self):
        output=self.run('devices')
        devices=re.findall(r'^([^\s]+)\s+(device|unauthorized|offline)\s*$',output,re.M)
        if self.serial:
            if (self.serial,'device') not in devices:raise RuntimeError('Selected phone is not connected/authorized. Unlock it and approve USB debugging.')
        else:
            if len(devices)!=1 or devices[0][1]!='device':
                raise RuntimeError('Connect exactly ONE exhibition phone by USB, unlock it and approve USB debugging.\n'+output)
            self.serial=devices[0][0]
    def owner(self):return is_owner(self.run('shell','dumpsys','device_policy'))
    def maintenance(self,enabled):
        result=self.run('shell','am','broadcast','-a',PACKAGE+'.MAINTENANCE','-n',PACKAGE+'/.OperatorReceiver',
                        '--ez','enabled','true' if enabled else 'false')
        if not re.search(r'result=0,\s*data="OK"',result):raise RuntimeError('Operator command was not accepted: '+result)
    def verify(self):
        print('Checking system lock. Unlock the phone if its credential screen is visible.',flush=True)
        for attempt in range(20):
            if is_locked(self.run('shell','dumpsys','activity')):
                print('LOCKED: exhibition is foreground; Android lock task is LOCKED (not screen pinning).',flush=True)
                print('Before admitting visitors: test Home, Recents, Back and top/bottom edge swipes on the phone.')
                return
            time.sleep(1)
        raise RuntimeError('NOT VERIFIED. Do not hand the phone to visitors. Unlock the phone; if asked, enter its PC connection address, then run VERIFY.bat.')
    def install(self,apk):
        if not Path(apk).is_file():raise RuntimeError('APK not found: '+str(apk))
        sdk=self.run('shell','getprop','ro.build.version.sdk').strip()
        if not sdk.isdigit() or int(sdk)<28:raise RuntimeError('Android 9 or later is required; existing app was not replaced.')
        print(self.run('install','-r',str(apk)),flush=True)
        if not self.owner():
            result=self.run('shell','dpm','set-device-owner',ADMIN,check=False)
            if not self.owner():
                raise RuntimeError('Device owner could not be enabled. No reset or account removal was attempted.\n'
                    'Android may reject provisioning because accounts, another owner or work profiles already exist.\n'
                    'Keep the phone with staff; send this exact error for diagnosis.\n'+result)
        self.maintenance(False)
        self.run('shell','am','start','-n',ACTIVITY)
        self.verify()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['install','verify','pause','resume'],nargs='?',default='install')
    parser.add_argument('--adb',default=str(ROOT/'platform-tools'/('adb.exe' if sys.platform=='win32' else 'adb')))
    parser.add_argument('--apk',default=str(ROOT/'Exhibition-Mobile.apk'))
    parser.add_argument('--serial')
    args=parser.parse_args()
    try:
        tool=Installer(args.adb,args.serial);tool.select()
        if args.action=='install':tool.install(args.apk)
        else:
            if not tool.owner():raise RuntimeError('This app is not the device owner. Run INSTALL.bat first.')
            if args.action=='pause':
                tool.maintenance(True)
                print('Operator maintenance enabled. Keep the phone away from visitors; use RESUME.bat to lock again.')
            elif args.action=='resume':
                tool.maintenance(False);tool.run('shell','am','start','-n',ACTIVITY);tool.verify()
            else:tool.verify()
        return 0
    except (OSError,RuntimeError,subprocess.TimeoutExpired) as error:
        print('STOP: '+str(error),file=sys.stderr);return 1


if __name__=='__main__':sys.exit(main())
