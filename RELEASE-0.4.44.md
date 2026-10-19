# TO-DO Personal 0.4.44 (Android code 48)

The editor and settings use the existing palette, fonts, controls and data model.

- At widths of 1000px and above, writing and deadline/reminder controls appear in two columns. Expand text switches to a single wide writing column and keeps schedule controls below it. The same DOM fields survive both switches and responsive changes.
- Narrow layouts keep the original 140px minimum main text area. A new undated entry starts with its schedule collapsed. An existing deadline or reminder is open on entry; accepting a suggested deadline also opens its controls. A compact summary stays visible when collapsed, and collapsed fields remain part of saving and draft recovery.
- Settings groups notification controls, language/time/date preferences, and app information. Account, saving status, offline readiness and backup access stay directly available. Expanded groups survive settings rerenders, language changes and notification status refreshes.
- Automatic login, Auth screens, synchronization, backup formats, reminder permissions and native pickers retain their existing behavior.

Validation includes the full logic and UI suites, responsive/accessibility checks, and browser scenarios covering keyboard resizing/caret retention, hidden-field persistence, custom reminders, desktop expansion and resizing back to phone, and settings disclosure state. The release pipeline compiles Android, audits the actual APK manifest/assets and verifies the permanent signing certificate. Device keyboard and physical Android appearance still need an on-device check.
