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

Historical note (2026-10-08), superseded by the review below: the three public links are now shipped in sign-in/Settings and signed Android builds. Play Console setup is separate from the current direct APK distribution. Mailbox delivery cannot be inferred from a working mailto link.

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

## Current implementation review — 2026-10-20 / 0.4.45

Compared the RU/EN policy, support and deletion pages with the current source,
live deployed deletion/push Edge Functions, and read-only database constraints.
All three public tables have RLS enabled. Confirmed ON DELETE CASCADE from
notebooks and web_push_subscriptions to auth.users, and from delivery history
to subscriptions. No user rows or secrets were read for this review.

Updated both policy languages to cover optional browser push endpoints, keys,
language/time zone, encrypted delivery metadata without entry text, browser/OS
push providers, 90-day unrenewed subscription expiry and dispatcher cleanup of
history older than 7 days. Clarified that local Android reminders remain local,
whereas browser push needs internet. Added selected-file JSON import/export,
unencrypted files without Auth credentials, recovery history, and the fact that
entry deletion does not rewrite earlier recovery copies. Removed a brittle
fixed Supabase log-access window and an unverified current audit-log toggle;
provider retention rules remain distinct from erasure guarantees.

Support and deletion contact remains support@m1strell.com. Prior owner acceptance
of mailbox monitoring and 30-day handling/cleanup remains unchanged. Reviewing
code and DNS cannot confirm present mailbox receipt or ongoing manual handling.
Do not claim delivery testing or legal certification from this source audit.
The deletion mailto prepares a draft and does not send or delete anything itself.

The UI links are present before sign-in and in Settings > About (RU/EN).
Policy, support, and account-deletion HTML use local styles and no tracking.
Fixed long policy heading wrapping at 320px without changing the palette.
Ready-to-use listing text and release preservation notes are in
`docs/release-readiness-0.4.45.md`. Store identity, audience, regions and a
submitted Data Safety form cannot be verified without that actual listing.

References rechecked: Supabase mobile deep linking; Android create-deeplinks;
Supabase Logs documentation (plan-dependent availability); Resend GDPR page
(30-day email/log retention on standard Free/Pro/Scale plans). Supabase changelog
2026-10-12 announces legacy TLS CBC cipher removal on 2026-11-10; this navigation
change does not alter TLS or supported Android WebView requirements.
