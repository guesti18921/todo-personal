# Android test version

## Build

The `Build Android test APK` workflow builds this branch without publishing the
website. Its `todo-personal-android-debug` artifact contains `app-debug.apk`.
The locked Capacitor CLI generates the native scaffold. Gradle creates a test
signing certificate during the build. Signing keys are not stored in the
repository. APKs built on different runners may have different signatures, so
before installing a newer test build, synchronize all local changes. Android
may require uninstalling an older test build; uninstalling removes local data.

For a local build, install Node 24, JDK 21 and the Android SDK (API 36), then:

```sh
npm ci
npm test
npm run build
npm run test:ui
npm run android:prepare
cd android
./gradlew assembleDebug
```

Windows users can run `gradlew.bat assembleDebug` in the final step, or use
`npm run android:open` to open the generated project in Android Studio.

## First test on the project owner's Realme

1. Install the test APK. Android may ask to allow installation from the app
   used to open the downloaded file.
2. With internet available, sign in to the existing email/password account and
   wait for the notebook to finish loading. A first login requires connectivity.
3. Create a task and a note. Check Russian, German and Chinese/Japanese text.
4. Switch off Wi-Fi and mobile data. Create and edit another record.
5. Close and reopen the application. Verify the local records and entry draft.
6. Check Android Back: leave the keyboard, leave the editor, return to Today,
   then minimize the application. Check landscape and keyboard layout.
7. Reconnect and wait for synchronization. Check the same account in the web
   version. Repeat with VPN on/off and a change between Wi-Fi and mobile data.

The native interface is packaged in the APK. Cached account data opens while
an expired session is waiting for the network; cloud operations still require
successful authentication. Signing out removes the active session. The website
and Android app have separate local storage; account synchronization connects
their records.

## Email confirmation returns to Android (0.2.0-test)

Before testing, open the Supabase project dashboard → Authentication → URL
Configuration → Redirect URLs and add exactly `todopersonal://auth-callback`.
Save the setting. Keep the existing Site URL and website redirect URLs.
Supabase must allow this URL; otherwise it falls back to the website Site URL.
If a custom confirmation email template is used, its confirmation button must
use `{{ .ConfirmationURL }}` rather than a hard-coded website or `{{ .SiteURL }}`.

Install the new APK, register, and open a newly issued confirmation email.
The browser verifies the email, then Android opens the installed app and the
app establishes the session. Test once with the app running and once after
closing it. Android may ask permission to open the external app. Old emails
keep their original redirect address and cannot be changed by an APK update.
An already confirmed account can simply sign in in the app.
Expired links and failed network requests show a retry/sign-in message; full
callback URLs and credentials are never logged by the app handler.
Google login is configured and verified by the owner in the web preview.
See [google-sign-in.md](google-sign-in.md) for the provider configuration.
In the next APK, verify both Google and email sign-in with the app closed and
already running. Returning from Google must preserve the existing notebook.

The builds currently use disposable debug signing keys. If Android refuses to
update the previous test APK, first sync all records, then uninstall it and
install this build. Uninstalling removes all local app data.

## Current limits

- Android notifications are implemented but still need a real-device background
  test in the next APK. Browser reminders require an open page.
- Basic date suggestions support ten languages. They require confirmation and
  keep the original text; arbitrary natural-language understanding is outside MVP.
- The interface is currently Russian; record text is not translated.
- Network access to Supabase depends on the actual provider/VPN; automated
  tests simulate failures, so the real network checks above are required.
- Do not uninstall or clear app data while changes are still only local.

## Additional checks in the next APK

1. In Settings enable reminders, grant Android notification permission, and
   create a reminder a few minutes ahead. Close the app and lock the phone.
   Verify delivery offline, tap-to-open, snooze, and cancellation after completion.
2. Deny notification permission, then enable it in Android settings. Check that
   the app explains the next step without repeatedly asking for permission.
3. Select multiple tasks and a note. Complete only the tasks; undo. Move the
   selection to tomorrow; verify the note text and reminder time are preserved.
4. Verify all screens scroll to their last control with the keyboard open and
   closed. Check portrait, landscape, and the same screens in the web preview.
5. Disconnect with unsynchronized changes and try signing out. The app must
   explain that changes are local, keep the account open, and preserve every entry.
   Reconnect, synchronize, and retry signing out.
6. On a fresh device, interrupt the first account load. Verify a readable retry
   message and the option to use another account. Server errors must not appear.

The preview now uses the same notebook interface on touch and desktop screens.
Account snapshots remain isolated. VPN/IP changes never clear local records;
actual network reachability must be checked with the networks used by the owner.

## 0.4.0-test build checkpoint (2026-10-06)

The reproducible scaffold uses versionCode 4 and versionName 0.4.0-test.
It packages all current local-first, Google sign-in, notification, list and
interface changes. The prepared project includes the App, Browser and Local
Notifications plugins, the authentication return intent, and the notification
icon. Actual background delivery and native sign-in remain device checks.

To build it, open repository Actions → Build Android test APK → Run workflow.
Select `android-local-first-2026-10-06`, then press Run workflow. Once all steps
finish successfully, open the run and download `todo-personal-android-debug`
from Artifacts. The ZIP contains `app-debug.apk`. Do not download an older run.

Before replacing an installed test build, open its notebook with internet and
wait for account synchronization to finish. Verify the same latest entries in
the web preview. If Android rejects an update because of debug signatures,
keep the old app installed until every local-only change is in the account.

## 0.4.0 owner checks and 0.4.1 notification fix

The owner confirmed on the Realme test device that notifications arrive and
open the app, offline records survive reopening and synchronize, VPN switching
works on the tested connection, and Google sign-in preserves the notebook.
Tapping a notification opened Today instead of the record editor in 0.4.0.

0.4.1-test (versionCode 5) separates receiving a reminder from tapping it.
Receiving remains passive; tapping opens the matching task or note editor.
The account and reminder timestamp must still match. A cold-start tap waits for
the notebook to load. An interrupted draft is saved before navigating, and a
failed draft save leaves its editor open and retains the pending tap for retry.

Validation: 52 logic/runtime scenarios plus 11 compiled UI scenarios pass.
The real-device tap fix requires a newly built 0.4.1 APK. Open Actions → Build
Android test APK → Run workflow and select android-local-first-2026-10-06.
Test with two records and the app on Today, another tab, and closed. A delivered
notification must open the exact record's editor. Updating an installed test
APK still depends on its debug signing certificate; synchronize before replacing.
