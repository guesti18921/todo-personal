# Web Push

Browser reminders inside an open notebook remain available independently of Web Push. Android still schedules local notifications and does not subscribe to Web Push.

## Deployment

Use project `ihvwqqvndmwtislvgamd`. No changes to the `notebooks` schema or its RLS policies are needed.

1. Apply `supabase/migrations/202610150001_web_push.sql` as an administrator.
2. Run `node scripts/create-web-push-secrets.cjs` **once**. It creates a private ignored directory, an environment file and a Cron setup file. Do not publish these files or regenerate the VAPID key during updates.
3. Set the generated secrets: `supabase secrets set --project-ref ihvwqqvndmwtislvgamd --env-file private-web-push-config/web-push.env`. The initial enabled flag is deliberately false.
4. Deploy `push-subscriptions` and `push-dispatch` with `supabase functions deploy NAME --project-ref ihvwqqvndmwtislvgamd --no-verify-jwt`. Both functions perform their own credential verification: verified Auth user for subscriptions, independent server secret for Cron. No service key or VAPID private key is shipped to browsers/APKs.
5. Execute the generated `private-web-push-config/cron.sql` as an administrator. It stores the scheduler secret in Vault, not in the Cron command. Do not run it twice; preserve the existing named secrets and job on updates.
6. Check both functions, the one-minute Cron job and subscription table permissions. Enable delivery with `supabase secrets set --project-ref ihvwqqvndmwtislvgamd WEB_PUSH_ENABLED=true`.
7. In a desktop browser, enable system notifications in TO-DO Settings and allow the browser permission. Save a reminder at least two minutes ahead, wait for sync, close the tab and check delivery. Check notification click, logout, account switch and completion on another device. Real browser delivery is a separate required acceptance check.

## Behaviour and limits

- The dispatcher reads current cloud records in each subscribed browser's IANA time zone. Android edits therefore update browser reminders after sync. Offline edits cannot cancel a server reminder before those edits reach the cloud.
- Calendar arithmetic matches existing reminders, including DST, custom times, 15/60-minute offsets and calendar-day offsets. Nonexistent entered local times are rejected.
- Opt-in is per browser/profile and account. Notifications contain a generic reminder, not note text. The worker stores an account ID, no credentials, and drops previous-account messages. Clicking never signs into another account and never reloads an open editor.
- Claims use a database lease and a unique subscription/entry/time key. Failed sends retry up to five attempts, expired endpoints are removed, and completed/edited/deleted entries are rechecked before sending. Browser tags and a durable seen marker suppress ordinary duplicate deliveries. An external push service and the database cannot commit atomically; a crash between sending and recording success can cause a repeat.
- Delivery is checked once a minute, not at exact seconds. A working connection, OS/browser notification permissions and browser background operation are required. A powered-off PC or a browser fully stopped by the OS cannot show a notification immediately. Pushes expire after 30 minutes.
- Twenty subscriptions per account are allowed. A database trigger enforces the limit even for concurrent requests. Subscriptions are renewed while the notebook is used and expire after 90 days without renewal; delivery logs are cleaned after seven days. Account deletion cascades to both tables.
- `WEB_PUSH_ENABLED=false` stops server dispatch; browser in-page reminders and Android notifications remain separate.

## Verification

`npm test`, `npm run test:ui`, `npm run test:browser`. CI additionally runs `tests/web-push-schema.sql` in a disposable PostgreSQL database named `todo_push_test` (the script refuses any other database name). These checks do not replace live permission and closed-tab delivery testing.
