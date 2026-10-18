# 0.4.42 — password login errors

A rejected password login now honors GoTrue's explicit `x-sb-error-code` response header without waiting for a delayed, empty or interrupted error body. Only confirmed credential and unconfirmed-email errors use that shortcut; timeouts and service errors are not classified as incorrect passwords.

Password-token requests have a ten-second connection/body deadline. The shared error presenter separates incorrect email/password, unavailable service, network timeout and rate limiting, and handles thrown errors using the same rules. Existing session persistence and automatic sign-in remain unchanged.

Regression coverage uses the actual Supabase SDK and browser responses: Russian/English, standard GoTrue JSON, explicit error header with an unreadable body, duplicate submit, subsequent attempts, network failure, HTTP 503 and HTTP 429. No test signs in to a real user's account or sends email.
