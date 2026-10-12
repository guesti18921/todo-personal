package com.m1strell.todopersonal;

import java.util.Date;
import java.util.TimeZone;

public class ReminderClockTest {
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
    public static void main(String[] args) {
        String wall = "2026-10-08T17:00:00";
        Date moscow = ReminderClock.resolve(wall, TimeZone.getTimeZone("Europe/Moscow"));
        Date dubai = ReminderClock.resolve(wall, TimeZone.getTimeZone("Asia/Dubai"));
        check("2026-10-08T14:00:00.000Z".equals(ReminderClock.iso(moscow)), "Moscow wall time");
        check("2026-10-08T13:00:00.000Z".equals(ReminderClock.iso(dubai)), "Move alarm one hour earlier in UTC");
        check(moscow.getTime() - dubai.getTime() == 3600000, "Offset change");
        Date ny = ReminderClock.resolve(wall, TimeZone.getTimeZone("America/New_York"));
        check(ny.after(moscow), "Westward change postpones alarm");
        check(ReminderClock.resolve("2026-02-30T17:00:00", TimeZone.getTimeZone("UTC")) == null, "Invalid calendar date");
        check(ReminderClock.resolve("2026-10-08T25:00:00", TimeZone.getTimeZone("UTC")) == null, "Invalid hour");
        check(ReminderClock.resolve("2026-03-08T02:30:00", TimeZone.getTimeZone("America/New_York")) == null, "DST gap not silently shifted");
        Date ambiguous = ReminderClock.resolve("2026-11-01T01:30:00", TimeZone.getTimeZone("America/New_York"));
        check("2026-11-01T05:30:00.000Z".equals(ReminderClock.iso(ambiguous)), "DST repeated hour matches JavaScript's earlier occurrence");
        Date summer = ReminderClock.resolve("2026-07-08T17:00:00", TimeZone.getTimeZone("America/New_York"));
        Date winter = ReminderClock.resolve("2026-12-08T17:00:00", TimeZone.getTimeZone("America/New_York"));
        check(ReminderClock.iso(summer).contains("T21:00:"), "Summer offset");
        check(ReminderClock.iso(winter).contains("T22:00:"), "Winter offset");
        check(!ReminderClock.canMove(100, 101, false, false), "Past reminders never rearm");
        check(!ReminderClock.canMove(200, 100, true, false), "Cancelled reminders never rearm");
        check(!ReminderClock.canMove(200, 100, false, true), "Delivered reminders never rearm");
        check(ReminderClock.canMove(200, 100, false, false), "Pending future reminder can move");
        System.out.println("Native reminder clock checks passed");
    }
}
