"""Compile the production policy against deterministic Android service doubles."""
from pathlib import Path
import subprocess
import tempfile
ROOT=Path(__file__).resolve().parents[1]
JDK=Path('/Applications/Unity/Hub/Editor/2019.3.9f1/PlaybackEngines/AndroidPlayer/OpenJDK/bin')
SOURCES={
'android/content/Context.java':'''package android.content;
public class Context {
 public static final String DEVICE_POLICY_SERVICE="policy",ACTIVITY_SERVICE="activity",KEYGUARD_SERVICE="keyguard"; public static final int MODE_PRIVATE=0;
 public android.app.admin.DevicePolicyManager policy=new android.app.admin.DevicePolicyManager();
 public android.app.ActivityManager activity=new android.app.ActivityManager();
 public android.app.KeyguardManager keyguard=new android.app.KeyguardManager();
 public SharedPreferences prefs=new SharedPreferences();
 public Object getSystemService(String name){return name.equals("policy")?policy:name.equals("activity")?activity:keyguard;}
 public String getPackageName(){return "org.resonantfields.exhibition";}
 public SharedPreferences getSharedPreferences(String n,int m){return prefs;}
}''',
'android/content/SharedPreferences.java':'''package android.content; public class SharedPreferences {
 public boolean maintenance; public boolean getBoolean(String k,boolean d){return maintenance;}
 public SharedPreferences edit(){return this;} public SharedPreferences putBoolean(String k,boolean v){maintenance=v;return this;} public boolean commit(){return true;}
}''',
'android/content/ComponentName.java':'''package android.content; public class ComponentName {public ComponentName(Context c,Class<?> k){}}''',
'android/content/Intent.java':'''package android.content; public class Intent {public static final String ACTION_MAIN="main",CATEGORY_HOME="home",CATEGORY_DEFAULT="default";}''',
'android/content/IntentFilter.java':'''package android.content; public class IntentFilter {public IntentFilter(String a){} public void addCategory(String c){}}''',
'android/app/ActivityManager.java':'''package android.app; public class ActivityManager {public static final int LOCK_TASK_MODE_LOCKED=1,LOCK_TASK_MODE_PINNED=2;public int state; public int getLockTaskModeState(){return state;}}''',
'android/app/KeyguardManager.java':'''package android.app; public class KeyguardManager {public boolean locked;public boolean isKeyguardLocked(){return locked;}}''',
'android/app/Activity.java':'''package android.app; public class Activity extends android.content.Context {public int starts,stops;public boolean failStart;public void startLockTask(){starts++;if(!failStart)activity.state=1;}public void stopLockTask(){stops++;activity.state=0;}}''',
'android/os/Build.java':'''package android.os; public class Build {public static class VERSION {public static int SDK_INT=30;}}''',
'android/os/UserManager.java':'''package android.os; public class UserManager {public static final String DISALLOW_CREATE_WINDOWS="windows";}''',
'android/app/admin/DevicePolicyManager.java':'''package android.app.admin; import android.content.*;
public class DevicePolicyManager {
 public static final int LOCK_TASK_FEATURE_NONE=0;
 public boolean owner,bar,windows,home,permit=true;public int features=-1;public String[] packages={};
 public boolean isDeviceOwnerApp(String p){return owner;}public void setLockTaskPackages(ComponentName a,String[] p){packages=p;}
 public boolean isLockTaskPermitted(String p){return permit&&packages.length==1&&packages[0].equals(p);}
 public void setLockTaskFeatures(ComponentName a,int f){features=f;}public void setStatusBarDisabled(ComponentName a,boolean d){bar=d;}
 public void addUserRestriction(ComponentName a,String r){windows=true;}public void clearUserRestriction(ComponentName a,String r){windows=false;}
 public void addPersistentPreferredActivity(ComponentName a,IntentFilter f,ComponentName c){home=true;}
 public void clearPackagePersistentPreferredActivities(ComponentName a,String p){home=false;}
}''',
'org/resonantfields/exhibition/KioskAdmin.java':'package org.resonantfields.exhibition; public class KioskAdmin {}',
'org/resonantfields/exhibition/MainActivity.java':'package org.resonantfields.exhibition; public class MainActivity {}',
'org/resonantfields/exhibition/KioskPolicyTest.java':'''package org.resonantfields.exhibition;
import android.app.Activity;
public class KioskPolicyTest {
 static void ok(boolean b,String m){if(!b)throw new AssertionError(m);}
 public static void main(String[] args){
 Activity a=new Activity();
 ok(!KioskPolicy.enter(a)&&a.starts==0,"Unmanaged phone must never fall back to screen pinning");
 a.policy.owner=true;a.keyguard.locked=true;
 ok(!KioskPolicy.enter(a)&&a.starts==0,"Locked credential screen must remain accessible before kiosk starts");
 a.keyguard.locked=false;a.policy.permit=false;
 ok(!KioskPolicy.enter(a)&&a.starts==0,"No lock allowlist permission: deny start");
 a.policy.permit=true;a.failStart=true;
 ok(!KioskPolicy.enter(a),"Failed OS lock must not be reported as protection");
 a.failStart=false;a.activity.state=2;
 ok(!KioskPolicy.locked(a),"Screen pinning does not count");
 ok(KioskPolicy.enter(a)&&a.stops==1,"Migrate pinning into verified full lock");
 ok(a.policy.features==0&&a.policy.bar&&a.policy.windows&&a.policy.home,"Hide all system entry points, block overlays and recover via Home");
 ok(a.policy.packages.length==1&&a.policy.packages[0].equals(a.getPackageName()),"Only exhibition may be allowlisted");
 int starts=a.starts;ok(KioskPolicy.enter(a)&&a.starts==starts,"Resume already locked task without churn");
 KioskPolicy.setMaintenance(a,true);
 ok(!KioskPolicy.enter(a)&&a.starts==starts,"Do not relock during authorized maintenance");
 ok(a.policy.packages.length==0&&!a.policy.bar&&!a.policy.windows&&!a.policy.home,"Operator maintenance restores system access");
 KioskPolicy.setMaintenance(a,false);a.activity.state=0;
 ok(KioskPolicy.enter(a),"Resume reapplies protection");
 a.policy.owner=false;boolean denied=false;
 try{KioskPolicy.setMaintenance(a,true);}catch(SecurityException e){denied=true;}
 ok(denied,"Non-owner may not mutate maintenance policy");
 System.out.println("PASS: unmanaged/pinned/failed/credential lock guards, strict policy, resume, operator recovery");
 }}'''}
with tempfile.TemporaryDirectory(prefix='kiosk-policy-') as temp:
    root=Path(temp)
    for name,source in SOURCES.items():
        file=root/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_text(source)
    actual=root/'org/resonantfields/exhibition/KioskPolicy.java'
    actual.write_text((ROOT/'src/org/resonantfields/exhibition/KioskPolicy.java').read_text())
    subprocess.run([str(JDK/'javac'),'-d',str(root)]+[str(p) for p in root.rglob('*.java')],check=True)
    subprocess.run([str(JDK/'java'),'-cp',str(root),'org.resonantfields.exhibition.KioskPolicyTest'],check=True)
