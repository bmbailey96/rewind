/* Shared movie / television routing. Private answers stay in the existing synced hub state. */
const RewindMedia=(()=>{
 const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
 const today=()=>discoveryWindow().today;
 let filter='all',browseToken=0,extraRows=[],refreshTimer=null,seedFlight=null;
 try{const p=JSON.parse(localStorage.getItem('rewind-ui-v1')||'{}');if(['all','movie','tv'].includes(p.mediaType))filter=p.mediaType;}catch{}
 const button=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b;};
 function linkedTitle(m){const known=MediaModel.seriesForFilm(m);if(known)return known;const year=String(m?.year||m?.release_date||'').slice(0,4),title=MediaModel.norm(m?.title);if(!year||!title)return null;const hits=(hubState.seriesRecords||[]).filter(r=>r.letterboxdURL&&((m.letterboxdURL&&m.letterboxdURL.replace(/\/$/,'')===r.letterboxdURL.replace(/\/$/,''))||MediaModel.norm(MediaModel.clean(r.title))===title&&String(TV.seed(r.title)?.catalog?.seasons?.find(s=>s.number===1)?.date||'').startsWith(year)));const names=[...new Set(hits.map(r=>r.title))];return names.length===1?names[0]:null;}
 const isTV=m=>MediaModel.type(m)==='tv'||!!linkedTitle(m);
 const clean=MediaModel.clean;
 function groups(){
  const map=new Map(TV.groupRows().map(g=>[g.id,{...g,seasons:[...g.seasons],legacy:[...g.legacy]}]));
  for(const m of [...watchlist,...hubState.taste]){
   const title=linkedTitle(m);if(!title)continue;
   const matches=[...map.values()].filter(g=>MediaModel.norm(clean(g.title))===MediaModel.norm(title));
   const id=matches.length===1?matches[0].id:TVModel.seriesKey(title);
   const g=map.get(id)||{id,title,seasons:[],legacy:[],intent:false};
   g.alias={...g.alias,...m};if(watchlist.some(w=>w.id===m.id)){g.intent=true;g.fromLetterboxd=true;}
   if((m.rating!=null||m.owned||m.favorite||m.rewatches>1)&&!g.legacy.some(r=>r.source==='Letterboxd linked entry'))g.legacy.push({id:id+':letterboxd',title,season:null,status:'watched',rating:m.rating??null,owned:!!m.owned,favorite:!!m.favorite,rewatches:m.rewatches||0,source:'Letterboxd linked entry',letterboxdURL:m.letterboxdURL});
   map.set(id,g);
  }
  return [...map.values()];
 }
 function group(m){
  const title=linkedTitle(m),id=typeof m==='string'?m:m.id;
  return groups().find(g=>g.id===String(id).split(':evidence:')[0]||title&&MediaModel.norm(clean(g.title))===MediaModel.norm(title))||
   {id:typeof id==='string'&&id.startsWith('tv:')?id:TVModel.seriesKey(title||m.title||m.name),title:title||m.title||m.name||'TV series',seasons:[],legacy:[],intent:false};
 }
 function next(g){return MediaModel.nextSeason(g,TV.catalogFor(g),today());}
 function status(g){
  const cache=TV.cached(g.id),target=next(g),future=target?.date>today();
  const stale=!cache?.checkedAt||Date.now()-cache.checkedAt>24*3600000;
  const offers=future?[]:[...(g.alias?.owned?HubModel.shelfStatus(g.alias).offers:[]),...(cache?.providers||[]).map(p=>({kind:'subscription',provider:p.name,included:RewindModel.included(p.name,myServices),link:HubModel.safeLink(cache.providerURL)||'https://www.themoviedb.org/tv/'+cache.tmdbId}))];
  const summary=offers.length?RewindModel.summary(offers):{code:'nodata',kind:'unknown',label:future?'Season '+target.number+' not released':'Streaming not checked'};
  return {...summary,offers,stale,checkedAt:cache?.checkedAt||null,mediaType:'tv'};
 }
 function asMedia(g){
  const cache=TV.cached(g.id),d=cache?.detail||{},target=next(g),first=(MediaModel.norm(clean(g.title))==='twinpeaksthereturn'?TV.catalogFor(g).find(s=>s.number===1)?.date:null)||d.first_air_date||TV.catalogFor(g).find(s=>s.number===1)?.date||g.alias?.release_date||'';
  const genres=d.genres?.length?d.genres:(d.genre_ids||[]).map(id=>({id,name:({18:'Drama',35:'Comedy',16:'Animation',99:'Documentary',80:'Crime',9648:'Mystery',10765:'Sci-Fi & Fantasy',10759:'Action & Adventure'})[id]||''}));
  const keywords={keywords:d.keywords?.results||d.keywords?.keywords||[]};
  return {id:g.id,mediaType:'tv',tmdbId:cache?.tmdbId||d.id,title:g.title,first_air_date:first,release_date:target?.date||first,poster_path:d.poster_path||g.alias?.poster_path,backdrop_path:d.backdrop_path,overview:d.overview||g.alias?.overview||'',runtime:d.episode_run_time?.[0]||d.last_episode_to_air?.runtime||null,genre_ids:MediaModel.movieGenres(genres),meta:{...d,genres,keywords,runtime:d.episode_run_time?.[0]||d.last_episode_to_air?.runtime||null},pinned:!!cache?.pinned,followRelease:(hubState.seriesFollows||[]).includes(g.id),addedAt:Math.max(0,...[...g.seasons,...g.legacy].map(r=>r.updatedAt||0)),availabilitySnapshot:status(g),letterboxdURL:g.alias?.letterboxdURL||g.legacy.find(r=>r.letterboxdURL)?.letterboxdURL};
 }

 function registration(scope='all'){
  return groups().filter(g=>scope==='release'?(hubState.seriesFollows||[]).includes(g.id):g.intent||(hubState.seriesFollows||[]).includes(g.id)||MediaModel.positiveRecords(g).length).flatMap(g=>{
   const c=TV.cached(g.id),target=next(g)||{number:Math.max(0,...TV.catalogFor(g).map(s=>s.number),...g.seasons.map(r=>r.season||0))+1};if(!Number.isSafeInteger(c?.tmdbId)||target.number>100)return [];
   const count=target.scope?.match(/(?:episodes?|ep)\s*(\d+)/i)?.[1];const episode=target.partial&&count?Number(count):null;
   return [{id:g.id,tmdbId:c.tmdbId,title:g.title,followRelease:(hubState.seriesFollows||[]).includes(g.id),season:MediaModel.norm(clean(g.title))==='twinpeaksthereturn'?3:target.number,episode}];
  });
 }
 function receiveSnapshots(rows){
  let changed=false;
  for(const c of rows||[]){
   if(c?.mediaType!=='tv'||!String(c.id).startsWith('tv:')||!Number.isSafeInteger(c.tmdbId)||c.detail?.id!==c.tmdbId||!Array.isArray(c.detail.seasons)||!Array.isArray(c.providers)||!c.checkedAt||c.checkedAt>Date.now()||c.checkedAt<=(TV.cached(c.id)?.checkedAt||0)||!groups().some(g=>g.id===c.id))continue;
   const old=TV.cached(c.id);hubState.seriesCatalog=(hubState.seriesCatalog||[]).filter(r=>r.id!==c.id);hubState.seriesCatalog.push({...c,pinned:old?.pinned||false});changed=true;
  }
  if(changed){persistHubState();window.dispatchEvent(new Event('rewind:tv-state'));}
  return changed;
 }

 function accepts(m){return filter==='all'||isTV(m)===(filter==='tv');}
 function select(items){return (items||[]).filter(accepts).map(m=>isTV(m)&&!String(m.id).startsWith('tv:')?asMedia(group(m)):m);}
 function savedTV(scope='all'){return groups().filter(g=>scope==='release'?(hubState.seriesFollows||[]).includes(g.id):g.intent||(hubState.seriesFollows||[]).includes(g.id)).map(asMedia);}
 function collection(items=watchlist,scope='all'){return [...new Map([...select(items).filter(m=>!isTV(m)),...savedTV(scope).filter(accepts)].map(m=>[m.id,m])).values()];}
 function evidence(){return groups().flatMap(g=>MediaModel.positiveRecords(g).map(r=>({...asMedia(g),id:g.id+':evidence:'+(r.season||'series'),title:g.title+(r.season?' · season '+r.season:''),rating:r.rating,release_date:TV.catalogFor(g).find(s=>s.number===r.season)?.date||asMedia(g).first_air_date,owned:!!r.owned,favorite:!!r.favorite,rewatches:r.rewatches||0,scope:r.scope,source:r.source})));}
 async function seeds(){if(seedFlight)return seedFlight;seedFlight=(async()=>{await TV.ready;const candidates=groups().filter(g=>MediaModel.positiveRecords(g).length&&!TV.cached(g.id)?.detail?.credits).slice(0,4);await mapLimited(candidates,2,async g=>{try{await TV.check(g);}catch{}});return evidence();})().finally(()=>{seedFlight=null;});return seedFlight;}
 function unseen(m){if(!isTV(m))return false;const g=group(m);return !g.seasons.some(r=>r.status==='watched')||!!next(g);}
 function playable(m){if(!isTV(m))return true;const g=group(m),n=next(g);return unseen(m)&&!(n?.date>today());}
 function save(){persistHubState();scheduleSync();window.dispatchEvent(new Event('rewind:tv-state'));TV.render();}
 function add(m){const g=group(m);if(!g.intent){hubState.seriesRecords=TVModel.merge(hubState.seriesRecords,[{id:g.id+':series:intent',seriesId:g.id,title:g.title,season:null,status:'watchlist',scope:'Series',rating:null,partial:false,source:'Rewind watchlist'}]);save();}showToast(g.title+' saved');}
 function follow(m,on=true){const g=group(m),ids=new Set(hubState.seriesFollows||[]);if(on)ids.add(g.id);else ids.delete(g.id);hubState.seriesFollows=[...ids];if(on&&!g.intent)add(m);save();}
 function remove(id){const g=group(id);if(g.fromLetterboxd&&g.alias)watchlist=watchlist.filter(m=>!MediaModel.seriesForFilm(m)||MediaModel.norm(MediaModel.seriesForFilm(m))!==MediaModel.norm(clean(g.title)));hubState.seriesRecords=(hubState.seriesRecords||[]).map(r=>r.seriesId===g.id&&r.status==='watchlist'?{...r,status:'unseen',rating:null,updatedAt:Date.now()}:r);hubState.seriesFollows=(hubState.seriesFollows||[]).filter(x=>x!==g.id);saveWatchlist(false);save();showToast(g.title+' removed from watchlist; ratings kept');}
 function pin(id){const g=group(id),c=TV.cached(g.id)||{id:g.id,mediaType:'tv'};c.pinned=!c.pinned;hubState.seriesCatalog=[...(hubState.seriesCatalog||[]).filter(x=>x.id!==g.id),c];save();}
 async function hydrate(m,force=false){const g=group(m),c=TV.cached(g.id);if(force||!c?.checkedAt||Date.now()-c.checkedAt>6*3600000)await TV.check(g);return asMedia(group(m));}
 async function recommendations(seed){if(isTV(seed)){const full=await hydrate(seed);return full.tmdbId?(await tmdbGet('/tv/'+full.tmdbId+'/recommendations')).results?.map(r=>asMedia(TV.fromResult(r)))||[]:[];}return (await tmdbGet('/movie/'+seed.id+'/recommendations')).results||[];}
 function recordProgress(m){const g=group(m);TV.open(g.id);const host=$('tv-grid').querySelector('article')||$('tv-grid');TV.edit(g,host);}
 function typeBadge(m){const tv=isTV(m),badge=el('span',tv?'▣ TV SERIES':'▤ MOVIE','media-type-badge '+(tv?'tv':'movie'));badge.setAttribute('aria-label',tv?'TV series':'Movie');return badge;}
 function tvCard(m,opts={}){
  const g=group(m),full=asMedia(g),c=el('article',null,'rental-card compact-film-card integrated-tv-card');c.dataset.movieId=g.id;c.dataset.mediaType='tv';
  const poster=el(full.poster_path?'img':'div',full.poster_path?null:'NO POSTER','card-poster'+(full.poster_path?'':' poster-missing'));if(full.poster_path){poster.src=posterUrl(full.poster_path);poster.alt='';poster.loading='lazy';}
  c.append(poster,el('h3',g.title,'card-title'));const meta=el('p',null,'card-meta');meta.append(typeBadge(full),document.createTextNode(' · '+((full.first_air_date||'').slice(0,4)||'Year unlisted')));c.append(meta);
  const n=next(g),progress=n?(n.partial?'Continue season '+n.number:'Next: season '+n.number):g.seasons.length?'Caught up with recorded seasons':'Season history unconfirmed';
  c.append(el('p',progress,'card-director'));
  const current=opts.status||status(g),cost=opts.collectionCost||ReleaseModel.cost(current.offers,rentalBudget,current.stale);c.append(renderCostHeadline(cost));
  if(n?.partial)c.append(el('p',n.scope,'tv-progress'));
  if(g.seasons.length){const strip=el('div',null,'tv-seasons');for(const r of g.seasons)strip.append(el('span','S'+r.season+' · '+(r.partial?'partly watched':r.status==='watched'?(r.rating==null?'watched':r.rating+' ★'):r.status==='watchlist'?'watchlist':'not watched')));c.append(strip);}
  const dates=TV.eventsFor(g);if(dates.length)c.append(el('p',dates.slice(0,2).map(e=>formatFilmDate(e.date)+' · '+e.label).join(' / '),'tv-release-note'));
  if(!current.stale&&current.offers.length)c.append(el('p','Series-level streaming listing. Confirm the season you need on the service.','offer-note'));
  const actions=el('div',null,'card-actions'),following=(hubState.seriesFollows||[]).includes(g.id);
  const followButton=button(following?'FOLLOWING RELEASES':'FOLLOW RELEASES',()=>follow(full,!following));followButton.setAttribute('aria-pressed',String(following));actions.append(followButton);
  if(!g.intent)actions.append(button('SAVE',()=>add(full)));
  const details=button('Details, seasons & viewing options',()=>{
   const body=el('div',null,'tv-detail-body');
   openFilmDetails(full,body,details,async()=>{
    body.replaceChildren(el('p','Checking series and seasons…'));
    try{const checked=await hydrate(full),updated=group(checked),s=status(updated);body.replaceChildren(typeBadge(checked),el('p',checked.overview),el('p','Ratings and progress are saved per season.'));
     const providers=el('div',null,'tv-provider-links');for(const offer of s.offers){const a=el('a',offer.provider+(offer.included?' · your service':''));a.href=offer.link;a.target='_blank';a.rel='noopener noreferrer';providers.append(a);}body.append(providers,el('p',s.offers.length?'Listings describe the series; the needed season may differ.':'No subscription listing returned. This does not establish that the show is unavailable.','offer-note'));
     for(const event of TV.eventsFor(updated))body.append(el('p',formatFilmDate(event.date)+' · '+event.label));
     body.append(button('Rate / update season progress',()=>TV.edit(updated,body)));
     if(checked.letterboxdURL&&HubModel.safeLink(checked.letterboxdURL)){const a=el('a','Linked Letterboxd entry ↗');a.href=checked.letterboxdURL;a.target='_blank';a.rel='noopener noreferrer';body.append(a);}
     if(updated.intent)body.append(button('Remove from watchlist',()=>{remove(updated.id);$('film-detail-dialog')?.close();}));
     body.append(button('Recheck streaming',async()=>{await hydrate(checked,true);details.click();}));
    }catch(e){body.replaceChildren(el('p',e.message),button('Try again',()=>details.click()));}
   });
  });details.className='film-details-trigger';details.setAttribute('aria-haspopup','dialog');
  c.append(actions,details);if(opts.context==='watchlist')c.append(button(full.pinned?'Unpin series':'Pin series',()=>pin(g.id)));
  return c;
 }
 async function tvBrowse(stage='recent',page=1,query=''){
  await TV.ready;let results=[];
  if(query)results=(await tmdbGet('/search/tv',{query,page})).results||[];
  else if(stage==='coming'){const end=ReleaseModel.addDays(today(),180);results=(await tmdbGet('/discover/tv',{'first_air_date.gte':today(),'first_air_date.lte':end,sort_by:'popularity.desc',page})).results||[];}
  else if(stage==='circuit'){results=(await tmdbGet('/discover/tv',{sort_by:'vote_average.desc','vote_count.gte':25,page})).results||[];}
  else {const feeds=await Promise.all([tmdbGet('/tv/on_the_air',{page}),tmdbGet('/trending/tv/week',{page})]);results=feeds.flatMap(r=>r.results||[]);}
  const saved=new Set(savedTV().map(m=>m.id));let movies=[...new Map(results.filter(r=>r.id&&typeof r.name==='string').map(r=>{const m=asMedia(TV.fromResult(r));return [m.id,m];})).values()];
  if(!query){if(stage==='coming')movies.push(...groups().map(asMedia).filter(m=>TV.eventsFor(group(m)).length));movies=movies.filter(m=>!saved.has(m.id)&&unseen(m)&&!skipSet.has(m.id));}
  const genre=Number($('discover-genre')?.value||0);if(genre&&!query)movies=movies.filter(m=>m.genre_ids.includes(genre)||(genre===27||genre===53)&&new RegExp(genre===27?'horror':'thriller','i').test((m.meta.keywords?.keywords||[]).map(k=>k.name).join(' ')));
  return [...new Map(movies.map(m=>[m.id,m])).values()];
 }
 function paintTVBrowse(rows,append=false){const grid=$('discover-grid');if(!append)for(const c of grid.querySelectorAll('[data-media-type=tv]'))c.remove();const existing=new Set([...grid.querySelectorAll('[data-media-type=tv]')].map(c=>c.dataset.movieId));for(const m of rows)if(!existing.has(m.id))grid.append(renderCard(m,{context:'discover'}));}
 function labelControls(){
  document.querySelectorAll('[data-media-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mediaFilter===filter)));
  const search=$('search-input');search.placeholder=filter==='tv'?'Any TV series…':filter==='movie'?'Any movie…':'Find a movie or TV series…';
  $('discover-more').textContent='MORE TITLES';$('pick-again').textContent='PICK ANOTHER';if($('pick-film').textContent==='PICK A FILM')$('pick-film').textContent='PICK A TITLE';for(const id of ['picker-intro','picker-status']){const n=$(id);if(n&&filter!=='movie')n.textContent=n.textContent.replace(/\bfilms\b/g,'titles').replace(/\bfilm\b/g,'title');}
 }
 function changed(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{renderWatchlist(false,true).catch(()=>{});if(typeof Hub!=='undefined')Hub.stateChanged();},120);}
 function setFilter(value){
  if(!['all','movie','tv'].includes(value))return;filter=value;let p={};try{p=JSON.parse(localStorage.getItem('rewind-ui-v1')||'{}')||{};}catch{}p.mediaType=filter;localStorage.setItem('rewind-ui-v1',JSON.stringify(p));scheduleSync();labelControls();
  ++discoverRequest;++searchRequest;watchlistLimit=WATCHLIST_PAGE_SIZE;changed();window.dispatchEvent(new Event('rewind:media-filter'));
  if($('tab-discover').classList.contains('active')&&$('hub-picker').hidden){if($('search-input').value.trim())$('search-form').dispatchEvent(new Event('submit',{cancelable:true}));else renderDiscover().catch(()=>{});}
  if(typeof Hub!=='undefined')Hub.mediaChanged?.();
 }
 // Route shared entry points, while retaining the original movie implementation.
 const originalCard=renderCard;renderCard=(m,opts={})=>{if(isTV(m))return tvCard(m,opts);const c=originalCard(m,opts);c.dataset.mediaType='movie';const meta=c.querySelector('.card-meta');if(meta)meta.prepend(typeBadge(m),document.createTextNode(' · '));return c;};
 const originalSeen=isSeen;isSeen=m=>isTV(m)?!unseen(m):originalSeen(m);
 const originalDetails=fetchMovieDetails;fetchMovieDetails=async(id,force=false)=>{if(!String(id).startsWith('tv:'))return originalDetails(id,force);const full=await hydrate(group(id),force);return {...full.meta,...full,genres:full.meta.genres,credits:full.meta.credits,keywords:full.meta.keywords};};
 const originalStatus=deriveStatus;deriveStatus=async(m,force=false)=>isTV(m)?(await hydrate(m,force)).availabilitySnapshot:originalStatus(m,force);
 const originalAdd=addToWatchlist;addToWatchlist=(m,...args)=>isTV(m)?add(m):originalAdd(m,...args);
 const originalFollow=followReleaseFilm;followReleaseFilm=(m,...args)=>isTV(m)?follow(m,true):originalFollow(m,...args);
 const originalUnfollow=unfollowReleaseFilm;unfollowReleaseFilm=id=>String(id).startsWith('tv:')?follow(group(id),false):originalUnfollow(id);
 const originalRemove=removeFromWatchlist;removeFromWatchlist=id=>String(id).startsWith('tv:')?remove(id):originalRemove(id);
 const originalWatched=markMovieWatched;markMovieWatched=m=>isTV(m)?recordProgress(m):originalWatched(m);
 const originalPin=togglePin;togglePin=id=>String(id).startsWith('tv:')?pin(id):originalPin(id);
 const originalScope=scopedWatchlist;scopedWatchlist=()=>collection(originalScope(),watchlistScope);
 const originalSearch=searchMovies;searchMovies=async query=>{const jobs=await Promise.allSettled([filter==='tv'?Promise.resolve([]):originalSearch(query),filter==='movie'?Promise.resolve([]):tvBrowse('recent',1,query)]);const movies=jobs[0].status==='fulfilled'?jobs[0].value.filter(m=>!isTV(m)):[],series=jobs[1].status==='fulfilled'?jobs[1].value:[];if(jobs.every(r=>r.status==='rejected'))throw Error('Search unavailable');return select([...movies,...series]);};
 const originalRank=rankDiscovery;rankDiscovery=async movies=>{const ranked=await originalRank(movies),positive=[...HubModel.evidence(hubState.taste).filter(m=>!isTV(m)),...evidence()];const enhanced=ranked.map(m=>{const fit=HubModel.affinity(m,positive,hubState.feedback);return {...m,discoveryFit:HubModel.strongConnection(fit)?fit:m.discoveryFit};});return $('discover-sort').value==='taste'?enhanced.sort((a,b)=>(b.discoveryFit?.score||0)-(a.discoveryFit?.score||0)):enhanced;};
 const originalDiscover=renderDiscover;renderDiscover=async(append=false)=>{
  const token=++browseToken,type=filter;
  if(type==='tv'){++discoverRequest;if(!append){discoverPage=1;$('discover-grid').replaceChildren();}const status=$('discover-status');status.textContent='Finding TV series…';try{const list=await tvBrowse(discoveryStage,discoverPage);if(token!==browseToken)return;discoverPage++;extraRows=append?[...extraRows,...list]:list;paintTVBrowse(list,true);status.textContent=extraRows.length+' TV series · streaming and season dates are checked in Details.';$('discover-more').hidden=false;$('discover-more').disabled=!list.length;labelControls();}catch{status.textContent='TV discovery could not refresh. Your saved seasons are still available.';}return;}
  await originalDiscover(append);
  if(type==='all'){try{const list=await tvBrowse(discoveryStage,Math.max(1,append?discoverPage-1:1));if(token!==browseToken||filter!=='all')return;extraRows=append?[...extraRows,...list]:list;paintTVBrowse(list,true);$('discover-status').textContent+=' · '+list.length+' TV series';}catch{}}
  if(token===browseToken)labelControls();
 };
 const originalCached=renderDiscoverCached;renderDiscoverCached=()=>{if(filter!=='tv')originalCached();else $('discover-grid').replaceChildren();if(filter!=='movie')paintTVBrowse(extraRows.filter(m=>!skipSet.has(m.id)&&unseen(m)));};
 window.addEventListener('rewind:tv-state',changed);window.addEventListener('rewind:state',()=>{labelControls();changed();});
 document.querySelectorAll('[data-media-filter]').forEach(b=>b.onclick=()=>setFilter(b.dataset.mediaFilter));
 const originalWatchlist=renderWatchlist;renderWatchlist=async(...args)=>{const result=await originalWatchlist(...args);const all=collection(),scope=scopedWatchlist();$('watchlist-count').textContent=all.length+' saved titles · '+all.filter(isTV).length+' TV series';$('watchlist-empty').hidden=all.length>0;$('watchlist-scope-note').textContent=watchlistScope==='release'?'Movie and TV releases you follow. Season ratings and progress stay with each series.':'Your saved movies and TV series.';labelControls();return result;};
 async function refreshTV(limit=12,force=false){await TV.ready;const selected=groups().filter(g=>(g.intent||(hubState.seriesFollows||[]).includes(g.id)||MediaModel.positiveRecords(g).length)&&(force||!TV.cached(g.id)?.checkedAt||Date.now()-TV.cached(g.id).checkedAt>6*3600000)).sort((a,b)=>Number(!!TV.cached(a.id)?.checkedAt)-Number(!!TV.cached(b.id)?.checkedAt)).slice(0,limit);await mapLimited(selected,2,async g=>{try{await TV.check(g);}catch{}});changed();}
 $('refresh-card-btn').addEventListener('click',()=>{if(filter!=='movie')refreshTV(12,true).catch(()=>{});});
 document.querySelectorAll('[data-calendar-source=digital]').forEach(b=>b.addEventListener('click',()=>refreshTV().catch(()=>{})));
 $('cinema-refresh').addEventListener('click',()=>{if(document.querySelector('[data-calendar-source=digital][aria-pressed=true]'))refreshTV(12,true).catch(()=>{});});
  const tvNews=el('section',null,'tv-news-updates');tvNews.id='tv-news-updates';tvNews.hidden=true;tvNews.append(el('h3','TV release updates'),el('p','Catalog-listed series and season premieres. Open a title for its dated sources.','offer-note'));const tvNewsGrid=el('div',null,'card-row wrap');tvNews.append(tvNewsGrid);$('movie-news-panel').append(tvNews);
 async function news(){tvNews.hidden=filter==='movie';$('movie-news-grid').hidden=filter==='tv';if(filter==='movie')return;tvNewsGrid.textContent='Checking TV release dates…';try{await refreshTV(8);const rows=[...new Map([...(await tvBrowse('coming')),...groups().filter(g=>TV.eventsFor(g).length&&(g.intent||(hubState.seriesFollows||[]).includes(g.id)||MediaModel.positiveRecords(g).length)).map(asMedia)].map(m=>[m.id,m])).values()];tvNewsGrid.replaceChildren();for(const movie of rows.slice(0,12))tvNewsGrid.append(tvCard(movie,{context:'discover'}));if(!rows.length)tvNewsGrid.append(el('p','No dated TV premieres returned. Saved series stay available in your collection.'));}catch{tvNewsGrid.textContent='TV release updates could not refresh.';}}
 document.querySelector('[data-find-mode=news]').addEventListener('click',news);
 window.addEventListener('rewind:media-filter',()=>{if(!$('movie-news-panel').hidden)news();});

 labelControls();TV.ready.then(changed);
 return {registration,receiveSnapshots,isTV,accepts,select,filter:()=>filter,setFilter,collection,groups,group,next,status,asMedia,evidence,seeds,hydrate,recommendations,playable,tvBrowse,typeBadge,tvCard,changed,savedTV,
 recordProgress,calendarRows:()=>groups().filter(g=>g.intent||(hubState.seriesFollows||[]).includes(g.id)||MediaModel.positiveRecords(g).length).flatMap(g=>TV.eventsFor(g).map(e=>({id:g.id+':'+e.date+':'+e.label,title:g.title,kind:'stream',mediaType:'tv',seriesId:g.id,theatrical:false,dates:[e.date],ranges:[],start:e.date,end:e.date,label:e.label,platform:'',sourceKind:'tv',certainty:'Listed',film:{id:g.id},art:TV.cached(g.id)?.detail,url:e.url,followed:true}))).filter(r=>accepts(r)&&!hubState.hidden.includes(r.id)),modeChanged:()=>labelControls()};
})();
