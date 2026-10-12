# Mobile saving, recovery and offline launch

## What the user sees

The header's saving status opens a dedicated Saving screen. It shows active tasks, completed tasks and notes, the last successful device save and the last confirmed account synchronization. Offline and conflict explanations remain visible while editing. Settings show whether offline startup is ready. Manual sync retries upload and then checks the cloud; success is never inferred merely from the browser's online flag.

Device snapshots remain account-scoped and retain pending edits, conflict state and the last confirmed synchronization time across restart. A browser with a cached account and notebook can open its own saved records while an expired token refresh waits for connectivity; signing out clears access to that cached account. Existing Android offline behavior is retained.

Network requests through Supabase have a 15-second abort timeout and preserve caller cancellation. Network errors keep the local notebook and retry automatically with the existing backoff. No authorization decision depends on the IP address. Tests simulate failed/restored connections and stalled requests; VPN providers, routing and Supabase reachability still require the owner's phone test.

## Conflicts

Uploads use conditional cloud revisions. An unresolved conflict survives restart and suspends automatic uploads. Compare retrieves both copies and lists changed, missing and differently typed records. It does not change either copy.

Keep both combines their records. Unchanged IDs are deduplicated; different versions with the same ID retain the cloud version plus a new local-copy ID and label. Additional copies have reminders disabled to avoid duplicate notifications. Records missing from one side are retained, including deletions made on only one device; the UI states this before the choice.

Use cloud is a secondary expanded action. Both options first re-fetch and check the cloud revision/content and current local content, write an account-scoped recovery snapshot of both originals, and persist the selected notebook before changing the active state. If a read, backup, persistence or stale-preview check fails, the current notebook stays intact. A later concurrent cloud update is caught by the normal conditional upload.

Each recovery snapshot is retained under a separate local key; a pointer selects the latest for download. The browser can export the current notebook and the most recent recovery pair as JSON. Native file export is not provided in this stage, so Android hides download buttons. Recovery files are not automatically imported in this version. Device storage can still be cleared by the user or OS; an exported file is a separate copy.

## Browser offline shell

The scoped service worker caches the public HTML, JS and CSS shell after the first successful online visit. Supabase and account requests are never cached by the worker; account records stay in the existing account-scoped local snapshots. Preview navigation falls back to the cached HTML after failure or a four-second timeout. Device reminders still need an open page in browsers.

`scripts/version-offline.cjs` hashes the shipped HTML/JS/mobile CSS after webpack to version the worker cache automatically. Update asset URLs in `dist/index.html` and `dist/sw.js` together when changing filenames or query versions. Worker activation cleans only caches for its own path. Registering the shell requires a normal browser with service-worker support; embedded browsers may restrict it. The UI reports readiness only after worker activation.

## Validation

Automated storage tests cover recovery, stale previews, local changes during a delayed replacement request, offline conflict restart and restored connectivity. Compiled UI tests cover translated offline status, compare/keep-both, export and browser startup with an expired session and failed network. Worker-runtime tests cover public shell caching, offline navigation and exclusions; fetch tests cover timeout and caller cancellation. These mocks do not substitute for a real browser offline reload or physical VPN switching test. The owner tests those on their phone after publication. No new APK is built in this stage.
