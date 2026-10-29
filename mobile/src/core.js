'use strict';

// These routines intentionally have no React Native dependencies. The website
// and the future native app must agree on IDs and what "verified" means.
function titleKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
function yearOf(film) {
  const value = String(film?.year || film?.release_date || film?.first_air_date || '').slice(0, 4);
  return /^\d{4}$/.test(value) ? value : '';
}
function canonicalId(film, kind) {
  const type = kind || film?.mediaType || film?.media_type || 'movie';
  const id = film?.tmdbId || film?.tmdb_id || film?.id;
  if ((typeof id === 'number' || typeof id === 'string') && /^\d+$/.test(String(id)) && Number(id) > 0)
    return type + ':' + String(Number(id));
  const label = titleKey(film?.title || film?.name);
  if (!label || !yearOf(film)) return null;
  return type + ':name:' + label + ':' + yearOf(film);
}
function validPoster(value) {
  return typeof value === 'string' && /^\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(value)
    ? value : null;
}
function safeString(value) { return typeof value === 'string' ? value.slice(0, 1200) : ''; }
function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function parseRating(value) {
  const n = safeNumber(value);
  return n !== null && n >= 0 && n <= 5 ? n : null;
}
function normalizeMovie(film, origin = 'import', taste = []) {
  if (!film || typeof film !== 'object') return null;
  const type = film.mediaType === 'tv' || film.media_type === 'tv' ? 'tv' : 'movie';
  const id = canonicalId(film, type);
  const title = safeString(film.title || film.name).trim();
  if (!id || !title) return null;
  const matchingTaste = taste.find(t => t && String(t.id) === String(film.id));
  const raw = JSON.stringify(film);
  const snapshot = film.availabilitySnapshot && typeof film.availabilitySnapshot === 'object'
    ? film.availabilitySnapshot : null;
  return {
    id, tmdb_id: /^\d+$/.test(String(film.tmdbId || film.id || '')) ? Number(film.tmdbId || film.id) : null,
    media_type: type, title, year: yearOf(film),
    poster_path: validPoster(film.poster_path || film.detailsSnapshot?.poster_path),
    overview: safeString(film.overview || film.meta?.overview),
    genres_json: JSON.stringify(Array.isArray(film.genre_ids) ? film.genre_ids : Array.isArray(film.genres) ? film.genres : []),
    rating: parseRating(film.rating ?? matchingTaste?.rating),
    pinned: film.pinned ? 1 : 0, watched: film.watched ? 1 : 0,
    note: safeString(film.manualNote || film.note),
    source: origin,
    letterboxd_url: /^https:\/\/(www\.)?letterboxd\.com\/|^https:\/\/boxd\.it\//i.test(film.letterboxdURL || '') ? film.letterboxdURL : null,
    availability_json: snapshot ? JSON.stringify(snapshot) : null,
    raw_json: raw, modified_at: Date.now()
  };
}
function normalizeBackup(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.watchlist))
    throw Error('This is not a Rewind film backup. Export JSON from Rewind Settings.');
  const taste = Array.isArray(input.hub?.taste) ? input.hub.taste : [];
  const out = input.watchlist.map(row => normalizeMovie(row, 'rewind', taste)).filter(Boolean);
  const seasons = (Array.isArray(input.hub?.seriesRecords) ? input.hub.seriesRecords : [])
    .filter(row => row?.status === 'watchlist' && row.title)
    .map(row => normalizeMovie({
      id: row.seriesId || row.id, title: row.title, year: row.year,
      mediaType: 'tv', rating: row.rating, note: row.note,
      poster_path: row.poster_path
    }, 'rewind'));
  // Do not duplicate identical seasons as separate series in this first version.
  const unique = new Map();
  for (const row of [...out, ...seasons.filter(Boolean)]) {
    const earlier = unique.get(row.id);
    unique.set(row.id, earlier ? {
      ...earlier, ...row, pinned: Math.max(earlier.pinned, row.pinned),
      watched: Math.max(earlier.watched, row.watched),
      note: earlier.note || row.note,
      availability_json: row.availability_json || earlier.availability_json,
      letterboxd_url: row.letterboxd_url || earlier.letterboxd_url
    } : row);
  }
  return { films: [...unique.values()], settings: {
    services: Array.isArray(input.services) ? input.services.filter(s => typeof s === 'string').slice(0, 25) : [],
    rentalBudget: typeof input.rentalBudget === 'number' && input.rentalBudget >= 0 &&
      input.rentalBudget <= 100 ? input.rentalBudget : 7.99
  }, updatedAt: Number(input.updatedAt) || null };
}
function availability(film, now = Date.now()) {
  let data;
  try { data = typeof film.availability_json === 'string' ? JSON.parse(film.availability_json) : film.availabilitySnapshot; }
  catch { data = null; }
  if (!data || typeof data !== 'object' || !Number.isFinite(data.checkedAt))
    return { label: 'Viewing options not checked', verified: false, offers: [], checkedAt: null };
  const fresh = data.stale !== true && now - data.checkedAt >= 0 && now - data.checkedAt < 6 * 60 * 60 * 1000;
  if (!fresh) return { label: 'Previously checked · needs refresh', verified: false, offers: [], checkedAt: data.checkedAt };
  const offers = Array.isArray(data.offers) ? data.offers.filter(o =>
    o && ['rent', 'buy', 'subscription', 'free'].includes(o.kind) && typeof o.provider === 'string') : [];
  const accessible = offers.filter(o => o.kind === 'free' || (o.kind === 'subscription' && o.included));
  const rents = offers.filter(o => o.kind === 'rent' && typeof o.price === 'number' && Number.isFinite(o.price));
  if (accessible.length) return { label: accessible[0].kind === 'free' ? 'FREE · ' + accessible[0].provider : 'INCLUDED · ' + accessible[0].provider, verified: true, offers, checkedAt: data.checkedAt };
  if (rents.length) {
    rents.sort((a,b) => a.price - b.price);
    return { label: 'RENT $' + rents[0].price.toFixed(2) + ' · ' + rents[0].provider, verified: true, offers, checkedAt: data.checkedAt };
  }
  return { label: 'No confirmed viewing offer', verified: true, offers, checkedAt: data.checkedAt };
}
function score(film) {
  let genres = [];
  try { genres = JSON.parse(film.genres_json || '[]'); } catch {}
  const ids = genres.map(g => typeof g === 'object' ? g.id : g);
  return (film.pinned ? 8 : 0) + (film.rating || 0) * 2 +
    (ids.includes(27) ? 2 : 0) + (ids.includes(878) ? 1.5 : 0) +
    (ids.includes(53) ? 0.8 : 0) + (film.watched ? -100 : 0);
}
function candidateFilms(films, query = '', mode = 'recommended') {
  const q = titleKey(query);
  const filtered = films.filter(f => !q || titleKey(f.title).includes(q));
  if (mode === 'az') return filtered.sort((a,b) => a.title.localeCompare(b.title));
  if (mode === 'year') return filtered.sort((a,b) => Number(b.year) - Number(a.year) || a.title.localeCompare(b.title));
  return filtered.sort((a,b) => score(b) - score(a) || a.title.localeCompare(b.title));
}
function discoverPick(films, excluded = []) {
  const excludedIds = new Set(excluded);
  const pool = candidateFilms(films.filter(f => !f.watched && !excludedIds.has(f.id)));
  // Prefer strong candidates, but do not return the same film deterministically.
  const sample = pool.slice(0, Math.min(16, pool.length));
  return sample.length ? sample[Math.floor(Math.random() * sample.length)] : null;
}
module.exports = { titleKey, yearOf, canonicalId, validPoster, normalizeMovie, normalizeBackup, availability, score, candidateFilms, discoverPick };
