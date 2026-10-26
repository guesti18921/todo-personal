# Interface languages — current Android baseline 0.4.47

The mobile notebook has Russian and English interface translations. Entries can contain text in any language. Deadline suggestions currently recognize common expressions in Russian, English, German, Italian, Spanish, Chinese, Japanese, French, Portuguese and Korean.

## First launch and language choice

The primary device/browser language determines the initial interface: Russian for `ru`, English for `en`, and English for unsupported languages. Country, IP address and VPN are not used. The sign-in, registration and recovery screens use the system language; there is no language selector before sign-in. A language selector is available under Settings after sign-in. Choosing a language never translates entry text or changes deadlines, time zone, reminder times or account identity.

Old manual pre-login preferences do not override system detection on the signed-out screens. After sign-in, pending local account preferences take precedence, then the saved account language; device detection is the initial fallback. Signing out returns the auth screens to the system language.

## Offline and account persistence

The device choice is stored under `todo-personal:language`; account choices are isolated under `todo-personal:language:<user-id>`. A local account choice has a dirty flag until Supabase confirms an update to `user_metadata.todo_personal_language`. The flag persists across offline restarts. The app retries when the connection returns, on focus and every 15 seconds while visible. Metadata updates run outside the Supabase auth callback. User metadata is a preference only and is never used for authorization.

New devices read the account language from their authenticated session. Pending local choices win over stale account metadata. Storage failures keep the current language and show a message.

## Translation boundary

`t()` is for interface copy only. `ui` translates static template segments and leaves interpolated values untouched. Entry contents, project names, backup JSON and identifiers must never be passed into the translation dictionary. Native notification titles and the channel name follow the interface language; notification bodies remain in the original entry language. Existing pending notifications are reconciled with the new title while keeping their ID, target and time.

Date labels use the chosen interface locale. Dates and times continue to use the device's local time zone. System date/time pickers, Google screens and email messages use their own language settings.

## Manual Android check

1. Install the current signed APK over the existing signed app. Keep the existing installation and data.
2. Switch Russian → English → Russian under Settings. Check navigation, search, deadline controls and reminder choices.
3. Create a long multilingual note; verify the list preview is compact and opening it shows the entire text.
4. Choose English, turn off internet, close and reopen the app. Check that the language and entries remain.
5. Schedule a near-future reminder, switch the interface language, and check its title, original text, exact time and tap target.
6. Reconnect and sign into the same account on a second device; check that the account language is used.

