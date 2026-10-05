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
  scheduleSync();
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
  scheduleSync();
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
  scheduleSync();
}

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

// ---------- cross-device sync (github gist) ----------

const GITHUB_API = 'https://api.github.com';
const GIST_DESC = 'REWIND watchlist sync data (do not delete)';
const GIST_FILENAME = 'rewind-sync.json';
const GH_TOKEN_KEY = 'rewind-gh-token';
const GH_GIST_KEY = 'rewind-gist-id';

let syncTimer;

function ghFetch(path, opts = {}) {
  const token = localStorage.getItem(GH_TOKEN_KEY);
  return fetch(GITHUB_API + path, {
    ...opts,
    headers: {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github+json',
      ...(opts.headers || {}),
    },
  });
}

function collectSyncData() {
  return {
    watchlist,
    seen: [...seenSet],
    skipped: [...skipSet],
    services: myServices,
    updatedAt: Date.now(),
  };
}

function applySyncData(data) {
  if (!data) return;
  watchlist = data.watchlist || [];
  if (Array.isArray(data.services)) {myServices = data.services;localStorage.setItem('rewind-services-v1',JSON.stringify(myServices));renderServiceSettings();}
  seenSet = new Set(data.seen || []);
  skipSet = new Set(data.skipped || []);
  saveWatchlist();
  saveSeenSet();
  saveSkipSet();
}

async function findOrCreateGist() {
  const existingId = localStorage.getItem(GH_GIST_KEY);
  if (existingId) {
    const check = await ghFetch('/gists/' + existingId);
    if (check.ok) return existingId;
  }
  const listRes = await ghFetch('/gists?per_page=100');
  if (listRes.ok) {
    const gists = await listRes.json();
    const found = gists.find(g => g.description === GIST_DESC);
    if (found) {
      localStorage.setItem(GH_GIST_KEY, found.id);
      return found.id;
    }
  }
  const createRes = await ghFetch('/gists', {
    method: 'POST',
    body: JSON.stringify({
      description: GIST_DESC,
      public: false,
      files: { [GIST_FILENAME]: { content: JSON.stringify(collectSyncData()) } },
    }),
  });
  const created = await createRes.json();
  localStorage.setItem(GH_GIST_KEY, created.id);
  return created.id;
}

async function pullFromGist() {
  const gistId = await findOrCreateGist();
  const res = await ghFetch('/gists/' + gistId);
  const gist = await res.json();
  const content = gist.files?.[GIST_FILENAME]?.content;
  if (content) {
    try { applySyncData(JSON.parse(content)); } catch (e) { /* ignore malformed */ }
  }
}

async function pushToGist() {
  const gistId = await findOrCreateGist();
  await ghFetch('/gists/' + gistId, {
    method: 'PATCH',
    body: JSON.stringify({ files: { [GIST_FILENAME]: { content: JSON.stringify(collectSyncData()) } } }),
  });
  const statusEl = document.getElementById('sync-status');
  if (statusEl) statusEl.textContent = 'Last synced ' + new Date().toLocaleTimeString();
}

function scheduleSync() {
  scheduleEmailSync();
  if (!localStorage.getItem(GH_TOKEN_KEY)) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => pushToGist().catch(() => {}), 1500);
}

document.getElementById('watchmode-save-btn').addEventListener('click', () => {
  const key = document.getElementById('watchmode-key-input').value.trim();
  const statusEl = document.getElementById('watchmode-status');
  if (!key) {
    localStorage.removeItem(WATCHMODE_KEY_STORAGE);
    statusEl.textContent = 'Price source disconnected. No cached price quotes will be displayed.';
    watchlist.forEach(m=>delete m.watchmodeCache);renderWatchlist();return;
  }
  localStorage.setItem(WATCHMODE_KEY_STORAGE, key);
  watchlist.forEach(m=>delete m.watchmodeCache);
  statusEl.textContent = 'Saved. Checking US provider offers and quoted rental/purchase prices.';
  renderWatchlist();
});

document.getElementById('gh-connect-btn').addEventListener('click', async () => {
  const token = document.getElementById('gh-token-input').value.trim();
  const statusEl = document.getElementById('sync-status');
  if (!token) return;
  localStorage.setItem(GH_TOKEN_KEY, token);
  statusEl.textContent = 'Connecting...';
  try {
    await pullFromGist();
    statusEl.textContent = 'Connected. Pulled latest synced data.';
    renderWatchlist();
    renderDiscover();
  } catch (e) {
    statusEl.textContent = 'Connection failed, check the token has "gist" scope.';
  }
});

document.getElementById('gh-sync-now-btn').addEventListener('click', async () => {
  const statusEl = document.getElementById('sync-status');
  if (!localStorage.getItem(GH_TOKEN_KEY)) {
    statusEl.textContent = 'Connect with a token first.';
    return;
  }
  statusEl.textContent = 'Pushing...';
  try {
    await pushToGist();
  } catch (e) {
    statusEl.textContent = 'Push failed.';
  }
});

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

function discoveryWindow() {
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const month = document.getElementById('release-month').value;
  const start = month ? month + '-01' : dateMonthsAgo(6);
  const monthEnd = month ? new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10) : today;
  return {start,end:monthEnd < today ? monthEnd : today,today};
}
const movieDetailCache = new Map();
async function fetchMovieDetails(id) {
  if (!movieDetailCache.has(id)) {
    movieDetailCache.set(id,tmdbGet(`/movie/${id}`,{append_to_response:'release_dates,credits'}).catch(err=>{movieDetailCache.delete(id);throw err;}));
  }
  return movieDetailCache.get(id);
}
async function mapLimited(items, concurrency, fn) {
  const results = new Array(items.length);let next = 0;
  await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{
    while(next < items.length){const i=next++;results[i]=await fn(items[i],i);}
  }));
  return results;
}
async function fetchDiscover(page = 1, filter = null) {
  const window = filter?.window || discoveryWindow();
  const broad = (filter?.scope || document.getElementById('discover-scope').value) === 'small';
  const rereleases = filter?.rereleases ?? document.getElementById('include-rereleases').checked;
  const genre = filter?.genre ?? document.getElementById('discover-genre').value;
  return tmdbGet('/discover/movie', {
    region:REGION,sort_by:filter?.sort || document.getElementById('discover-sort').value,
    with_release_type:'2|3','release_date.gte':window.start,'release_date.lte':window.end,
    'vote_count.gte':broad ? 5 : 50,'with_runtime.gte':60,include_video:false,include_adult:false,
    ...(!rereleases ? {'primary_release_date.gte':dateMonthsAgo(24)} : {}),
    ...(genre ? {with_genres:genre} : {}),page,
  });
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

// ---------- availability and service preferences ----------
let myServices;
try {const stored=JSON.parse(localStorage.getItem('rewind-services-v1'));myServices=Array.isArray(stored)?stored.filter(s=>typeof s==='string'):[...RewindModel.DEFAULT_SERVICES];}
catch {myServices = [...RewindModel.DEFAULT_SERVICES];}
const WATCHMODE_KEY_STORAGE = 'rewind-watchmode-key';
const WATCHMODE_CACHE_HOURS = 6;
function getWatchmodeKey() { return localStorage.getItem(WATCHMODE_KEY_STORAGE); }
async function checkWatchmode(tmdbId) {
  const key = getWatchmodeKey();
  if (!key) return null;
  const res = await fetch(`https://api.watchmode.com/v1/title/movie-${tmdbId}/sources/?regions=US`,{headers:{'X-API-Key':key}});
  if (!res.ok) throw Error(`Price lookup failed (${res.status}). Provider prices were not updated.`);
  const sources = await res.json();
  if (!Array.isArray(sources)) throw Error('Price source returned an invalid response.');
  return {sources,checkedAt:Date.now()};
}
async function checkWatchmodeCached(movie, force = false) {
  if (!getWatchmodeKey()) return null;
  const cache = movie.watchmodeCache;
  if (!force && cache?.sources && Date.now()-cache.checkedAt < WATCHMODE_CACHE_HOURS*3600000) return cache;
  const found = await checkWatchmode(movie.id);
  movie.watchmodeCache = found;
  return found;
}
async function deriveStatus(movie, force = false) {
  const results = await Promise.allSettled([fetchWatchProviders(movie.id),fetchReleaseDates(movie.id)]);
  const p = results[0];const d = results[1];
  const releaseDates = d.status === 'fulfilled' ? d.value : [];
  if (p.status === 'rejected') {
    if (movie.availabilitySnapshot) return {...movie.availabilitySnapshot,stale:true,priceWarning:'Provider lookup failed. Showing the previous check.'};
    return {code:'nodata',kind:'unknown',label:'Availability could not be checked',offers:[],stale:true};
  }
  const providers = p.value || {};
  let quote = null;let priceWarning = '';
  if (getWatchmodeKey()) {
    try {quote = await checkWatchmodeCached(movie,force);}
    catch (err) {priceWarning = err.message;}
  }
  const offers = RewindModel.mergeOffers(RewindModel.normalizeTMDB(providers,myServices),RewindModel.normalizeWatchmode(quote?.sources,myServices));
  const today = discoveryWindow().today;
  const futureDigital = releaseDates.filter(r=>r.type===4 && r.release_date.slice(0,10)>today).sort((a,b)=>a.release_date.localeCompare(b.release_date))[0];
  const pastDigital = releaseDates.filter(r=>r.type===4 && r.release_date.slice(0,10)<=today).sort((a,b)=>b.release_date.localeCompare(a.release_date))[0];
  const futureTheater = releaseDates.filter(r=>[2,3].includes(r.type) && r.release_date.slice(0,10)>today).sort((a,b)=>a.release_date.localeCompare(b.release_date))[0];
  let best = RewindModel.summary(offers);
  if (!best && futureDigital) best = {code:'notyet',kind:'upcoming',label:'Digital release listed '+formatFilmDate(futureDigital.release_date),date:futureDigital.release_date};
  if (!best && futureTheater) best = {code:'notyet',kind:'theaters',label:'US theatrical release '+formatFilmDate(futureTheater.release_date),date:futureTheater.release_date};
  if (!best && pastDigital) best = {code:'nodata',kind:'unverified',label:'Digital date passed · no current provider listing'};
  if (!best) best = {code:'nodata',kind:'unknown',label:'No US streaming offer listed'};
  const result = {...best,offers,link:RewindModel.safeLink(providers.link),checkedAt:Date.now(),quoteCheckedAt:quote?.checkedAt || null,priceWarning,datesUnavailable:d.status==='rejected',digitalDate:futureDigital?.release_date || null};
  movie.availabilitySnapshot = result;
  return result;
}
function formatFilmDate(value) {
  return new Date(value.slice(0,10)+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}
function renderServiceSettings() {
  const root=document.getElementById('service-settings');root.innerHTML='';
  RewindModel.SERVICE_CHOICES.forEach(name=>{
    const label=document.createElement('label');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=myServices.includes(name);
    checkbox.onchange=()=>{myServices=checkbox.checked?[...myServices,name]:myServices.filter(s=>s!==name);localStorage.setItem('rewind-services-v1',JSON.stringify(myServices));scheduleSync();renderWatchlist();};
    label.append(checkbox,document.createTextNode(' '+name));root.appendChild(label);
  });
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
    card.appendChild(renderAvailability(movie,status));

    if (status.link) {
      const priceLink = document.createElement('a');
      priceLink.href = status.link;
      priceLink.target = '_blank';
      priceLink.rel = 'noopener';
      priceLink.className = 'price-link';
      priceLink.textContent = 'VERIFY OFFERS ↗';
      card.appendChild(priceLink);
    }
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
  meta.textContent = [year,movie.runtime ? movie.runtime+' min' : '',movie.director].filter(Boolean).join(' · ') || 'year unknown';
  card.appendChild(meta);
  if (movie.usReleaseDate) {const release=document.createElement('p');release.className='release-note';release.textContent='US theatrical listing · '+formatFilmDate(movie.usReleaseDate);card.appendChild(release);}
  if (movie.overview) {const synopsis=document.createElement('p');synopsis.className='card-synopsis';synopsis.textContent=movie.overview;card.appendChild(synopsis);}

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
  } else if (context === 'search') {
    // search results persist and just reflect ON CARD state, since re-searching
    // the same title later should show it's already added, not make it vanish
    const addBtn = document.createElement('button');
    addBtn.textContent = inList ? 'ON CARD' : 'ADD TO CARD';
    addBtn.disabled = inList;
    addBtn.onclick = () => { addToWatchlist(movie); addBtn.textContent = 'ON CARD'; addBtn.disabled = true; };
    actions.appendChild(addBtn);
  } else {
    // discover: a queue to clear, both actions remove the card for good
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

  if (context !== 'watchlist') {
    const check=document.createElement('button');check.className='secondary';check.textContent='WHERE TO WATCH';
    const slot=document.createElement('div');slot.className='inline-availability';
    check.onclick=async()=>{
      check.disabled=true;check.textContent='CHECKING…';
      try {const availability=await deriveStatus(movie,true);slot.innerHTML='';const label=document.createElement('p');label.className='inline-status';label.textContent=availability.label;slot.append(label,renderAvailability(movie,availability));check.textContent='REFRESH OPTIONS';}
      catch {slot.textContent='Could not check availability. Try again.';check.textContent='TRY AGAIN';}
      finally {check.disabled=false;}
    };
    actions.appendChild(check);card.appendChild(slot);
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
    overview:movie.overview || '',runtime:movie.runtime || null,director:movie.director || '',usReleaseDate:movie.usReleaseDate || null,
    availabilitySnapshot:movie.availabilitySnapshot || null,watchmodeCache:movie.watchmodeCache || null,
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
  scheduleSync();
  // keep it out of Discover/Search's cached lists so re-renders don't bring it back
  lastDiscoverResults = lastDiscoverResults.filter(m => m.id !== movie.id);
  lastSearchResults = lastSearchResults.filter(m => m.id !== movie.id);
}

function togglePin(id) {
  const entry = watchlist.find(w => w.id === id);
  if (!entry) return;
  entry.pinned = !entry.pinned;
  saveWatchlist();
  scheduleSync();
  renderWatchlist();
}

function removeFromWatchlist(id) {
  watchlist = watchlist.filter(w => w.id !== id);
  saveWatchlist();
  scheduleSync();
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
  lastSearchResults.forEach(m => document.getElementById('search-grid').appendChild(renderCard(m, { context: 'search', markSeen: true })));
}

let notOutYetExpanded = false;
let watchlistSort = 'recommended';
let watchlistRequest = 0;

async function renderWatchlist(force = false) {
  const request = ++watchlistRequest;
  const grid = document.getElementById('watchlist-grid');
  const pinnedGrid = document.getElementById('pinned-grid');
  const pinnedSection = document.getElementById('pinned-section');
  const empty = document.getElementById('watchlist-empty');
  const countEl = document.getElementById('watchlist-count');
  const changedStrip = document.getElementById('changed-strip');
  const changedList = document.getElementById('changed-list');
  const notOutYetToggle = document.getElementById('not-out-yet-toggle');
  const notOutYetGrid = document.getElementById('not-out-yet-grid');

  grid.innerHTML = '';
  pinnedGrid.innerHTML = '';
  changedList.innerHTML = '';
  notOutYetGrid.innerHTML = '';
  countEl.textContent = watchlist.length + (watchlist.length === 1 ? ' title' : ' titles');

  if (watchlist.length === 0) {
    document.getElementById('card-check-status').textContent='Add a film from New Arrivals or Search.';
    empty.hidden = false;
    changedStrip.hidden = true;
    pinnedSection.hidden = true;
    notOutYetToggle.hidden = true;
    notOutYetGrid.style.display = 'none';
    return;
  }
  empty.hidden = true;

  document.getElementById('card-check-status').textContent='Checking US providers…';
  const results = (await mapLimited([...watchlist],4,async entry=>{
    let status;
    const lookupMovie={...entry};
    try {status=await deriveStatus(lookupMovie,force);}
    catch {status={code:'nodata',kind:'unknown',label:'Availability could not be checked',offers:[],stale:true};}
    if(request !== watchlistRequest) return {entry,status,changed:false,prevLabel:entry.lastStatusLabel};
    entry.availabilitySnapshot=lookupMovie.availabilitySnapshot;entry.watchmodeCache=lookupMovie.watchmodeCache;
    const fingerprint = status.offers?.map(o=>`${o.kind}:${o.provider}:${o.format || ''}:${o.price ?? ''}`).sort().join('|') || status.label;
    const changed = !status.stale && entry.lastAvailabilityKey != null && entry.lastAvailabilityKey !== fingerprint;
    const prevLabel=entry.lastStatusLabel;
    if (!status.stale) {
      if(changed || !entry.lastStatusLabel) entry.statusChangedAt=Date.now();
      entry.lastStatusCode=status.code;entry.lastStatusLabel=status.label;entry.lastAvailabilityKey=fingerprint;
    }
    return {entry,status,changed,prevLabel};
  })).filter(r=>watchlist.some(m=>m.id===r.entry.id));
  if (request !== watchlistRequest) return;
  document.getElementById('card-check-status').textContent='US providers checked '+new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})+' · '+results.filter(r=>r.status.stale).length+' failed checks';
  saveWatchlist();

  const pinned = results.filter(r => r.entry.pinned);
  const unpinned = results.filter(r => !r.entry.pinned);
  const notOutYet = unpinned.filter(r => r.status.code === 'notyet' || r.status.code === 'nodata');
  const mainList = unpinned.filter(r => r.status.code === 'free' || r.status.code === 'rent');

  const sorters = {
    recommended: (a, b) => affinityScore(b.entry.genre_ids) - affinityScore(a.entry.genre_ids),
    added: (a, b) => (b.entry.addedAt || 0) - (a.entry.addedAt || 0),
    release: (a, b) => (b.entry.release_date || '').localeCompare(a.entry.release_date || ''),
    az: (a, b) => a.entry.title.localeCompare(b.entry.title),
  };
  const sortFn = sorters[watchlistSort] || sorters.recommended;

  // pinned row: most recently changed first, so a pinned title that just
  // flipped status jumps to the front of its own row
  pinned.sort((a, b) => (b.entry.statusChangedAt || 0) - (a.entry.statusChangedAt || 0));
  notOutYet.sort(sortFn);
  mainList.sort(sortFn);

  pinnedSection.hidden = pinned.length === 0;
  pinned.forEach(({ entry, status, changed, prevLabel }) => {
    pinnedGrid.appendChild(renderCard(entry, { context: 'watchlist', status, changed, prevLabel }));
  });

  if (notOutYet.length > 0) {
    notOutYetToggle.hidden = false;
    notOutYetToggle.textContent = (notOutYetExpanded ? '▴ ' : '▾ ') +
      `AWAITING STREAMING / UNVERIFIED (${notOutYet.length})`;
    notOutYetGrid.style.display = notOutYetExpanded ? '' : 'none';
    notOutYet.forEach(({ entry, status, changed, prevLabel }) => {
      notOutYetGrid.appendChild(renderCard(entry, { context: 'watchlist', status, changed, prevLabel }));
    });
  } else {
    notOutYetToggle.hidden = true;
    notOutYetGrid.style.display = 'none';
  }

  const changedOnes = results.filter(r => r.changed);
  if (changedOnes.length) {
    changedStrip.hidden = false;
    changedOnes.forEach(({ entry, status, prevLabel }) => {
      changedList.appendChild(renderCard(entry, { context: 'watchlist', status, changed: true, prevLabel }));
    });
  } else {
    changedStrip.hidden = true;
  }

  mainList.forEach(({ entry, status, changed, prevLabel }) => {
    grid.appendChild(renderCard(entry, { context: 'watchlist', status, changed, prevLabel }));
  });
}

document.getElementById('sort-select').addEventListener('change', (e) => {
  watchlistSort = e.target.value;
  renderWatchlist();
});

document.getElementById('not-out-yet-toggle').addEventListener('click', () => {
  notOutYetExpanded = !notOutYetExpanded;
  renderWatchlist();
});

// ---------- render: discover ----------

let discoverRequest = 0;
async function renderDiscover(append = false) {
  const request = ++discoverRequest;
  const filter={window:discoveryWindow(),scope:document.getElementById('discover-scope').value,genre:document.getElementById('discover-genre').value,rereleases:document.getElementById('include-rereleases').checked,sort:document.getElementById('discover-sort').value};
  const statusEl=document.getElementById('discover-status');statusEl.textContent='Finding feature releases…';
  const grid = document.getElementById('discover-grid');
  if (!append) grid.innerHTML = '';
  // always clear any previous empty-state message before deciding whether to show a new one
  grid.querySelectorAll('.empty-note').forEach(el => el.remove());

  const MIN_RESULTS = 12;
  const MAX_PAGES_PER_LOAD = 6; // safety cap so a fully-triaged profile doesn't spam TMDB forever

  let filtered = [];
  let pagesChecked = 0;
  let totalPages = Infinity;

  while (filtered.length < MIN_RESULTS && pagesChecked < MAX_PAGES_PER_LOAD && discoverPage <= totalPages) {
    const data = await fetchDiscover(discoverPage,filter);
    if (request !== discoverRequest) return;
    totalPages = data.total_pages || totalPages;
    const candidates = data.results.filter(m =>
      !isSeen(m) && !skipSet.has(m.id) && !watchlist.some(w => w.id === m.id)
    );
    const verified=await mapLimited(candidates,4,async m=>{try{return RewindModel.discoveryMovie(m,await fetchMovieDetails(m.id),filter.window,filter.rereleases);}catch{return null;}});
    if(request !== discoverRequest) return;
    filtered=filtered.concat(verified.filter(Boolean));
    pagesChecked++;
    discoverPage++;
  }

  lastDiscoverResults = append ? lastDiscoverResults.concat(filtered) : filtered;
  statusEl.textContent=`${lastDiscoverResults.length} films · TMDB-listed US theatrical dates · ${filter.scope==='small'?'smaller releases included':'50+ TMDB ratings; 60+ minutes'}`;
  filtered.forEach(m => grid.appendChild(renderCard(m, { context: 'discover' })));

  const loadMoreBtn = document.getElementById('discover-more');
  const exhausted = discoverPage > totalPages;
  loadMoreBtn.disabled = exhausted;
  loadMoreBtn.textContent = exhausted ? 'NOTHING FURTHER BACK' : 'LOAD MORE STOCK';

  if (filtered.length === 0) {
    const note = document.createElement('p');
    note.className = 'empty-note';
    note.textContent = exhausted
      ? "No more matching feature releases in this window. Try Smaller Releases or another month."
      : "No matches on these pages. Load more, change the month, or include smaller releases.";
    grid.appendChild(note);
  }
}

document.getElementById('discover-more').addEventListener('click', async () => {
  try {await renderDiscover(true);}catch(err){showToast(err.message);}
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
  results.forEach(m => grid.appendChild(renderCard(m, { context: 'search', markSeen: true })));
});

// ---------- tabs ----------

document.getElementById('search-input').addEventListener('focus', (e) => e.target.select());

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'watchlist') renderWatchlist();
    if (btn.dataset.tab === 'search') {
      document.getElementById('search-input').value = '';
      document.getElementById('search-grid').innerHTML = '';
      lastSearchResults = [];
    }
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
  scheduleSync();
  renderWatchlist();
});

// ---------- init ----------

async function init() {
  if (localStorage.getItem(GH_TOKEN_KEY)) {
    const statusEl = document.getElementById('sync-status');
    if (statusEl) statusEl.textContent = 'Syncing...';
    try {
      await pullFromGist();
      if (statusEl) statusEl.textContent = 'Synced ' + new Date().toLocaleTimeString();
    } catch (e) {
      if (statusEl) statusEl.textContent = 'Could not reach sync, showing local data.';
    }
  }
  if (!localStorage.getItem('rewind-coyote-seeded-v1')) {
    try {
      if (!watchlist.some(m=>m.id === 1204680)) addToWatchlist(await tmdbGet('/movie/1204680'));
      localStorage.setItem('rewind-coyote-seeded-v1','1');
    } catch (err) { showToast('Could not add Coyote vs. Acme. Search the catalog to try again.'); }
  }
  renderWatchlist().catch(err=>showToast(err.message));
  renderDiscover().catch(err=>showToast(err.message));
}

// Alert and browse controls are initialized below before the first render.

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Reuse Transmission's existing email service. The authenticated request sends
// only selected film IDs/titles; the GitHub token is verified, never stored.
const ALERT_API = 'https://transmissionalbum.netlify.app/.netlify/functions/rewind-watchlist';
let emailEnabled = false;
let emailTimer;
async function emailRequest(method, data) {
  const token = localStorage.getItem(GH_TOKEN_KEY);
  if (!token) throw Error('Connect GitHub under Import first.');
  const res = await fetch(ALERT_API,{method,headers:{Authorization:'Bearer ' + token,'Content-Type':'application/json'},...(data ? {body:JSON.stringify(data)} : {})});
  const result = await res.json();
  if (!res.ok) throw Error(result.error || 'Could not update email alerts.');
  return result;
}
async function syncEmailCard(enabled = emailEnabled) {
  const result = await emailRequest('POST',{enabled,movies:watchlist.map(m=>({id:m.id,title:m.title})),services:myServices});
  emailEnabled = enabled;
  document.getElementById('email-alert-status').textContent = enabled ? `Daily email checks enabled for ${result.count} films. The first check reports current availability and future dates; later changes trigger emails.` : 'Email alerts paused.';
}
function scheduleEmailSync() {
  if (!emailEnabled) return;
  clearTimeout(emailTimer);
  emailTimer = setTimeout(()=>syncEmailCard().catch(err=>document.getElementById('email-alert-status').textContent=err.message),2000);
}
document.getElementById('email-enable-btn').onclick = () => syncEmailCard(true).catch(err=>document.getElementById('email-alert-status').textContent=err.message);
document.getElementById('email-disable-btn').onclick = () => syncEmailCard(false).catch(err=>document.getElementById('email-alert-status').textContent=err.message);
const monthSelect = document.getElementById('release-month');
for (let i=0;i<24;i++) {
  const date = new Date(); date.setDate(1); date.setMonth(date.getMonth()-i);
  const option = document.createElement('option');
  option.value = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
  option.textContent = date.toLocaleDateString('en-US',{month:'long',year:'numeric'}).toUpperCase();
  monthSelect.appendChild(option);
}
for (const id of ['release-month','discover-sort','discover-scope','discover-genre','include-rereleases']) document.getElementById(id).onchange = () => {discoverPage=1;renderDiscover().catch(err=>showToast(err.message));};
async function initEmailAlerts() {
  if (!localStorage.getItem(GH_TOKEN_KEY)) {
    try {const res=await fetch('https://transmissionalbum.netlify.app/.netlify/functions/rewind-status');if(res.ok){const s=await res.json();document.getElementById('email-alert-status').textContent=`Daily checks ${s.enabled?'active':'paused'} for ${s.tracked} film${s.tracked===1?'':'s'} on the server. Connect GitHub under Import to sync this card.`;}}catch {}
    return;
  }
  try {
    const state = await emailRequest('GET');
    emailEnabled = state.enabled;
    document.getElementById('email-alert-status').textContent = state.enabled ? `Daily email checks enabled for ${state.movies.length} films.` : 'Email alerts paused. Enable to track Your Card.';
    // Opening a device must not replace the server's card with stale local data.
  } catch (err) { document.getElementById('email-alert-status').textContent = err.message; }
}
renderServiceSettings();
document.getElementById('refresh-card-btn').onclick=()=>renderWatchlist(true);
init().then(initEmailAlerts);
