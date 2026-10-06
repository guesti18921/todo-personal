# Android: first implementation stage

This branch adds the storage foundation for the planned Android version. It
keeps the existing colors, adds a mobile interface at widths up to 700px, and
does not publish the website. Android test APK builds are now configured; see
`docs/android-testing.md` for build and device test steps.

## Implemented

- Mobile Today / All entries / Completed / Settings screens with a large +.
- Fast task/note entry, optional date and time, manual pinning to Today,
  account-scoped entry drafts, autosave of existing records and undo actions.
- Existing desktop views handle tasks without a deadline.

- Permanent, versioned local snapshots scoped to the authenticated account.
- Cached notebooks open before a cloud request; pending edits survive reopening.
- Existing tasks, projects, notes and completion flags are retained. Legacy
  entries receive deterministic IDs; new entries receive random IDs.
- Existing unsaved drafts migrate without deleting them until persistence succeeds.
- Failed uploads retry with increasing delays up to one minute, and on focus or
  a browser `online` event. This also covers a connection change while the device
  still reports that it is online.
- Cloud revision checks stop conflicting uploads. Neither version is overwritten
  automatically; the existing download/load-cloud controls remain available.
- Local storage failure is shown explicitly. Corrupted snapshots are retained.
- Record text is stored unchanged, including German, English, Italian, Spanish,
  Chinese, Japanese and Russian text. This is text preservation, not reminder
  understanding or interface translation.

## Verification

Run `npm test` for storage, migration, account isolation, restart, retry, Unicode
and conflict scenarios. Tests use an isolated storage and cloud simulation; they
do not contact a real Supabase account. Run `npm ci` and `npm run build` to compile
the application, then `npm run test:ui` for offline interface flows in a DOM
simulation. These checks do not substitute for layout and Android device tests.

## Scope of offline support

The interface must already be loaded and a local snapshot must exist for the
account. First login and first download require connectivity. This stage does
not cache the website shell or add a service worker; reopening the GitHub Pages
URL offline is not guaranteed. The future packaged Android application will
include its interface locally.

Browser localStorage is device storage, not a backup. Clearing application/site
data removes local snapshots. Signing out hides account data from the interface;
snapshots remain account-scoped for later authenticated use on this device.

## Next stages

1. Android device testing, including full offline cold start.
2. Google login and synchronization behavior under VPN/network switching.
3. Local reminders, explicit confirmation of inferred dates and multilingual
   reminder parsing. Device timezone, not IP location, determines relative dates.

The first Android release is tested by the project owner before publication.
