# 0.4.29

- Android date fields now invoke a native DatePickerDialog, bypassing different OEM WebView date-segment editing behaviour. The ISO storage format, existing save/change handlers, Today/Tomorrow/No deadline controls and time picker are unchanged.
- Both deadline and custom reminder dates use the calendar. Cancel and stale results from a removed editor or another account cannot change saved data. The packaged 0.4.28 Android regression fails on the editable field; 0.4.29 passes date selection, reminder selection, save and restart.
- Added browser push subscription controls, durable worker account binding and notification click handling that preserves an existing editor. Android local reminders remain independent.
- Added server-only subscription and delivery tables, user-verified registration, server-authenticated scheduled dispatch, timezone/DST parity with existing reminders, rechecks for edited/completed/deleted entries, claim leases/retries and endpoint expiration handling. See [deployment instructions](web-push.md).
- Push notifications use a generic message, not the entry text. Web Push is not active until server functions, secrets and Cron are deployed and checked.

Checks include unit/server mocks, UI tests, browser viewports and disposable PostgreSQL migration/permission/lease/quota/cascade tests in CI. Physical S25 Ultra/Tecno calendars and actual desktop closed-tab delivery remain acceptance checks; passing automated tests is not a claim that the app has no bugs.
