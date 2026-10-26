# Reminders: mobile preview and Android

The deadline describes when the task is due. A reminder is a separate optional choice, available for tasks and notes. Default: no reminder. Presets are at the deadline, 15 minutes, one hour, or one calendar day before it. Custom reminders also work without a deadline. A deadline without a time uses 09:00, stated explicitly in the editor. Times follow the device's local timezone.

The editor displays the exact resulting time, explains disabled device delivery, and validates incomplete reminder fields when saving. Turning the device switch off cancels delivery on that device and keeps record choices. Choices sync as part of the existing notebook JSON; the device switch stays local and account-scoped. Completing or restoring a task clears its reminder; deletion cancels it. Undo restores the original record, including its reminder.

## Browser preview

Enable reminders in Settings or the editor. The device reminder switch controls the in-app banner while the page is open. Optional system browser notifications have a separate Web Push switch; with supported browser APIs, permission, internet and a configured server, they can arrive with the tab closed. See `web-push.md` for deployment and delivery limits. The in-app banner alone cannot wake a closed browser. The page remembers future reminders while enabled; a newly entered past time does not fire. A due reminder can appear on return to the same still-open page within 30 minutes. Each occurrence is shown once on the device. Closing it leaves the record unchanged. Snoozing sets a custom time 10 minutes from now without changing the deadline. Completed tasks stop appearing in active lists.

## Android implementation

Capacitor Local Notifications 8.3.0 schedules local OS notifications, including when offline. Permission is requested only after an explicit enable action. Scheduling without exact-alarm permission uses inexact notifications and displays an explanation; the user can request exact-alarm access separately. OS power restrictions may affect delivery. Native operations are serialized, account-guarded, and reconcile changed, completed, deleted, and disabled records. Notification taps arriving during cold startup are retained until notebook loading completes. Reminder reconciliation also runs on resume, cloud reload, local edits, and periodically while visible. Account changes cancel previous-account notifications.

The Android preparation script generates the notification icon and Android version 0.4.47 (versionCode 51). A dedicated receiver adjusts eligible alarms after clock or time-zone changes. Before each Android release, check background delivery, notification taps, reboot behavior, exact-alarm settings, time-zone changes and vendor battery restrictions on a physical device. Automated checks do not establish actual delivery on every device. Installed APKs change only when the user installs an update.

## Validation

`npm test`: time calculation, invalid input, deadline parser dotted-time regression, native permission/account races, scheduling reconciliation, cancellation, browser deduplication and snooze.

`npm run build && npm run test:ui`: offline browser creation, enabling, due banner, snooze preserving the deadline, completion cancellation and device disable.

`npm run android:prepare`: locked plugin registration, native assets and icon generation. This is preparation, not an Android compilation or device test.

