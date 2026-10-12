# TO-DO Personal 0.4.26

Fixes an Android recovery-link replay during password saving. Previously the replay could replace the recovery controller and enable a second password-update request. Auth callbacks now leave the pending operation intact, and the recovery operation has an application-level save lock that is released after failure so retry remains available.

No changes to notebook storage, synchronization, reminders, public legal/support pages or interface styles. Android versionCode is 30; the permanent signing certificate is unchanged.

Regression coverage includes duplicate callbacks during a delayed password request, repeated submission, failure followed by retry, a recovery link for another account, and Android Back preserving the active account and records. Existing logic, interface and browser checks remain in the release workflow. Production Google/email delivery and physical-device behavior require device testing.
