# Google sign-in setup

The application checks the public `/auth/v1/settings` endpoint on startup, focus and reconnection. The Google button appears only when the provider is enabled. Email/password login continues to work without Google setup. Settings failures hide the Google button until another successful check.

## Owner setup (no secrets in source code or chat)

1. Open https://console.cloud.google.com/auth/overview . Create/select the project and configure Branding, Audience and Data Access. Request only `openid`, email and profile. While the audience is Testing, add the accounts that will test login.
2. In Clients, create an OAuth client of type **Web application** (the app uses a system browser flow, not Android Credential Manager).
3. Authorized JavaScript origin: `https://todo.m1strell.com`.
4. Authorized redirect URI: `https://ihvwqqvndmwtislvgamd.supabase.co/auth/v1/callback`.
5. Open https://supabase.com/dashboard/project/ihvwqqvndmwtislvgamd/auth/providers . Enable Google and enter the Client ID and Client Secret there. Save. Do not put the secret in the repository or send it in chat.
6. Under Authentication → URL Configuration add these exact redirect URLs without removing existing URLs:
   - `https://todo.m1strell.com/mobile-preview/`
   - `todopersonal://auth-callback`
7. Reload the preview login screen; the Google button should appear. Choose an account and confirm that the return URL is `/mobile-preview/`, not the old website root.

## Flow and checks

Web: the explicit button tap obtains a Supabase OAuth URL, then navigates in the same tab. Android: Capacitor Browser opens the system browser, and the existing deep-link handler establishes the session on return. The existing Supabase implicit flow is retained for email-link compatibility; PKCE callback support also remains in the deep-link handler. This is not native Google Credential Manager integration.

The app offers an account picker, prevents duplicate launches during the request, validates the authorization URL, and displays friendly errors without exposing callback tokens. Cancelling a web consent flow shows a retry message. Closing the native browser leaves email login/retry available. Existing records remain tied to the Supabase user ID; a different Google account is a different notebook. Do not promise automatic notebook merging.

Automated tests cover request options, duplicate clicks, URL validation, failed launches/retry, provider availability, and error mapping. Email auth/deep links/offline/sync tests remain required. Actual Google end-to-end login needs provider setup and a tester account. Native browser/deep-link return needs the next APK; the previously installed APK cannot acquire a new native plugin through a website reload.

References: https://supabase.com/docs/guides/auth/social-login/auth-google and https://capacitorjs.com/docs/apis/browser .

## Owner browser verification — 2026-10-06

The public project settings reported Google enabled after owner configuration. The owner confirmed Google login returned to the notebook and that a test record survived page reload and a fresh incognito Google login. This verifies the browser login/account saving flow for that test account. Android return, broader audience access and VPN/network-switch checks remain separate validations.
