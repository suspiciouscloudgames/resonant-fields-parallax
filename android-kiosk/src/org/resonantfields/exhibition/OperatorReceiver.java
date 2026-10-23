package org.resonantfields.exhibition;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** DUMP is a system/development permission held by adb shell, never by web pages. */
public class OperatorReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent) {
        if(!"org.resonantfields.exhibition.MAINTENANCE".equals(intent.getAction()))return;
        try{
            KioskPolicy.setMaintenance(context,intent.getBooleanExtra("enabled",true));
            context.startActivity(new Intent(context,MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP));
            setResultCode(0);setResultData("OK");
        }catch(Exception error){setResultCode(1);setResultData(error.getMessage());}
    }
}
