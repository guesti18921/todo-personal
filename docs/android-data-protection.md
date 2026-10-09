# Android system backup and migration policy

Version 0.4.12 keeps allowBackup=false and adds explicit exclusions for legacy
full backup and Android 12+ cloud-backup/device-transfer. Each storage domain is
excluded recursively, including WebView state (notebooks and auth sessions),
preferences (saved reminders), databases and device-protected storage.
The prepared manifest references both committed XML files.

This closes an OEM-dependent gap in allowBackup=false alone. It is a setting for
Android's supported backup transports, not encryption or a guarantee against
root access or proprietary tools that ignore platform rules.

Cloud notebook synchronization and local conflict recovery copies are unaffected.
Before changing phones, synchronize all pending changes from the old device.
Sign in on the new device to retrieve the account notebook. Offline-only drafts
and pending edits do not transfer through Android system migration.

Verify both XML resources and references in the packaged release, not only the
generated scaffold. Device-to-device migration itself needs two physical devices
and was not tested on the owner's single phone.

Reference: https://developer.android.com/identity/data/autobackup

## Remote account deletion (web fix after APK 0.4.14)

The app checks Auth's `/auth/v1/user` endpoint at startup, every 10 seconds while
visible, on focus, reconnect and native resume. This check also runs while editing
or holding unsynced changes. Only an explicit `user_not_found` response for the
still-current account and access token clears that account's local snapshots,
drafts, recovery copies, reminders and session. Late responses cannot clear a
different account or a renewed session. Network errors, rate limits, expired JWTs
and a missing notebook do not prove account deletion and never trigger this wipe.

Offline devices cannot learn about server deletion until they reconnect. This
is not remote erasure of exported files or a promise that providers' backups are
immediately purged. Normal sign-out still retains account-scoped offline copies.

Regression checks: `tests/account-guard.test.cjs` and the packaged UI test
`server-confirmed remote deletion closes an open editor and clears only the deleted account`.
