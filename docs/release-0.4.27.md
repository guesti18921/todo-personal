# TO-DO Personal 0.4.27

Fixes recovery callbacks whose verification started before a password save. The previous save lock only rejected newly arriving links; a verification already awaiting a server response could still replace the controller or reset the form. Starting a save now invalidates older recovery callbacks. Every asynchronous verification phase and the error handler check this generation before changing the interface. The invalidation remains effective after both successful and failed saves.

Regression coverage delays each of the three verification requests and tests success/error replies during saving and after completion, plus a late error following a failed save with a successful retry. These tests verify the number of password requests, the form state, and preservation of notebook records and the active account.

Android versionCode is 31. Notebook storage, synchronization, reminders, styles, and public policy/support pages are unchanged. The permanent signing certificate is retained. Physical-device behavior and production email/Google delivery are outside the automated checks.
