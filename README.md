# Rewind

A personal catch-up shelf: browse US theatrical feature releases, select films
that slipped past, and track where they can be watched at home.

## Discovery

The default shelf uses the last six months, sorted by TMDB popularity, with a
50-rating minimum and 60-minute runtime floor. Each candidate is checked against
its US theatrical release records and details before display. Shorts, missing
posters, and entries without a matching US theatrical date are excluded. Smaller
Releases lowers the rating count to 5; Search is unrestricted. Rereleases are an
explicit toggle. No saved watchlist, seen, skipped, or pinned records are removed.
Dates are database listings, not verified local showtimes. Wide release dates
are preferred, with limited dates used when no wide release is listed.

## Availability and prices

Cards separate selected subscriptions, free streaming, rentals, purchases,
other subscriptions/add-on channels, and cable-login offers. Prime/Apple stores
and channel add-ons never count as included with a base subscription. Service
choices are editable and sync with the existing GitHub Gist.

JustWatch availability via TMDB has no price quotes. The optional existing
Watchmode key now retrieves US rent/buy quotes with format, source and timestamp.
Null, missing, string, foreign-region and failed quotes never become dollar
amounts. A digital release date alone is not proof of a current rental offer.
Failed provider checks show previous availability marked stale. The service
worker caches only the app shell, never provider requests, prices or credentials.

## Email

Daily email checks use Transmission's existing Netlify/Resend backend. Coyote
vs. Acme is seeded once. Existing GitHub sign-in verifies bmbailey96 when syncing
selected IDs/titles and service preferences. Tokens are never stored on the
backend. Emails go to bmbailey96@gmail.com. Opening a device does not overwrite
the server card; explicit selection changes and Enable Email Alerts sync it.

Run `npm test` for discovery, subscription-route and price-integrity checks.
