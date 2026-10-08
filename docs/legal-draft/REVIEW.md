# TO-DO Personal privacy and deletion pages — review draft

Confirmed 2026-10-08: Supabase Free plan; the user tested Android 0.4.9 account deletion successfully.

The HTML pages are in Russian and English, contain no sign-in, tracking scripts,
forms or third-party font requests, and share a local stylesheet. The deletion
page opens an email draft and also displays the address for manual use. It does
not claim that opening the email app submits a request or automatically deletes
an account. Its proposed support turnaround is 30 days after ownership checks.
The mailbox owner must monitor requests, verify ownership without collecting
passwords or login codes, delete the verified user in Supabase Authentication
> Users (which cascades notebooks), and notify the requester. Support deletion
correspondence should be removed from the mailbox within 30 days after closure,
including Trash, unless an applicable legal obligation requires retaining it.

## Confirmed backend settings 2026-10-08

User dashboard screenshots confirm database audit logging is disabled and the
read-only auth.audit_log_entries count is 0 (both dates NULL). No cleanup needed.
Platform logs remain independent of this table.
Custom SMTP is enabled: smtp.resend.com, port 465, sender
noreply@m1strell.com, display name TO-DO, minimum interval 60 seconds.
No SMTP credentials were collected or changed.

## Publication blockers

No working support mailbox has been created yet. The Gmail address in the HTML
is an unverified draft placeholder: Google account creation failed. Do not publish
these pages or ship these contact links until a working mailbox replaces it and
receiving/replying are tested. support@m1strell.com is planned via Timeweb;
Timeweb tariff migration is blocked and deferred pending support resolution.
Confirm the proposed support turnaround and correspondence retention with the
mailbox owner before publication.

Provider infrastructure backups are distinct from the app's local conflict
recovery copies. Free does not include paid-plan daily backup access; that does
not establish that every provider infrastructure copy is erased immediately.
Resend states that email and log data is retained for 30 days on standard plans.
The active SMTP provider was confirmed as Resend by the user dashboard screenshot.

## Publication work after the check

Finalize the retention section and support handling expectations. Copy the three
public assets to dist on both the mobile branch and published main branch without
replacing main's desktop application. Add a privacy link on the sign-in screen
and in mobile Settings, plus a support link. Publish Pages and verify both public
URLs without authentication. Prepare the next Android update with the same signing
certificate, so the in-app privacy link ships with the release.

Expected public URLs:
https://guesti18921.github.io/todo-personal/privacy.html
https://guesti18921.github.io/todo-personal/delete-account.html

## Primary references checked 2026-10-08

- https://support.google.com/googleplay/android-developer/answer/10144311
- https://support.google.com/googleplay/android-developer/answer/13327111
- https://supabase.com/docs/guides/auth/audit-logs
- https://supabase.com/docs/guides/observability/logs
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/backups
- https://resend.com/security/gdpr

These are drafts, not confirmation of Google Play approval or complete legal
compliance. Data Safety and the intended distribution/audience still need review.

## Additional authentication review 2026-10-08

Dashboard confirms email confirmation ON, new signups ON, anonymous sign-ins OFF,
manual linking OFF, Email and Google providers ON. CAPTCHA is OFF; leaked
password protection is OFF (Pro feature). Email limit 30/project/hour; sign-in
and signup limit 30/IP/5 minutes; token verification 30/IP/5 minutes; token
refresh 150/IP/5 minutes. IP forwarding OFF. Minimum password length was 6;
user instructed to set 8, saved state still needs confirmation. Weak-password
message updated to 8 in mobile source, not yet shipped in APK or website.
