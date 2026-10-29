# Rewind Native · Phase 1

A real React Native / Expo app inside the existing Rewind repository, separate from the Netlify website. No WebView. No changes to the website.

## Implemented
- Native Library, offline Discover draw, Settings, film details, search, sorts, pins, watched flags, notes, poster artwork.
- SQLite persistence, independent of Safari local storage, retained across app restarts and available offline.
- First launch bundles 261 verified film identities from the May 27, 2026 Letterboxd archive. They are an OLD snapshot, not the user's latest watchlist and not live syncing.
- Import existing Rewind Settings JSON backups. Preserve local edits; deduplicate catalog identities; transactional SQLite import with rollback on failure.
- Export a native JSON backup using iOS Files / share sheet.
- Never present old or failed rental quotes as current offers. Offline taste draws include unchecked films.
- No API keys or secrets embedded.

## Not yet implemented
This is the first native foundation, not the finished Rewind replacement. Live Discover recommendations for new films, real provider polling and daily prices, automatic full Letterboxd Watchlist updates, server-side scheduled checks, real native notifications, full TV seasons, Oracle context, and release calendars remain separate integration work. No fabricated availability.

## Developing without a Mac
Node 22.13+:

    cd mobile
    npm install
    npm run check
    npx expo install --check
    npx expo start

GitHub Actions also runs the test suite and exports the JavaScript iOS bundle without Xcode or a paid Apple account.

## Physical iPhone testing
On October 29, 2026, Expo SDK 58 is the latest release, but Expo Go for SDK 58 was not yet generally available from the App Store, and current Expo documentation requires Apple Developer enrollment for its physical iPhone signing workflows. A GitHub repo does not install or run on an iPhone by itself. A compatible Expo client, development server, and signing when applicable are needed.

A signed standalone iPhone or TestFlight build requires the owner's Apple Developer Program account and explicit credential authorization. No paid enrollment, Apple signing, Expo cloud build, or iPhone installation has been performed here.

Cloud iOS simulator compilation (not a physical-phone install) can be requested after connecting an Expo account:

    npx eas-cli@latest login
    npx eas-cli@latest build --platform ios --profile simulator

The app's development and production profiles are configured but do not include secrets.

## Migrating the real collection
1. In the CURRENT Rewind website, open Settings / Storage recovery / Download backup JSON. Do this on the device holding the most up-to-date unsynced data, without clearing browser storage.
2. In the native app, open Settings / Import Rewind JSON. Choose that file from Files and confirm.
3. The native app merges known catalog IDs, replaces untouched May 2026 starter data, and preserves pins, notes and watched changes edited locally. The database transaction rolls back on import failures.
4. Export Native Backup creates a separate local file that can be saved to Files or iCloud Drive.

Import does not update Letterboxd or the website. Native backup format is not promised as a full website round trip until we build and test bidirectional sync.

## Files
- App.js: native UI, no WebView.
- src/core.js: pure identity, import, cached-availability and pick logic.
- src/db.js: SQLite data persistence, import, export.
- assets/starter-library.json: 261 older, verified first-launch movie identities.
- test/core.test.cjs: offline Node tests.
- eas.json: cloud simulator + signed development and production build profiles.

Next phase: secure synchronization to the existing availability backend, then the real native Oracle, TV seasons, new discoveries and local showtimes. Provider checks should not depend on keeping the app open.
