package com.m1strell.todopersonal;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.UserManager;
import com.getcapacitor.CapConfig;
import com.getcapacitor.JSObject;
import com.capacitorjs.plugins.localnotifications.LocalNotification;
import com.capacitorjs.plugins.localnotifications.LocalNotificationManager;
import com.capacitorjs.plugins.localnotifications.NotificationStorage;
import com.capacitorjs.plugins.localnotifications.TimedNotificationPublisher;
import java.util.Collections;
import java.util.Date;
import java.util.Set;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

/** Recompute existing alarms without starting the WebView or accessing cloud data. */
public final class ReminderClockReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (!Intent.ACTION_TIMEZONE_CHANGED.equals(action) && !Intent.ACTION_TIME_CHANGED.equals(action)) return;
        UserManager users = context.getSystemService(UserManager.class);
        if (users == null || !users.isUserUnlocked()) return;
        TimeZone zone = TimeZone.getDefault();
        if (Intent.ACTION_TIMEZONE_CHANGED.equals(action)) {
            String name = intent.getStringExtra("time-zone");
            // Use the broadcast value: the process's cached default can still be old.
            if (name == null || !java.util.Arrays.asList(TimeZone.getAvailableIDs()).contains(name)) return;
            zone = TimeZone.getTimeZone(name);
        }
        NotificationStorage storage = new NotificationStorage(context);
        LocalNotificationManager manager = new LocalNotificationManager(storage, null, context, CapConfig.loadDefault(context));
        if (!manager.areNotificationsEnabled()) return;
        Set<Integer> delivered = manager.currentlyVisibleIds();
        long now = System.currentTimeMillis();
        for (String key : storage.getSavedNotificationIds()) {
            try {
                LocalNotification old = storage.getSavedNotification(key);
                if (old == null || old.getId() == null || old.getSchedule() == null || old.getSchedule().getAt() == null
                        || old.getSchedule().isPerpetual()) continue;
                if (!ReminderClock.canMove(old.getSchedule().getAt().getTime(), now, old.getCancelled(), delivered.contains(old.getId()))) continue;
                JSObject json = storage.getSavedNotificationAsJSObject(key);
                if (json == null) continue;
                JSONObject extra = json.optJSONObject("extra");
                if (extra == null || extra.optString("account").isEmpty() || extra.optString("entryId").isEmpty()) continue;
                String wallTime = extra.optString("wallTime", null);
                if (wallTime == null) continue; // Older app versions acquire metadata on next launch.
                Date at = ReminderClock.resolve(wallTime, zone);
                if (at == null || at.getTime() <= now) {
                    // Past/nonexistent local deadlines must not leave an old future alarm.
                    cancelTimer(context, old.getId());
                    storage.deleteNotification(key);
                    continue;
                }
                if (at.equals(old.getSchedule().getAt())) continue;
                String iso = ReminderClock.iso(at);
                json.getJSONObject("schedule").put("at", iso);
                extra.put("at", iso);
                extra.put("signature", new JSONArray().put(extra.getString("account"))
                    .put(extra.getString("entryId")).put(iso).put(json.optString("body")).toString());
                LocalNotification moved = LocalNotification.Companion.buildNotificationFromJSObject(json);
                // Same notification id replaces the previous alarm; preserve channel/exact settings.
                manager.schedule(null, Collections.singletonList(moved));
                storage.appendNotifications(Collections.singletonList(moved));
            } catch (Exception ignored) {
                // One malformed legacy record must not prevent other alarms being adjusted.
                // Notification contents and credentials are never written to logs.
            }
        }
    }

    private static void cancelTimer(Context context, int id) {
        Intent alarm = new Intent(context, TimedNotificationPublisher.class);
        int flags = PendingIntent.FLAG_NO_CREATE;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
        PendingIntent pending = PendingIntent.getBroadcast(context, id, alarm, flags);
        if (pending == null) return;
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        manager.cancel(pending);
        pending.cancel();
    }
}
