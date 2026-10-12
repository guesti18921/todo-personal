# Cross-device email confirmation

The search input remains mounted when Android's soft keyboard resizes the
viewport or background reminder status changes. Re-rendering list contents does
not replace the active input, query, selection or focus.

Email signup and password sign-in rejected as `email_not_confirmed` show a
waiting screen. While visible, it retries at most once every 30 seconds for
15 minutes, using a separate non-persistent Supabase client. It installs the
session in the main client only if the waiting attempt is still current.
Cancellation, successful sign-in, expiry, invalid credentials and rate limits
clear the pending credentials. Closing/restarting the app requires password
entry again. The password is never written to local storage by this feature.
Gmail and other email providers behave identically. Google OAuth remains a
separate sign-in flow and does not use this mechanism.

## Deployment required before testing

1. Publish `dist/email-confirmed.html` at
   `https://guesti18921.github.io/todo-personal/email-confirmed.html`.
   The Pages workflow copies it to the root alongside the existing website.
2. In Supabase Authentication → URL Configuration → Redirect URLs, allow this
   exact HTTPS URL. Without this setting Supabase may fall back to the existing
   Site URL and open the old website. Do not remove the native OAuth redirect.
3. Build and sign the updated APK after publishing/configuration.

The landing page never logs in the computer opening the email. It strips token
fragments and query parameters from history immediately and loads no external
resources. Verification still happens on Supabase, not on this page.

## Device checks

Start signup on the phone, confirm the email on a computer, then return to the
phone with the waiting screen open. Within 30 seconds it should sign in. Also
test opening the email on the same phone, a non-Gmail address, offline recovery,
cancellation, a used/expired link, and normal password/Google sign-in.
