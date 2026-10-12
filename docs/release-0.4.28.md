# TO-DO Personal 0.4.28 — coordinated audit fixes

The uploaded 0.4.27 APK was matched by SHA-256 to the previous release and its bundled code to the reviewed build. Existing baseline logic, interface and browser checks passed. New regressions then reproduced three interaction defects before production source changes:

- Superseded sign-in callbacks could release the recovery form lock, replace the active session or erase the password-success message.
- A recovery-email request, or password sign-in, finishing after a recovery link arrived could alter the newer password-save screen.
- An account-scoped edit draft became inaccessible after its source record was removed from the synchronized notebook, including after restart.

Auth operations now use an operation generation to reject superseded results before session installation and after asynchronous boundaries. Ready recovery remains isolated until an explicit new sign-in is started. UI requests also have an operation ticket, so their completion/error/finally handlers cannot change a newer screen. Account changes invalidate both contexts.

Draft discovery includes valid drafts whose source entry no longer exists. The existing draft panel explains the deletion, and continuing recovers the fields as a new entry with a new identifier. The original draft is removed only after a replacement draft is saved successfully. Storage failure, Back/restart, multiple drafts, account isolation and both interface languages are covered. Browser checks exercise real cloud deletion followed by recovery and offline restart at small Russian and English viewports.

No new dependencies, navigation, features, CSS, notification behavior, database schema or public pages were introduced. Only the auth/recovery coordination, draft recovery, explanatory translations, version metadata, tests and release notes changed. Android versionCode is 32; the permanent signing certificate is retained.

The review covers auth helpers, notebook storage/sync/conflict modules, entry/list/editor operations, date/time parsing, translations, reminder models/engine, native time-picker/clock/reset sources, public documents, deletion Edge Function source and packaging/signing checks. It does not verify live Supabase RLS/settings, production email/Google flows, OEM notification delivery or installation on a physical Android device. Server and native plugin interactions in interface tests are simulated; native clock calculations run as Java tests. Actual release signatures are verified by Android signing tools in the isolated CI signing job.
