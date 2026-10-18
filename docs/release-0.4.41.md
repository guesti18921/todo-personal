# 0.4.41 — password reset design

Web recovery and the Android recovery screen share the approved light design: #F7F3EE background, #FFFDFB card, #C38D9E accents, independent centered eye controls, and a lock icon on Save. Fonts and SVG icons ship locally.

A successful server response opens the separate Password saved screen. Pending requests disable the form; validation and server errors retain the editable fields. Android returns to reauthentication without clearing local records or drafts. Late authentication callbacks cannot replace the success screen.

The recovery client remains isolated and nonpersistent. URL credentials are removed before requesting assets. No real reset email is sent by the tests.

Validation: 135 logic checks (one optional environment check skipped), 96 interface checks, browser checks for Russian/English recovery, pending/failure/success responses, centered controls, accessibility, and notebook account isolation. The browser suite also covers the existing login, receipts, notebook, and offline flows. Release APK auditing compares packaged recovery assets against the build.
