// ---------- letterboxd import ----------

const SEEN_KEY = 'rewind-seen-v1';
let seenSet = loadSeenSet();

function loadSeenSet() {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    return new Set();
  }
}

function saveSeenSet() {
  localStorage.setItem(SEEN_KEY, JSON.stringify([...seenSet]));
}

function normalizeTitle(title) {
  return (title || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function seenKey(title, year) {
  return normalizeTitle(title) + '|' + (year || '');
}

function isSeen(movie) {
  const year = (movie.release_date || movie.primary_release_date || '').slice(0, 4);
  return seenSet.has(seenKey(movie.title, year));
}

// minimal CSV parser, handles quoted fields with commas/newlines
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map(r => {
    const obj = {};
    header.forEach((h, idx) => obj[h.trim()] = r[idx] || '');
    return obj;
  });
}

document.getElementById('import-watched').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const rows = parseCSV(text);
  let added = 0;
  rows.forEach(r => {
    const name = r.Name || r.name;
    const year = r.Year || r.year;
    if (!name) return;
    seenSet.add(seenKey(name, year));
    added++;
  });
  saveSeenSet();
  document.getElementById('watched-status').textContent = `Loaded ${added} seen titles. New Arrivals will filter them out from now on.`;
  renderDiscover();
});

document.getElementById('import-watchlist').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const rows = parseCSV(text).filter(r => r.Name || r.name);
  const statusEl = document.getElementById('watchlist-import-status');
  let matched = 0, skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const name = rows[i].Name || rows[i].name;
    const year = rows[i].Year || rows[i].year;
    statusEl.textContent = `Matching ${i + 1} / ${rows.length}... (${matched} added so far)`;
    try {
      const results = await searchMovies(name);
      let best = results[0];
      if (year) {
        const withYear = results.find(m => (m.release_date || '').slice(0, 4) === String(year));
        if (withYear) best = withYear;
      }
      const releaseDate = best?.release_date;
      const isRecent = releaseDate && releaseDate >= dateMonthsAgo(12);
      if (best && isRecent && !watchlist.some(w => w.id === best.id)) {
        watchlist.push({
          id: best.id,
          title: best.title,
          poster_path: best.poster_path,
          release_date: best.release_date || '',
          genre_ids: best.genre_ids || [],
          addedAt: Date.now(),
          lastStatusCode: null,
          lastStatusLabel: null,
          statusChangedAt: null,
          pinned: false,
          manualNote: '',
        });
        matched++;
      } else {
        skipped++;
      }
    } catch (err) {
      skipped++;
    }
    // gentle pacing so we don't hammer TMDB
    await new Promise(res => setTimeout(res, 120));
  }
  saveWatchlist();
  statusEl.textContent = `Done. ${matched} added to Your Card (last 12 months only), ${skipped} skipped (too old or unmatched).`;
  renderWatchlist();
});

// ---------- skip list ----------

const SKIP_KEY = 'rewind-skipped-v1';
let skipSet = loadSkipSet();

function loadSkipSet() {
  try {
    const raw = localStorage.getItem(SKIP_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    return new Set();
  }
}

function saveSkipSet() {
  localStorage.setItem(SKIP_KEY, JSON.stringify([...skipSet]));
}

function skipMovie(id) {
  skipSet.add(id);
  saveSkipSet();
}

const GENRE_MAP = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
  878: 'Science Fiction', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};

// weights derived from analyzing genre frequency across your 4.5-5 star
// rated Letterboxd titles, higher = shows up more often in what you love
const GENRE_AFFINITY = {
  28: 0.0741, 12: 0.0741, 878: 0.0691, 35: 0.1123, 53: 0.0963,
  18: 0.1679, 80: 0.0667, 9648: 0.0531, 10402: 0.0148, 10749: 0.0333,
  27: 0.0877, 10752: 0.0123, 14: 0.0481, 37: 0.0074, 16: 0.0309,
  10751: 0.0346, 36: 0.0123, 99: 0.0049,
};

function affinityScore(genreIds) {
  if (!genreIds || !genreIds.length) return 0;
  const sum = genreIds.reduce((s, g) => s + (GENRE_AFFINITY[g] || 0), 0);
  return sum / genreIds.length;
}

let watchlistGenreFilter = null;
let watchlistSort = 'status';
let watchlistShowAll = false;

// ---------- config ----------

const TMDB_KEY = '000802da6224e125437187b196cde898';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w342';
const REGION = 'US';
const STORAGE_KEY = 'rewind-watchlist-v1';

// release_type codes on TMDB: 1 premiere, 2 limited theatrical, 3 theatrical, 4 digital, 5 physical, 6 tv
const RELEASE_TYPE_DIGITAL = 4;

let discoverPage = 1;
let watchlist = loadWatchlist();

// ---------- storage ----------

function loadWatchlist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveWatchlist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist));
}

// ---------- tmdb calls ----------

async function tmdbGet(path, params = {}) {
  const url = new URL(TMDB_BASE + path);
  url.searchParams.set('api_key', TMDB_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error('TMDB request failed: ' + path);
  return res.json();
}

function dateMonthsAgo(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

async function fetchDiscover(page = 1) {
  const today = new Date().toISOString().slice(0, 10);
  const twelveMonthsAgo = dateMonthsAgo(12);
  const data = await tmdbGet('/discover/movie', {
    region: REGION,
    sort_by: 'popularity.desc',
    with_release_type: '2|3',
    'primary_release_date.gte': twelveMonthsAgo,
    'primary_release_date.lte': today,
    'vote_count.gte': 50,
    page,
  });
  return data;
}

async function searchMovies(query) {
  const data = await tmdbGet('/search/movie', { query, region: REGION });
  return data.results || [];
}

async function fetchWatchProviders(id) {
  const data = await tmdbGet(`/movie/${id}/watch/providers`);
  return data.results?.[REGION] || null;
}

async function fetchReleaseDates(id) {
  const data = await tmdbGet(`/movie/${id}/release_dates`);
  const entry = (data.results || []).find(r => r.iso_3166_1 === REGION);
  return entry ? entry.release_dates : [];
}

// keywords matched against TMDB/JustWatch provider_name (lowercase, substring match)
const MY_SERVICES = [
  'hulu',
  'prime video', 'amazon prime',
  'apple tv',
  'hbo max', 'max',
  'netflix',
  'eternal family',
  'peacock',
  'paramount',
  'disney plus', 'disney+',
  'shudder',
];

function isMyService(providerName) {
  const n = (providerName || '').toLowerCase();
  return MY_SERVICES.some(s => n.includes(s));
}

// ---------- status logic ----------

// returns { code, label, date }
async function deriveStatus(movie) {
  const [providers, releaseDates] = await Promise.all([
    fetchWatchProviders(movie.id).catch(() => null),
    fetchReleaseDates(movie.id).catch(() => []),
  ]);

  if (providers) {
    const streamingLists = [
      ...(providers.free || []),
      ...(providers.flatrate || []),
      ...(providers.ads || []),
    ];

    const mine = streamingLists.find(p => isMyService(p.provider_name));
    if (mine) {
      return { code: 'free', label: 'STREAMING ON ' + mine.provider_name.toUpperCase(), providers: [mine] };
    }

    // it's streaming, just not on anything you subscribe to
    if (streamingLists.length) {
      const p = streamingLists[0];
      return { code: 'rent', label: 'ON ' + p.provider_name.toUpperCase() + ' (NOT ONE OF YOURS)', providers: streamingLists };
    }

    if (providers.rent?.length || providers.buy?.length) {
      const p = providers.rent?.[0] || providers.buy?.[0];
      return { code: 'rent', label: 'RENT/BUY ON ' + p.provider_name.toUpperCase(), providers: providers.rent || providers.buy };
    }
  }

  const digital = releaseDates.find(r => r.type === RELEASE_TYPE_DIGITAL);
  if (digital) {
    const d = new Date(digital.release_date);
    const today = new Date();
    if (d > today) {
      return { code: 'notyet', label: 'CONFIRMED ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), date: digital.release_date };
    }
    return { code: 'rent', label: 'DIGITAL SINCE ' + d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) };
  }

  return { code: 'nodata', label: 'NO DATE YET' };
}

// ---------- rendering helpers ----------

function posterUrl(path) {
  return path ? IMG_BASE + path : '';
}

function stampRotation(seed) {
  const n = (seed.charCodeAt(0) + seed.length) % 7 - 3;
  return n + 'deg';
}

function renderCard(movie, opts = {}) {
  const { context = 'discover', status = null, changed = false } = opts;
  const inList = watchlist.some(w => w.id === movie.id);
  const year = (movie.release_date || movie.primary_release_date || '').slice(0, 4);

  const card = document.createElement('div');
  card.className = 'rental-card';

  const poster = document.createElement('img');
  poster.className = 'card-poster';
  poster.loading = 'lazy';
  poster.src = posterUrl(movie.poster_path);
  poster.alt = movie.title + ' poster';
  card.appendChild(poster);

  if (status) {
    const stampWrap = document.createElement('div');
    stampWrap.style.setProperty('--stamp-rot', stampRotation(movie.title || 'x'));
    const stamp = document.createElement('span');
    stamp.className = 'stamp status-' + status.code;
    stamp.textContent = status.label;
    stampWrap.appendChild(stamp);

    if (changed && opts.prevLabel) {
      const ghost = document.createElement('div');
      ghost.className = 'stamp-ghost';
      ghost.textContent = opts.prevLabel;
      stampWrap.appendChild(ghost);
    }
    card.appendChild(stampWrap);
  }

  const title = document.createElement('p');
  title.className = 'card-title';
  title.textContent = movie.title;
  card.appendChild(title);

  if (opts.markSeen && isSeen(movie)) {
    const seenTag = document.createElement('span');
    seenTag.className = 'new-tag';
    seenTag.style.background = 'var(--ink-soft)';
    seenTag.style.color = 'var(--paper)';
    seenTag.textContent = 'ALREADY SEEN';
    card.insertBefore(seenTag, title);
  }

  const meta = document.createElement('p');
  meta.className = 'card-meta';
  meta.textContent = year || 'year unknown';
  card.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  if (context === 'watchlist') {
    const pinBtn = document.createElement('button');
    const isPinned = watchlist.find(w => w.id === movie.id)?.pinned;
    pinBtn.className = isPinned ? '' : 'secondary';
    pinBtn.textContent = isPinned ? '★ PINNED' : '☆ PIN';
    pinBtn.onclick = () => togglePin(movie.id);
    actions.appendChild(pinBtn);

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'REMOVE';
    removeBtn.onclick = () => removeFromWatchlist(movie.id);
    actions.appendChild(removeBtn);
  } else {
    const addBtn = document.createElement('button');
    addBtn.textContent = inList ? 'ON CARD' : 'ADD TO CARD';
    addBtn.disabled = inList;
    addBtn.onclick = () => { addToWatchlist(movie); card.remove(); };
    actions.appendChild(addBtn);

    if (!inList) {
      const skipBtn = document.createElement('button');
      skipBtn.className = 'secondary';
      skipBtn.textContent = 'SKIP';
      skipBtn.onclick = () => { skipMovie(movie.id); card.remove(); };
      actions.appendChild(skipBtn);
    }
  }

  card.appendChild(actions);
  return card;
}

// ---------- watchlist actions ----------

function addToWatchlist(movie) {
  if (watchlist.some(w => w.id === movie.id)) return;
  watchlist.push({
    id: movie.id,
    title: movie.title,
    poster_path: movie.poster_path,
    release_date: movie.release_date || movie.primary_release_date || '',
    genre_ids: movie.genre_ids || [],
    addedAt: Date.now(),
    lastStatusCode: null,
    lastStatusLabel: null,
    statusChangedAt: null,
    pinned: false,
    manualNote: '',
  });
  saveWatchlist();
  showToast(movie.title + ' — added to your card');
  // keep it out of Discover/Search's cached lists so re-renders don't bring it back
  lastDiscoverResults = lastDiscoverResults.filter(m => m.id !== movie.id);
  lastSearchResults = lastSearchResults.filter(m => m.id !== movie.id);
}

function togglePin(id) {
  const entry = watchlist.find(w => w.id === id);
  if (!entry) return;
  entry.pinned = !entry.pinned;
  saveWatchlist();
  renderWatchlist();
}

function removeFromWatchlist(id) {
  watchlist = watchlist.filter(w => w.id !== id);
  saveWatchlist();
  renderWatchlist();
}

// ---------- render: watchlist ----------

let lastDiscoverResults = [];
let lastSearchResults = [];

function renderDiscoverCached() {
  document.getElementById('discover-grid').querySelectorAll('.rental-card').forEach(el => el.remove());
  lastDiscoverResults.forEach(m => document.getElementById('discover-grid').appendChild(renderCard(m, { context: 'discover' })));
}
function renderSearchCached() {
  document.getElementById('search-grid').querySelectorAll('.rental-card').forEach(el => el.remove());
  lastSearchResults.forEach(m => document.getElementById('search-grid').appendChild(renderCard(m, { context: 'discover', markSeen: true })));
}

async function renderWatchlist() {
  const grid = document.getElementById('watchlist-grid');
  const pinnedGrid = document.getElementById('pinned-grid');
  const pinnedSection = document.getElementById('pinned-section');
  const empty = document.getElementById('watchlist-empty');
  const countEl = document.getElementById('watchlist-count');
  const changedStrip = document.getElementById('changed-strip');
  const changedList = document.getElementById('changed-list');

  grid.innerHTML = '';
  pinnedGrid.innerHTML = '';
  changedList.innerHTML = '';
  countEl.textContent = watchlist.length + (watchlist.length === 1 ? ' title' : ' titles');

  if (watchlist.length === 0) {
    empty.hidden = false;
    changedStrip.hidden = true;
    pinnedSection.hidden = true;
    document.getElementById('hidden-count-note').hidden = true;
    renderGenreChips();
    return;
  }
  empty.hidden = true;

  const statusOrder = { free: 0, notyet: 1, nodata: 2, rent: 3 };
  const results = [];

  for (const entry of watchlist) {
    const status = await deriveStatus(entry);
    const changed = entry.lastStatusCode !== null && entry.lastStatusCode !== status.code;
    if (changed || entry.lastStatusCode === null) {
      entry.statusChangedAt = Date.now();
    }
    results.push({ entry, status, changed });
    entry._prevLabel = entry.lastStatusLabel;
    entry.lastStatusCode = status.code;
    entry.lastStatusLabel = status.label;
  }
  saveWatchlist();

  renderGenreChips();

  const passesFilter = (r) => !watchlistGenreFilter || (r.entry.genre_ids || []).includes(watchlistGenreFilter);
  const passesStatusGate = (r) => watchlistShowAll || r.status.code === 'free' || r.status.code === 'rent';

  const pinned = results.filter(r => r.entry.pinned && passesFilter(r));
  // pinned always shows regardless of status, that's the point of pinning
  const unpinned = results.filter(r => !r.entry.pinned && passesFilter(r) && passesStatusGate(r));
  const hiddenCount = results.filter(r => !r.entry.pinned && passesFilter(r) && !passesStatusGate(r)).length;

  // pinned row: most recently changed first, so a pinned title that just
  // flipped status jumps to the front of its own row
  pinned.sort((a, b) => (b.entry.statusChangedAt || 0) - (a.entry.statusChangedAt || 0));

  const sorters = {
    status: (a, b) => {
      const tierDiff = statusOrder[a.status.code] - statusOrder[b.status.code];
      if (tierDiff !== 0) return tierDiff;
      return (b.entry.statusChangedAt || 0) - (a.entry.statusChangedAt || 0);
    },
    added: (a, b) => (b.entry.addedAt || 0) - (a.entry.addedAt || 0),
    release: (a, b) => (b.entry.release_date || '').localeCompare(a.entry.release_date || ''),
    az: (a, b) => a.entry.title.localeCompare(b.entry.title),
    recommended: (a, b) => affinityScore(b.entry.genre_ids) - affinityScore(a.entry.genre_ids),
  };
  unpinned.sort(sorters[watchlistSort] || sorters.status);

  const hiddenNote = document.getElementById('hidden-count-note');
  if (hiddenCount > 0 && !watchlistShowAll) {
    hiddenNote.hidden = false;
    hiddenNote.textContent = `${hiddenCount} title${hiddenCount === 1 ? '' : 's'} hidden, not confirmed streaming yet`;
  } else {
    hiddenNote.hidden = true;
  }

  pinnedSection.hidden = pinned.length === 0;
  pinned.forEach(({ entry, status, changed }) => {
    pinnedGrid.appendChild(renderCard(entry, { context: 'watchlist', status, changed, prevLabel: entry._prevLabel }));
  });

  const changedOnes = results.filter(r => r.changed && passesFilter(r));
  if (changedOnes.length) {
    changedStrip.hidden = false;
    changedOnes.forEach(({ entry, status }) => {
      changedList.appendChild(renderCard(entry, { context: 'watchlist', status, changed: true, prevLabel: entry._prevLabel }));
    });
  } else {
    changedStrip.hidden = true;
  }

  unpinned.forEach(({ entry, status, changed }) => {
    grid.appendChild(renderCard(entry, { context: 'watchlist', status, changed, prevLabel: entry._prevLabel }));
  });
}

function renderGenreChips() {
  const wrap = document.getElementById('genre-chips');
  const present = new Set();
  watchlist.forEach(w => (w.genre_ids || []).forEach(g => present.add(g)));
  wrap.innerHTML = '';
  if (present.size === 0) { wrap.hidden = true; return; }
  wrap.hidden = false;

  const allChip = document.createElement('button');
  allChip.className = 'chip' + (watchlistGenreFilter === null ? ' active' : '');
  allChip.textContent = 'ALL';
  allChip.onclick = () => { watchlistGenreFilter = null; renderWatchlist(); };
  wrap.appendChild(allChip);

  [...present].sort((a, b) => (GENRE_MAP[a] || '').localeCompare(GENRE_MAP[b] || '')).forEach(gid => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (watchlistGenreFilter === gid ? ' active' : '');
    chip.textContent = (GENRE_MAP[gid] || 'Other').toUpperCase();
    chip.onclick = () => { watchlistGenreFilter = gid; renderWatchlist(); };
    wrap.appendChild(chip);
  });
}

document.getElementById('sort-select').addEventListener('change', (e) => {
  watchlistSort = e.target.value;
  renderWatchlist();
});

document.getElementById('show-all-toggle').addEventListener('click', (e) => {
  watchlistShowAll = !watchlistShowAll;
  e.target.textContent = watchlistShowAll ? 'SHOWING ALL' : 'SHOW ALL';
  e.target.classList.toggle('active', watchlistShowAll);
  renderWatchlist();
});

// ---------- render: discover ----------

async function renderDiscover(append = false) {
  const grid = document.getElementById('discover-grid');
  if (!append) grid.innerHTML = '';

  const MIN_RESULTS = 12;
  const MAX_PAGES_PER_LOAD = 6; // safety cap so a fully-triaged profile doesn't spam TMDB forever

  let filtered = [];
  let pagesChecked = 0;
  let totalPages = Infinity;

  while (filtered.length < MIN_RESULTS && pagesChecked < MAX_PAGES_PER_LOAD && discoverPage <= totalPages) {
    const data = await fetchDiscover(discoverPage);
    totalPages = data.total_pages || totalPages;
    const pageFiltered = data.results.filter(m =>
      !isSeen(m) && !skipSet.has(m.id) && !watchlist.some(w => w.id === m.id)
    );
    filtered = filtered.concat(pageFiltered);
    pagesChecked++;
    discoverPage++;
  }

  lastDiscoverResults = append ? lastDiscoverResults.concat(filtered) : filtered;
  filtered.forEach(m => grid.appendChild(renderCard(m, { context: 'discover' })));

  if (filtered.length === 0) {
    const note = document.createElement('p');
    note.className = 'empty-note';
    note.textContent = "Nothing new right now, looks like you've already added, skipped, or seen everything TMDB's currently returning for the last 12 months. Check back later or hit LOAD MORE STOCK to dig further back in the results.";
    grid.appendChild(note);
  }
}

document.getElementById('discover-more').addEventListener('click', async () => {
  await renderDiscover(true);
});

// ---------- render: search ----------

document.getElementById('search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;
  const grid = document.getElementById('search-grid');
  grid.innerHTML = '';
  const results = await searchMovies(q);
  lastSearchResults = results;
  results.forEach(m => grid.appendChild(renderCard(m, { context: 'discover', markSeen: true })));
});

// ---------- tabs ----------

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'watchlist') renderWatchlist();
  });
});

// ---------- toast ----------

let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

document.getElementById('prune-btn').addEventListener('click', () => {
  const cutoff = dateMonthsAgo(12);
  const before = watchlist.length;
  watchlist = watchlist.filter(w => w.release_date && w.release_date >= cutoff);
  const removed = before - watchlist.length;
  saveWatchlist();
  showToast(`Cleared ${removed} older title${removed === 1 ? '' : 's'} off your card`);
  renderWatchlist();
});

// ---------- init ----------

renderWatchlist();
renderDiscover();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
