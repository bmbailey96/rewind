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
  document.getElementById('watched-status').textContent = `Loaded ${added} seen titles. Films You Missed will filter them out from now on.`;
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
      best=results.find(m=>HubModel.norm(m.title)===HubModel.norm(name)&&(!year||(m.release_date||'').slice(0,4)===String(year)));
      if (best && !watchlist.some(w => w.id === best.id)) {
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
          manualNote: '',letterboxdURL:HubModel.safeLink(rows[i]['Letterboxd URI']||rows[i].URI),
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
  statusEl.textContent = `Done. ${matched} added to Your Card, ${skipped} skipped (already tracked, ambiguous, or unmatched).`;
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
    rentalBudget,
    hub:hubState,
    updatedAt: Date.now(),
  };
}

function applySyncData(data) {
  if (!data) return;
  if(typeof data.rentalBudget==='number'&&data.rentalBudget>=0&&data.rentalBudget<=100){rentalBudget=data.rentalBudget;localStorage.setItem('rewind-rental-budget-v1',String(rentalBudget));document.getElementById('rental-budget').value=rentalBudget;}
  if(data.hub&&typeof data.hub==='object'){for(const key of ['taste','hidden','muted','followed','knownEvents','suggestions','dismissedSuggestions','ignoredTaste'])if(Array.isArray(data.hub[key]))hubState[key]=data.hub[key];if(Number.isFinite(data.hub.suggestionsVersion))hubState.suggestionsVersion=data.hub.suggestionsVersion;if(Number.isFinite(data.hub.suggestionsCheckedAt))hubState.suggestionsCheckedAt=data.hub.suggestionsCheckedAt;if(typeof data.hub.eventAlerts==='boolean')hubState.eventAlerts=data.hub.eventAlerts;localStorage.setItem('rewind-hub-v1',JSON.stringify(hubState));}
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
  calendarCache=null;calendarFailure=null;
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
    await initEmailAlerts();
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
let hubState;
try {hubState=JSON.parse(localStorage.getItem('rewind-hub-v1'))||{};}catch{hubState={};}
for(const key of ['taste','hidden','muted','followed','knownEvents','suggestions','dismissedSuggestions','ignoredTaste'])if(!Array.isArray(hubState[key]))hubState[key]=[];


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
  window.dispatchEvent(new Event('rewind:state'));
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
const observedDetails=new Map();
async function fetchMovieDetails(id,force=false) {
  if(force)movieDetailCache.delete(id);
  if (!movieDetailCache.has(id)) {
    movieDetailCache.set(id,tmdbGet(`/movie/${id}`,{append_to_response:'release_dates,credits'}).catch(err=>{movieDetailCache.delete(id);throw err;}));
  }
  const detail=await movieDetailCache.get(id);observedDetails.set(id,detail);return detail;
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
    ...(broad ? {'vote_count.lte':100} : {}),'with_runtime.gte':60,include_video:false,include_adult:false,
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

let announcementPromise;
function fetchAnnouncements(){if(!announcementPromise)announcementPromise=fetch('release-announcements.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Announcement feed unavailable');return r.json();}).catch(err=>{announcementPromise=null;throw err;});return announcementPromise;}
let calendarCache=null,calendarPromise=null,calendarFailure=null;
async function fetchStreamingCalendar(){
  const key=getWatchmodeKey();if(!key)return [];
  if(calendarFailure)throw Error(calendarFailure);
  if(calendarCache&&Date.now()-calendarCache.checkedAt<24*3600000)return calendarCache.releases;
  if(!calendarPromise){const start=ReleaseModel.addDays(discoveryWindow().today,-30).replaceAll('-',''),end=ReleaseModel.addDays(discoveryWindow().today,90).replaceAll('-','');calendarPromise=fetch(`https://api.watchmode.com/v1/releases/?start_date=${start}&end_date=${end}&limit=250`,{headers:{'X-API-Key':key}}).then(async r=>{if(!r.ok)throw Error('Upcoming calendar is not available with this price connection.');const body=await r.json();const releases=Array.isArray(body.releases)?body.releases:[];calendarCache={checkedAt:Date.now(),releases};return releases;}).catch(err=>{calendarFailure=err.message;throw err;}).finally(()=>calendarPromise=null);}
  return calendarPromise;
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
async function deriveRemoteStatus(movie, force = false) {
  const results = await Promise.allSettled([fetchWatchProviders(movie.id),fetchMovieDetails(movie.id,force),fetchAnnouncements(),fetchStreamingCalendar()]);
  const p = results[0];const d = results[1];
  const fullDetails=d.status==='fulfilled'?d.value:null;
  const details=fullDetails?{id:fullDetails.id,runtime:fullDetails.runtime,release_dates:fullDetails.release_dates}:movie.detailsSnapshot;
  if(fullDetails){movie.detailsSnapshot=details;Object.assign(movie,{runtime:fullDetails.runtime,director:(fullDetails.credits?.crew||[]).filter(c=>c.job==='Director').map(c=>c.name).join(', '),overview:fullDetails.overview||movie.overview||''});}
  const releaseDates = ReleaseModel.datesFor(details);
  const timeline={details,announcements:ReleaseModel.matchingAnnouncements({...((results[2].status==='fulfilled'?results[2].value:null)||{}),today:discoveryWindow().today},movie.id),calendar:(results[3].status==='fulfilled'?results[3].value:[]).filter(r=>r.tmdb_id===movie.id&&r.tmdb_type==='movie')};
  if (p.status === 'rejected') {
    if (movie.availabilitySnapshot) return {...movie.availabilitySnapshot,...timeline,datesUnavailable:d.status==='rejected',announcementUnavailable:results[2].status==='rejected',stale:true,priceWarning:'Provider lookup failed. Showing the previous check.'};
    return {code:'nodata',kind:'unknown',label:'Availability could not be checked',offers:[],...timeline,stale:true};
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
  movie.priceHistory=ReleaseModel.recordQuotes(movie.priceHistory,offers,quote?.checkedAt);
  const result = {...best,...timeline,calendarWarning:results[3].status==='rejected'?'Upcoming calendar unavailable. Showing the verified announcement feed.':'',announcementUnavailable:results[2].status==='rejected',offers,link:RewindModel.safeLink(providers.link),checkedAt:Date.now(),quoteCheckedAt:quote?.checkedAt || null,priceWarning,datesUnavailable:d.status==='rejected',digitalDate:futureDigital?.release_date || null};
  movie.availabilitySnapshot = result;
  return result;
}
async function deriveStatus(movie,force=false){const status=await deriveRemoteStatus(movie,force);const owned=hubState.taste.find(m=>m.id===movie.id&&m.owned);if(!owned)return status;const formats=owned.physicalFormats?.length?owned.physicalFormats:['Physical copy'];const physical=formats.map(format=>({kind:'physical',provider:'Your shelf',format,included:true,price:0,link:null}));const result={...status,offers:[...physical,...(status.stale?[]:status.offers||[])],stale:false,physical:true,code:'owned',kind:'physical',label:'On your physical shelf',remoteStale:status.stale,priceWarning:status.stale?'Streaming could not refresh. Your imported shelf copy is still available.':status.priceWarning};movie.availabilitySnapshot=result;return result;}
function formatFilmDate(value) {
  const date=/^\d{4}-\d{2}-\d{2}/.test(String(value))?new Date(String(value).slice(0,10)+'T12:00:00Z'):new Date(value);return Number.isFinite(date.getTime())?date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}):'Date unavailable';
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
  const {context='discover',status=null,changed=false}=opts;
  const card=document.createElement('article');card.className='rental-card';card.dataset.movieId=movie.id;
  const poster=document.createElement('img');poster.className='card-poster';poster.loading='lazy';poster.src=posterUrl(movie.poster_path);poster.alt=movie.title+' poster';card.appendChild(poster);
  const title=document.createElement('h3');title.className='card-title';title.textContent=movie.title;card.appendChild(title);
  const meta=document.createElement('p');meta.className='card-meta';meta.textContent=[(movie.release_date||'').slice(0,4),movie.director].filter(Boolean).join(' · ');card.appendChild(meta);
  if(movie.pinned){const pinned=document.createElement('span');pinned.className='new-tag';pinned.textContent='PINNED';card.appendChild(pinned);}
  if(changed){const tag=document.createElement('span');tag.className='new-tag';tag.textContent='CHANGED SINCE YOUR LAST VISIT';card.appendChild(tag);}
  if(opts.markSeen&&isSeen(movie)){const tag=document.createElement('span');tag.className='new-tag';tag.textContent='ALREADY SEEN';card.appendChild(tag);}
  const costInfo=status?ReleaseModel.cost(status.offers,rentalBudget,status.stale):null;
  if(costInfo){const block=document.createElement('div');block.className='cost-block cost-'+costInfo.band;const badge=document.createElement('strong');badge.className='cost-badge';badge.textContent=costInfo.badge;block.appendChild(badge);const caption=document.createElement('p');caption.className='cost-caption';caption.textContent=costInfo.caption;block.appendChild(caption);if(costInfo.stale){const old=document.createElement('span');old.className='cost-warning';old.textContent='PREVIOUS CHECK';block.appendChild(old);}if(costInfo.cheaper){const cheaper=document.createElement('p');cheaper.className='cost-alternative';cheaper.textContent='$'+costInfo.cheaper.price.toFixed(2)+' on '+costInfo.cheaper.provider+(costInfo.cheaper.format?' · '+costInfo.cheaper.format:'');block.appendChild(cheaper);}card.appendChild(block);}

  if(status){const upcoming=(status.announcements||[]).filter(a=>a.kind==='subscription'&&a.date&&a.date>discoveryWindow().today).sort((a,b)=>a.date.localeCompare(b.date))[0];if(upcoming){const note=document.createElement('p');note.className='wait-advice';note.textContent=upcoming.provider+' on '+formatFilmDate(upcoming.date)+' · announced';card.appendChild(note);}else if(costInfo?.band==='premium'){const note=document.createElement('p');note.className='wait-advice';const pref=ReleaseModel.preference(movie.alert);const estimate=ReleaseModel.priceEstimate(movie,status.offers,watchlist,discoveryWindow().today,pref.mode==='rental'?pref.maxPrice:rentalBudget);note.textContent=estimate&&!estimate.overdue?'Cheaper rental estimate: '+formatFilmDate(estimate.start)+' to '+formatFilmDate(estimate.end):'Above your $'+rentalBudget.toFixed(2)+' limit. No drop date announced.';card.appendChild(note);}}

  const details=document.createElement('details');details.className='film-details';
  const summary=document.createElement('summary');summary.textContent='Details & options';details.appendChild(summary);
  const body=document.createElement('div');body.className='film-details-body';details.appendChild(body);card.appendChild(details);
  const secondaryActions=document.createElement('div');secondaryActions.className='card-actions secondary-actions';
  let current=status;
  const fillDetails=()=>{
    body.replaceChildren();body.appendChild(secondaryActions);if(current)body.appendChild(renderAvailability(movie,{...current,previousLabel:opts.prevLabel},{details:[...observedDetails.values()],movies:watchlist}));
    if(context==='watchlist'){const alert=document.createElement('details');alert.className='source-disclosure';const title=document.createElement('summary');title.textContent='Alert settings';alert.append(title,renderAlertPreference(movie));body.appendChild(alert);}
    const extra=document.createElement('p');extra.className='card-meta';extra.textContent=[movie.runtime?movie.runtime+' min':'',movie.director].filter(Boolean).join(' · ');body.appendChild(extra);
    if(movie.overview){const synopsis=document.createElement('p');synopsis.textContent=movie.overview;body.appendChild(synopsis);}
    const filmLinks=document.createElement('div');filmLinks.className='film-links';const lb=document.createElement('a');lb.textContent='LETTERBOXD';lb.href=HubModel.letterboxd(movie);lb.target='_blank';lb.rel='noopener';filmLinks.appendChild(lb);body.appendChild(filmLinks);
    if(context==='watchlist'){
      const tools=document.createElement('div');tools.className='card-actions';
      for(const [name,fn] of [[movie.pinned?'UNPIN':'PIN',()=>togglePin(movie.id)],['STOP TRACKING',()=>removeFromWatchlist(movie.id)]]){const btn=document.createElement('button');btn.className='secondary';btn.textContent=name;btn.onclick=fn;tools.appendChild(btn);}body.appendChild(tools);
    }
  };
  if(current)fillDetails();
  details.addEventListener('toggle',async()=>{if(!details.open)return;if(current){fillDetails();return;}body.textContent='Checking releases and viewing options…';try{current=await deriveStatus(movie);fillDetails();}catch{body.textContent='Could not load this film. Close and reopen to retry.';}});
  const actions=document.createElement('div');actions.className='card-actions';
  if(context==='watchlist'){
    const watched=document.createElement('button');watched.className='secondary';watched.textContent='WATCHED';watched.onclick=()=>markMovieWatched(movie);secondaryActions.appendChild(watched);
    const next=!status?.stale?costInfo?.offer:null;
    if(next?.link){const link=document.createElement('a');link.className='watch-link';link.textContent=next.included||next.kind==='free'?'WATCH':next.kind==='buy'?'BUY OFFER':'RENT OFFER';link.href=next.link;link.target='_blank';link.rel='noopener noreferrer';actions.prepend(link);}
    if(costInfo?.band==='premium'){const wait=document.createElement('button');wait.className='secondary wait-button';const pref=ReleaseModel.preference(movie.alert);wait.textContent=pref.mode==='rental'?'WAITING FOR $'+pref.maxPrice.toFixed(2):'WAIT FOR $'+rentalBudget.toFixed(2);wait.onclick=()=>{movie.alert={mode:'rental',maxPrice:rentalBudget};saveWatchlist();scheduleSync();showToast('Watching for a rental at $'+rentalBudget.toFixed(2)+' or less');renderWatchlist();};secondaryActions.appendChild(wait);}
  }else{
    const inList=watchlist.some(w=>w.id===movie.id);const track=document.createElement('button');track.textContent=inList?'TRACKED':'TRACK THIS FILM';track.disabled=inList;
    track.onclick=()=>{addToWatchlist(movie);if(context==='discover')card.remove();else{track.textContent='TRACKED';track.disabled=true;}};actions.appendChild(track);
    if(context==='discover'){const skip=document.createElement('button');skip.className='secondary';skip.textContent='SKIP';skip.onclick=()=>{skipMovie(movie.id);card.remove();};secondaryActions.appendChild(skip);}
  }
  if(!current)body.appendChild(secondaryActions);
  card.appendChild(actions);return card;
}
function renderAlertPreference(movie){
  const wrap=document.createElement('fieldset');wrap.className='alert-preference';const legend=document.createElement('legend');legend.textContent='Notify me when';wrap.appendChild(legend);
  const select=document.createElement('select');select.setAttribute('aria-label','Alert preference for '+movie.title);
  for(const [value,label] of [['mine','Included with my services or free'],['any','Any availability or release news'],['rental','Rental at my price']]){const option=document.createElement('option');option.value=value;option.textContent=label;select.appendChild(option);}
  const pref=ReleaseModel.preference(movie.alert);select.value=pref.mode;wrap.appendChild(select);
  const priceLabel=document.createElement('label');priceLabel.textContent='Maximum rental price ($)';priceLabel.hidden=pref.mode!=='rental';const amount=document.createElement('input');amount.type='number';amount.min='0';amount.max='100';amount.step='0.01';amount.value=pref.maxPrice;amount.setAttribute('aria-label','Maximum rental price for '+movie.title);priceLabel.appendChild(amount);wrap.appendChild(priceLabel);
  const note=document.createElement('p');note.className='offer-note';note.textContent=pref.mode==='rental'?'Price emails require a connected price source. Quotes include their format.':'Announcements and actual availability both count. Estimates never trigger emails.';wrap.appendChild(note);
  const save=()=>{movie.alert=ReleaseModel.preference({mode:select.value,maxPrice:amount.value===''?pref.maxPrice:Number(amount.value)});saveWatchlist();scheduleSync();priceLabel.hidden=select.value!=='rental';note.textContent=select.value==='rental'?'Price emails require a connected price source. Quotes include their format.':'Announcements and actual availability both count. Estimates never trigger emails.';};
  select.onchange=save;amount.onchange=save;return wrap;
}
function markMovieWatched(movie){
  const key=seenKey(movie.title,(movie.release_date||'').slice(0,4)),already=seenSet.has(key),entry=watchlist.find(m=>m.id===movie.id);
  seenSet.add(key);saveSeenSet();watchlist=watchlist.filter(m=>m.id!==movie.id);saveWatchlist();scheduleSync();renderWatchlist();renderDiscoverCached();
  const undo=()=>{if(!already)seenSet.delete(key);saveSeenSet();if(entry&&!watchlist.some(m=>m.id===entry.id))watchlist.push(entry);saveWatchlist();scheduleSync();renderWatchlist();};
  showToast(movie.title+' marked watched',undo);if(typeof Hub!=='undefined')Hub.watched(movie,undo);
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
    genre_ids: movie.genre_ids || [],letterboxdURL:movie.letterboxdURL||null,tags:movie.tags||[],tones:movie.tones||null,tagline:movie.tagline||'',
    addedAt: Date.now(),
    lastStatusCode: null,
    lastStatusLabel: null,
    statusChangedAt: null,
    pinned: false,
    manualNote: '',alert:{mode:'mine',maxPrice:7.99},priceHistory:movie.priceHistory || [],
  });
  saveWatchlist();
  showToast(movie.title + ' added to your card');
  scheduleSync();
  // Keep tracked films off the shelf; search still shows their tracked state.
  lastDiscoverResults = lastDiscoverResults.filter(m => m.id !== movie.id);

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

let watchlistSort = 'cost';
let costFilter='all';
let rentalBudget=Number(localStorage.getItem('rewind-rental-budget-v1')??7.99);
if(!Number.isFinite(rentalBudget)||rentalBudget<0||rentalBudget>100)rentalBudget=7.99;
const previousVisit=Number(localStorage.getItem('rewind-last-visit-v1'))||Date.now();
localStorage.setItem('rewind-last-visit-v1',String(Date.now()));
let watchlistRequest = 0;

async function renderWatchlist(force = false) {
  const request = ++watchlistRequest;
  const empty=document.getElementById('watchlist-empty');
  const grids=['watch-now','paid','waiting'];grids.forEach(id=>{document.getElementById(id+'-grid').replaceChildren();document.getElementById(id+'-section').hidden=true;});
  document.getElementById('watchlist-count').textContent=watchlist.length+(watchlist.length===1?' film':' films');
  empty.hidden=watchlist.length>0;
  if(!watchlist.length){document.getElementById('filter-empty').hidden=true;document.getElementById('card-check-status').textContent='';document.getElementById('card-summary').textContent='';return;}
  document.getElementById('card-check-status').textContent='Checking US providers…';
  const results = (await mapLimited([...watchlist],4,async entry=>{
    let status;
    const lookupMovie={...entry};
    try {status=await deriveStatus(lookupMovie,force);}
    catch {status={code:'nodata',kind:'unknown',label:'Availability could not be checked',offers:[],stale:true};}
    if(request !== watchlistRequest) return {entry,status,changed:false,prevLabel:entry.lastStatusLabel};
    Object.assign(entry,{availabilitySnapshot:lookupMovie.availabilitySnapshot,watchmodeCache:lookupMovie.watchmodeCache,detailsSnapshot:lookupMovie.detailsSnapshot,priceHistory:lookupMovie.priceHistory,runtime:lookupMovie.runtime??entry.runtime,director:lookupMovie.director||entry.director,overview:lookupMovie.overview||entry.overview});
    const fingerprint = status.offers?.map(o=>`${o.kind}:${o.provider}:${o.format || ''}:${o.price ?? ''}`).sort().join('|') || status.label;
    const changed = !status.stale && entry.lastAvailabilityKey != null && entry.lastAvailabilityKey !== fingerprint;
    const prevLabel=entry.lastStatusLabel;
    if (!status.stale) {
      if(changed || !entry.lastStatusLabel) entry.statusChangedAt=Date.now();
      if(changed)entry.lastChange={at:Date.now(),from:prevLabel,to:status.label};
      entry.lastStatusCode=status.code;entry.lastStatusLabel=status.label;entry.lastAvailabilityKey=fingerprint;
    }
    return {entry,status,changed,prevLabel};
  })).filter(r=>watchlist.some(m=>m.id===r.entry.id));
  if (request !== watchlistRequest) return;
  document.getElementById('card-check-status').textContent='US providers checked '+new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})+' · '+results.filter(r=>r.status.stale).length+' failed checks';
  saveWatchlist();

  const sorters={cost:(a,b)=>(ReleaseModel.cost(a.status.offers,rentalBudget).price??Infinity)-(ReleaseModel.cost(b.status.offers,rentalBudget).price??Infinity),changed:(a,b)=>(b.entry.statusChangedAt||0)-(a.entry.statusChangedAt||0),added:(a,b)=>(b.entry.addedAt||0)-(a.entry.addedAt||0),release:(a,b)=>(b.entry.release_date||'').localeCompare(a.entry.release_date||''),az:(a,b)=>a.entry.title.localeCompare(b.entry.title)};
  const costRanks={free:0,cheap:1,premium:2,unknown:3,buy:4,waiting:5};
  results.sort((a,b)=>Number(!!b.entry.pinned)-Number(!!a.entry.pinned)||(watchlistSort==='cost'?(costRanks[ReleaseModel.cost(a.status.offers,rentalBudget,a.status.stale).band]-costRanks[ReleaseModel.cost(b.status.offers,rentalBudget,b.status.stale).band]||sorters.cost(a,b)):Number(!!b.entry.pinned)-Number(!!a.entry.pinned)||(sorters[watchlistSort]||sorters.changed)(a,b)));
  const groups={now:'watch-now',paid:'paid',waiting:'waiting'};
  const counts={now:0,paid:0,waiting:0};let changedCount=0;
  const display=results.filter(r=>{const c=ReleaseModel.cost(r.status.offers,rentalBudget,r.status.stale);return costFilter==='all'||costFilter===c.band;});
  const optionsLabel=document.getElementById('card-options-label');if(optionsLabel)optionsLabel.textContent=costFilter==='all'?'Filter, sort & refresh':'Filter: '+({free:'included / free',cheap:'at my price',premium:'over my price',waiting:'waiting'}[costFilter]||costFilter)+' · sort & refresh';
  document.querySelectorAll('[data-cost-filter]').forEach(btn=>{btn.classList.toggle('active',btn.dataset.costFilter===costFilter);btn.setAttribute('aria-pressed',String(btn.dataset.costFilter===costFilter));});
  let lastPaidBand=null;
  for(const r of display){const group=ReleaseModel.group(r.status);counts[group]++;const id=groups[group];const changed=r.changed||!!r.entry.lastChange&&r.entry.lastChange.at>previousVisit;if(changed)changedCount++;if(group==='paid'&&watchlistSort==='cost'){const c=ReleaseModel.cost(r.status.offers,rentalBudget);const band=c.band;if(band!==lastPaidBand){const divider=document.createElement('h4');divider.className='cost-divider';divider.textContent=band==='cheap'?'AT YOUR PRICE · $'+rentalBudget.toFixed(2)+' OR LESS':band==='premium'?'OVER YOUR PRICE':band==='buy'?'PURCHASE ONLY':'PRICE NOT CHECKED';document.getElementById(id+'-grid').appendChild(divider);lastPaidBand=band;}}document.getElementById(id+'-grid').appendChild(renderCard(r.entry,{context:'watchlist',status:r.status,changed,prevLabel:r.entry.lastChange?.from}));}
  for(const [group,id] of Object.entries(groups)){document.getElementById(id+'-section').hidden=!counts[group];document.getElementById(id+'-count').textContent='('+counts[group]+')';}
  document.getElementById('filter-empty').hidden=display.length>0;
  document.getElementById('card-summary').textContent=`${counts.now} ready to watch · ${counts.paid} rent or buy · ${counts.waiting} waiting`+(changedCount?` · ${changedCount} changed since your last visit`:'');
  saveWatchlist();window.dispatchEvent(new Event('rewind:card-rendered'));
}
document.getElementById('rental-budget').value=rentalBudget;
document.getElementById('rental-budget').onchange=e=>{const value=Number(e.target.value);if(e.target.value===''||!Number.isFinite(value)||value<0||value>100)return;rentalBudget=value;localStorage.setItem('rewind-rental-budget-v1',String(value));scheduleSync();renderWatchlist();};
document.querySelectorAll('[data-cost-filter]').forEach(btn=>btn.onclick=()=>{costFilter=btn.dataset.costFilter;renderWatchlist();});
document.getElementById('sort-select').addEventListener('change',e=>{watchlistSort=e.target.value;renderWatchlist();});

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
    filtered=filtered.concat(verified.filter(m=>m&&!isSeen(m)&&!skipSet.has(m.id)&&!watchlist.some(w=>w.id===m.id)));
    pagesChecked++;
    discoverPage++;
  }

  filtered=[...new Map(filtered.map(m=>[m.id,m])).values()];
  if(append)filtered=filtered.filter(m=>!lastDiscoverResults.some(prior=>prior.id===m.id));
  lastDiscoverResults = append ? lastDiscoverResults.concat(filtered) : filtered;
  statusEl.textContent=`${lastDiscoverResults.length} films · TMDB-listed US theatrical dates · ${filter.scope==='small'?'smaller releases':'recent feature releases'}`;
  filtered.forEach(m => grid.appendChild(renderCard(m, { context: 'discover' })));

  const loadMoreBtn = document.getElementById('discover-more');
  const exhausted = discoverPage > totalPages;
  loadMoreBtn.disabled = exhausted;
  loadMoreBtn.textContent = exhausted ? 'NOTHING FURTHER BACK' : 'LOAD MORE STOCK';

  if (filtered.length === 0) {
    const note = document.createElement('p');
    note.className = 'empty-note';
    note.textContent = exhausted
      ? "No more matching feature releases in this window. Try another month or genre."
      : "No matches on these pages. Load more, change the month, or include smaller releases.";
    grid.appendChild(note);
  }
}

document.getElementById('discover-more').addEventListener('click', async () => {
  try {await renderDiscover(true);}catch(err){showToast(err.message);}
});

// ---------- render: search ----------

let searchRequest=0;
document.getElementById('search-form').addEventListener('submit',async e=>{e.preventDefault();const query=document.getElementById('search-input').value.trim();if(!query)return;const request=++searchRequest;document.getElementById('search-clear-btn').hidden=false;document.getElementById('discover-grid').hidden=true;document.getElementById('discover-more').hidden=true;document.getElementById('discovery-filters').hidden=true;const grid=document.getElementById('search-grid');grid.hidden=false;grid.textContent='Searching…';try{const results=await searchMovies(query);if(request!==searchRequest)return;lastSearchResults=results;grid.replaceChildren();results.forEach(m=>grid.appendChild(renderCard(m,{context:'search',markSeen:true})));document.getElementById('discover-status').textContent=results.length+' catalog matches';}catch{if(request===searchRequest)grid.textContent='Search failed. Try again.';}});
document.getElementById('search-clear-btn').onclick=()=>{searchRequest++;document.getElementById('search-input').value='';document.getElementById('search-grid').hidden=true;document.getElementById('search-clear-btn').hidden=true;document.getElementById('discovery-filters').hidden=false;document.getElementById('discover-grid').hidden=false;document.getElementById('discover-more').hidden=false;document.getElementById('discover-status').textContent=lastDiscoverResults.length+' recent films';};
document.getElementById('search-input').addEventListener('focus',e=>e.target.select());
document.querySelectorAll('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b===btn));document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id==='tab-'+btn.dataset.tab));if(btn.dataset.tab==='watchlist')renderWatchlist();}));

// ---------- toast ----------

let toastTimer;
function showToast(msg,undo) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  if(undo){const btn=document.createElement('button');btn.textContent='UNDO';btn.onclick=()=>{undo();el.hidden=true;};el.appendChild(btn);}
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, undo ? 10000 : 3500);
}

document.getElementById('prune-btn').addEventListener('click', () => {
  const cutoff = dateMonthsAgo(12);
  const before = watchlist.length;
  const removedFilms=watchlist.filter(w=>w.release_date&&w.release_date<cutoff);
  watchlist=watchlist.filter(w=>!w.release_date||w.release_date>=cutoff);
  const removed = before - watchlist.length;
  saveWatchlist();
  showToast(`Cleared ${removed} older title${removed === 1 ? '' : 's'} off your card`,()=>{for(const film of removedFilms)if(!watchlist.some(w=>w.id===film.id))watchlist.push(film);saveWatchlist();scheduleSync();renderWatchlist();});
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
  if (!token) throw Error('Connect GitHub in Settings first.');
  const res = await fetch(ALERT_API,{method,headers:{Authorization:'Bearer ' + token,'Content-Type':'application/json'},...(data ? {body:JSON.stringify(data)} : {})});
  const result = await res.json();
  if (!res.ok) throw Error(result.error || 'Could not update email alerts.');
  return result;
}
async function syncEmailCard(enabled = emailEnabled) {
  const result = await emailRequest('POST',{enabled,movies:watchlist.map(m=>({id:m.id,title:m.title,alert:ReleaseModel.preference(m.alert)})),services:myServices,eventAlerts:!!hubState.eventAlerts,eventFilms:HubModel.evidence(hubState.taste).slice(0,500).map(m=>({id:m.id,title:m.title})),followedEvents:hubState.followed.slice(0,500)});
  emailEnabled = enabled;
  document.getElementById('email-alert-status').textContent = enabled ? `Daily email checks enabled for ${result.count} films. Alerts follow each film’s selected preference.` : 'Email alerts paused.';
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
    try {const res=await fetch('https://transmissionalbum.netlify.app/.netlify/functions/rewind-status');if(res.ok){const s=await res.json();document.getElementById('price-alert-status').textContent=s.pricesConfigured?'Price emails are connected.':'Price-threshold emails are not connected yet. Local quotes can be enabled below.';document.getElementById('email-alert-status').textContent=`Daily checks ${s.enabled?'active':'paused'} for ${s.tracked} film${s.tracked===1?'':'s'} on the server. Connect GitHub in Settings to sync this card.`;}}catch {}
    return;
  }
  try {
    const state = await emailRequest('GET');
    document.getElementById('price-alert-status').textContent=state.pricesConfigured?'Price emails are connected.':'Price-threshold emails need a connected server price source. Local price checks work with your Watchmode key.';
    emailEnabled = state.enabled;
    document.getElementById('email-alert-status').textContent = state.enabled ? `Daily email checks enabled for ${state.movies.length} films.` : 'Email alerts paused. Enable to track Your Card.';
    // Opening a device must not replace the server's card with stale local data.
  } catch (err) { document.getElementById('email-alert-status').textContent = err.message; }
}
renderServiceSettings();
document.getElementById('refresh-card-btn').onclick=()=>renderWatchlist(true);
init().then(initEmailAlerts);
