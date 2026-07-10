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
    sort_by: 'primary_release_date.desc',
    with_release_type: '2|3',
    'primary_release_date.gte': twelveMonthsAgo,
    'primary_release_date.lte': today,
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

// ---------- status logic ----------

// returns { code, label, date }
async function deriveStatus(movie) {
  const [providers, releaseDates] = await Promise.all([
    fetchWatchProviders(movie.id).catch(() => null),
    fetchReleaseDates(movie.id).catch(() => []),
  ]);

  if (providers) {
    if (providers.free?.length) {
      return { code: 'free', label: 'FREE ON ' + providers.free[0].provider_name.toUpperCase(), providers: providers.free };
    }
    if (providers.flatrate?.length) {
      return { code: 'free', label: 'STREAMING ON ' + providers.flatrate[0].provider_name.toUpperCase(), providers: providers.flatrate };
    }
    if (providers.ads?.length) {
      return { code: 'free', label: 'FREE (ADS) ON ' + providers.ads[0].provider_name.toUpperCase(), providers: providers.ads };
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

  const meta = document.createElement('p');
  meta.className = 'card-meta';
  meta.textContent = year || 'year unknown';
  card.appendChild(meta);

  if (context === 'watchlist' && watchlist.find(w => w.id === movie.id)?.manualNote) {
    const note = document.createElement('p');
    note.className = 'card-note';
    note.textContent = watchlist.find(w => w.id === movie.id).manualNote;
    card.appendChild(note);
  }

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  if (context === 'watchlist') {
    const noteBtn = document.createElement('button');
    noteBtn.className = 'secondary';
    noteBtn.textContent = 'NOTE';
    noteBtn.onclick = () => promptNote(movie.id);
    actions.appendChild(noteBtn);

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'REMOVE';
    removeBtn.onclick = () => removeFromWatchlist(movie.id);
    actions.appendChild(removeBtn);
  } else {
    const addBtn = document.createElement('button');
    addBtn.textContent = inList ? 'ON CARD' : 'ADD TO CARD';
    addBtn.disabled = inList;
    addBtn.onclick = () => addToWatchlist(movie);
    actions.appendChild(addBtn);
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
    addedAt: Date.now(),
    lastStatusCode: null,
    lastStatusLabel: null,
    manualNote: '',
  });
  saveWatchlist();
  showToast(movie.title + ' — added to your card');
  renderDiscoverCached();
  renderSearchCached();
}

function removeFromWatchlist(id) {
  watchlist = watchlist.filter(w => w.id !== id);
  saveWatchlist();
  renderWatchlist();
}

function promptNote(id) {
  const entry = watchlist.find(w => w.id === id);
  if (!entry) return;
  const note = window.prompt('Rumor / note for ' + entry.title, entry.manualNote || '');
  if (note === null) return;
  entry.manualNote = note.trim();
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
  lastSearchResults.forEach(m => document.getElementById('search-grid').appendChild(renderCard(m, { context: 'discover' })));
}

async function renderWatchlist() {
  const grid = document.getElementById('watchlist-grid');
  const empty = document.getElementById('watchlist-empty');
  const countEl = document.getElementById('watchlist-count');
  const changedStrip = document.getElementById('changed-strip');
  const changedList = document.getElementById('changed-list');

  grid.innerHTML = '';
  changedList.innerHTML = '';
  countEl.textContent = watchlist.length + (watchlist.length === 1 ? ' title' : ' titles');

  if (watchlist.length === 0) {
    empty.hidden = false;
    changedStrip.hidden = true;
    return;
  }
  empty.hidden = true;

  const statusOrder = { free: 0, notyet: 1, nodata: 2, rent: 3 };
  const results = [];

  for (const entry of watchlist) {
    const status = await deriveStatus(entry);
    const changed = entry.lastStatusCode !== null && entry.lastStatusCode !== status.code;
    results.push({ entry, status, changed });
    entry._prevLabel = entry.lastStatusLabel;
    entry.lastStatusCode = status.code;
    entry.lastStatusLabel = status.label;
  }
  saveWatchlist();

  results.sort((a, b) => statusOrder[a.status.code] - statusOrder[b.status.code]);

  const changedOnes = results.filter(r => r.changed);
  if (changedOnes.length) {
    changedStrip.hidden = false;
    changedOnes.forEach(({ entry, status }) => {
      changedList.appendChild(renderCard(entry, { context: 'watchlist', status, changed: true, prevLabel: entry._prevLabel }));
    });
  } else {
    changedStrip.hidden = true;
  }

  results.forEach(({ entry, status, changed }) => {
    grid.appendChild(renderCard(entry, { context: 'watchlist', status, changed, prevLabel: entry._prevLabel }));
  });
}

// ---------- render: discover ----------

async function renderDiscover(append = false) {
  const grid = document.getElementById('discover-grid');
  if (!append) grid.innerHTML = '';
  const data = await fetchDiscover(discoverPage);
  lastDiscoverResults = append ? lastDiscoverResults.concat(data.results) : data.results;
  data.results.forEach(m => grid.appendChild(renderCard(m, { context: 'discover' })));
}

document.getElementById('discover-more').addEventListener('click', async () => {
  discoverPage += 1;
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
  results.forEach(m => grid.appendChild(renderCard(m, { context: 'discover' })));
});

// ---------- tabs ----------

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
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

// ---------- init ----------

renderWatchlist();
renderDiscover();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
