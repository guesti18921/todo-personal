# Mobile-first Android MVP: current state

The mobile preview is https://todo.m1strell.com/mobile-preview/ . It preserves the original colours. The older website root remains separate. Native sources are generated reproducibly from locked Capacitor dependencies; APK builds are manual, and the owner tests the first release.

## Implemented

- Today / All entries / Completed / Settings, large +, optional deadlines, no-date pinning to Today, selected date chips and full page scrolling.
- Tasks and notes with unrestricted multilingual text, autosave, per-account drafts, search, completion/restoration, deletion and undo.
- Deadline filters, account/device sorting preference and selection for batch completion/restoration or moving to tomorrow, with safe undo.
- Account-scoped snapshots, offline browser shell, offline cached-account opening, conditional Supabase sync, timeout and automatic connection retries.
- Conflict comparison, keep both / use cloud, separate recovery snapshots and browser JSON export.
- Email signup confirmation returning to the native app; Google login through the browser, explicit account selection, readable errors and password visibility.
- Confirmed deadline suggestions in ten languages, dotted clocks, weekdays and anchored numeric durations; optional combined deadline/reminder acceptance.
- Optional local Android notifications and browser reminders, device enable/disable, timing choices, snooze and cancellation on completion/deletion/account change.

## Verified by the owner

The owner confirmed page scrolling, selected deadlines, reminders in the web flow, offline/synchronization behavior, and Google login with a record surviving reload and a fresh incognito sign-in. Automated tests also cover these flows with simulated storage/network/notification APIs; they are not substitutes for physical Android testing.

## Remaining before the first Android release

1. Test a fresh APK: offline cold launch, Google and email return, real Android background reminders, permissions, back button, keyboard and scrolling.
2. Check phone behavior when changing VPN, IP and connection, including cloud sync and signing back in. The app does not authorize by IP, but external service reachability cannot be guaranteed.
3. Final user-facing cleanup and accessibility/layout pass; remove technical controls from ordinary product flows, then fix issues found by the owner.
4. Prepare release configuration and audience access, and check data recovery/export needs. Browser JSON restore and native file export are not implemented.

For focused behavior and test instructions see `list-management.md`, `sync-and-offline.md`, `google-sign-in.md`, `deadline-suggestions.md`, `reminders.md` and `android-testing.md`.
