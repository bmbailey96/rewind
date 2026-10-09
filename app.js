// ---------- letterboxd import ----------
StorageModel.migrate(localStorage);
function persistData(key,data){if(StorageModel.save(localStorage,key,data))return true;showToast('This browser could not save the latest change. Your previous saved films are still available. Free some site storage or reconnect sync.');return false;}

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
  document.getElementById('watched-status').textContent = `Loaded ${added} seen titles. Browse will keep them off the shelf.`;
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
  statusEl.textContent = `Done. ${matched} added to your watchlist, ${skipped} skipped (already tracked, ambiguous, or unmatched).`;
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
  updateBrowseDismissControl();
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

let syncTimer,syncFlight=null;
const SYNC_BASE_KEY='rewind-sync-base-v1',SYNC_DIRTY_KEY='rewind-sync-dirty-v1';
const syncBase=()=>{try{return JSON.parse(localStorage.getItem(SYNC_BASE_KEY)||'null');}catch{return null;}};
function rememberSync(data){persistData(SYNC_BASE_KEY,data);}
function syncNotice(text,error=false){const e=document.getElementById('sync-status');if(e){e.dataset.tone=error?'error':'info';e.textContent=text;}}
async function ghJSON(path,options){const r=await ghFetch(path,options);if(!r.ok)throw Error(r.status===401||r.status===403?'GitHub did not accept this token. Check its gist permission.':'GitHub sync failed (HTTP '+r.status+'). Your changes remain on this device.');return r.json();}

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
    watchlist:StorageModel.compact(watchlist),
    seen: [...seenSet],
    skipped: [...skipSet],
    services: myServices,
    rentalBudget,
    hub:StorageModel.compact(hubState),
    ui:JSON.parse(localStorage.getItem('rewind-ui-v1')||'{}'),
    recommendations:JSON.parse(localStorage.getItem('rewind-recommendations-v1')||'[]'),
    updatedAt: Date.now(),
  };
}

function applySyncData(data) {
  if (!data) return;
  if(data.ui&&typeof data.ui==='object')localStorage.setItem('rewind-ui-v1',JSON.stringify(data.ui));
  if(Array.isArray(data.recommendations))localStorage.setItem('rewind-recommendations-v1',JSON.stringify(data.recommendations));
  if(typeof data.rentalBudget==='number'&&data.rentalBudget>=0&&data.rentalBudget<=100){rentalBudget=data.rentalBudget;localStorage.setItem('rewind-rental-budget-v1',String(rentalBudget));document.getElementById('rental-budget').value=rentalBudget;}
  if(data.hub&&typeof data.hub==='object'){const restores=[...(hubState.theaterHideRestores||[]),...(data.hub.theaterHideRestores||[])];hubState.hiddenTheaterFilms=CounterModel.mergeHiddenFilms(hubState.hiddenTheaterFilms,data.hub.hiddenTheaterFilms,restores);hubState.theaterHideRestores=[...new Map(restores.map(r=>[r.key+':'+r.at,r])).values()];for(const key of ['taste','hidden','muted','followed','knownEvents','suggestions','dismissedSuggestions','ignoredTaste','ignoredOwnership','setAsides','feedback','changeReceipts','calendarBaseline'])if(Array.isArray(data.hub[key]))hubState[key]=data.hub[key];if(Number.isFinite(data.hub.receiptsReadAt))hubState.receiptsReadAt=Math.max(hubState.receiptsReadAt||0,data.hub.receiptsReadAt);if(Number.isFinite(data.hub.suggestionsVersion))hubState.suggestionsVersion=data.hub.suggestionsVersion;if(Number.isFinite(data.hub.suggestionsCheckedAt))hubState.suggestionsCheckedAt=data.hub.suggestionsCheckedAt;if(typeof data.hub.eventAlerts==='boolean')hubState.eventAlerts=data.hub.eventAlerts;persistHubState();}
  watchlist = data.watchlist || [];
  if (Array.isArray(data.services)) {myServices = data.services;localStorage.setItem('rewind-services-v1',JSON.stringify(myServices));renderServiceSettings();}
  seenSet = new Set(data.seen || []);
  skipSet = new Set(data.skipped || []);
  saveWatchlist();
  saveSeenSet();
  saveSkipSet();
}

async function findOrCreateGist() {
  const existing=localStorage.getItem(GH_GIST_KEY);if(existing){const r=await ghFetch('/gists/'+existing);if(r.ok)return existing;if(r.status!==404)throw Error('Could not access your saved sync connection. Check the token.');}
  for(let page=1;page<=10;page++){const list=await ghJSON('/gists?per_page=100&page='+page),found=list.find(g=>g.description===GIST_DESC&&g.files?.[GIST_FILENAME]);if(found){localStorage.setItem(GH_GIST_KEY,found.id);return found.id;}if(list.length<100)break;}
  const data=collectSyncData(),created=await ghJSON('/gists',{method:'POST',body:JSON.stringify({description:GIST_DESC,public:false,files:{[GIST_FILENAME]:{content:JSON.stringify(data)}}})});if(!created.id)throw Error('GitHub returned no sync ID.');localStorage.setItem(GH_GIST_KEY,created.id);rememberSync(data);return created.id;
}
async function readGist(id){const gist=await ghJSON('/gists/'+id),file=gist.files?.[GIST_FILENAME];let content=file?.content;if(file?.truncated){const rawURL=new URL(file.raw_url);if(rawURL.protocol!=='https:'||rawURL.hostname!=='gist.githubusercontent.com')throw Error('Unexpected sync file address.');const response=await fetch(rawURL.href,{headers:{Authorization:'token '+localStorage.getItem(GH_TOKEN_KEY)},cache:'no-store'});if(!response.ok)throw Error('Could not read the full saved film profile.');content=await response.text();}let data;try{data=JSON.parse(content);}catch{throw Error('Saved sync data could not be read. Local films were kept.');}if(!data||!Array.isArray(data.watchlist)||!Array.isArray(data.seen)||!Array.isArray(data.skipped))throw Error('Saved sync data is incomplete. Local films were kept.');return data;}
async function pullFromGist(){const id=await findOrCreateGist(),remote=await readGist(id),base=syncBase(),local=collectSyncData(),merged=SyncModel.merge(base||{},local,remote);applySyncData(merged);rememberSync(remote);window.dispatchEvent(new Event('rewind:state'));return merged;}
async function pushToGist(){if(syncFlight)return syncFlight;syncFlight=(async()=>{const id=await findOrCreateGist(),remote=await readGist(id),local=collectSyncData(),merged=SyncModel.merge(syncBase()||{},local,remote);merged.updatedAt=Date.now();await ghJSON('/gists/'+id,{method:'PATCH',body:JSON.stringify({files:{[GIST_FILENAME]:{content:JSON.stringify(merged)}}})});const current=collectSyncData(),after=SyncModel.merge(local,current,merged);applySyncData(after);rememberSync(merged);const changed=JSON.stringify({...current,updatedAt:0})!==JSON.stringify({...local,updatedAt:0});if(changed){localStorage.setItem(SYNC_DIRTY_KEY,'1');scheduleSync();}else localStorage.removeItem(SYNC_DIRTY_KEY);window.dispatchEvent(new Event('rewind:state'));syncNotice('Synced '+new Date().toLocaleTimeString()+'. Ready on your connected devices.');})().catch(e=>{syncNotice(e.message,true);throw e;}).finally(()=>{syncFlight=null;});return syncFlight;}
function scheduleSync(){scheduleEmailSync();localStorage.setItem(SYNC_DIRTY_KEY,'1');if(!localStorage.getItem(GH_TOKEN_KEY))return;clearTimeout(syncTimer);syncNotice('Saving changes across devices…');syncTimer=setTimeout(()=>pushToGist().catch(()=>{}),1500);}
let lastSyncPull=0;
async function refreshDeviceSync(){if(!localStorage.getItem(GH_TOKEN_KEY)||document.hidden||syncFlight||Date.now()-lastSyncPull<30000)return;lastSyncPull=Date.now();try{if(localStorage.getItem(SYNC_DIRTY_KEY))await pushToGist();else{await pullFromGist();syncNotice('Synced '+new Date().toLocaleTimeString()+'. Connected devices share this film memory.');}renderWatchlist(false,true);}catch(e){syncNotice(e.message,true);}}
window.addEventListener('focus',refreshDeviceSync);window.addEventListener('online',refreshDeviceSync);document.addEventListener('visibilitychange',refreshDeviceSync);

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
    await pushToGist();
    statusEl.dataset.tone='info';statusEl.textContent = 'Connected and synced. Use this same GitHub connection on your phone.';
    renderWatchlist();
    renderDiscover();
    await initEmailAlerts();
  } catch (e) {
    statusEl.dataset.tone='error';statusEl.textContent = e.message || 'Connection failed. Check the token has gist permission.';
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
    statusEl.dataset.tone='error';statusEl.textContent = e.message || 'Sync failed. Your changes remain on this device.';
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

let discoverPage = 1;let discoveryStage='recent',horizonFeed=null,horizonPromise=null;
let watchlist = loadWatchlist();
let hubState;
try {hubState=JSON.parse(localStorage.getItem('rewind-hub-v1'))||{};}catch{hubState={};}
for(const key of ['taste','hidden','muted','followed','knownEvents','suggestions','dismissedSuggestions','ignoredTaste','hiddenTheaterFilms','theaterHideRestores','ignoredOwnership','setAsides','feedback','changeReceipts','calendarBaseline'])if(!Array.isArray(hubState[key]))hubState[key]=[];


function mergeTheaterState(incoming){
 if(!incoming||typeof incoming!=='object')return;
 const restores=[...hubState.theaterHideRestores,...(Array.isArray(incoming.theaterHideRestores)?incoming.theaterHideRestores:[])];
 hubState.theaterHideRestores=[...new Map(restores.map(r=>[r.key+':'+r.at,r])).values()];
 hubState.hiddenTheaterFilms=CounterModel.mergeHiddenFilms(hubState.hiddenTheaterFilms,Array.isArray(incoming.hiddenTheaterFilms)?incoming.hiddenTheaterFilms:[],restores);
}
function refreshTheaterState(){try{mergeTheaterState(JSON.parse(localStorage.getItem('rewind-hub-v1')||'{}'));}catch{}}
function persistHubState(){refreshTheaterState();persistData('rewind-hub-v1',hubState);}
window.addEventListener('storage',event=>{if(event.key==='rewind-hub-v1'){refreshTheaterState();if(typeof Hub!=='undefined')Hub.stateChanged();}});

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
  persistData(STORAGE_KEY,watchlist);
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
  if(filter?.stage==='coming'){const end=ReleaseModel.addDays(window.today,365),params={include_video:false,include_adult:false,...(genre?{with_genres:genre}:{}),page,sort_by:['popularity.desc','taste'].includes(filter.sort)?'popularity.desc':'primary_release_date.asc'};const results=await Promise.allSettled([tmdbGet('/discover/movie',{...params,region:REGION,with_release_type:'2|3','release_date.gte':window.today,'release_date.lte':end}),tmdbGet('/discover/movie',{...params,'primary_release_date.gte':window.today,'primary_release_date.lte':end})]);const success=results.filter(r=>r.status==='fulfilled').map(r=>r.value);if(!success.length)throw Error('Upcoming catalog unavailable');return {results:[...new Map(success.flatMap(d=>d.results||[]).map(m=>[m.id,m])).values()],total_pages:Math.max(...success.map(d=>d.total_pages||1))};}
  return tmdbGet('/discover/movie', {
    region:REGION,sort_by:filter?.sort==='taste'?'popularity.desc':filter?.sort || document.getElementById('discover-sort').value,
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
async function checkStorePricesCached(movie,force=false){
  const cache=movie.storePriceCache;
  if(!force&&cache&&Array.isArray(cache.offers)&&Date.now()-cache.checkedAt<6*3600000)return cache;
  const res=await fetch('https://transmissionalbum.netlify.app/.netlify/functions/rewind-prices?id='+movie.id,{signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw Error('US store prices unavailable. No dollar amount assumed.');
  const result=await res.json();
  if(result.id!==movie.id||!Array.isArray(result.offers)||!Number.isFinite(result.checkedAt))throw Error('Invalid store price response.');
  movie.storePriceCache=result;return result;
}
async function deriveRemoteStatus(movie, force = false) {
  const results = await Promise.allSettled([fetchWatchProviders(movie.id),fetchMovieDetails(movie.id,force),fetchAnnouncements(),fetchStreamingCalendar(),checkStorePricesCached(movie,force)]);
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
  const storeQuotes=results[4].status==='fulfilled'?results[4].value:null;
  if(results[4].status==='rejected')priceWarning=[priceWarning,'US store prices could not refresh.'].filter(Boolean).join(' ');
  const storeOffers=(storeQuotes?.offers||[]).filter(o=>o.region==='US'&&['rent','buy'].includes(o.kind)&&typeof o.price==='number'&&Number.isFinite(o.price)&&o.price>=0&&RewindModel.safeLink(o.link));
  const watchmodeOffers=RewindModel.normalizeWatchmode(quote?.sources,myServices);
  const offers = RewindModel.mergeOffers(RewindModel.mergeOffers(RewindModel.normalizeTMDB(providers,myServices),storeOffers),watchmodeOffers);
  const today = discoveryWindow().today;
  const futureDigital = releaseDates.filter(r=>r.type===4 && r.release_date.slice(0,10)>today).sort((a,b)=>a.release_date.localeCompare(b.release_date))[0];
  const pastDigital = releaseDates.filter(r=>r.type===4 && r.release_date.slice(0,10)<=today).sort((a,b)=>b.release_date.localeCompare(a.release_date))[0];
  const futureTheater = releaseDates.filter(r=>[2,3].includes(r.type) && r.release_date.slice(0,10)>today).sort((a,b)=>a.release_date.localeCompare(b.release_date))[0];
  let best = RewindModel.summary(offers);
  if (!best && futureDigital) best = {code:'notyet',kind:'upcoming',label:'Digital release listed '+formatFilmDate(futureDigital.release_date),date:futureDigital.release_date};
  if (!best && futureTheater) best = {code:'notyet',kind:'theaters',label:'US theatrical release '+formatFilmDate(futureTheater.release_date),date:futureTheater.release_date};
  if (!best && pastDigital) best = {code:'nodata',kind:'unverified',label:'Digital date passed · no current provider listing'};
  if (!best) best = {code:'nodata',kind:'unknown',label:'No US streaming offer listed'};
  movie.priceHistory=ReleaseModel.recordQuotes(movie.priceHistory,storeOffers,storeQuotes?.checkedAt);
  movie.priceHistory=ReleaseModel.recordQuotes(movie.priceHistory,watchmodeOffers,quote?.checkedAt);
  const result = {...best,...timeline,calendarWarning:results[3].status==='rejected'?'Upcoming calendar unavailable. Showing the verified announcement feed.':'',announcementUnavailable:results[2].status==='rejected',offers,link:RewindModel.safeLink(providers.link),checkedAt:Date.now(),quoteCheckedAt:[storeQuotes?.checkedAt,quote?.checkedAt].filter(Number.isFinite).sort((a,b)=>a-b)[0]||null,priceSources:[...(storeQuotes?['JustWatch US prices']:[]),...(quote?['Watchmode']:[])],priceWarning,datesUnavailable:d.status==='rejected',digitalDate:futureDigital?.release_date || null};
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
    checkbox.onchange=()=>{myServices=checkbox.checked?[...myServices,name]:myServices.filter(s=>s!==name);localStorage.setItem('rewind-services-v1',JSON.stringify(myServices));scheduleSync();renderWatchlist(false,true);};
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

function renderCostHeadline(costInfo){const block=document.createElement('div');block.className='cost-block cost-'+costInfo.band;const badge=document.createElement('strong');badge.className='cost-badge';badge.textContent=costInfo.badge;block.appendChild(badge);const caption=document.createElement('p');caption.className='cost-caption';caption.textContent=costInfo.caption;block.appendChild(caption);if(costInfo.stale){const old=document.createElement('span');old.className='cost-warning';old.textContent='PREVIOUS CHECK';block.appendChild(old);}if(costInfo.cheaper){const cheaper=document.createElement('p');cheaper.className='cost-alternative';cheaper.textContent='$'+costInfo.cheaper.price.toFixed(2)+' on '+costInfo.cheaper.provider+(costInfo.cheaper.format?' · '+costInfo.cheaper.format:'');block.appendChild(cheaper);}return block;}
// Only cards that enter the viewport ask for offers. Four checks run at a time.
const visibleOfferJobs=[],observedOfferCards=new Set();let offerObserver=null,offerChecks=0;
function observeCardOffers(card,check){
 if(typeof IntersectionObserver!=='function')return;
 if(!offerObserver)offerObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){offerObserver.unobserve(entry.target);observedOfferCards.delete(entry.target);visibleOfferJobs.push(entry.target.offerCheck);}drainOfferChecks();},{rootMargin:'120px'});
 for(const old of observedOfferCards)if(!old.isConnected){offerObserver.unobserve(old);observedOfferCards.delete(old);}
 card.offerCheck=async()=>{if(card.isConnected)await check();};observedOfferCards.add(card);offerObserver.observe(card);
}
function drainOfferChecks(){while(offerChecks<4&&visibleOfferJobs.length){const job=visibleOfferJobs.shift();offerChecks++;Promise.resolve().then(job).catch(()=>{}).finally(()=>{offerChecks--;drainOfferChecks();});}}
function renderCard(movie, opts = {}) {
  const {context='discover',status=null,changed=false}=opts;
  const card=document.createElement('article');card.className='rental-card'+(movie.releaseFile?' release-card':'');card.dataset.movieId=movie.id;
  const image=posterUrl(movie.poster_path);const poster=document.createElement(image?'img':'div');poster.className='card-poster'+(image?'':' poster-missing');if(image){poster.loading='lazy';poster.src=image;poster.alt=movie.title+' poster';poster.onerror=()=>{const fallback=document.createElement('div');fallback.className='card-poster poster-missing';fallback.textContent='NO POSTER ON FILE';poster.replaceWith(fallback);};}else{poster.textContent='NO POSTER ON FILE';}card.appendChild(poster);
  const title=document.createElement('h3');title.className='card-title';title.textContent=movie.title;card.appendChild(title);
  const meta=document.createElement('p');meta.className='card-meta';meta.textContent=[(movie.release_date||'').slice(0,4),movie.runtime?movie.runtime+' min':'Runtime not listed',movie.director].filter(Boolean).join(' · ');card.appendChild(meta);
  if(movie.pinned){const pinned=document.createElement('span');pinned.className='new-tag';pinned.textContent='PINNED';card.appendChild(pinned);}
  if(changed){const tag=document.createElement('span');tag.className='new-tag';tag.textContent='CHANGED SINCE YOUR LAST VISIT';card.appendChild(tag);}
  if(opts.markSeen&&isSeen(movie)){const tag=document.createElement('span');tag.className='new-tag';tag.textContent='ALREADY SEEN';card.appendChild(tag);}
  let costInfo=status?.pending?{band:'waiting',badge:'CHECKING',caption:'Getting current offers and prices.'}:status?ReleaseModel.cost(status.offers,rentalBudget,status.stale):null;
  if(costInfo&&!(movie.releaseFile&&costInfo.band==='waiting'))card.appendChild(renderCostHeadline(costInfo));

  if(movie.discoveryFit||movie.requestedInterest){const reason=document.createElement('p');reason.className='discovery-reason';reason.textContent=movie.requestedInterest?'You asked to keep an eye on this one.':movie.discoveryFit.connection?.directors?.length?'From '+movie.discoveryFit.connection.directors.join(' and ')+', behind '+movie.discoveryFit.connection.seedTitle+'.':FilmOracle.reading(movie,{connection:null}).text;card.appendChild(reason);}if(movie.releaseFile)card.appendChild(renderReleaseFile(movie,status));
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
    if(opts.onRemovePhysical){const remove=document.createElement('button');remove.className='secondary';remove.textContent='REMOVE FROM PHYSICAL SHELF';remove.onclick=opts.onRemovePhysical;body.appendChild(remove);}
    if(movie.overview){const synopsis=document.createElement('p');synopsis.textContent=movie.overview;body.appendChild(synopsis);}
    const filmLinks=document.createElement('div');filmLinks.className='film-links';const lb=document.createElement('a');lb.textContent='LETTERBOXD';lb.href=HubModel.letterboxd(movie);lb.target='_blank';lb.rel='noopener';filmLinks.appendChild(lb);body.appendChild(filmLinks);
    if(context==='watchlist'){
      const tools=document.createElement('div');tools.className='card-actions';
      for(const [name,fn] of [[movie.pinned?'UNPIN':'PIN',()=>togglePin(movie.id)],['REMOVE FROM WATCHLIST',()=>removeFromWatchlist(movie.id)]]){const btn=document.createElement('button');btn.className='secondary';btn.textContent=name;btn.onclick=fn;tools.appendChild(btn);}body.appendChild(tools);
    }
  };
  if(current)fillDetails();
  details.addEventListener('toggle',async()=>{if(!details.open)return;if(current){fillDetails();return;}body.textContent='Checking releases and viewing options…';try{current=await deriveStatus(movie);fillDetails();}catch{body.textContent='Could not load this film. Close and reopen to retry.';}});
  const actions=document.createElement('div');actions.className='card-actions';
  if(context==='watchlist'){
    const watched=document.createElement('button');watched.className='secondary';watched.textContent='MARK WATCHED';watched.onclick=()=>markMovieWatched(movie);secondaryActions.appendChild(watched);
    const next=!status?.stale?costInfo?.offer:null;
    if(next?.link){const link=document.createElement('a');link.className='watch-link';link.textContent=next.kind==='buy'?'BUY':next.kind==='rent'?'RENT':'WATCH';link.href=next.link;link.target='_blank';link.rel='noopener noreferrer';actions.prepend(link);}
    if(costInfo?.band==='premium'){const wait=document.createElement('button');wait.className='secondary wait-button';const pref=ReleaseModel.preference(movie.alert);wait.textContent=pref.mode==='rental'?'WAITING FOR $'+pref.maxPrice.toFixed(2):'WAIT FOR $'+rentalBudget.toFixed(2);wait.onclick=()=>{movie.alert={mode:'rental',maxPrice:rentalBudget};saveWatchlist();scheduleSync();showToast('Watching for a rental at $'+rentalBudget.toFixed(2)+' or less');renderWatchlist();};secondaryActions.appendChild(wait);}
  }else{
    const next=!status?.stale?costInfo?.offer:null;if(next?.link){const watch=document.createElement('a');watch.className='watch-link';watch.textContent=next.kind==='rent'?'RENT':next.kind==='buy'?'BUY':'WATCH';watch.href=next.link;watch.target='_blank';watch.rel='noopener noreferrer';actions.appendChild(watch);}
    if(context==='physical'){const watched=document.createElement('button');watched.className='secondary';watched.textContent='MARK WATCHED';watched.onclick=()=>markMovieWatched(movie);secondaryActions.appendChild(watched);}
    const inList=watchlist.some(w=>w.id===movie.id);const track=document.createElement('button');track.textContent=inList?('TRACKED'):'TRACK';track.disabled=inList;
    track.onclick=()=>{addToWatchlist(movie);if(context==='discover'&&!movie.releaseFile)card.remove();else{track.textContent='TRACKED';track.disabled=true;card.classList.add('film-tracked');}};actions.appendChild(track);
    if((context==='discover'||context==='search')&&!inList){const skip=document.createElement('button');skip.className='text-action hide-action';skip.textContent='HIDE';skip.onclick=()=>{skipMovie(movie.id);card.remove();updateBrowseDismissControl();};actions.appendChild(skip);}
  }
  if(!current)body.appendChild(secondaryActions);
  card.appendChild(actions);
  if(!status&&['discover','search'].includes(context))observeCardOffers(card,async()=>{
   try{const found=await deriveStatus(movie);if(!card.isConnected)return;current=found;if(movie.releaseFile)card.querySelector('.release-file')?.replaceWith(renderReleaseFile(movie,found));costInfo=ReleaseModel.cost(found.offers,rentalBudget,found.stale);card.querySelector('.cost-block')?.remove();if(!(movie.releaseFile&&costInfo.band==='waiting'))details.before(renderCostHeadline(costInfo));
    const next=!found.stale?costInfo.offer:null;if(next?.link&&!actions.querySelector('.watch-link')){const watch=document.createElement('a');watch.className='watch-link';watch.textContent=next.kind==='rent'?'RENT':next.kind==='buy'?'BUY':'WATCH';watch.href=next.link;watch.target='_blank';watch.rel='noopener noreferrer';actions.prepend(watch);}if(details.open)fillDetails();
   }catch{if(card.isConnected&&!card.querySelector('.cost-block')){const note=document.createElement('p');note.className='offer-note';note.textContent='Viewing options could not refresh. Open Details to retry.';details.before(note);}}
  });
  return card;
}
function renderAlertPreference(movie){
  const wrap=document.createElement('fieldset');wrap.className='alert-preference';const legend=document.createElement('legend');legend.textContent='Notify me when';wrap.appendChild(legend);
  const select=document.createElement('select');select.setAttribute('aria-label','Alert preference for '+movie.title);
  for(const [value,label] of [['mine','Included with my services or free'],['any','Any availability or release news'],['rental','Rental at my price']]){const option=document.createElement('option');option.value=value;option.textContent=label;select.appendChild(option);}
  const pref=ReleaseModel.preference(movie.alert);select.value=pref.mode;wrap.appendChild(select);
  const priceLabel=document.createElement('label');priceLabel.textContent='Maximum rental price ($)';priceLabel.hidden=pref.mode!=='rental';const amount=document.createElement('input');amount.type='number';amount.min='0';amount.max='100';amount.step='0.01';amount.value=pref.maxPrice;amount.setAttribute('aria-label','Maximum rental price for '+movie.title);priceLabel.appendChild(amount);wrap.appendChild(priceLabel);
  const note=document.createElement('p');note.className='offer-note';note.textContent=pref.mode==='rental'?'Daily US store quotes include price and format. An unmatched or failed quote never counts as a price drop.':'Announcements and actual availability both count. Estimates never trigger emails.';wrap.appendChild(note);
  const save=()=>{movie.alert=ReleaseModel.preference({mode:select.value,maxPrice:amount.value===''?pref.maxPrice:Number(amount.value)});saveWatchlist();scheduleSync();priceLabel.hidden=select.value!=='rental';note.textContent=select.value==='rental'?'Daily US store quotes include price and format. An unmatched or failed quote never counts as a price drop.':'Announcements and actual availability both count. Estimates never trigger emails.';};
  select.onchange=save;amount.onchange=save;return wrap;
}
function markMovieWatched(movie){
  const key=seenKey(movie.title,(movie.release_date||'').slice(0,4)),already=seenSet.has(key),entry=watchlist.find(m=>m.id===movie.id);
  seenSet.add(key);saveSeenSet();watchlist=watchlist.filter(m=>m.id!==movie.id);saveWatchlist();scheduleSync();renderWatchlist();renderDiscoverCached();
  let restored=false;const undo=()=>{if(restored)return;restored=true;if(!already)seenSet.delete(key);saveSeenSet();if(entry&&!watchlist.some(m=>m.id===entry.id))watchlist.push(entry);saveWatchlist();scheduleSync();renderWatchlist();};
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
    availabilitySnapshot:movie.availabilitySnapshot || null,watchmodeCache:movie.watchmodeCache || null,storePriceCache:movie.storePriceCache||null,
    release_date: movie.release_date || movie.primary_release_date || '',
    genre_ids: movie.genre_ids || [],letterboxdURL:movie.letterboxdURL||null,releaseFile:movie.releaseFile||null,tags:movie.tags||[],tones:movie.tones||null,tagline:movie.tagline||'',
    addedAt: Date.now(),
    lastStatusCode: null,
    lastStatusLabel: null,
    statusChangedAt: null,
    pinned: false,
    manualNote: '',alert:{mode:movie.releaseFile?'any':'mine',maxPrice:7.99},priceHistory:movie.priceHistory || [],
  });
  saveWatchlist();
  showToast(movie.title + ' added to your watchlist');
  scheduleSync();
  // Keep watchlist films off the shelf; search still shows their tracked state.
  lastDiscoverResults = lastDiscoverResults.filter(m => m.id !== movie.id||m.releaseFile);

}

function togglePin(id) {
  const entry = watchlist.find(w => w.id === id);
  if (!entry) return;
  entry.pinned = !entry.pinned;
  saveWatchlist();
  scheduleSync();
  renderWatchlist(false,true);
}

function removeFromWatchlist(id) {
  const entry=watchlist.find(w=>w.id===id);if(!entry)return;
  watchlist=watchlist.filter(w=>w.id!==id);saveWatchlist();scheduleSync();renderWatchlist(false,true);
  showToast(entry.title+' removed from your watchlist',()=>{if(!watchlist.some(w=>w.id===id))watchlist.push(entry);saveWatchlist();scheduleSync();renderWatchlist(false,true);});
}

// ---------- render: watchlist ----------

let lastDiscoverResults = [];
let lastSearchResults = [];

function browseCandidates(grid){return [...grid.querySelectorAll('.rental-card')].map(card=>({card,id:Number(card.dataset.movieId)})).filter(row=>Number.isInteger(row.id)&&row.id>0&&!watchlist.some(m=>m.id===row.id));}
function updateBrowseDismissControl(){
  const grid=document.getElementById('search-grid').hidden?document.getElementById('discover-grid'):document.getElementById('search-grid');
  const count=browseCandidates(grid).length,button=document.getElementById('browse-dismiss');
  if(button){button.disabled=!count;button.textContent=count?'PASS OVER THESE '+count+' FILMS':'PASS OVER THESE FILMS';}
  const note=document.getElementById('dismissed-count');if(note)note.textContent=skipSet.size+' films passed over. These stay off Browse until restored.';
  const restore=document.getElementById('restore-dismissed');if(restore)restore.hidden=!skipSet.size;
}
function dismissVisibleBrowse(){
  const search=!document.getElementById('search-grid').hidden,grid=document.getElementById(search?'search-grid':'discover-grid'),rows=browseCandidates(grid);
  if(!rows.length)return 0;
  const ids=new Set(rows.map(row=>row.id)),newIds=[...ids].filter(id=>!skipSet.has(id));
  const removedDiscover=lastDiscoverResults.filter(m=>ids.has(m.id)),removedSearch=lastSearchResults.filter(m=>ids.has(m.id));
  ++discoverRequest;++searchRequest;
  for(const id of ids)skipSet.add(id);saveSkipSet();scheduleSync();
  lastDiscoverResults=lastDiscoverResults.filter(m=>!ids.has(m.id));lastSearchResults=lastSearchResults.filter(m=>!ids.has(m.id));
  for(const row of rows)row.card.remove();
  document.getElementById('discover-status').textContent=rows.length+' passed over. Added films kept. Load more when you want.';
  updateBrowseDismissControl();
  showToast(rows.length+' films passed over',()=>{
   for(const id of newIds)skipSet.delete(id);saveSkipSet();scheduleSync();
   lastDiscoverResults=[...new Map([...lastDiscoverResults,...removedDiscover].map(m=>[m.id,m])).values()];
   lastSearchResults=[...new Map([...lastSearchResults,...removedSearch].map(m=>[m.id,m])).values()];
   renderDiscoverCached();renderSearchCached();updateBrowseDismissControl();
   document.getElementById('discover-status').textContent='Pass-over undone. Added films kept.';
  });return rows.length;
}
function renderDiscoverCached() {
  const grid=document.getElementById('discover-grid');grid.replaceChildren();
  lastDiscoverResults.filter(m=>!isSeen(m)&&!skipSet.has(m.id)&&(!watchlist.some(w=>w.id===m.id)||m.releaseFile)).forEach(m=>grid.appendChild(renderCard(m,{context:'discover'})));if(discoveryStage==='circuit'){const unresolved=(horizonFeed?.items||[]).filter(m=>!m.id);if(unresolved.length)grid.appendChild(renderSourceLinks(unresolved));}
  updateBrowseDismissControl();
}
function renderSearchCached() {
  const grid=document.getElementById('search-grid');grid.replaceChildren();
  lastSearchResults.filter(m=>!skipSet.has(m.id)).forEach(m=>grid.appendChild(renderCard(m,{context:'search',markSeen:true})));
  updateBrowseDismissControl();
}
document.getElementById('browse-dismiss').onclick=dismissVisibleBrowse;
document.getElementById('restore-dismissed').onclick=()=>{
 const prior=[...skipSet];skipSet.clear();saveSkipSet();scheduleSync();discoverPage=1;
 renderDiscover().catch(err=>showToast(err.message));renderSearchCached();
 showToast('Passed-over films restored',()=>{for(const id of prior)skipSet.add(id);saveSkipSet();scheduleSync();renderDiscoverCached();renderSearchCached();});
};
const browseObserver=new MutationObserver(updateBrowseDismissControl);
for(const id of ['discover-grid','search-grid'])browseObserver.observe(document.getElementById(id),{childList:true,attributes:true,attributeFilter:['hidden']});
updateBrowseDismissControl();

let watchlistSort = 'cost';
let costFilter='all';
let rentalBudget=Number(localStorage.getItem('rewind-rental-budget-v1')??7.99);
if(!Number.isFinite(rentalBudget)||rentalBudget<0||rentalBudget>100)rentalBudget=7.99;
const previousVisit=Number(localStorage.getItem('rewind-last-visit-v1'))||Date.now();
localStorage.setItem('rewind-last-visit-v1',String(Date.now()));
let watchlistRequest = 0;

async function renderWatchlist(force = false, reuse = false) {
  const request = ++watchlistRequest;
  const empty=document.getElementById('watchlist-empty');
  const loading=document.getElementById('watchlist-load-status');
  document.getElementById('watchlist-count').textContent=watchlist.length+(watchlist.length===1?' film':' films');
  empty.hidden=watchlist.length>0;
  if(!watchlist.length){paintWatchlist([]);loading.textContent='';document.getElementById('filter-empty').hidden=true;document.getElementById('card-check-status').textContent='';document.getElementById('card-summary').textContent='';return;}
  if(!reuse){paintWatchlist(watchlist.map(entry=>({entry,status:entry.availabilitySnapshot?{...entry.availabilitySnapshot,stale:true}:{code:'nodata',kind:'unknown',label:'Checking availability',offers:[],pending:true},changed:false})));loading.textContent='Checking offers and prices for '+watchlist.length+' film'+(watchlist.length===1?'':'s')+'…';}
  document.getElementById('card-check-status').textContent=reuse?'Showing saved availability.':'Checking US providers…';
  const results = (await mapLimited([...watchlist],4,async entry=>{
    let status;
    const lookupMovie={...entry};const beforeAvailability=entry.availabilityBaseline||(!entry.availabilitySnapshot?.stale?entry.availabilitySnapshot:null);
    try {
      if(reuse&&entry.availabilitySnapshot){
        const cached=entry.availabilitySnapshot;
        const owned=hubState.taste.find(m=>m.id===entry.id&&m.owned);const remote=(cached.offers||[]).filter(o=>o.kind!=='physical').map(o=>o.kind==='subscription'?{...o,included:RewindModel.included(o.provider,myServices)}:o);
        const offers=[...(owned?HubModel.shelfStatus(owned).offers:[]),...remote];status={...cached,...(owned?HubModel.shelfStatus(owned):RewindModel.summary(offers)||{code:'nodata',kind:'unknown',label:'No current offer'}),physical:!!owned,offers,stale:owned?false:cached.physical?!!cached.remoteStale:cached.stale};lookupMovie.availabilitySnapshot=status;
      }else status=await deriveStatus(lookupMovie,force);
    }
    catch {status={code:'nodata',kind:'unknown',label:'Availability could not be checked',offers:[],stale:true};}
    if(request !== watchlistRequest) return {entry,status,changed:false,prevLabel:entry.lastStatusLabel};
    if(!reuse&&!status.stale){for(const receipt of CounterModel.changes(beforeAvailability,status,Date.now())){const record={...receipt,movieId:entry.id,title:entry.title,id:[entry.id,receipt.type,receipt.key,status.quoteCheckedAt||status.checkedAt].join(':')};if(!hubState.changeReceipts.some(r=>r.id===record.id))hubState.changeReceipts.push(record);}entry.availabilityBaseline={...status};persistHubState();}
    const priorIncluded=typeof entry.lastFreshIncluded==='boolean'?entry.lastFreshIncluded:entry.availabilitySnapshot&&!entry.availabilitySnapshot.stale?HubModel.isIncluded(entry.availabilitySnapshot):null;
    Object.assign(entry,{availabilitySnapshot:lookupMovie.availabilitySnapshot,watchmodeCache:lookupMovie.watchmodeCache,storePriceCache:lookupMovie.storePriceCache,detailsSnapshot:lookupMovie.detailsSnapshot,priceHistory:lookupMovie.priceHistory,runtime:lookupMovie.runtime??entry.runtime,director:lookupMovie.director||entry.director,overview:lookupMovie.overview||entry.overview});
    const fingerprint = status.offers?.map(o=>`${o.kind}:${o.provider}:${o.format || ''}:${o.price ?? ''}`).sort().join('|') || status.label;
    const changed = !status.stale && entry.lastAvailabilityKey != null && entry.lastAvailabilityKey !== fingerprint;
    const prevLabel=entry.lastStatusLabel;
    if (!status.stale) {
      const included=HubModel.isIncluded(status);
      if(priorIncluded===false&&included)entry.includedSince=Date.now();
      entry.lastFreshIncluded=included;
      if(changed || !entry.lastStatusLabel) entry.statusChangedAt=Date.now();
      if(changed)entry.lastChange={at:Date.now(),from:prevLabel,to:status.label};
      entry.lastStatusCode=status.code;entry.lastStatusLabel=status.label;entry.lastAvailabilityKey=fingerprint;
    }
    return {entry,status,changed,prevLabel};
  })).filter(r=>watchlist.some(m=>m.id===r.entry.id));
  if (request !== watchlistRequest) return;
  document.getElementById('card-check-status').textContent=reuse?'Showing saved availability. Check availability to refresh.':'US providers checked '+new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})+(results.some(r=>r.status.stale)?' · '+results.filter(r=>r.status.stale).length+' previous checks':'');
  saveWatchlist();

  paintWatchlist(results);
  document.getElementById('watchlist-load-status').textContent='';
}
function paintWatchlist(results){
  for(const id of ['watch-now','paid','waiting']){document.getElementById(id+'-grid').replaceChildren();document.getElementById(id+'-section').hidden=true;}
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
  document.getElementById('card-summary').textContent=changedCount?changedCount+' changed since your last visit':'';
  window.dispatchEvent(new Event('rewind:card-rendered'));
}
document.getElementById('rental-budget').value=rentalBudget;
document.getElementById('rental-budget').onchange=e=>{const value=Number(e.target.value);if(e.target.value===''||!Number.isFinite(value)||value<0||value>100)return;rentalBudget=value;localStorage.setItem('rewind-rental-budget-v1',String(value));scheduleSync();renderWatchlist(false,true);};
document.getElementById('reset-cost-filter').onclick=()=>{costFilter='all';renderWatchlist(false,true);};
document.querySelectorAll('[data-cost-filter]').forEach(btn=>btn.onclick=()=>{costFilter=btn.dataset.costFilter;renderWatchlist(false,true);});
document.getElementById('sort-select').addEventListener('change',e=>{watchlistSort=e.target.value;renderWatchlist(false,true);});

function renderReleaseFile(movie,status){
 const facts=DiscoveryModel.facts(movie,status,discoveryWindow().today),box=document.createElement('div');box.className='release-file';
 const badge=document.createElement('strong');badge.className='release-stage';badge.textContent=facts.badge;box.appendChild(badge);
 for(const text of [facts.theatrical,facts.home]){const p=document.createElement('p');p.textContent=text.replace(/\d{4}-\d{2}-\d{2}/g,formatFilmDate);box.appendChild(p);}
 if(facts.screening){const p=document.createElement('p');p.className='regional-screening';p.textContent=facts.screening.label+' · '+facts.screening.location+' · '+formatFilmDate(facts.screening.date)+' at '+facts.screening.time+' MT'+(facts.screening.stale?' · previous check':'');box.appendChild(p);}
 const url=HubModel.safeLink(movie.releaseFile.sourceURL);if(url){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=movie.releaseFile.source+(movie.releaseFile.news?.length?' report':' film page');box.appendChild(a);const p=document.createElement('p');p.className='offer-note';p.textContent=(movie.releaseFile.stale?'Previous source check ':'Source checked ')+formatFilmDate(new Date(movie.releaseFile.checkedAt).toISOString().slice(0,10));box.appendChild(p);}for(const news of movie.releaseFile.news||[]){const url=HubModel.safeLink(news.url);if(!url)continue;const p=document.createElement('p'),a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=news.title;p.appendChild(a);box.appendChild(p);}for(const source of movie.releaseFile.releaseSources||[]){if(source.url===movie.releaseFile.sourceURL)continue;const a=document.createElement('a');a.href=HubModel.safeLink(source.url);a.textContent=source.name+' · additional source';a.target='_blank';a.rel='noopener noreferrer';box.appendChild(a);}return box;
}
function updateDiscoveryGuide(){
 const content={recent:['New releases','Recent US theatrical releases, with your strongest connections first.'],coming:['Worth waiting for','Forthcoming films, including first releases abroad. A catalog date does not confirm a Kalispell booking.'],circuit:['Beyond the multiplex','Acquisitions, festival films, small releases, and new restorations. Dates stay attached to their sources.']}[discoveryStage];
 document.querySelector('#tab-discover .count-stamp').textContent='A RELEASE RADAR';document.getElementById('discovery-stage-title').textContent=content[0];document.getElementById('discovery-stage-note').textContent=content[1];
 const search=!!document.getElementById('search-input').value.trim();document.getElementById('discovery-filters').hidden=search||discoveryStage==='circuit';document.getElementById('discover-more').hidden=search||discoveryStage==='circuit';
 for(const id of ['release-month','discover-scope']){document.getElementById(id).hidden=discoveryStage!=='recent';document.querySelector('label[for="'+id+'"]').hidden=discoveryStage!=='recent';}document.getElementById('include-rereleases').closest('label').hidden=discoveryStage!=='recent';
 document.getElementById('discovery-filter-note').textContent=discoveryStage==='coming'?'Future listings may have no runtime, poster, or US date yet. Those gaps stay labeled. Known shorts are excluded.':'Feature films with a US theatrical listing. No minimum rating count. Seen, skipped, and tracked films stay off this shelf.';
 document.querySelectorAll('[data-discovery-stage]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.discoveryStage===discoveryStage)));
}
async function fetchHorizon(){
 if(horizonFeed)return horizonFeed;if(horizonPromise)return horizonPromise;
 horizonPromise=(async()=>{let data;try{const r=await fetch('https://transmissionalbum.netlify.app/.netlify/functions/rewind-horizon');if(!r.ok)throw Error();data=await r.json();if(!Array.isArray(data.items))throw Error();}catch{const r=await fetch('horizon-snapshot.json',{cache:'no-cache'});if(!r.ok)throw Error('Independent listings unavailable');data={...await r.json(),stale:true};}if(!Number.isFinite(data.checkedAt)||Date.now()-data.checkedAt>7*86400000)data.items=[];horizonFeed=data;return data;})();try{return await horizonPromise;}finally{horizonPromise=null;}
}
async function refreshTrackedReleases(){const feed=await fetchHorizon();let changed=false;for(const tracked of watchlist){const row=feed.items.find(m=>m.id===tracked.id);if(!row||!tracked.releaseFile)continue;const file=DiscoveryModel.sourceMovie(row)?.releaseFile;if(file){tracked.releaseFile={...file,screenings:file.screenings.map(r=>({...r,stale:feed.stale||r.stale}))};changed=true;}}if(changed){saveWatchlist();window.dispatchEvent(new Event('rewind:state'));}}
async function rankDiscovery(movies){
 if(typeof Hub!=='undefined')await Hub.loadTasteBaseline();const seeds=HubModel.evidence(hubState.taste);
 const ranked=await mapLimited(movies,4,async movie=>{if(!movie.id)return movie;let meta=movie.meta;try{if(!meta?.credits)meta=await fetchMovieDetails(movie.id);if(!meta?.keywords)meta={...meta,keywords:await tmdbGet('/movie/'+movie.id+'/keywords')};}catch{}const fit=HubModel.affinity({...movie,meta},seeds,hubState.feedback),profileFit=TasteModel.affinity({...movie,meta});return {...movie,meta,profileFit,discoveryFit:HubModel.strongConnection(fit)?fit:null,requestedInterest:movie.id===1599181};});
 if(document.getElementById('discover-sort').value==='taste')ranked.sort((a,b)=>Number(!!b.requestedInterest)-Number(!!a.requestedInterest)||((b.discoveryFit?.score||0)+(b.profileFit?.score||0))-((a.discoveryFit?.score||0)+(a.profileFit?.score||0)));return ranked;
}
function renderSourceLinks(rows){
 const details=document.createElement('details');details.className='source-film-links';const summary=document.createElement('summary');summary.textContent='More release leads ('+rows.length+')';details.appendChild(summary);const note=document.createElement('p');note.textContent='These titles need a verified catalog match before tracking.';details.appendChild(note);for(const row of rows){const a=document.createElement('a');a.href=row.sourceURL||row.releaseFile.sourceURL;a.target='_blank';a.rel='noopener noreferrer';a.textContent=row.title;details.appendChild(a);}return details;
}
async function renderCircuit(request){
 const feed=await fetchHorizon(),grid=document.getElementById('discover-grid');const movies=await rankDiscovery(feed.items.map(DiscoveryModel.sourceMovie).filter(m=>m&&(!m.id||!isSeen(m)&&!skipSet.has(m.id))));if(request!==discoverRequest)return;
 lastDiscoverResults=movies.filter(m=>m.id);grid.replaceChildren();for(const movie of lastDiscoverResults)grid.appendChild(renderCard(movie,{context:'discover'}));const unresolved=movies.filter(m=>!m.id);if(unresolved.length)grid.appendChild(renderSourceLinks(unresolved));
 document.getElementById('discover-status').textContent=movies.length+' release leads · '+(feed.sources?.length?feed.sources.filter(s=>!s.stale).map(s=>s.name).join(', ')+' · ':'')+(feed.stale?'previous check':'source checked '+formatFilmDate(new Date(feed.checkedAt).toISOString().slice(0,10)))+' · refreshed daily';if(!movies.length)grid.textContent='No current independent listings. Search any film above.';updateBrowseDismissControl();
}

// ---------- render: discover ----------

let discoverRequest = 0;
async function renderDiscover(append = false) {
  const request = ++discoverRequest;
  const filter={stage:discoveryStage,window:discoveryWindow(),scope:document.getElementById('discover-scope').value,genre:document.getElementById('discover-genre').value,rereleases:document.getElementById('include-rereleases').checked,sort:document.getElementById('discover-sort').value};
  const statusEl=document.getElementById('discover-status'),loadButton=document.getElementById('discover-more');loadButton.disabled=true;statusEl.textContent=discoveryStage==='circuit'?'Checking independent release listings…':discoveryStage==='coming'?'Finding forthcoming films…':'Finding recent releases…';
  const grid = document.getElementById('discover-grid');
  grid.dataset.stage=discoveryStage;grid.setAttribute('aria-busy','true');if(!append)grid.replaceChildren();
  try{
  if(filter.stage==='circuit'){await renderCircuit(request);return;}
  // always clear any previous empty-state message before deciding whether to show a new one
  grid.querySelectorAll('.empty-note').forEach(el => el.remove());

  const MIN_RESULTS = 12;
  const MAX_PAGES_PER_LOAD = 6; // safety cap so a fully-triaged profile doesn't spam TMDB forever

  let filtered = [];
  let pagesChecked = 0;
  let totalPages = Infinity;

  while (filtered.length < MIN_RESULTS && pagesChecked < MAX_PAGES_PER_LOAD && discoverPage <= totalPages) {
    const data = await fetchDiscover(discoverPage,filter);
    if(discoverPage===1&&filter.stage==='coming'&&filter.sort==='taste'){if(typeof Hub!=='undefined')await Hub.loadTasteBaseline();const seeds=HubModel.evidence(hubState.taste).sort((a,b)=>(Number(!!b.owned)+Number(!!b.favorite)+(b.rating||0))-(Number(!!a.owned)+Number(!!a.favorite)+(a.rating||0))).slice(0,6);const related=await mapLimited(seeds,3,async seed=>{try{return (await tmdbGet('/movie/'+seed.id+'/recommendations')).results||[];}catch{return [];}});data.results=[...new Map([...related.flat().filter(m=>!m.release_date||m.release_date>=filter.window.today),...data.results].map(m=>[m.id,m])).values()];}
    if (request !== discoverRequest) return;
    totalPages = data.total_pages || totalPages;
    const candidates = data.results.filter(m =>
      !isSeen(m) && !skipSet.has(m.id) && !watchlist.some(w => w.id === m.id)
    );
    const verified=await mapLimited(candidates,4,async m=>{try{const details=await fetchMovieDetails(m.id);return filter.stage==='coming'?DiscoveryModel.futureMovie(m,details,filter.window.today,ReleaseModel.addDays(filter.window.today,365)):RewindModel.discoveryMovie(m,details,filter.window,filter.rereleases);}catch{return null;}});
    if(request !== discoverRequest) return;
    filtered=filtered.concat(verified.filter(m=>m&&!isSeen(m)&&!skipSet.has(m.id)&&!watchlist.some(w=>w.id===m.id)));
    pagesChecked++;
    discoverPage++;
  }

  filtered=await rankDiscovery([...new Map(filtered.map(m=>[m.id,m])).values()]);if(request!==discoverRequest)return;
  if(append)filtered=filtered.filter(m=>!lastDiscoverResults.some(prior=>prior.id===m.id));
  lastDiscoverResults = append ? lastDiscoverResults.concat(filtered) : filtered;
  statusEl.textContent=filter.stage==='coming'?lastDiscoverResults.length+' films with forthcoming listings · US and first-release dates are labeled separately':`${lastDiscoverResults.length} films · TMDB-listed US theatrical dates · ${filter.scope==='small'?'smaller releases':'recent feature releases'}`;
  if(!append)grid.replaceChildren();
  filtered.forEach(m => grid.appendChild(renderCard(m, { context: 'discover' })));

  const loadMoreBtn = document.getElementById('discover-more');
  const exhausted = discoverPage > totalPages;
  loadMoreBtn.disabled = exhausted;
  loadMoreBtn.textContent = exhausted ? 'NO MORE MATCHES' : 'MORE FILMS';

  updateBrowseDismissControl();
  if (filtered.length === 0) {
    const note = document.createElement('p');
    note.className = 'empty-note';
    note.textContent = exhausted
      ? "No more matching feature releases in this window. Try another month or genre."
      : "No matches on these pages. Load more, change the month, or include smaller releases.";
    grid.appendChild(note);
  }
  }catch(err){if(request===discoverRequest)statusEl.textContent='Could not load this shelf. Try More films or change a filter.';throw err;}finally{if(request===discoverRequest){grid.setAttribute('aria-busy','false');if(loadButton.textContent!=='NO MORE MATCHES')loadButton.disabled=false;}}
}

document.getElementById('discover-more').addEventListener('click', async () => {
  try {await renderDiscover(true);}catch(err){showToast(err.message);}
});

// ---------- render: search ----------

let searchRequest=0;
document.getElementById('search-form').addEventListener('submit',async e=>{e.preventDefault();const query=document.getElementById('search-input').value.trim();if(!query)return;++discoverRequest;const request=++searchRequest;document.getElementById('search-clear-btn').hidden=false;document.getElementById('discover-grid').hidden=true;document.getElementById('discover-more').hidden=true;document.getElementById('discovery-filters').hidden=true;const grid=document.getElementById('search-grid');grid.hidden=false;grid.textContent='Searching…';try{const results=await searchMovies(query);if(request!==searchRequest)return;lastSearchResults=results.filter(m=>!skipSet.has(m.id));grid.replaceChildren();lastSearchResults.forEach(m=>grid.appendChild(renderCard(m,{context:'search',markSeen:true})));document.getElementById('discover-status').textContent=lastSearchResults.length+' catalog matches';if(!lastSearchResults.length){const note=document.createElement('p');note.className='empty-note';note.textContent='No films found. Try the title without a year or subtitle.';grid.appendChild(note);}}catch{if(request===searchRequest)grid.textContent='Search failed. Try again.';}});
document.getElementById('search-clear-btn').onclick=()=>{searchRequest++;document.getElementById('search-input').value='';document.getElementById('search-grid').hidden=true;document.getElementById('search-clear-btn').hidden=true;document.getElementById('discover-grid').hidden=false;updateDiscoveryGuide();renderDiscoverCached();document.getElementById('discover-status').textContent=lastDiscoverResults.length+' films on this shelf';updateBrowseDismissControl();};
document.getElementById('search-input').addEventListener('search',e=>{if(!e.target.value.trim())document.getElementById('search-clear-btn').click();});
document.querySelectorAll('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.tab-btn').forEach(b=>{b.classList.toggle('active',b===btn);if(b===btn)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id==='tab-'+btn.dataset.tab));if(btn.dataset.tab==='watchlist')renderWatchlist();}));

// ---------- toast ----------

let toastTimer;
function showToast(msg,undo) {
  const el = document.getElementById('toast');
  el.textContent = /failed to fetch/i.test(msg)?'Could not reach the film service. Your saved films are still here. Try Refresh.':msg;
  el.dataset.tone=/failed|unavailable|could not|cannot|error/i.test(msg)?'error':'success';
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
      if(localStorage.getItem(SYNC_DIRTY_KEY))await pushToGist();else await pullFromGist();
      if (statusEl) statusEl.textContent = 'Synced ' + new Date().toLocaleTimeString();
    } catch (e) {
      if (statusEl) {statusEl.dataset.tone='error';statusEl.textContent = 'Could not reach sync. Your changes remain on this device.';}
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
  document.getElementById('email-alert-status').textContent = enabled ? `Daily alerts enabled for ${result.count} films. Alerts follow each film’s selected preference.` : 'Email alerts paused.';
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
    try {const res=await fetch('https://transmissionalbum.netlify.app/.netlify/functions/rewind-status');if(res.ok){const s=await res.json();document.getElementById('price-alert-status').textContent=s.pricesConfigured?'Daily US store price checks are active. Unquoted offers stay unpriced.':'Server price checks are unavailable.';document.getElementById('email-alert-status').textContent=`Daily checks ${s.enabled?'active':'paused'} for ${s.tracked} film${s.tracked===1?'':'s'} on the server. Connect GitHub in Settings to sync this card.`;}}catch {}
    return;
  }
  try {
    const state = await emailRequest('GET');
    document.getElementById('price-alert-status').textContent=state.pricesConfigured?'Daily US store price checks are active. Unquoted offers stay unpriced.':'Server price checks are unavailable.';
    emailEnabled = state.enabled;
    document.getElementById('email-alert-status').textContent = state.enabled ? `Daily alerts enabled for ${state.movies.length} films.` : 'Email alerts paused. Enable alerts for your watchlist.';
    // Opening a device must not replace the server's card with stale local data.
  } catch (err) { document.getElementById('email-alert-status').textContent = err.message; }
}
renderServiceSettings();
document.getElementById('refresh-card-btn').onclick=async()=>{const btn=document.getElementById('refresh-card-btn');btn.disabled=true;try{await renderWatchlist(true);}catch(err){showToast(err.message);}finally{btn.disabled=false;}};
init().then(initEmailAlerts);

document.querySelectorAll('[data-discovery-stage]').forEach(button=>button.onclick=()=>{searchRequest++;document.getElementById('search-input').value='';document.getElementById('search-clear-btn').hidden=true;document.getElementById('search-grid').hidden=true;document.getElementById('discover-grid').hidden=false;discoveryStage=button.dataset.discoveryStage;discoverPage=1;updateDiscoveryGuide();renderDiscover().catch(e=>showToast(e.message));});
updateDiscoveryGuide();
