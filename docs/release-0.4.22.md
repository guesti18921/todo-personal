# TO-DO Personal 0.4.22

Version code: 26. Package: com.m1strell.todopersonal.

User-reported regressions reproduced against 0.4.21:
- Reauthentication password input was replaced on keyboard resize, losing focus. The form now stays mounted, including during background updates and retry.
- Empty existing-entry drafts could trap the editor because Back required a nonempty heading. Back now retains the draft and leaves; recovery identifies the saved entry and distinguishes unfinished edits from a new record. Explicit restore retrieves the last saved version.
- Yearless slash dates were unsupported. Valid day/month alternatives are now shown, and only the selected alternative is applied.
- Spaced clock notation ("в 6 00") and Russian/English month names were unsupported. Recognized explicit clock and calendar expressions are validated. The known spelling "октрября" is supported without rewriting the entry. Unsupported or invalid dates are never rolled over.

Additional fixes found during review:
- Selecting a second date/time alternative or accepting a date-only reminder now dismisses its suggestion, retaining the selected deadline after restart.
- Failed editor saves restore the prior in-memory notebook, preserving a recoverable draft and preventing invisible duplicate records.
- Malformed drafts cannot crash the editor.
- Reminder previews follow the selected clock format; changing account clears stale reauthentication state.

Validation before CI: 109 logic tests passed, 1 SDK-dependent test skipped; 47 UI tests passed. Browser checks passed at 10 RU/EN/locale/viewport configurations, including password DOM identity and focus through simulated keyboard resizing, empty draft exit/reload/restore, exact user input phrases, alternative choice persistence, accessible layouts, time-picker accept/cancel, HTTP failures and offline restart. The original 0.4.21 APK passed manifest/asset/security checks. CI compiles the native release and verifies signatures in the existing isolated signing job. The downloaded signed APK is checked again and its packaged web assets are audited in Chromium.

Limits: no Android emulator or physical handset is available here. OEM keyboard behavior, native time-picker interaction and delivery of notifications while the phone is asleep still require device checks. A comprehensive regression review cannot guarantee the absence of every possible defect. Existing live API isolation checks are not rerun against real accounts in this release.
