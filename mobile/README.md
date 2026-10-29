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

## Run on an iPhone using a Windows laptop (free Expo Go)
This testing setup is intentionally pinned to Expo SDK 54 because Apple's App Store currently offers Expo Go for SDK 54. We will upgrade to a modern SDK again when the install route supports it. You do not need to own a Mac or join Apple's paid developer program just to test this Expo Go prototype.

1. Install Node.js LTS on Windows from nodejs.org and restart your terminal.
2. Open this repository in GitHub; select Code, then Download ZIP. Extract the ZIP, open the mobile folder in File Explorer and choose Open in Terminal (PowerShell). Alternatively, clone with Git and open mobile in PowerShell.
3. In that mobile directory run:
   
       npm install
       npm run check
       npx expo login
       npm run start:lan

4. On the iPhone, install the official Expo Go app from the App Store, sign into the same free Expo account, connect the iPhone and Windows laptop to the same Wi-Fi and scan the terminal QR code with the iPhone Camera.
5. Keep the PowerShell window open while using Rewind. The native SQLite database lives on the iPhone. If Windows Firewall requests permission for a private network, allow Node. If Wi-Fi routing blocks LAN, stop the Expo server with Ctrl+C and run:

       npm run start:tunnel

Expo may prompt to install its tunnel helper. Only install the official Expo helper. Do not upload passwords or your personal Rewind backup to third-party sites.

This is a local development session running inside Expo Go. It is not a signed standalone iPhone app. The development server must remain on the Windows machine while testing. An app binary signed and installed independently will require a separate Apple distribution step.

## Mac-free cloud builds
GitHub Actions runs the regression tests and exports the iOS JavaScript bundle using Metro without Xcode or Apple credentials. Standalone iOS distribution remains separate.

After authorizing Expo and Apple developer account access, a cloud simulator build (not a physical-iPhone install) can be requested with:

    npx eas-cli@latest login
    npx eas-cli@latest build --platform ios --profile simulator

No paid enrollment, Apple signing, Expo cloud build, or physical iPhone install has been performed in this PR.

## Migrating the real collection
1. In the CURRENT Rewind website, open Settings / Export collection for iPhone app / Download Rewind Backup. Do this on the device holding the most up-to-date unsynced data, without clearing browser storage.
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
