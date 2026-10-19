# TO-DO Personal 0.4.43 (Android code 47)

## Correctness and recovery

- Same-origin tabs take an account-scoped Web Lock before reading or writing the local notebook. A second tab explains the wait and automatically opens the latest snapshot after handoff. Page exit closes the old store before releasing ownership; restored pages reload before editing. Browsers without Web Locks retain the stale-write check, which is a best-effort fallback rather than an atomic cross-tab guarantee.
- Lato 300/400/700 is packaged locally under the OFL license. Notebook and authentication typography and approved colors are preserved.
- Recovery history shows every retained account-scoped copy, allows individual downloads and confirmed deletion, deduplicates identical copies and stops creating copies after three. Pre-upgrade copies are never pruned automatically; the user must export and explicitly delete a copy before another conflict resolution that needs a backup.
- JSON import previews counts, validates format, size, structure and account identity, rejects stale previews, makes a recovery copy before changes, merges without replacing current entries, disables reminders on new imported records, and does not duplicate a repeated import. Legacy files without owner metadata are explicitly identified in the preview.
- Android uses the system document picker to save and open backup files. No broad storage permission is added. File I/O runs separately from the shared Capacitor bridge executor.

## Sign-in and shell

- Android Google OAuth uses PKCE. Only the verifier and pending operation metadata survive process exit; temporary bearer tokens do not. Returns require a locally started, unexpired flow and verified user identity. Duplicate callbacks, unsolicited sessions, and another owner's reauthentication cannot replace the open account. Existing automatic login, password login, email receipt, recovery and reminders remain in place.
- A generated CSP allows local scripts and exact hashes of required inline bootstrap code, local fonts and the specific Supabase endpoints. An embedded app never starts Auth and instead offers a top-level link.

## Validation and remaining work

Tests exercise shared browser storage with real tabs, offline restart and handoff; browser import/export and history confirmation; actual Supabase SDK PKCE with warm/cold Android bridge mocks; wrong-owner/duplicate/unsolicited returns; native file bridge; existing storage, Auth, push, account isolation, accessibility and responsive layouts.

The release pipeline runs the complete test suite, browser audit, Java/Gradle build, actual APK manifest/assets checks and permanent signing-certificate verification before publication.

Physical Android document providers, Google account selection and notifications still require a device check; mocks do not replace those checks. Leaked-password protection remains disabled because the current Supabase plan does not provide it. No paid plan is enabled. GitHub Pages does not provide configurable CSP/X-Frame-Options response headers: the implemented CSP is a meta policy with an application bootstrap embedding guard. Verified Android App Links would additionally require approved HTTPS redirects and hosting configuration; this release uses the existing callback with PKCE.

Settings grouping, visual consistency and a two-column desktop editor are proposed separately in a design demo. They are not silently transferred into the published notebook.
