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
