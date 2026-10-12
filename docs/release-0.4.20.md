# TO-DO Personal 0.4.20

Version code: 24. Package: com.m1strell.todopersonal.

- Existing-entry editor drafts are stored by account and entry ID, including empty headings. A recovered draft never replaces the notebook until validated and saved. Successful autosave clears the draft; account deletion also removes these drafts.
- Same-account reauthentication verifies the user ID with a temporary, nonpersistent Auth client before updating the active session. Pending local notebook changes are retained and synchronization is retried after login.
- Slash dates with competing day/month order offer explicit alternatives. Bare Russian/English hours from 1 to 12 offer morning/evening alternatives. Explicit 24-hour and AM/PM phrases stay unambiguous.
- Time format: device default, 24 hours or 12 hours. Android reads the actual device setting through a native plugin and opens a system TimePickerDialog with the selected format. Browser fallback uses an accessible modal with hour/minute/period controls. Canonical stored times remain HH:mm; changing presentation does not reschedule reminders.
- Today filtering and the rest of the visual design retain their existing behavior.

Validation: storage/Auth/parser/reminder/signing unit tests, 42 UI tests including restart recovery and HTTP 401 reauthentication, browser layouts/accessibility and time-picker confirmation/cancellation at 10 viewport configurations. Local Android-SDK-dependent test is skipped; release compilation and signature verification are performed by the existing isolated CI jobs. Actual notification delivery and OEM keyboard/dialog behavior still require a real-device check.

No database policies, user records, Auth provider configuration or public website deployment are changed by this release.
