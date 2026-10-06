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
Google login is still a later stage.

The builds currently use disposable debug signing keys. If Android refuses to
update the previous test APK, first sync all records, then uninstall it and
install this build. Uninstalling removes all local app data.

## Current limits

- Notifications and natural-language date parsing are not implemented yet.
- The interface is currently Russian; record text is not translated.
- Network access to Supabase depends on the actual provider/VPN; automated
  tests simulate failures, so the real network checks above are required.
- Do not uninstall or clear app data while changes are still only local.
