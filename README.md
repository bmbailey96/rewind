# Rewind

A personal shelf for films missed in theaters: what can be watched now, what a rental costs, and what is worth waiting for. Static PWA, US availability, TMDB film metadata, JustWatch listings, optional Watchmode quotes.

## Two screens and settings

- **Your Card:** Watch now, Rent or buy, Waiting. Large Included/Free/price labels, price filters, and rentals ordered by cost. Apple TV and Prime Video quotes take priority. HD/4K are compared where supplied; SD-only prices do not masquerade as an HD bargain. Lower HD/4K prices at other stores remain visible.
- The rental budget defaults to $7.99 and can be changed in Sort & rental budget. It groups cards; existing per-film alert thresholds stay unchanged.
- **Films You Missed:** recent US theatrical feature releases, popular first, inline catalog search, collapsed month/genre/release filters. Seen, skipped, and tracked films stay off the shelf. No minimum rating count. Runtime and US type 2/3 release records establish eligibility. Rereleases are opt-in.
- **Settings:** Letterboxd imports, services, price connection, cross-device sync, email switches. Maintenance is explicit, never automatic.
- Watched has an Undo action. Existing seen/skipped lists, pins, localStorage keys, and Gist data are preserved. Search shows tracked state.

## Expanded cards

Offers are separated into included subscriptions, free, rent, buy, other subscriptions/add-on channels, and cable. Repeated format rows at the same store and price collapse into one row. Base subscriptions never imply access to paid store rentals or add-on channels.

Release timelines distinguish **Announced**, **Listed**, **Observed**, **Estimate**, and **Unknown**:

- US limited/wide theatrical and digital dates from TMDB. Digital dates do not assert that screenings ended, or that a rental became cheaper.
- Verified provider/distributor announcements in `release-announcements.json`, with source, check date, US region, and exact TMDB film ID. This is a selected curated feed, not a complete or automatically researched news service. October 2026 examples are from Shudder's official US Letterboxd lineup, HBO Max's official pressroom, and Universal Pictures Home Entertainment.
- Optional Watchmode `/releases/` calendar, shared across cards and cached for 24 hours. Exact movie TMDB ID matching. Calendar rows do not create confirmed current offers. The basic calendar is primarily US; any explicitly foreign rows are rejected. No assumption of complete coverage.
- Actual quoted prices include store, format, and check time. A successful refresh appends to bounded local quote history. Null/unknown prices never become $0. Repeated cached observations are deduplicated. Source failure retains clearly marked previous availability.
- A digital-window estimate requires at least five distinct recently browsed features with listed US theatrical and past digital dates. It uses the 20th–80th percentile of observed gaps, excludes same-day/implausible gaps, and labels its broad comparison and sample count. It never claims a named service.
- A cheaper-rental estimate requires at least five other films with matching store/format premium-to-threshold observations and checks close enough to bracket a price change. It uses observed check times, not purported exact price-change dates. Without sufficient history or an explicit price announcement, no reduction date is fabricated.

## Alerts

Per film: any availability/release news, included with selected services or free, or quoted rental at/below a chosen price. New tracks default to included/free; old records without a preference retain their previous any-news behavior. Premium cards offer Wait for my rental budget. Preferences and rental budget sync through the existing private Gist; credentials do not.

The Transmission backend retains the existing Resend sender/recipient and daily check. GitHub Bearer identity is verified as `bmbailey96`, never stored. It receives film IDs/titles, service choices, and alert preferences. Relevant announcements and actual availability can send mail. Estimates never do. Deduplication checkpoints advance only after a successful email; lookup failures never invent removals.

A browser Watchmode key enables on-device quotes/calendar. The separate backend `WATCHMODE_API_KEY` enables daily rental-threshold emails and its calendar. Status/settings explicitly report whether server price checks are connected. A browser key is never silently sent to the alert server or the Gist.

## Validation

`npm test` runs domain regressions and JavaScript syntax checks. Tests cover US feature eligibility, rereleases, channels, buy-only labels, null prices, format comparisons, cost grouping, quote observations, estimate sample minimums, and announcement matching. Transmission tests cover per-film filtering, announcements, exact rental thresholds, retries/outages, and email deduplication. Only the app shell is service-worker cached, never API responses or credentials.

## Unified film hub

Rewind remains the shared card and availability store. The original kalispell-showtimes, movie-oracle, and movie-roulette repositories remain intact.

- Coming Up uses a dark seven-day screening board. Consecutive exact dates become spanning bars; gaps split the bars. National event windows are striped, not expanded into invented daily screenings. List view, search, source filters, week navigation, hide, mute, restore, and event following are available. Mountain Time is used for local schedules.
- The public Transmission `rewind-cinema` function reads Fathom's official releases and TributeMovies' Kalispell listings using Cheerio. It also uses the existing https://kalispell-showtimes.onrender.com/api/showtimes service as a date-only local feed when direct ticket listings are blocked. It caches checks for six hours. A scheduled dispatcher refreshes the cache in a background function every six hours so Render cold starts do not exceed the scheduled-function timeout. Failures retain a clearly labeled previous check for at most seven days. The checked-in launch snapshot is a dated fallback, not a live booking promise.
- Cinemark links open the Kalispell theater page. Individual listed screening times open the supplied Fandango ticket links. National Fathom dates never assert local participation. The last listed day never asserts a closing date.
- Roulette preserves all 164 original entries and the curated CSV tags, runtimes, tone values, and Letterboxd links. Historical provider data from that deck is discarded; displayed viewing options are checked against current sources. Presets, tone triangle / sliders, variety, themes, content exclusions, reroll, banish, undo, reset, sharing, genre, runtime, and budget controls are available. Unknown content tags are excluded when a content exclusion is active; tags are not comprehensive advisories.
- Oracle uses explicit ratings >=4/5, ownership, favorites, or repeat diary entries. Candidate recommendations are generated from TMDB seeds, then ranked with explainable director, keyword, and genre matches against individual positive records. It does not average all tastes together, penalize popularity, infer affection from a watchlist, or claim a predicted rating. Import ratings.csv, diary.csv, or owned/favorites list CSVs in Settings. Without evidence, picks are labeled as filtered selections. Metadata matching is not the old OpenAI embedding service; that original project remains preserved.
- Watched retains Rewind's local action and undo. A dismissible dialog offers a Letterboxd link; it does not automatically open a tab or post a rating. Known imported Letterboxd URLs are kept, otherwise the TMDB redirect is used.
- Watchlist imports accept older films and require a normalized exact title/year match. Ambiguous matches are skipped. The existing card, seen, skip, provider, price, and Gist keys remain unchanged. `rewind-hub-v1` stores taste records and calendar preferences and is included in Gist sync. Existing sync payloads without hub data retain local hub records.
- Event emails are an explicit Settings option, initially off. When enabled with daily emails, new national event dates and local booking dates are reported for tracked films, positive taste records, and followed events. Failed checks do not trigger emails. Event deduplication is checkpointed only after successful delivery. Price threshold emails still require the server WATCHMODE_API_KEY.

Tests include source HTML fixtures, date rollover, gap-preserving bars, selection filters, imports, evidence rules, local watched/undo, Letterboxd links, and existing availability/price checks.
