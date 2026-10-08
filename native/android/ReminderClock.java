package com.m1strell.todopersonal;

import java.text.ParsePosition;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** Local calendar time is the source of truth; UTC is only the alarm transport. */
public final class ReminderClock {
    private ReminderClock() {}

    public static Date resolve(String wallTime, TimeZone zone) {
        if (wallTime == null || !wallTime.matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}")) return null;
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
        format.setLenient(false);
        format.setTimeZone(zone);
        ParsePosition position = new ParsePosition(0);
        Date date = format.parse(wallTime, position);
        if (date == null || position.getIndex() != wallTime.length()) return null;
        // Java normally picks the later occurrence of an ambiguous fall-back hour.
        // JavaScript Date picks the earlier one; keep native and notebook time identical.
        int previousOffset = zone.getOffset(date.getTime() - 24L * 60 * 60 * 1000);
        int delta = previousOffset - zone.getOffset(date.getTime());
        if (delta > 0) {
            Date earlier = new Date(date.getTime() - delta);
            if (wallTime.equals(format.format(earlier))) date = earlier;
        }
        return date;
    }

    public static String iso(Date date) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(date);
    }

    public static boolean canMove(long oldAt, long now, boolean cancelled, boolean delivered) {
        return oldAt > now && !cancelled && !delivered;
    }
}
