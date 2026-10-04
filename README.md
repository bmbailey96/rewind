# Rewind

Browse US theatrical releases by month, select missed films, and check Your Card
for streaming, rental, and purchase availability. The rating-count minimum was
removed so smaller releases are not excluded. No existing watchlist or watched
records were removed. Coyote vs. Acme is added once on the first updated visit.

Email checks run daily through the existing Transmission Netlify backend at
https://transmissionalbum.netlify.app. Deploy the matching Transmission changes
before this frontend. The backend initially tracks Coyote vs. Acme. To sync the
rest of Your Card, connect GitHub under Import using the existing gist token,
then enable email alerts. The token is verified on the backend but never stored.
Alerts go only to bmbailey96@gmail.com. Pause under Your Card.

The first check reports current availability and future dates. Later checks only
email new providers or new/changed dates. US theatrical listings do not establish
local showtimes. An announced digital date is not a subscription streaming date.
