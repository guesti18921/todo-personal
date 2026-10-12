# TO-DO Personal 0.4.23

Version code: 27. Package: com.m1strell.todopersonal.

Synchronization regressions reproduced using assets extracted from the signed 0.4.22 APK:

- Manual synchronization could replace the stored notebook while an existing record's editor was opened during a delayed cloud download. The editor kept showing old fields. Saving afterward could overwrite the newer cloud fields. Both manual and background synchronization now use the same dynamic editing guard, checked before download and again before application. An unchanged editor can be left safely and the deferred cloud revision loaded afterward; real local edits retain revision-based conflict protection.
- Opening a saved entry and leaving without edits changed its updatedAt and marked the notebook dirty. This created unnecessary uploads and could cause a conflict with legitimate changes on another device. Unchanged, safely persisted records no longer create another save. Real failed local saves still retry persistence.
- The same green dot represented confirmed synchronization, a cached local copy, pending edits and uploads. Gray now represents local/pending/available state; an outlined ring represents upload; a green check is reserved for clean, server-confirmed state. The local label now says “Сохранено на телефоне” / “Saved on your phone”. Failure to save locally takes priority over abbreviated phase labels.

Regression coverage:

- Delayed manual download, opening an existing editor during the request, unchanged exit and later cloud download.
- Unchanged record viewing leaves the stored snapshot and dirty flag untouched.
- Real Supabase SDK against a mocked HTTP service with revision-conditional updates, two independent app instances, offline editing, competing update, conflict persistence after restart, comparison and keep-both resolution.
- Further edits while an upload is pending are sent afterward; the latest snapshot is not marked confirmed prematurely.
- Real Chromium repeats the delayed-download/editor race, safe exit and later refresh; mocked PATCH handling checks owner and expected revision.
- UI regression tests can run directly against extracted APK assets through TODO_ASSET_ROOT.

Local validation: 110 logic tests passed; one Android-SDK-dependent signing test skipped locally. All 50 UI tests and Chromium checks at 10 RU/EN viewport/locale configurations passed. These checks repeat in CI before native compilation, manifest/asset audit and isolated release signing.

Limitations: HTTP services in these checks are controlled fixtures, not the production Supabase project. No physical Android handset or two real signed-in accounts were available. The native build, APK manifest and certificate checks do not replace on-device sync/keyboard testing. No production data, account permissions or website deployment changed.
