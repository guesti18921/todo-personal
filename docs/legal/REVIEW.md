# TO-DO Personal privacy and account deletion — publication notes

Confirmed 2026-10-08: Supabase Free plan; the user tested Android 0.4.9 account deletion successfully.

The HTML pages are in Russian and English, contain no sign-in, tracking scripts,
forms or third-party font requests, and share a local stylesheet. The deletion
page opens an email draft and also displays the address for manual use. It does
not claim that opening the email app submits a request or automatically deletes
an account. Its support turnaround is at most 30 days after ownership checks.
The mailbox owner must monitor requests, verify ownership without collecting
passwords or login codes, delete the verified user in Supabase Authentication
> Users (which cascades notebooks), and notify the requester. Resolved support
correspondence must be removed from the mailbox within 30 days after closure,
including Trash, unless an applicable legal obligation requires retaining it.

## Confirmed backend settings 2026-10-08

User dashboard screenshots confirm database audit logging is disabled and the
read-only auth.audit_log_entries count is 0 (both dates NULL). No cleanup needed.
Platform logs remain independent of this table.
Custom SMTP is enabled: smtp.resend.com, port 465, sender
noreply@m1strell.com, display name TO-DO, minimum interval 60 seconds.
No SMTP credentials were collected or changed.

## Publication status and owner decisions

Updated 2026-10-08: support@m1strell.com was created on the paid Timeweb
mail tariff. Receiving mail from Gmail and replying have both been tested.
Gmail initially classified replies as spam with DKIM no-key errors. The domain
uses Cloudflare authoritative DNS; the Timeweb DKIM public key and an initial
DMARC policy are now published there. Offline cryptographic verification of the
received test email succeeds with that published key. A new Gmail delivery check
is pending. Do not represent spam filtering as fixed until that check.

Privacy and deletion drafts now use support@m1strell.com throughout. Timeweb
is disclosed separately from Resend: support correspondence uses Timeweb;
authentication emails use Resend. Google is listed for optional sign-in only.
Supabase API/database log access on Free is one day; this is not a promise that
all internal provider copies are erased within one day. Android 0.4.12 backup
exclusions are described without promising universal device-transfer behavior.

Owner accepted mailbox monitoring, manual deletion handling, email confirmation,
correspondence cleanup and limited data use during the 2026-10-08 conversation.
After clarifying that in-app deletion is automatic and only email requests need
manual handling, the owner instructed completion and publication of the pages.
The agreed public commitments are:
- Complete verified account deletion requests within 30 days of ownership
  confirmation, without deliberately delaying until the last day.
- Remove resolved support correspondence, including Trash, within 30 days of
  resolution unless applicable law requires retaining it.
These are operating commitments, not a universal Google Play deadline.

The notice identifies TO-DO Personal and its developer contact. Final Play listing
identity, audience, distribution regions and Data Safety answers must be checked
against the notice when setting up Play Console; this publication is not a claim
of full compliance with every regional privacy law or Google Play approval.

Provider infrastructure backups are distinct from the app's local conflict
recovery copies. Free does not include paid-plan daily backup access; that does
not establish that every provider infrastructure copy is erased immediately.
Resend states that email and log data is retained for 30 days on standard plans.
The active SMTP provider was confirmed as Resend by the user dashboard screenshot.

## Published assets and remaining work

Canonical source: docs/legal/privacy.html, delete-account.html and legal.css.
Identical copies in dist are deployed at the root site and mobile preview.
Deployment 37825737571 completed successfully on 2026-10-08; application tests,
build and mobile UI tests passed. GitHub Pages redirects to todo.m1strell.com.
Pages contain no login requirement, analytics, forms or external assets.
The contact is also written out so the request works without a mailto handler.

Public URLs:
https://todo.m1strell.com/privacy.html
https://todo.m1strell.com/delete-account.html

Remaining: add the public privacy link to sign-in and Settings, plus support and
external account-deletion links, then ship them in the next signed Android build.
Complete Play Console Data Safety and regional/audience checks. Gmail filtering
verification is deferred at the owner's request; do not claim it is resolved.

## Manual support deletion procedure

1. Read the request; identify the account email in Supabase Authentication > Users.
2. Send a deletion confirmation to the address recorded on that account. Do not
   rely solely on a sender display name or unverified From header. Wait for a reply
   confirming deletion. Never request passwords, sign-in codes or notebook contents.
3. If that email cannot be accessed, do not delete based only on knowledge of the
   address. Use an authenticated in-app deletion route or a separately verified
   recovery process; do not promise that every lost-email request can be verified.
4. Delete only the confirmed account via Supabase Authentication > Users. The
   notebooks foreign key has ON DELETE CASCADE. Check that both records are gone.
5. Notify the user by email, then remove resolved correspondence (including Trash)
   within the agreed period. Do not include credentials or private entry text in logs.

## Primary references checked 2026-10-08

- https://support.google.com/googleplay/android-developer/answer/10144311
- https://support.google.com/googleplay/android-developer/answer/13327111
- https://supabase.com/docs/guides/auth/audit-logs
- https://supabase.com/docs/guides/observability/logs
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/backups
- https://resend.com/security/gdpr
- https://timeweb.com/ru/personal-data-apps/

Publication is not confirmation of Google Play approval or complete legal
compliance. Data Safety and the intended distribution/audience still need review.

## Additional authentication review 2026-10-08

Dashboard confirms email confirmation ON, new signups ON, anonymous sign-ins OFF,
manual linking OFF, Email and Google providers ON. CAPTCHA is OFF; leaked
password protection is OFF (Pro feature). Email limit 30/project/hour; sign-in
and signup limit 30/IP/5 minutes; token verification 30/IP/5 minutes; token
refresh 150/IP/5 minutes. IP forwarding OFF. Minimum password length was 6;
user instructed to set 8, saved state still needs confirmation. The client weak-password message uses 8 in Android 0.4.12; the backend saved value still needs confirmation.
