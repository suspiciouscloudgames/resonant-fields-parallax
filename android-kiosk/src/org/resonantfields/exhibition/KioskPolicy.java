package org.resonantfields.exhibition;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.KeyguardManager;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.UserManager;

/** Screen pinning is deliberately never accepted as exhibition protection. */
public final class KioskPolicy {
    private KioskPolicy() {}
    static DevicePolicyManager manager(Context context) {
        return (DevicePolicyManager)context.getSystemService(Context.DEVICE_POLICY_SERVICE);
    }
    static ComponentName admin(Context context) { return new ComponentName(context,KioskAdmin.class); }
    public static boolean isOwner(Context context) { return manager(context).isDeviceOwnerApp(context.getPackageName()); }
    public static boolean maintenance(Context context) {
        return context.getSharedPreferences("kiosk",Context.MODE_PRIVATE).getBoolean("maintenance",false);
    }
    public static void configure(Context context) {
        if(!isOwner(context)||maintenance(context))return;
        DevicePolicyManager dpm=manager(context);ComponentName admin=admin(context);
        dpm.setLockTaskPackages(admin,new String[]{context.getPackageName()});
        if(Build.VERSION.SDK_INT>=28)dpm.setLockTaskFeatures(admin,DevicePolicyManager.LOCK_TASK_FEATURE_NONE);
        dpm.setStatusBarDisabled(admin,true);
        dpm.addUserRestriction(admin,UserManager.DISALLOW_CREATE_WINDOWS);
        IntentFilter home=new IntentFilter(Intent.ACTION_MAIN);
        home.addCategory(Intent.CATEGORY_HOME);home.addCategory(Intent.CATEGORY_DEFAULT);
        dpm.addPersistentPreferredActivity(admin,home,new ComponentName(context,MainActivity.class));
    }
    public static boolean locked(Context context) {
        return ((ActivityManager)context.getSystemService(Context.ACTIVITY_SERVICE)).getLockTaskModeState()
            ==ActivityManager.LOCK_TASK_MODE_LOCKED;
    }
    public static boolean enter(Activity activity) {
        if(!isOwner(activity)||maintenance(activity))return false;
        configure(activity);
        if(locked(activity))return true;
        // Do not cover the credential screen with a task that cannot be unlocked.
        if(((KeyguardManager)activity.getSystemService(Context.KEYGUARD_SERVICE)).isKeyguardLocked())return false;
        if(!manager(activity).isLockTaskPermitted(activity.getPackageName()))return false;
        ActivityManager am=(ActivityManager)activity.getSystemService(Context.ACTIVITY_SERVICE);
        if(am.getLockTaskModeState()==ActivityManager.LOCK_TASK_MODE_PINNED)activity.stopLockTask();
        activity.startLockTask();
        return locked(activity);
    }
    /** Only the permission-protected operator receiver can change this flag. */
    public static void setMaintenance(Context context,boolean enabled) {
        if(!isOwner(context))throw new SecurityException("Device owner is not configured");
        context.getSharedPreferences("kiosk",Context.MODE_PRIVATE).edit().putBoolean("maintenance",enabled).commit();
        DevicePolicyManager dpm=manager(context);ComponentName admin=admin(context);
        if(enabled){
            dpm.setLockTaskPackages(admin,new String[]{});
            dpm.clearPackagePersistentPreferredActivities(admin,context.getPackageName());
            dpm.clearUserRestriction(admin,UserManager.DISALLOW_CREATE_WINDOWS);
            dpm.setStatusBarDisabled(admin,false);
        }else configure(context);
    }
}
