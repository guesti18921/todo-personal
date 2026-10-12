# TO-DO Personal 0.4.25

Version code 29. Scoped fixes for two reproduced regressions in the signed 0.4.24 APK.

1. Accepting a password-recovery return while an editor is open now persists the complete editor draft before replacing the DOM. This includes a cleared existing title and unfinished new entries. If draft storage fails, the editor remains open with the latest text and a visible saving error; recovery navigation returns false. The notebook session is never replaced by the temporary recovery session.
2. The new-password heading, minimum-length label, repeated-password label and save button now have English translations.

Regression coverage: both original failing scenarios were reproduced against 0.4.24 assets. New UI cases verify the editor draft, immediate recovery navigation, return to the preserved draft, new-entry preservation, storage refusal, reset form translations, matching passwords and unchanged notebook/session storage. Chromium exercises recovery arrival during editing and keyboard resize on Russian and English 320px screens and checks accessibility.

Validation: 112 logic tests pass (one Android-SDK-dependent signing test skipped locally), 59 UI tests pass, browser checks cover ten existing viewport/locale configurations plus the new recovery cases. CI repeats tests, release manifest audit and isolated signing. Final artifact tests run against packaged assets.

Limitations: authentication services in automated tests are fixtures. Production reset email delivery, Google's account chooser and native Android keyboard behavior still require on-device testing. Public pages were restored separately and their URLs stay unchanged. No reminder, parser, synchronization-model or public website changes are part of this release.
