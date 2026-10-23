import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('installer',Path(__file__).resolve().parents[1]/'install-kiosk.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class InstallerTests(unittest.TestCase):
 def test_owner(self):
  self.assertTrue(m.is_owner('Device Owner: \n    admin=ComponentInfo{org.resonantfields.exhibition/.KioskAdmin}\n'))
  self.assertTrue(m.is_owner('Device Owner:\n admin=ComponentInfo{org.resonantfields.exhibition/org.resonantfields.exhibition.KioskAdmin}'))
  self.assertFalse(m.is_owner('Profile Owner: \n admin=ComponentInfo{org.resonantfields.exhibition/.KioskAdmin}'))
  self.assertFalse(m.is_owner('Device Owner:\n admin=ComponentInfo{other/.KioskAdmin}'))
 def test_lock(self):
  prefix='mResumedActivity: ActivityRecord{123 u0 org.resonantfields.exhibition/.MainActivity t12}\n'
  self.assertTrue(m.is_locked(prefix+'mLockTaskModeState=LOCKED'))
  self.assertFalse(m.is_locked(prefix+'mLockTaskModeState=PINNED'))
  self.assertFalse(m.is_locked(prefix.replace('org.resonantfields.exhibition','com.android.settings')+'mLockTaskModeState=LOCKED'))
 def test_select(self):
  tool=m.Installer('adb')
  for data in ['List of devices attached\n','x\tunauthorized\n','x\tdevice\ny\tdevice\n']:
   with patch.object(tool,'run',return_value=data),self.assertRaises(RuntimeError):tool.select()
  with patch.object(tool,'run',return_value='List of devices attached\nx\tdevice\n'):tool.select()
  self.assertEqual(tool.serial,'x')
 def test_denied_owner_stops_install(self):
  tool=m.Installer('adb');calls=[]
  def run(*args,**kwargs):
   calls.append(args)
   return '30' if args==('shell','getprop','ro.build.version.sdk') else 'Not allowed: accounts exist'
  with patch.object(tool,'run',side_effect=run),patch.object(tool,'owner',return_value=False),patch.object(m.Path,'is_file',return_value=True):
   with self.assertRaisesRegex(RuntimeError,'No reset'):tool.install('phone.apk')
  self.assertEqual([c[0] for c in calls],['shell','install','shell'])
  self.assertEqual(calls[2],('shell','dpm','set-device-owner',m.ADMIN))
 def test_maintenance_reply(self):
  tool=m.Installer('adb')
  with patch.object(tool,'run',return_value='Broadcast completed: result=0, data="OK"'):tool.maintenance(True)
  with patch.object(tool,'run',return_value='Broadcast completed: result=0'),self.assertRaises(RuntimeError):tool.maintenance(True)
if __name__=='__main__':unittest.main()
