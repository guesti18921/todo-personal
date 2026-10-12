# Mobile browser preview

The Pages workflow copies the existing main/dist website unchanged to the site
root and builds the Android development branch into /mobile-preview/.
Open that path on a phone and sign in with the confirmed test account.
The preview shares the Supabase database with the app. Use the test account:
the older root website still expects mandatory dates for tasks.

Interface changes can be tested by refreshing this page after a successful
Publish TO-DO workflow. Browser-local unsynced data and APK-local unsynced data
are separate; sync is needed to see edits on both devices.
Native Android functionality still requires device testing in an APK.
Android APK assembly now runs only through workflow_dispatch, when requested.

Pages deployment runs from main in the github-pages environment. After a
development branch change, run Publish TO-DO manually from main, or update
the publishing workflow in main to trigger a deployment. It always reads the
current development branch for the preview. Development-branch pushes do not
attempt deployment because the environment does not accept that branch.
To register directly in the preview, first allow its exact URL in Supabase
Authentication → URL Configuration → Redirect URLs. Signing in with an
already confirmed account does not require another redirect setting.
