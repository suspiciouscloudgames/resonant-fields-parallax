package org.resonantfields.exhibition;

import java.util.Calendar;
import java.util.TimeZone;

/** Same Korean daily hours as dist/exhibition-hours.js, even while disconnected. */
public final class OperatingHours {
    private OperatingHours() {}
    public static boolean isOpen(long now){
        Calendar korea=Calendar.getInstance(TimeZone.getTimeZone("Asia/Seoul"));
        korea.setTimeInMillis(now);
        int minute=korea.get(Calendar.HOUR_OF_DAY)*60+korea.get(Calendar.MINUTE);
        return minute>=12*60+45&&minute<18*60;
    }
}
