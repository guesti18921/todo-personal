# TO-DO Personal: current capabilities

Current Android baseline: **0.4.47**, versionCode **51**. This document describes the current application; version-specific release notes describe historical changes.

The web app is https://todo.m1strell.com/ . The optional preview at https://todo.m1strell.com/mobile-preview/ uses the same interface and colour palette. Account-scoped local data belongs to the browser origin; a different URL path is not a separate account-storage boundary. Android packages the web interface with Capacitor and native extensions generated from locked dependencies.

## Implemented

- Today / All entries / Completed / Settings, large +, optional deadlines, no-date pinning to Today, selected date chips and full page scrolling.
- Tasks and notes with unrestricted multilingual text, autosave, per-account drafts, search, completion/restoration, deletion and undo.
- Deadline filters, account/device sorting preference and selection for batch completion/restoration or moving to tomorrow, with safe undo.
- Account-scoped snapshots, offline browser shell, offline cached-account opening, conditional Supabase sync, timeout and automatic connection retries.
- Conflict comparison, keep both / use cloud, and up to three separate local recovery snapshots. Browser and Android JSON export and selected-file import with preview; native file operations use system document dialogs. Import merges records and disables reminders on newly imported entries.
- Email signup confirmation returning to the native app; Google login through the browser, explicit account selection, readable errors and password visibility.
- Confirmed deadline suggestions in ten languages, dotted clocks, weekdays and anchored numeric durations; optional combined deadline/reminder acceptance.
- Optional local Android notifications, an open-page reminder banner, and a separate optional browser Web Push subscription. Device enable/disable, timing choices, snooze and reconciliation after completion, deletion or account change remain separate from the record's deadline.

- The sign-in screens use the system language (Russian or English, with English as fallback). Signed-in Settings allow choosing the account interface language; entry text is not translated.

## Saving and drafts

New entries remain local drafts until saved. Existing entries with non-empty main text save changes automatically; Back also attempts to save them. Back is not an undo operation. Local persistence failures keep an error visible instead of reporting success. Local saving and cloud confirmation have distinct statuses. Drafts stay on the current device and should not be treated as synchronized records.

## Release checks and limits

1. Before each Android release, test a fresh install and an update signed with the existing certificate: offline cold launch, Google and email return, real Android background reminders, permissions, back button, keyboard and scrolling.
2. Check phone behavior when changing VPN, IP and connection, including cloud sync and signing back in. The app does not authorize by IP, but external service reachability cannot be guaranteed.
3. Check real export/import, cancellation, stale previews and recovery-history limits. Do not clear app data or uninstall as a routine troubleshooting step when unsynchronized entries remain.
4. Test Russian and English layouts and inspect reported errors. Automated mocks and browser tests do not certify actual delivery on all Android devices or mail providers.

The owner previously confirmed the core web workflows. Treat those reports as historical checks, not proof that every later build has been tested on the owner's phone. Web Push needs the deployed functions, scheduler, secrets and browser permission described in `web-push.md`. System background restrictions can delay delivery. Exported JSON is not encrypted. Source updates do not automatically update an installed APK.

For focused behavior and test instructions see `list-management.md`, `sync-and-offline.md`, `google-sign-in.md`, `deadline-suggestions.md`, `reminders.md` and `android-testing.md`.

