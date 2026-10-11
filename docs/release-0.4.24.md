# TO-DO Personal 0.4.24

Version code 28. Extends the existing reauthentication screen only.

- Google-only identities offer Continue with Google without requiring a password. Linked Google/email identities offer both methods; email identities keep the existing password form and focus-preserving behavior.
- Forgot password sends a reset email for the current notebook owner's email through the existing isolated confirmation client and reviewed reset page. Success, rate limits and network failures preserve the notebook and pending edits.
- Google reauthentication uses a non-persistent, isolated Supabase client. OAuth return tokens are verified with getUser and owner ID checked before installing the session. Different users, expired return attempts, malformed callbacks, failed verification and intervening account changes cannot assign the notebook to a different account. Native returns after process restart also verify against the current cached notebook owner.
- Web reauthentication returns disable automatic callback session detection and use a session-scoped owner marker before processing tokens. Callback credentials are stripped from the URL. Existing ordinary login behavior remains enabled.
- Same-account success renews the session and retries pending synchronization; server failures remain visible in the existing synchronization status.

Validation: 112 logic checks passed, 1 Android-SDK-dependent check skipped locally. 54 UI checks include Google-only/linked accounts, recovery success and failure, wrong-account rejection and successful OAuth return with pending changes through the actual Supabase SDK. Existing browser checks cover 10 locale/viewport configurations, synchronization/editor races, offline restart and time pickers.

Limits: OAuth/Auth HTTP responses in automated checks are fixtures. A physical Android Google chooser, production reset email delivery and OS notification delivery still require on-device testing. Existing notebook UI, date parsing, synchronization model and reminder scheduling implementation were not modified.
