# TO-DO Personal privacy and deletion pages — review draft

Confirmed 2026-10-08: support address todopersonal.support@gmail.com;
Supabase Free plan; the user tested Android 0.4.9 account deletion successfully.

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

## Blocking factual check before publication

Inspect Authentication > Configuration > Audit Logs > Write audit logs to the
database. Optional auth.audit_log_entries storage is independent of accessible
platform-log retention. Do not assume its rows disappear with auth.users or
claim that every security log is deleted after one hour or one day.
If database audit logging exists, verify its actual retention and existing rows
before finalizing the policy. A read-only count contains no user emails or tokens:

```sql
select count(*) as entries,
       min(created_at) as oldest_entry,
       max(created_at) as newest_entry
from auth.audit_log_entries;
```

Provider infrastructure backups are distinct from the app's local conflict
recovery copies. Free does not include paid-plan daily backup access; that does
not establish that every provider infrastructure copy is erased immediately.
Resend states that email and log data is retained for 30 days on standard plans.
Confirm the active SMTP provider is still Resend if settings have changed.

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
