// The shared counter. Film state remains in app.js and its original storage keys.
const Hub = (()=>{
 const $=id=>document.getElementById(id),today=()=>discoveryWindow().today,addDays=(d,n)=>ReleaseModel.addDays(d,n);
 function node(tag,text,className){const el=document.createElement(tag);if(text!=null)el.textContent=text;if(className)el.className=className;return el;}
 function link(text,url,className){const a=node('a',text,className);a.href=HubModel.safeLink(url)||'#';a.target='_blank';a.rel='noopener noreferrer';return a;}
 function button(text,fn,className='secondary'){const b=node('button',text,className);b.type='button';b.onclick=fn;return b;}
 function save(){persistHubState();scheduleSync();}
 let cinema=null,findMode='shelf',anchor=today(),calendarView='calendar',openCalendarEvent=null,visibilityClock=0,currentPick=null,dealt=new Set(),banished=[],pickRequest=0,cinemaPromise=null;
 let calendarSource='kalispell';
 let cinemaLoadedWeek=null;const cinemaWeeks=new Map();
 let snapshotPromise=null;const cinemaSnapshot=()=>snapshotPromise||(snapshotPromise=fetch('cinema-snapshot.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Snapshot unavailable');return r.json();}).catch(err=>{snapshotPromise=null;throw err;}));
 const venueName=r=>r.venueId==='roxy'?'Roxy · Missoula':'Cinemark · Kalispell';
 const calendarChannel=r=>r.kind==='local'?(r.venueId==='roxy'?'roxy':'theater'):r.regional?'theater':r.kind==='stream'&&!r.theatrical?'digital':'national';
 const channelLabel=r=>r.kind==='local'?venueName(r):r.regional?'Regional screening · Missoula':r.kind==='stream'&&!r.theatrical?'Digital'+(r.platform?' · '+r.platform:''):r.theatrical?'US theatrical date':'National event';
 function channelBadge(r){const badge=node('span',channelLabel(r),'release-channel '+calendarChannel(r));if(typeof RewindMedia!=='undefined')badge.prepend(RewindMedia.typeBadge(r),document.createTextNode(' · '));return badge;}
 const cinemaArt=new Map(),artPending=new Set(),sessionHiddenTheaters=[];let baselinePromise=null,lastAside=null;
 function loadTasteBaseline(){if(baselinePromise)return baselinePromise;baselinePromise=(async()=>{try{const r=await fetch('taste-baseline.json',{cache:'no-cache'});if(!r.ok)throw Error();const baseline=await r.json();if(!Array.isArray(baseline.taste)||!Array.isArray(baseline.seen))throw Error();hubState.taste=HubModel.mergeRecords(baseline.taste.filter(m=>!hubState.ignoredTaste?.includes(m.id)).map(m=>hubState.ignoredOwnership.includes(m.id)?{...m,owned:false,physicalFormats:[]}:m),hubState.taste);for(const m of baseline.seen)seenSet.add(seenKey(m.title,m.year));saveSeenSet();persistHubState();hubState.profileSource=baseline.source;renderTaste();$('taste-status').textContent=baseline.taste.length+' connected positive ratings · '+baseline.seen.length+' watched exclusions · local imports take precedence';}catch{$('taste-status').textContent='Published taste profile could not refresh. Your imported records remain available.';}})();return baselinePromise;}
 function filmFor(event){return [...watchlist,...hubState.taste].find(m=>HubModel.matchEvent(event,m));}

 function visibilityTime(){refreshTheaterState();visibilityClock=Math.max(Date.now(),visibilityClock+1,...hubState.theaterHideRestores.map(r=>r.at||0),...hubState.hiddenTheaterFilms.map(r=>r.createdAt||0));return ++visibilityClock;}
 function restoreTheater(identity,permanent){
  if(permanent){const at=visibilityTime();hubState.hiddenTheaterFilms=hubState.hiddenTheaterFilms.filter(r=>!HubModel.sameTheaterFilm(r,identity));hubState.theaterHideRestores.push({...identity,at});save();}
  else for(let i=sessionHiddenTheaters.length-1;i>=0;i--)if(HubModel.sameTheaterFilm(sessionHiddenTheaters[i],identity))sessionHiddenTheaters.splice(i,1);
  renderCalendar();
 }
 function hideTheater(r,permanent){
  // Home release dates are independent of a theater's listings. Hide only this dated
  // digital entry rather than hiding the whole film and every future store arrival.
  if(r.kind==='stream'&&!r.theatrical){
   if(!hubState.hidden.includes(r.id))hubState.hidden.push(r.id);
   save();openCalendarEvent=null;$('event-detail').hidden=true;renderCalendar();
   showToast('Hidden digital date for '+r.title,()=>{hubState.hidden=hubState.hidden.filter(id=>id!==r.id);save();renderCalendar();});
   return;
  }
  const identity={...HubModel.theaterIdentity(r,cinemaArt.get(r.id)||r.art||r.film),createdAt:visibilityTime()};identity.key=identity.id?'tmdb:'+identity.id:'title:'+HubModel.norm(identity.title)+':'+identity.year;
  const bucket=permanent?hubState.hiddenTheaterFilms:sessionHiddenTheaters;
  if(!bucket.some(x=>HubModel.sameTheaterFilm(x,identity)))bucket.push(identity);
  if(permanent)save();openCalendarEvent=null;$('event-detail').hidden=true;renderCalendar();
  showToast(r.title+(permanent?' hidden permanently':' hidden for this visit'),()=>restoreTheater(identity,permanent));
 }
 function calendarNote(r){return r.regional?'LISTED REGIONAL SCREENING':r.recommended?'FOR YOU · '+r.reason:r.film?.pinned?'PINNED':r.film&&watchlist.some(m=>m.id===r.film.id)?'ON YOUR WATCHLIST':r.favorite?'FROM YOUR POSITIVE RECORDS':r.kind==='local'?'LOCAL LISTING':r.kind==='event'?'NATIONAL EVENT · local tickets unconfirmed':r.theatrical?'US RELEASE DATE':'TRACKED RELEASE';}
 function calendarCardNote(r){
  if(r.regional)return 'Regional screening · Missoula · '+(r.label||'Open source for details');
  if(r.kind==='stream'){
   if(r.theatrical)return 'US theatrical date · Kalispell screenings not confirmed';
   if(r.mediaType==='tv')return r.label+' · TV series · '+r.start;
   const platform=r.platform?'On '+r.platform:'Store/platform not listed';
   const cost=r.announcementKind==='subscription'?'Subscription listing · Rental price not listed':'Price not listed';
   return (r.certainty==='Announced'?'Announced digital date':'Listed digital date')+' · '+platform+' · '+cost;
  }
  if(r.kind==='event')return 'National event · Kalispell tickets not confirmed';
  return venueName(r)+(r.screenings?.length?' · Tap a date for showtimes':' · Exact times not supplied');
 }
 function directCalendarActions(r,container){
  if(r.mediaType==='tv'){container.appendChild(button('OPEN TV',()=>TV.open(r.seriesId)));return;}
  const actions=node('div',null,'calendar-film-actions'),identityFilm=cinemaArt.get(r.id)||r.art||r.film,savedFilm=identityFilm&&watchlist.find(m=>m.id===identityFilm.id),tracked=!!savedFilm||hubState.followed.includes(r.id);
  const track=button(tracked?'On watchlist':'Add to watchlist',async()=>{if(tracked)return;track.disabled=true;try{let film=identityFilm;if(!film){await resolveCinemaArt(r,true);film=cinemaArt.get(r.id);}if(film?.id)addToWatchlist(film,{origin:'calendar'});else{hubState.followed=[...new Set([...hubState.followed,r.id])];save();showToast('Saved screening; catalog match pending.');}renderCalendar();}catch{track.disabled=false;showToast('Could not save this title. Try again.');}});track.disabled=tracked;track.className='track-action';track.setAttribute('aria-label',(tracked?'On watchlist: ':'Add to watchlist: ')+r.title);actions.appendChild(track);
  const hide=button('HIDE',()=>hideTheater(r,true));hide.className='text-action hide-action';hide.setAttribute('aria-label','Hide: '+r.title);actions.appendChild(hide);container.appendChild(actions);
 }
 function paintCinemaArt(r){const art=cinemaArt.get(r.id);if(!art)return;for(const holder of document.querySelectorAll('[data-calendar-id]'))if(holder.dataset.calendarId===r.id){const head=holder.querySelector('.calendar-film-head')||holder.querySelector('.board-label')||holder.querySelector('.cinema-title');for(const bar of holder.querySelectorAll('.run-bar'))if(art.backdrop_path||art.poster_path)bar.style.setProperty('--screening-art',art?.backdrop_path||art?.poster_path?'url(https://image.tmdb.org/t/p/w780'+(art.backdrop_path||art.poster_path)+')':'url('+HubModel.safeLink(r.poster)+')');if(head&&art.poster_path&&!head.querySelector('img')){head.querySelector('.calendar-poster-placeholder')?.remove();const img=node('img');img.src=posterUrl(art.poster_path);img.alt='';img.loading='lazy';head.prepend(img);}}}
 function theaterHidden(event,film){const identity=HubModel.theaterIdentity(event,film);return [...sessionHiddenTheaters,...hubState.hiddenTheaterFilms].some(saved=>HubModel.sameTheaterFilm(saved,identity));}
 function cinemaRows(){const horizon=addDays(anchor,120),rows=[];for(const [kind,key] of [['local','local'],['local','roxy'],['event','events']])for(const raw of cinema?.[key]?.items||[]){const dates=(raw.dates||[]).filter(d=>d>=today());const ranges=(raw.ranges||[]).filter(r=>r.end>=today());if(/^Cinemark Birthday Party$/i.test(raw.title)||!dates.length&&!ranges.length||raw.end>horizon&&raw.start>horizon||hubState.hidden.includes(raw.id))continue;const film=filmFor(raw),identityFilm=cinemaArt.get(raw.id)||film;if(theaterHidden(raw,identityFilm))continue;rows.push({...raw,art:cinemaArt.get(raw.id)||film,kind,dates,ranges,film,followed:hubState.followed.includes(raw.id),favorite:film&&HubModel.evidence([film]).length>0,muted:hubState.muted.includes(raw.id),stale:cinema[key].stale});}
 for(const movie of watchlist)for(const r of HubModel.upcoming(movie,today())){if(r.theatrical&&theaterHidden(movie,movie))continue;const releaseId='stream:'+movie.id+':'+r.date+':'+r.label;if(hubState.hidden.includes(releaseId))continue;rows.push({id:releaseId,title:movie.title,art:movie,reason:movie.suggestionReason,recommended:!!movie.suggestionReason&&!watchlist.some(m=>m.id===movie.id),regional:!!r.regional,kind:r.regional?'event':'stream',theatrical:!!r.theatrical,dates:[r.date],ranges:[],start:r.date,end:r.date,label:r.label,platform:r.platform,sourceKind:r.sourceKind,announcementKind:r.announcementKind,certainty:r.certainty,film:movie,url:r.url||'https://www.themoviedb.org/movie/'+movie.id+'/releases',stale:r.stale||movie.availabilitySnapshot?.stale});}
 if(typeof RewindMedia!=='undefined')rows.push(...RewindMedia.calendarRows());else if(typeof TV!=='undefined')rows.push(...TV.calendarRows());
 return HubModel.filterCalendar(rows.filter(r=>calendarSource!=='digital'||typeof RewindMedia==='undefined'||RewindMedia.accepts(r)),{source:calendarSource,savedOnly:$('calendar-saved-only').checked,venue:$('calendar-venue').value,savedIds:[...watchlist.map(m=>m.id),...(hubState.seriesRecords||[]).map(r=>r.seriesId)],followed:hubState.followed,search:$('calendar-search').value}).sort((a,b)=>Number(a.muted)-Number(b.muted)||((b.film?.pinned?8:0)+(b.favorite?6:0)+(b.followed?4:0)+(b.film&&watchlist.some(m=>m.id===b.film.id)?3:0)+(b.recommended?2:0))-((a.film?.pinned?8:0)+(a.favorite?6:0)+(a.followed?4:0)+(a.film&&watchlist.some(m=>m.id===a.film.id)?3:0)+(a.recommended?2:0))||a.start.localeCompare(b.start)||a.title.localeCompare(b.title));}
 async function loadRoxy(week,force){
  const query='?week='+encodeURIComponent(week)+(force?'&refresh='+Date.now():'');
  try{
   const response=await fetch('/.netlify/functions/roxy-cinema'+query);
   if(!response.ok)throw Error('Roxy unavailable');
   const feed=await response.json();if(!Array.isArray(feed.items))throw Error('Roxy response incomplete');return feed;
  }catch{
   try{const response=await fetch('roxy-snapshot.json',{cache:'no-cache'});if(!response.ok)throw Error();const feed=await response.json();return {...feed,items:Array.isArray(feed.items)?feed.items:[],stale:true};}
   catch{return {items:[],stale:true};}
  }
 }
 function updateCinemaStatus(){
  const sources=calendarSource==='digital'?[]:calendarSource==='local'?['local','roxy']:['local'];
  const feeds=sources.map(key=>cinema[key]).filter(Boolean),checked=feeds.map(f=>f.checkedAt).filter(Number.isFinite);
  const stamp=checked.length?new Date(Math.min(...checked)).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Denver'})+' MT':null;
  $('cinema-status').textContent=calendarSource==='digital'?'Digital movie and TV dates from your saved and followed titles':stamp?'Last checked '+stamp+(feeds.some(f=>f.stale)?' · some sources unavailable':''):'Screening sources unavailable';
  $('cinema-status').title=[['local','Kalispell'],['roxy','Roxy'],['events','Fathom']].map(([key,name])=>name+': '+(cinema[key]?.checkedAt?new Date(cinema[key].checkedAt).toLocaleString('en-US',{timeZone:'America/Denver'}):'not checked')+(cinema[key]?.stale?' · previous check':'')).join(' | ');
 }
 async function loadCinema(force=false,week=anchor){
  if(cinemaPromise){await cinemaPromise;if(week===anchor&&cinemaLoadedWeek!==week)return loadCinema(force,week);return;}
  const cached=cinemaWeeks.get(week);
  if(!force&&cached&&Date.now()-cached.at<600000){cinema=cached.data;cinemaLoadedWeek=week;updateCinemaStatus();renderCalendar();return;}
  cinemaPromise=(async()=>{
   if(force)snapshotPromise=null;
   const roxyRequest=loadRoxy(week,force);$('cinema-status').textContent='Checking the screening board…';
   try{
    const response=await fetch('https://transmissionalbum.netlify.app/.netlify/functions/rewind-cinema?week='+encodeURIComponent(week)+(force?'&refresh='+Date.now():''));
    if(!response.ok)throw Error('Live calendar unavailable');cinema=await response.json();
    if(!cinema.events||!cinema.local)throw Error('Calendar response incomplete');
    if(['events','local'].some(key=>cinema[key].stale)){
     try{
      const snapshot=await cinemaSnapshot();
      for(const key of ['events','local']){
       const live=cinema[key],backup=snapshot[key];
       const moreDetailed=key==='local'&&!live.items.some(m=>m.screenings?.length)&&backup.items.some(m=>m.screenings?.length);
       const usable=Date.now()-backup.checkedAt<(key==='local'?36*3600000:7*86400000);
       if(live.stale&&(backup.checkedAt>(live.checkedAt||0)||moreDetailed)&&usable)cinema[key]={...backup,stale:true};
      }
     }catch{}
    }
   }catch{
    try{cinema=JSON.parse(JSON.stringify(await cinemaSnapshot()));for(const key of ['events','local'])cinema[key].stale=true;}
    catch{cinema={events:{items:[],stale:true},local:{items:[],stale:true}};}
   }
   cinema.roxy=await roxyRequest;
   try{const snapshot=await cinemaSnapshot();for(const item of cinema.local.items)if(!item.poster)item.poster=ArtworkModel.sourcePoster(item,snapshot.local?.items||[]);}catch{}
   for(const key of ['events','local','roxy']){
    const feed=cinema[key],maxAge=key==='events'?7*86400000:36*3600000;
    if(!Number.isFinite(feed.checkedAt)||Date.now()-feed.checkedAt>maxAge)cinema[key]={...feed,items:[],stale:true};
   }
   updateCinemaStatus();cinemaLoadedWeek=week;cinemaWeeks.set(week,{data:cinema,at:Date.now()});
   if(cinemaWeeks.size>16)cinemaWeeks.delete(cinemaWeeks.keys().next().value);
   if(week===today())recordScreeningReceipts();
   renderCalendar();renderNews();decorateCards();
   if($('tab-watchlist').classList.contains('active')&&!window.RewindStartup?.defer('watchlist',()=>repaintWatchlist()))repaintWatchlist();
  })();
  try{await cinemaPromise;}finally{cinemaPromise=null;}
 }
 function renderCalendar(){
  refreshTheaterState();const rows=cinemaRows(),days=Array.from({length:7},(_,i)=>addDays(anchor,i)),board=$('calendar-bars'),mobile=$('calendar-mobile');board.replaceChildren();mobile.replaceChildren();
  const visible=rows.filter(r=>r.dates.some(d=>days.includes(d))||r.ranges.some(x=>x.start<=days.at(-1)&&x.end>=anchor));
  $('calendar-range').textContent=anchor.slice(0,7)===days.at(-1).slice(0,7)?new Date(anchor+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})+'–'+Number(days.at(-1).slice(-2))+', '+anchor.slice(0,4):formatFilmDate(anchor)+' – '+formatFilmDate(days.at(-1));$('calendar-count').textContent=cinemaLoadedWeek!==anchor&&!visible.length?'Checking this week…':cinema||visible.length?visible.length+(visible.length===1?' title this week':' titles this week'):'Loading listings…';
  $('calendar-scroll').hidden=calendarView!=='calendar';mobile.hidden=calendarView!=='calendar';$('calendar-listings').hidden=calendarView==='calendar';$('calendar-view').setAttribute('aria-pressed',calendarView==='calendar');$('calendar-list').setAttribute('aria-pressed',calendarView==='list');
  const header=node('div',null,'calendar-day-heads');header.appendChild(node('span','TITLES','board-label'));for(const day of days)header.appendChild(node('span',new Date(day+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'}),day===today()?'today':''));board.appendChild(header);
  const makeHead=(r,className)=>{const head=button('',()=>showEvent(r),className);head.title=r.title;head.appendChild(node('span',r.title,'calendar-film-name'));const art=cinemaArt.get(r.id)||r.art||r.film;const img=node(art?.poster_path||r.poster?'img':'span');if(img.tagName==='IMG'){img.src=art?.poster_path?posterUrl(art.poster_path):HubModel.safeLink(r.poster);img.alt='';img.loading='lazy';img.onerror=()=>{img.replaceWith(node('span','ART UNAVAILABLE','calendar-poster-placeholder'));};}else{img.className='calendar-poster-placeholder';img.textContent=artPending.has(r.id)?'LOADING ART':'NO VERIFIED ART';}head.prepend(img);head.appendChild(channelBadge(r));head.appendChild(node('small',calendarNote(r),'cinema-fit'));return head;};
  for(const r of visible){
   const row=node('div',null,'calendar-track');row.dataset.calendarId=r.id;row.dataset.channel=calendarChannel(r);const label=node('div',null,'calendar-film-label');label.appendChild(makeHead(r,'board-label'));directCalendarActions(r,label);row.appendChild(label);
   const lane=node('div',null,'bar-lane');for(const [i,day] of days.entries()){const cell=node('div',null,'lane-cell'+(day===today()?' today':''));cell.style.gridColumn=String(i+1);lane.appendChild(cell);}
   const positions=r.dates.map(d=>days.indexOf(d)).filter(i=>i>=0).sort((a,b)=>a-b),runs=[];for(const i of positions){if(runs.length&&runs.at(-1).at(-1)===i-1)runs.at(-1).push(i);else runs.push([i]);}
   for(const run of runs){const bar=button(r.kind==='stream'?r.label:run.length>1?run.length+' listed days':r.kind==='event'?'EVENT':'SCREENING',()=>showEvent(r),'run-bar '+r.kind+' channel-'+calendarChannel(r));bar.style.gridColumn=(run[0]+1)+' / '+(run.at(-1)+2);bar.style.gridRow='1';const art=cinemaArt.get(r.id)||r.art||r.film;if(art?.backdrop_path||art?.poster_path||r.poster)bar.style.setProperty('--screening-art',art?.backdrop_path||art?.poster_path?'url(https://image.tmdb.org/t/p/w780'+(art.backdrop_path||art.poster_path)+')':'url('+HubModel.safeLink(r.poster)+')');bar.title=r.title+' · '+run.map(i=>formatFilmDate(days[i])).join(', ')+(r.stale?' · Previous check':'');bar.setAttribute('aria-label',bar.title);lane.appendChild(bar);}
   for(const range of r.ranges){const start=Math.max(0,days.findIndex(d=>d>=range.start)),last=days.filter(d=>d<=range.end).length-1;if(last<start||range.start>days.at(-1)||range.end<anchor)continue;const bar=button('ANNOUNCED WINDOW',()=>showEvent(r),'run-bar event window channel-'+calendarChannel(r));bar.style.gridColumn=(start+1)+' / '+(last+2);bar.style.gridRow='1';const art=cinemaArt.get(r.id)||r.art||r.film;if(art?.backdrop_path||art?.poster_path||r.poster)bar.style.setProperty('--screening-art',art?.backdrop_path||art?.poster_path?'url(https://image.tmdb.org/t/p/w780'+(art.backdrop_path||art.poster_path)+')':'url('+HubModel.safeLink(r.poster)+')');bar.title=r.title+' · '+range.start+' to '+range.end+' · National window, not daily local screenings';bar.setAttribute('aria-label',bar.title);lane.appendChild(bar);}row.appendChild(lane);board.appendChild(row);
   const card=node('article',null,'calendar-mobile-card');card.dataset.calendarId=r.id;card.dataset.channel=calendarChannel(r);
   const inline=node('div',null,'calendar-inline-details');inline.hidden=true;
   const head=makeHead(r,'calendar-film-head');head.setAttribute('aria-expanded','false');
   const showMobile=(selectedDay=null)=>{
    if(!inline.hidden&&openCalendarEvent===r.id&&(selectedDay===null||inline.dataset.selectedDay===selectedDay)){
     inline.hidden=true;openCalendarEvent=null;head.setAttribute('aria-expanded','false');return;
    }
    for(const other of mobile.querySelectorAll('.calendar-inline-details'))other.hidden=true;
    for(const other of mobile.querySelectorAll('.calendar-film-head'))other.setAttribute('aria-expanded','false');
    openCalendarEvent=r.id;head.setAttribute('aria-expanded','true');inline.dataset.selectedDay=selectedDay||'';
    showEvent(r,inline,false,selectedDay);
   };
   head.onclick=()=>showMobile();card.appendChild(head);
   card.appendChild(node('p',calendarCardNote(r),'calendar-source-note'));
   if(r.stale)card.appendChild(node('p','PREVIOUS CHECK · confirm before leaving','cost-warning'));
   const strip=node('div',null,'mobile-week-strip');strip.setAttribute('aria-label','Listed dates for '+r.title);
   for(const day of days){
    const listed=r.dates.includes(day),window=r.ranges.some(w=>day>=w.start&&day<=w.end);
    const cell=node(listed||window?'button':'span',null,'mobile-week-day'+(listed?' listed':'')+(window?' announced-window':'')+(day===today()?' today':''));
    if(cell.tagName==='BUTTON'){cell.type='button';cell.onclick=()=>showMobile(day);}
    cell.append(node('small',new Date(day+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'})),node('strong',String(Number(day.slice(-2)))));
    cell.setAttribute('aria-label',formatFilmDate(day)+(listed?' · listed':window?' · announced national window':' · no listing'));
    strip.appendChild(cell);
   }
   card.appendChild(strip);
   if(r.ranges.length)card.appendChild(node('p','Striped dates mark a national window, not daily local showtimes.','offer-note'));
   directCalendarActions(r,card);card.appendChild(inline);mobile.appendChild(card);
   if(openCalendarEvent===r.id){head.setAttribute('aria-expanded','true');showEvent(r,inline,false);}
   resolveCinemaArt(r);
  }
  const emptyCalendar=()=>{
   const box=node('div',null,'calendar-empty'),query=$('calendar-search').value.trim(),savedOnly=$('calendar-saved-only').checked;
   const checking=cinemaLoadedWeek!==anchor;
   const text=checking?'Checking listings for this week…':!cinema?'Loading listed films and dates…':query?'No dates match “'+query+'” this week.':savedOnly?'No dates for your saved films this week.':calendarSource==='digital'?'No digital dates listed this week.':'No matching screenings listed this week.';
   box.append(node('p',text,'board-empty'));
   const nextDate=rows.flatMap(r=>[...r.dates,...r.ranges.map(w=>w.start)]).filter(d=>d>days.at(-1)).sort()[0];
   if(cinema&&!checking){const action=button(query?'Clear search':nextDate?'Next listed date · '+formatFilmDate(nextDate):savedOnly?'Show all films':'Check theater listings ↗',()=>{if(query){$('calendar-search').value='';renderCalendar();}else if(nextDate){anchor=nextDate;renderCalendar();loadCinema();}else if(savedOnly){$('calendar-saved-only').checked=false;$('calendar-saved-only').dispatchEvent(new Event('change'));}else window.open(($('calendar-venue')?.value==='roxy'?'https://www.theroxytheater.org/showtimes/':null)||cinema.theatreURL||'https://www.cinemark.com/theatres/mt-kalispell/cinemark-signature-stadium-kalispell-14','_blank','noopener,noreferrer');},'secondary');box.append(action);}return box;
  };
  if(!visible.length){board.append(emptyCalendar());mobile.append(emptyCalendar());}
  const list=$('calendar-listings');list.replaceChildren();for(const r of visible){const item=node('article',null,'cinema-list-item '+r.kind);item.dataset.calendarId=r.id;item.dataset.channel=calendarChannel(r);item.appendChild(makeHead(r,'cinema-title'));item.appendChild(node('p',r.kind==='stream'?formatFilmDate(r.start)+' · '+r.label:r.dates.filter(d=>days.includes(d)).map(d=>new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'})).join(' · ')||r.dateLabel,'agenda-dates'));const next=(r.screenings||[]).filter(x=>days.includes(x.date)&&(!x.startsAt||Date.parse(x.startsAt)>=Date.now())).slice(0,3);if(next.length)item.appendChild(node('p','Next listed: '+formatFilmDate(next[0].date)+' · '+next[0].time+' MT','agenda-times'));if(r.stale)item.appendChild(node('p','PREVIOUS CHECK','cost-warning'));directCalendarActions(r,item);list.appendChild(item);resolveCinemaArt(r);}if(!visible.length)list.appendChild(emptyCalendar());renderHidden();
 }
 function renderHidden(){const out=$('cinema-hidden');out.replaceChildren();for(const kind of ['hidden','muted'])for(const id of hubState[kind]){const r=[...(cinema?.events?.items||[]),...(cinema?.local?.items||[])].find(x=>x.id===id);out.appendChild(button((kind==='hidden'?'SHOW ':'UNMUTE ')+(r?.title||(/^stream:(\d+):(\d{4}-\d{2}-\d{2}):/.test(id)?(([...watchlist,...(hubState.suggestions||[])].find(m=>String(m.id)===id.split(':')[1])?.title||'Digital release')+' · '+id.split(':')[2]):id)),()=>{hubState[kind]=hubState[kind].filter(x=>x!==id);save();renderCalendar();}));}for(const [items,permanent] of [[sessionHiddenTheaters,false],[hubState.hiddenTheaterFilms,true]])for(const item of items){out.appendChild(button('RESTORE '+item.title+(permanent?' · permanently hidden':' · this visit'),()=>{restoreTheater(item,permanent);}));}if(!out.children.length)out.textContent='Nothing hidden or quiet.';}
 async function resolveCinemaArt(r,requested=false){if(cinemaArt.has(r.id)||artPending.has(r.id)||r.kind==='stream'||!requested&&r.poster&&!r.film)return;artPending.add(r.id);try{let m=r.film;if(!m)m=ArtworkModel.choose(await searchMovies(ArtworkModel.title(r.title)),r);if(m){const detail=await fetchMovieDetails(m.id);cinemaArt.set(r.id,{...m,...detail,meta:detail});}else cinemaArt.set(r.id,null);}catch{ /* A failed lookup is retried on the next calendar refresh. */ }finally{artPending.delete(r.id);paintCinemaArt(r);}}
 function showEvent(r,host=null,focus=true,selectedDay=null){
  if(r.mediaType==='tv'){TV.open(r.seriesId);return;}
  const out=host||$('event-detail');out.replaceChildren();out.hidden=false;
  const trigger=document.activeElement;
  const close=button('Close',()=>{out.hidden=true;openCalendarEvent=null;host?.closest('.calendar-mobile-card')?.querySelector('.calendar-film-head')?.setAttribute('aria-expanded','false');if(trigger?.isConnected)trigger.focus();},'detail-close');
  close.setAttribute('aria-label','Close screening details');out.appendChild(close);
  const art=cinemaArt.get(r.id)||r.art||r.film;
  if(!host){
   const hero=node('div',null,'screening-hero');
   if(art?.backdrop_path)hero.style.backgroundImage='linear-gradient(90deg,rgba(18,25,29,.9),rgba(18,25,29,.4)),url(https://image.tmdb.org/t/p/w780'+art.backdrop_path+')';
   if(art?.poster_path||r.poster){const img=node('img');img.src=art?.poster_path?posterUrl(art.poster_path):HubModel.safeLink(r.poster);img.alt=r.title+' poster';hero.appendChild(img);}
   const title=node('div');title.appendChild(node('p',r.kind==='local'?venueName(r).toUpperCase():r.kind==='stream'?(r.theatrical?'US THEATRICAL RELEASE':'DIGITAL RELEASE'):r.regional?'REGIONAL SCREENING · MISSOULA':'NATIONAL EVENT','event-kicker'));title.appendChild(node('h3',r.title));title.appendChild(node('p',art?.genres?.map(g=>g.name).slice(0,3).join(' · ')||''));hero.appendChild(title);out.appendChild(hero);
  }
  if(r.regional&&r.label)out.appendChild(node('p',r.label,'calendar-source-note'));
  if(r.stale)out.appendChild(node('p','Previous check. Confirm with the ticket seller.','cost-warning'));
  if(r.kind==='stream'){
   const facts=node('div',null,'calendar-release-facts');
   facts.appendChild(node('p','Date: '+formatFilmDate(r.start)+' · '+(r.certainty||'Listed')));
   if(r.theatrical){
    facts.appendChild(node('p','Location: US theatrical release. Kalispell screening not confirmed.'));
    facts.appendChild(node('p','Ticket price: Not listed.'));
   }else{
    facts.appendChild(node('p','Platform: '+(r.platform||'Not listed')));
    facts.appendChild(node('p',r.announcementKind==='subscription'?'Price: Subscription listing; separate rental price not supplied.':'Price: Not listed for this release date.'));
    facts.appendChild(node('p','A digital release date is not a confirmed rental offer.'));
   }
   facts.appendChild(node('p','Source: '+({announcement:'Dated distributor or service announcement',watchmode:'Watchmode release calendar',tmdb:'TMDB US release-date record',regional:'Regional screening listing'}[r.sourceKind]||'Release record')));
   out.appendChild(facts);
  }else if(!host){
   const days=Array.from({length:14},(_,i)=>addDays((r.dates||[]).find(d=>d>=today())||r.start,i));
   const strip=node('div',null,'screening-strip');strip.setAttribute('aria-label','Listed screening dates');
   for(const d of days){const active=(r.dates||[]).includes(d),window=(r.ranges||[]).some(w=>d>=w.start&&d<=w.end),cell=node('div',null,'screening-date'+(active?' active':'')+(window?' window':''));cell.appendChild(node('small',new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'})));cell.appendChild(node('strong',formatFilmDate(d)));strip.appendChild(cell);}
   out.appendChild(strip);
   out.appendChild(node('p',r.ranges?.length?'Striped dates: announced national window. Check local tickets.':r.kind==='local'?'Highlighted dates are listed screenings. Last listed day is not a confirmed closing date.':'Highlighted dates are announced event dates. Local participation needs a ticket check.','offer-note'));
  }
  const actions=node('div',null,'screening-actions');
  const actionLabel=r.kind==='local'?(r.venueId==='roxy'?'ROXY SHOWTIMES & TICKETS':'CINEMARK TICKETS'):r.kind==='stream'?(r.sourceKind==='announcement'?'ANNOUNCEMENT SOURCE':'RELEASE RECORD'):r.regional?'SCREENING SOURCE':'EVENT & TICKETS';
  actions.appendChild(link(actionLabel,r.url,'watch-link'));
  if(!host&&!watchlist.some(m=>m.id===art?.id)&&!hubState.followed.includes(r.id))actions.appendChild(button(art?.id?'Save to watchlist':'Track screening updates',()=>{if(art?.id)addToWatchlist(art);else{hubState.followed.push(r.id);save();}renderCalendar();showEvent(r);}));
  out.appendChild(actions);
  if(!host){const hideActions=node('div',null,'screening-hide-actions');hideActions.appendChild(button('HIDE',()=>hideTheater(r,true)));out.appendChild(hideActions);}
  if(r.kind!=='stream'){
   const extra=node('details',null,'source-disclosure');
   extra.appendChild(node('summary',selectedDay?'Showtimes · '+formatFilmDate(selectedDay):'Showtimes & event options'));
   const screenings=(r.screenings||[]).filter(ss=>ss.date>=today()&&(!selectedDay||ss.date===selectedDay));
   for(const ss of screenings)extra.appendChild(link(formatFilmDate(ss.date)+' · '+ss.time+' MT · '+(ss.format||'Screening'),ss.url,'screening-time'));
   if(!screenings.length)extra.appendChild(node('p',selectedDay?'No exact times listed for this date. Check the ticket seller.':'Exact showtimes are not supplied by this source. Open tickets for times.'));
   out.appendChild(extra);
   if(host&&selectedDay)extra.open=true;
  }
  if(r.recommended){out.appendChild(node('p',r.reason,'oracle-reason'));out.appendChild(button('NOT FOR ME',()=>{hubState.dismissedSuggestions=[...new Set([...(hubState.dismissedSuggestions||[]),r.film.id])];save();renderCalendar();out.hidden=true;}));}
  if(!art)resolveCinemaArt(r,true);
  if(!host&&focus)out.scrollIntoView({behavior:'smooth',block:'nearest'});
  if(focus)close.focus({preventScroll:true});
 }
 function renderNews(){const out=$('hub-news');if(!out)return;out.replaceChildren();if(!cinema)return;const events=cinema.events.items.filter(e=>e.end>=today()),matched=events.filter(e=>hubState.followed.includes(e.id)||filmFor(e)&&HubModel.evidence([filmFor(e)]).length);const fresh=events.filter(e=>!hubState.knownEvents.includes(e.id)&&(/anniversary/i.test(e.title)||/Big Screen Classics/i.test(e.category)));const picks=[...new Map([...matched,...fresh].map(e=>[e.id,e])).values()].slice(0,3);if(!picks.length){out.hidden=true;return;}out.hidden=false;out.appendChild(node('summary','Screening news · '+picks.length+' events'));for(const e of picks){const b=button(e.title+' · '+(e.dateLabel||formatFilmDate(e.start)),()=>{document.querySelector('[data-tab="upcoming"]').click();showEvent({...e,kind:'event',stale:cinema.events.stale});},'news-ticket');if(e.poster){b.classList.add('news-banner');b.style.backgroundImage='linear-gradient(90deg,rgba(13,29,30,.94),rgba(13,29,30,.4)),url('+HubModel.safeLink(e.poster)+')';}out.appendChild(b);}out.appendChild(node('p','National event dates. Local tickets checked separately.','offer-note'));const mark=button('MARK THESE EVENTS SEEN',()=>{hubState.knownEvents=[...new Set([...hubState.knownEvents,...events.map(e=>e.id)])];save();renderNews();});out.appendChild(mark);}
 function localListing(movie){const item=[...(cinema?.local?.items||[]),...(cinema?.roxy?.items||[])].find(e=>HubModel.matchEvent(e,movie)&&!theaterHidden(e,movie)&&!hubState.hidden.includes(e.id)&&(e.dates||[]).some(d=>d>=today()));if(!item)return null;return {location:venueName(item),date:item.dates.filter(d=>d>=today()).sort()[0],stale:!!cinema[item.venueId==='roxy'?'roxy':'local'].stale,url:item.url};}
 function decorateCards(applyNow=false){if(applyNow!==true&&window.RewindStartup?.defer('card-notes',()=>decorateCards(true)))return;if(!cinema)return;for(const card of document.querySelectorAll('.rental-card')){card.querySelector('.local-card-note')?.remove();card.querySelectorAll('.release-channels .theater,.release-channels .roxy').forEach(n=>n.remove());const movie=watchlist.find(m=>m.id===Number(card.dataset.movieId))||(currentPick?.id===Number(card.dataset.movieId)?currentPick:null);if(!movie)continue;const local=[...cinema.local.items,...(cinema.roxy?.items||[])].find(e=>HubModel.matchEvent(e,movie)&&e.end>=today());const event=cinema.events.items.find(e=>HubModel.matchEvent(e,movie)&&e.end>=today());let channels=card.querySelector('.release-channels');for(const screening of [...cinema.local.items,...(cinema.roxy?.items||[])].filter(e=>HubModel.matchEvent(e,movie)&&e.end>=today()&&!theaterHidden(e,movie)&&!hubState.hidden.includes(e.id))){if(!channels){channels=node('div',null,'release-channels');card.querySelector('.film-details-trigger')?.before(channels);}if(!channels.querySelector('.'+(screening.venueId==='roxy'?'roxy':'theater')))channels.append(channelBadge({...screening,kind:'local'}));}const r=local||event;if(r){const b=button(local?venueName(r).toUpperCase()+' · '+r.dates.filter(d=>d>=today()).length+' listed days'+(cinema[r.venueId==='roxy'?'roxy':'local'].stale?' · PREVIOUS CHECK':''):r.title+' · '+r.dateLabel+(cinema.events.stale?' · PREVIOUS CHECK':''),()=>{document.querySelector('[data-tab="upcoming"]').click();showEvent({...r,kind:local?'local':'event',stale:cinema[local?(r.venueId==='roxy'?'roxy':'local'):'events'].stale});},'local-card-note');card.querySelector('.film-details-trigger')?.before(b);if(local&&!movie.availabilitySnapshot?.offers?.length){const badge=card.querySelector('.cost-badge'),caption=card.querySelector('.cost-caption');if(badge)badge.textContent='IN THEATERS';if(caption)caption.textContent=venueName(r)+' · open tickets for prices';}}balanceCardUpdates(card);}}
 function setFindMode(mode){++pickRequest;findMode=mode;currentPick=null;$('pick-film').disabled=false;$('pick-again').disabled=false;document.querySelector('#tab-discover .count-stamp').textContent=mode==='news'?'FILM + TV REPORTS':mode==='physical'?'Already on your shelf':mode==='shelf'?'Recent theatrical releases':mode==='roulette'?'Your watchlist':'A film for right now';document.querySelectorAll('[data-find-mode]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.findMode===mode));$('physical-shelf').hidden=mode!=='physical';if(mode==='physical')renderPhysicalShelf();$('hub-picker').hidden=['shelf','physical','news'].includes(mode);$('movie-news-panel').hidden=mode!=='news';for(const id of ['discovery-intro','discovery-stages','discovery-guide','search-form','discovery-filters','discover-status','discover-grid','discover-more','browse-dismiss-bar'])$(id).hidden=mode!=='shelf';const searching=mode==='shelf'&&!!$('search-input').value.trim();$('search-grid').hidden=!searching;if(searching)for(const id of ['discover-grid','discover-more','discovery-filters'])$(id).hidden=true;if(mode==='shelf')updateDiscoveryGuide();updateBrowseDismissControl();$('hub-picker').classList.toggle('oracle-chamber',mode==='oracle');$('pick-film').textContent=mode==='oracle'?'ASK THE ORACLE':'PICK A FILM';$('picker-heading').textContent=mode==='roulette'?'Let Rewind choose.':'The Oracle';$('picker-intro').textContent=mode==='roulette'?'A film from your watchlist, with current viewing options. The hat has no opinions.':'Your taste, the weather, the moon, and several facts the moon has no business knowing. One film. A small disturbance in your evening.';$('picker-results').replaceChildren();$('picker-status').textContent='';$('picker-priorities').hidden=mode!=='roulette';updatePickActions();}
 async function hydrate(movie){if(typeof RewindMedia!=='undefined'&&RewindMedia.isTV(movie))return RewindMedia.hydrate(movie);const detail=await fetchMovieDetails(movie.id);const genres=(detail.genres||[]).map(g=>g.id);return {...movie,...detail,genre_ids:genres,meta:detail,release_date:detail.release_date||movie.release_date};}
 async function prepareSeeds(){const positive=[...HubModel.evidence(hubState.taste).filter(m=>typeof RewindMedia==='undefined'||!RewindMedia.isTV(m)),...(typeof RewindMedia!=='undefined'?await RewindMedia.seeds():[])],recent=[...positive].sort((a,b)=>(b.watchedAt||b.recordedAt||'').localeCompare(a.watchedAt||a.recordedAt||'')),strong=[...positive].sort((a,b)=>(Number(!!b.owned)+Number(b.rewatches>1)+Number(!!b.favorite)+(b.rating||0))-(Number(!!a.owned)+Number(a.rewatches>1)+Number(!!a.favorite)+(a.rating||0)));const diversified=[...new Map([...recent.slice(0,6),...strong.slice(0,6),...positive.map(m=>({m,n:Math.random()})).sort((a,b)=>a.n-b.n).slice(0,12).map(x=>x.m),...positive].map(m=>[m.id,m])).values()];return (await mapLimited(diversified.slice(0,24),3,async (s)=>{if(s.mediaType==='tv'||s.meta?.credits?.crew?.length)return s;try{const d=await fetchMovieDetails(s.id);return {...s,meta:{genres:d.genres,credits:{crew:(d.credits?.crew||[]).filter(c=>['Director','Writer','Screenplay','Story'].includes(c.job)).map(c=>({job:c.job,name:c.name}))}}};}catch{return null;}})).filter(Boolean);}
 let occasionsPromise;function loadOccasions(){return occasionsPromise||(occasionsPromise=fetch('film-occasions.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null));}
 async function pickFilm(){const request=++pickRequest;$('pick-film').disabled=true;$('pick-again').disabled=true;$('picker-status').textContent=findMode==='oracle'?'Reading the moment…':'Finding one film and checking where to watch…';$('picker-results').replaceChildren();try{
 await loadTasteBaseline();const seeds=findMode==='oracle'?await prepareSeeds():[];let oracleContext=null;if(findMode==='oracle'){try{const response=await fetch('https://transmissionalbum.netlify.app/.netlify/functions/rewind-oracle-context');if(response.ok)oracleContext=await response.json();}catch{}oracleContext={...oracleContext,occasions:await loadOccasions()};}let candidates=[];
 const collectionSource=$('picker-source')?.value||'all';const shelfOnly=collectionSource==='physical'||$('picker-cost').value==='physical';
 if(shelfOnly)candidates=hubState.taste.filter(m=>m.owned&&(typeof RewindMedia==='undefined'||RewindMedia.accepts(m)));
 else if(findMode==='roulette'||collectionSource==='watchlist')candidates=typeof RewindMedia!=='undefined'?RewindMedia.collection():[...watchlist];
 else if(seeds.length){const results=await mapLimited(HubModel.shuffle(seeds).slice(0,8),3,async s=>{try{return typeof RewindMedia!=='undefined'?await RewindMedia.recommendations(s):(await tmdbGet('/movie/'+s.id+'/recommendations')).results||[];}catch{return [];}});candidates=[...new Map(results.flat().map(m=>[m.id,m])).values()];}
 else candidates=[];
 if(typeof RewindMedia!=='undefined'&&!shelfOnly)candidates=RewindMedia.select([...candidates,...(findMode==='oracle'?RewindMedia.savedTV():[])]);
 let recommendationHistory=[];try{recommendationHistory=JSON.parse(localStorage.getItem('rewind-recommendations-v1')||'[]');}catch{}
 if(findMode==='oracle'&&!shelfOnly){
  const known=hubState.taste.filter(m=>isSeen(m)&&TasteModel.rewatchEvidence(m)).map(m=>({...m,oracleRewatch:true,occasionRewatch:!!OccasionModel.matches(m,oracleContext?.occasions).length}));
  const intended=HubModel.orderWatchlist(TasteModel.availableCandidates((typeof RewindMedia!=='undefined'?RewindMedia.collection():watchlist).filter(m=>!isSeen(m)&&!skipSet.has(m.id)&&!dealt.has(m.id)),recommendationHistory),'smart').map(m=>({...m,oracleSource:'watchlist'}));
  const ownedNew=HubModel.shuffle(hubState.taste.filter(m=>m.owned&&!isSeen(m))).map(m=>({...m,oracleSource:'physical'}));
  const discoveries=HubModel.shuffle(candidates.filter(m=>!isSeen(m)&&!watchlist.some(w=>w.id===m.id))).map(m=>({...m,oracleSource:'discovery'}));
  const repeats=HubModel.shuffle(known).sort((a,b)=>Number(b.occasionRewatch)-Number(a.occasionRewatch)).map(m=>({...m,oracleSource:'rewatch'}));
  candidates=collectionSource==='watchlist'?intended:[...new Map([...intended.slice(0,12),...ownedNew.slice(0,8),...discoveries.slice(0,8),...repeats.slice(0,4)].map(m=>[m.id,m])).values()];
 }
 if(findMode==='oracle')candidates=TasteModel.availableCandidates(candidates,recommendationHistory);
 candidates=candidates.filter(m=>(typeof RewindMedia==='undefined'||RewindMedia.accepts(m)&&RewindMedia.playable(m))&&!hubState.feedback.some(r=>r.id===m.id&&r.kind==='notforme')&&!skipSet.has(m.id)&&(m.oracleRewatch||shelfOnly||!isSeen(m))&&!deferred(m,m.availabilitySnapshot,findMode,true)&&!dealt.has(m.id));
 candidates=findMode==='roulette'?HubModel.orderWatchlist(candidates,$('picker-order').value):findMode==='oracle'?candidates:HubModel.shuffle(candidates);
 const eligible=[];const max=Math.min(32,candidates.length);for(let i=0;i<max;i+=4){if(request!==pickRequest)return;const batch=await mapLimited(candidates.slice(i,i+4),4,async m=>{try{const full=await hydrate(m);if(findMode==='oracle'&&full.mediaType!=='tv'){try{full.meta.keywords=await tmdbGet('/movie/'+m.id+'/keywords');}catch{full.meta.keywords={keywords:[]};}}const status=await deriveStatus(full);if(deferred(full,status,findMode))return null;const cost=ReleaseModel.cost(status.offers,rentalBudget,status.stale);if(!shelfOnly&&$('picker-cost').value!=='any'&&(status.stale||!['free',...($('picker-cost').value==='budget'?['cheap']:[])].includes(cost.band)))return null;return {...full,availabilitySnapshot:status};}catch{return null;}});eligible.push(...batch.filter(Boolean));if(findMode==='oracle')$('picker-status').textContent='Reading the moment… '+eligible.length+' films checked';if(findMode!=='oracle'&&eligible.length>=4)break;}
 if(request!==pickRequest)return;if(!eligible.length){$('picker-status').textContent=candidates.length?'No verified option at this budget among the films checked. Try a different budget.':shelfOnly?'No physical films available in this pool. Import your shelf CSV in Settings.':'No unpicked films left. Browse to add more, or come back for a fresh pick.';currentPick=null;updatePickActions();return;}
 for(let i=eligible.length-1;i>=0;i--)if(!eligible[i].oracleRewatch&&!shelfOnly&&!hubState.taste.some(t=>t.id===eligible[i].id&&t.owned)&&isSeen(eligible[i]))eligible.splice(i,1);if(!eligible.length){$('picker-status').textContent='Your updated watched list excludes these picks. Ask again.';return;}const allRanked=seeds.length?HubModel.ranked(eligible,seeds,hubState.feedback):eligible.map(m=>({...m,fit:{score:0,reasons:[]}}));const ranked=findMode==='oracle'&&!shelfOnly?allRanked.filter(m=>m.oracleSource!=='discovery'||TasteModel.eligibleDiscovery(m,m.fit)):allRanked;if(!ranked.length){$('picker-status').textContent='Nothing checked made a strong enough connection. Add a film to your watchlist or ask again.';currentPick=null;updatePickActions();return;}const rankedAt=Date.now(),oraclePool=findMode==='oracle'?ranked.map(m=>FilmOracle.rank({...m,profileFit:TasteModel.affinity(m)},m.fit,oracleContext,[...hubState.taste,...(typeof RewindMedia!=='undefined'?RewindMedia.evidence():[])],rankedAt,(cinema?.local?.items||[]).some(e=>e.end>=today()&&HubModel.matchEvent(e,m)))).sort((a,b)=>b.oracle.score-a.oracle.score):null;const picked=oraclePool?oraclePool[0]:HubModel.orderWatchlist(eligible,$('picker-order').value)[0];if(oraclePool)picked.oracle.comparison=FilmOracle.compare(oraclePool);currentPick=picked;dealt.add(picked.id);if(findMode==='oracle'){localStorage.setItem('rewind-recommendations-v1',JSON.stringify(TasteModel.remember(recommendationHistory,picked.id)));}const card=renderCard(picked,{context:findMode==='roulette'?'watchlist':'picker',status:picked.availabilitySnapshot});if(picked.oracleSource)card.appendChild(node('p',picked.oracleSource==='watchlist'?'FROM YOUR WATCHLIST':picked.oracleSource==='rewatch'?'FROM YOUR WATCHED FILMS':picked.oracleSource==='physical'?'FROM YOUR PHYSICAL SHELF':'A NEW DISCOVERY · connected to your taste','oracle-pool-label'));const pickReason=findMode==='roulette'?$('picker-order').value==='shuffle'?'A pure shuffle of your watchlist. The hat has no opinions.':picked.pinned?'You pinned this one. The picker is taking the hint.':HubModel.watchlistPriority(picked)>0?'Confirmed newly included within the last two weeks. This one moved to the front of the queue.':'From your watchlist. No eligible pins or confirmed new arrivals in this checked batch.':picked.fit?.reasons?.length?picked.fit.reasons.slice(0,2).join('. ')+'.':'A discovery pick. Import favorites or ratings in Settings to make these personal.';const reason=node('p',pickReason,'oracle-reason');if(findMode==='roulette')card.appendChild(reason);if(isSeen(picked)&&(picked.availabilitySnapshot.physical||picked.oracleRewatch))card.appendChild(node('p',picked.occasionRewatch?'A REWATCH · a film date worth marking':picked.oracleRewatch?'A REWATCH · a film you have a strong record with':'A REWATCH · from your physical shelf','new-tag'));if(picked.oracle){card.classList.add('oracle-film');if(picked.backdrop_path)card.style.setProperty('--oracle-backdrop','url(https://image.tmdb.org/t/p/w780'+picked.backdrop_path+')');card.appendChild(renderOracleReport(picked,oracleContext));}$('picker-results').appendChild(card);decorateCards();$('picker-status').textContent='';updatePickActions();if(picked.oracle)loadOracleReading(picked,card,request);
 }catch(err){$('picker-status').textContent=err.message;}finally{if(request===pickRequest){$('pick-film').disabled=false;$('pick-again').disabled=false;}}}
 function renderOracleReport(movie,context){
  const report=node('details',null,'oracle-report');report.open=true;report.appendChild(node('summary','The Oracle’s case'));
  const title=node('div',null,'oracle-reading-head');title.appendChild(node('span','◐','oracle-moon'));title.appendChild(node('p',movie.oracle.moon.name+' · Kalispell','oracle-coordinate'));report.appendChild(title);
  const reading=FilmOracle.momentReading(movie,context);const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',hour:'numeric',hourCycle:'h23'}).format(new Date()));if(hour<18)reading.text=reading.text.replace(/Tonight/g,hour<12?'This morning':'This afternoon').replace(/tonight/g,hour<12?'this morning':'this afternoon').replace(/An evening of/g,hour<12?'A morning of':'An afternoon of');report.appendChild(node('h4',reading.heading,'oracle-heading'));report.appendChild(node('p',reading.text,'oracle-verdict'));
  const comparison=movie.oracle.comparison;
  if(comparison){const drawer=node('details',null,'source-disclosure oracle-comparison');drawer.appendChild(node('summary','Why this won'));drawer.appendChild(node('p','Ranked '+comparison.count+' eligible films in this checked batch. Your viewing-source and budget filters applied first. This compares the checked batch, not every film available.','offer-note'));
   const format=n=>n.toFixed(4),scores=node('table',null,'oracle-score-table'),head=node('tr');for(const label of ['Film','Taste','Context','Total'])head.appendChild(node('th',label));scores.appendChild(head);for(const entry of [comparison.winner,...comparison.alternatives]){const tr=node('tr');tr.appendChild(node('th',entry.title));for(const value of [entry.taste,entry.context,entry.score])tr.appendChild(node('td',format(value)));scores.appendChild(tr);}drawer.appendChild(scores);
   if(!comparison.alternatives.length)drawer.appendChild(node('p','Only one eligible film was checked. There is no runner-up to beat. The Oracle will not invent an opponent.'));
   for(const rival of comparison.alternatives){drawer.appendChild(node('h4',rival.title));drawer.appendChild(node('p',rival.tie?'Exact tie. Neither film scored higher. This one came first in the batch order; the score cannot justify choosing it over '+rival.title+'.':(rival.close?'Close call. ':'')+movie.title+' leads by '+format(rival.gap)+' points.'+(rival.weatherTipped?' Weather tipped the result: removing the weather contributions would erase or reverse this lead.':'')));drawer.appendChild(node('p',rival.connection,'offer-note'));
    if(rival.gains.length)drawer.appendChild(node('p','Where '+movie.title+' gained: '+rival.gains.map(x=>x.title+' +'+format(x.points)).join('; ')+'.'));
    if(rival.losses.length)drawer.appendChild(node('p','Where '+rival.title+' fought back: '+rival.losses.map(x=>x.title+' +'+format(-x.points)).join('; ')+'.'));
    if(rival.deltas.length){const all=node('details');all.appendChild(node('summary','Every score difference'));for(const delta of rival.deltas)all.appendChild(node('p',delta.title+': '+(delta.points>0?'+':'')+format(delta.points)+' for '+movie.title));drawer.appendChild(all);}
   }drawer.appendChild(node('p','A close call means a gap of 0.1 points or less. Scores are ranking rules, not confidence percentages. Displayed numbers are rounded.','offer-note'));drawer.classList.add('oracle-inner-comparison');report.appendChild(drawer);}
  const inventory=node('details',null,'source-disclosure');inventory.appendChild(node('summary','Behind the curtain'));const comparisonDrawer=report.querySelector('.oracle-comparison');if(comparisonDrawer)inventory.appendChild(comparisonDrawer);
  if(movie.fit?.reasons?.length)inventory.appendChild(node('p',movie.fit.reasons.join('. ')+'.'));
  inventory.appendChild(node('p',movie.oracle.verdict));
  const signals=node('div',null,'oracle-signals');let evidenceGroup=null;for(const item of [...movie.oracle.ledger].sort((a,b)=>Number(b.group==='taste')-Number(a.group==='taste'))){const group=item.group==='taste'?'Recorded taste inputs':'Weather, daylight, moon & context';if(group!==evidenceGroup){signals.appendChild(node('h4',group,'oracle-evidence-heading'));evidenceGroup=group;}const tile=node('div',null,'oracle-signal');tile.append(node('small',item.title),node('strong',item.value),node('small',item.group==='summary'?'SUBTOTAL · counted once':item.group==='context'?'SUPPORTING INPUT · no duplicate points':(item.points>0?'+':'')+item.points.toFixed(3)+' POINTS'+(item.raw!==item.points?' · scaled from '+item.raw.toFixed(3):'')),node('p',item.story||item.why));if(item.source)tile.appendChild(link(item.source.label,item.source.url));const rule=node('details',null,'oracle-factor-rule');rule.append(node('summary','How it counted'),node('p',item.why));tile.appendChild(rule);signals.appendChild(tile);}inventory.appendChild(signals);
  if(context?.news?.length){const headlines=node('details',null,'source-disclosure');headlines.appendChild(node('summary','Film headlines consulted'));for(const h of context.news){const item=node('p');item.appendChild(link(h.title,h.url));item.appendChild(node('small',' · '+h.source+' · '+formatFilmDate(new Date(h.publishedAt).toISOString().slice(0,10))));headlines.appendChild(item);}inventory.appendChild(headlines);}
  inventory.appendChild(link('Weather source · Open-Meteo','https://open-meteo.com/'));
  inventory.appendChild(node('p',context?.checkedAt?'Weather checked '+new Date(context.checkedAt).toLocaleString('en-US',{timeZone:'America/Denver'})+' MT. Modeled for Kalispell.':'Weather and news unavailable. No conditions invented.','offer-note'));
  inventory.appendChild(node('p','The reading is playful interpretation of film metadata. The connections above are the factual evidence. Atmosphere has a small, capped ranking weight; moon phase is approximate.','offer-note'));report.appendChild(inventory);return report;
 }
 function loadOracleReading(){ /* The local reading already uses the selected film and checked conditions. */ }
 function updatePickActions(){$('banish-pick').textContent=findMode==='oracle'?'NOT FOR ME':'HIDE';$('banish-pick').title=findMode==='oracle'?'Exclude this film from recommendations. Keep it in your collection. Undo is available.':'Hide this film';$('pick-again').textContent='PICK ANOTHER';for(const id of ['pick-again','banish-pick'])$(id).hidden=!currentPick;$('pick-film').hidden=!!currentPick;$('undo-banish').hidden=!lastAside;$('picker-more').hidden=!currentPick&&!lastAside;$('set-aside-duration-label').hidden=true;$('picker-feedback').hidden=!currentPick||findMode!=='oracle';$('feedback-weak').disabled=!currentPick?.fit?.connection;renderAsides();}
 async function importTaste(){const file=$('import-taste').files[0];if(!file)return;++pickRequest;const kind=$('taste-import-kind').value,rows=parseCSV(await file.text()),incoming=[],missed=[],diaryCounts=new Map();if(kind==='diary')for(const r of rows){const key=HubModel.norm(r.Name||r.name||r.Title||r.title)+':'+(r.Year||r.year||'');diaryCounts.set(key,(diaryCounts.get(key)||0)+1);}let done=0;const priorSeen=new Set(seenSet);for(const r of rows)if(kind==='ratings'||kind==='diary'||kind==='profile'&&r.Watched==='yes')seenSet.add(seenKey(r.Name||r.name||r.Title||r.title,r.Year||r.year));saveSeenSet();$('import-taste').disabled=true;try{await mapLimited(rows,4,async r=>{const shelf=HubModel.shelfRow(r),title=kind==='owned'?shelf.title:r.Name||r.name||r.Title||r.title,year=kind==='owned'?shelf.year:String(r.Year||r.year||r['Release Year']||'').slice(0,4);if(!title)return;try{const local=watchlist.find(m=>HubModel.norm(m.title)===HubModel.norm(title)&&(!year||(m.release_date||'').slice(0,4)===year));const explicit=kind==='owned'&&/^\d+$/.test(String(shelf.tmdbId||''))?await fetchMovieDetails(Number(shelf.tmdbId)):null;const matches=explicit?[explicit]:local?[local]:(await searchMovies(title)).filter(m=>HubModel.norm(m.title)===HubModel.norm(title)&&(!year||(m.release_date||'').slice(0,4)===year));const best=matches.length===1&&(!explicit||HubModel.norm(explicit.title)===HubModel.norm(title)&&(!year||String(explicit.release_date||'').startsWith(year)))?matches[0]:null;if(!best){missed.push(title);return;}const rating=Number(r.Rating||r.rating);if(kind==='ratings'&&(!Number.isFinite(rating)||rating<=0||rating>5)){missed.push(title);return;}const date=r['Watched Date']||((kind==='diary')?r.Date:null);const item={id:best.id,title:best.title,release_date:best.release_date,poster_path:best.poster_path,letterboxdURL:HubModel.safeLink(r['Letterboxd URI']||r.URI),source:'Letterboxd '+kind+' import',recordedAt:ReleaseModel.date(r['Recorded Date'])?r['Recorded Date']:undefined,watchedAt:ReleaseModel.date(date)?date:undefined};if(['ratings','profile'].includes(kind)&&rating>0&&rating<=5)item.rating=rating;if(kind==='diary')item.rewatches=Math.max(diaryCounts.get(HubModel.norm(title)+':'+year)||1,/yes|true/i.test(r.Rewatch||'')?2:1);if(kind==='profile'){item.rewatches=Number(r['Diary Count'])||0;item.favorite=r.Liked==='yes';}if(kind==='owned'){item.owned=true;const format=shelf.format;item.physicalFormats=[format&&format!=='Movie'?format.slice(0,80):'Physical copy'];}if(kind==='favorites')item.favorite=true;if(HubModel.evidence([item]).length){try{const d=await fetchMovieDetails(best.id);item.runtime=d.runtime;item.director=d.credits?.crew?.find(c=>c.job==='Director')?.name;item.overview=d.overview;item.meta={genres:d.genres,credits:{crew:(d.credits?.crew||[]).filter(c=>['Director','Writer','Screenplay','Story'].includes(c.job)).map(c=>({job:c.job,name:c.name}))}};}catch{}}incoming.push(item);}catch{missed.push(title);}finally{done++;$('taste-status').textContent='Matched '+done+' / '+rows.length;}});const prior=hubState.taste,priorIgnoredOwnership=[...hubState.ignoredOwnership];if(kind==='owned')hubState.ignoredOwnership=hubState.ignoredOwnership.filter(id=>!incoming.some(m=>m.id===id));hubState.taste=HubModel.mergeRecords(hubState.taste,incoming);save();renderTaste();renderTonight();renderPhysicalShelf();renderWatchlist(false,true);$('taste-status').textContent=incoming.length+' matched records · '+HubModel.evidence(hubState.taste).length+' positive taste records'+(missed.length?' · '+missed.length+' unmatched or ambiguous: '+[...new Set(missed)].join(', '):'');showToast('Taste records imported',()=>{hubState.taste=prior;hubState.ignoredOwnership=priorIgnoredOwnership;seenSet=priorSeen;saveSeenSet();save();renderTaste();renderTonight();renderPhysicalShelf();renderWatchlist(false,true);});}finally{$('import-taste').disabled=false;}}
 function renderTaste(){const out=$('taste-records');out.replaceChildren();for(const m of hubState.taste){const row=node('div',null,'taste-record');row.appendChild(node('span',m.title+' · '+[m.rating!=null?m.rating+'/5':'',m.owned?'owned':'',m.favorite?'favorite':'',m.rewatches?m.rewatches+' diary entries':''].filter(Boolean).join(' · ')));row.appendChild(button('REMOVE',()=>{const old=m;hubState.taste=hubState.taste.filter(x=>x.id!==m.id);hubState.ignoredTaste=[...new Set([...(hubState.ignoredTaste||[]),m.id])];save();renderTaste();renderTonight();renderPhysicalShelf();showToast('Removed taste record for '+m.title,()=>{hubState.taste=HubModel.mergeRecords(hubState.taste,[old]);hubState.ignoredTaste=hubState.ignoredTaste.filter(id=>id!==old.id);save();renderTaste();renderTonight();renderPhysicalShelf();});}));out.appendChild(row);}if(!out.children.length)out.textContent='No taste records yet. Oracle can make a discovery pick; import ratings or favorites to make it personal.';}


 function deferred(movie,status,context,beforeLookup=false){const records=[...banished,...hubState.setAsides].filter(r=>!beforeLookup||r.mode!=='price');return CounterModel.setAside(movie,status,records,context,Date.now(),today());}
 function renderAsides(){const out=$('set-aside-records');out.replaceChildren();for(const record of [...banished,...hubState.setAsides]){const row=node('div',null,'aside-record');const names={visit:'this visit',week:'one week',price:record.key?'until this rental gets cheaper':'until a rental reaches $'+Number(record.budget).toFixed(2),forever:'indefinitely',tonight:'until tomorrow'};const movie=watchlist.find(m=>m.id===record.id)||hubState.taste.find(m=>m.id===record.id);const active=CounterModel.asideActive(record,movie?.availabilitySnapshot,Date.now(),today());row.append(node('span',record.title+' · '+names[record.mode]+(record.scope==='oracle'?(hubState.feedback.some(r=>r.id===record.id&&r.kind==='notforme')?' · recommendations':' · Oracle only'):'')+(active?'':' · expired')),button('RESTORE',()=>restoreAside(record)));out.appendChild(row);}for(const record of hubState.feedback.filter(r=>r.kind==='weak')){const row=node('div',null,'aside-record');row.append(node('span',record.title+' · rejected connection to '+record.seedTitle),button('ALLOW CONNECTION AGAIN',()=>{hubState.feedback=hubState.feedback.filter(r=>r!==record);save();renderAsides();}));out.appendChild(row);}out.closest('.aside-management').hidden=!out.children.length;if(!out.children.length)out.textContent='Nothing set aside. Corrections do not become ratings.';}
 function restoreAside(record){if(record.scope==='oracle'){const history=JSON.parse(localStorage.getItem('rewind-recommendations-v1')||'[]');localStorage.setItem('rewind-recommendations-v1',JSON.stringify(history.filter(r=>r.id!==record.id)));}if(record.scope==='oracle')hubState.feedback=hubState.feedback.filter(r=>!(r.kind==='notforme'&&r.id===record.id));banished=banished.filter(r=>r!==record);hubState.setAsides=hubState.setAsides.filter(r=>r!==record);dealt.delete(record.id);if(lastAside===record)lastAside=null;save();renderAsides();renderTonight();updatePickActions();}
 function undoLastAside(){if(!lastAside)return;restoreAside(lastAside);showToast('Returned to the deck');}
 function setAsideCurrent(mode,scope='all'){if(!currentPick)return;const cost=ReleaseModel.cost(currentPick.availabilitySnapshot?.offers,rentalBudget),record=CounterModel.createAside(currentPick,mode,Date.now(),cost.offer,rentalBudget,scope);if(mode==='tonight')record.untilDate=addDays(today(),1);if(mode==='visit')banished.push(record);else{hubState.setAsides.push(record);save();}lastAside=record;currentPick=null;updatePickActions();renderTonight();pickFilm();}
 function correctPick(kind){if(!currentPick)return;if(kind==='seen'&&typeof RewindMedia!=='undefined'&&RewindMedia.isTV(currentPick)){RewindMedia.recordProgress(currentPick);currentPick=null;$('picker-results').replaceChildren();$('picker-status').textContent='Choose the season you finished. No other seasons were marked watched.';updatePickActions();return;}const movie=currentPick,connection=movie.fit?.connection;const record={id:movie.id,title:movie.title,kind,at:Date.now(),seedId:connection?.seedId,seedTitle:connection?.seedTitle};hubState.feedback.push(record);save();if(kind==='seen'){markMovieWatched(movie);currentPick=null;$('picker-results').replaceChildren();$('picker-status').textContent='Recorded as seen. Your ratings were not changed.';updatePickActions();return;}if(kind==='familiar'||kind==='notforme'){setAsideCurrent('forever','oracle');if(kind==='notforme')showToast('Removed from recommendations. Your collection is unchanged.',undoLastAside);return;}if(kind==='tonight'){setAsideCurrent('tonight','oracle');return;}currentPick=null;updatePickActions();renderAsides();pickFilm();}
 function renderReceipts(){const out=$('change-receipts');out.replaceChildren();const receipts=[...hubState.changeReceipts].sort((a,b)=>b.at-a.at),unread=receipts.filter(r=>r.at>(hubState.receiptsReadAt||0)).length;$('change-summary').textContent='Availability changes'+(unread?' · '+unread+' unread':'');const updates=$('watchlist-updates-label');if(updates)updates.textContent='Change history';$('changes-read').hidden=!unread;for(const receipt of receipts.slice(0,100)){const item=node('article',null,'change-receipt');item.append(node('h4',receipt.title),node('p',receipt.text));const time=value=>value?new Date(value).toLocaleString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' MT':'not recorded';item.appendChild(node('small','Observed '+time(receipt.at)));const details=node('details');details.append(node('summary','Checks & source'),node('p','Previous check: '+time(receipt.beforeCheckedAt)),node('p','Current check: '+time(receipt.checkedAt)),node('p',receipt.source||'Verified source'));if(receipt.quotedAt)details.appendChild(node('p','Quote checked: '+time(receipt.quotedAt)));if(HubModel.safeLink(receipt.url))details.appendChild(link('OPEN SOURCE',receipt.url));item.appendChild(details);out.appendChild(item);}if(!receipts.length)out.textContent='No observed changes yet. The first successful check establishes a baseline.';}
 function recordScreeningReceipts(){if(!cinema?.local||cinema.local.stale)return;const fresh=cinema.local.items.map(r=>({id:r.id,title:r.title,dates:r.dates,checkedAt:cinema.local.checkedAt})),previous=hubState.calendarBaseline;for(const row of fresh){const old=previous.find(r=>r.id===row.id||HubModel.norm(r.title)===HubModel.norm(row.title));const film=filmFor(row);if(!previous.length||!film||!watchlist.some(m=>m.id===film.id)&&!HubModel.evidence([film]).length)continue;const added=row.dates.filter(d=>d>=today()&&!old?.dates.includes(d));if(added.length){const id='screening:'+row.id+':'+added.join(',');if(!hubState.changeReceipts.some(r=>r.id===id))hubState.changeReceipts.push({id,movieId:film.id,title:row.title,type:'screening',text:'Kalispell screenings added: '+added.map(formatFilmDate).join(', '),at:Date.now(),beforeCheckedAt:old?.checkedAt,checkedAt:cinema.local.checkedAt,source:'Local screening source',url:cinema.local.sourceURL||cinema.theatreURL});}}hubState.calendarBaseline=fresh;save();renderReceipts();}
 function renderPhysicalShelf(){
  const owned=hubState.taste.filter(m=>m.owned),select=$('physical-format'),selected=select.value||'all';
  select.replaceChildren();const all=node('option','All formats');all.value='all';select.appendChild(all);
  for(const format of [...new Set(owned.flatMap(m=>m.physicalFormats?.length?m.physicalFormats:['Physical copy']))].sort()){const option=node('option',format);option.value=format;select.appendChild(option);}select.value=[...select.options].some(o=>o.value===selected)?selected:'all';
  const films=owned.filter(m=>(typeof RewindMedia==='undefined'||RewindMedia.accepts(m))).filter(m=>select.value==='all'||(m.physicalFormats||['Physical copy']).includes(select.value)).sort((a,b)=>a.title.localeCompare(b.title));
  const grid=$('physical-grid');grid.replaceChildren();$('physical-count').textContent=films.length+' films'+(select.value==='all'?' on your shelf':' · '+select.value);
  for(const movie of films){const remove=()=>{const previous=JSON.parse(JSON.stringify(movie));movie.owned=false;movie.physicalFormats=[];hubState.ignoredOwnership=[...new Set([...hubState.ignoredOwnership,movie.id])];save();renderTonight();renderPhysicalShelf();renderWatchlist(false,true);showToast(movie.title+' removed from physical shelf',()=>{Object.assign(movie,previous);hubState.ignoredOwnership=hubState.ignoredOwnership.filter(id=>id!==movie.id);save();renderTonight();renderPhysicalShelf();renderWatchlist(false,true);});};const card=renderCard(movie,{context:'physical',status:HubModel.shelfStatus(movie),onRemovePhysical:remove});if(isSeen(movie))card.querySelector('.card-meta').after(node('p','A REWATCH','new-tag'));grid.appendChild(card);}
  if(!films.length)grid.appendChild(node('p',owned.length?'No copies in this format.':'Import your barcode-app CSV in Settings. Titles with ambiguous matches will be listed for review.','empty-note'));
 }
 function renderTonight(applyNow=false){
  if(!applyNow&&window.RewindStartup?.defer('tonight',()=>renderTonight(true)))return;
  const grid=$('tonight-grid');grid.replaceChildren();const pool=new Map((typeof RewindMedia!=='undefined'?RewindMedia.collection():watchlist).map(m=>[m.id,m]));for(const m of hubState.taste.filter(m=>m.owned))pool.set(m.id,{...pool.get(m.id),...m});
  const seeds=[...HubModel.evidence(hubState.taste).filter(m=>typeof RewindMedia==='undefined'||!RewindMedia.isTV(m)),...(typeof RewindMedia!=='undefined'?RewindMedia.evidence():[])],seedFeatures=new Map(seeds.map(seed=>[seed,HubModel.features(seed)])),eligible=[];
  for(const movie of pool.values()){
   if(typeof RewindMedia!=='undefined'&&(!RewindMedia.accepts(movie)||!RewindMedia.playable(movie)))continue;
   const own=hubState.taste.find(m=>m.id===movie.id&&m.owned),saved=movie.availabilitySnapshot;
   const fresh=saved&&!saved.stale&&Date.now()-(saved.checkedAt||0)<24*3600000;
   const offers=[...(own?HubModel.shelfStatus(own).offers:[]),...(fresh?saved.offers||[]:[])].filter(o=>o.kind==='physical'||o.kind==='free'||o.kind==='subscription'&&o.included||o.kind==='rent'&&typeof o.price==='number'&&o.price<=rentalBudget);
   if(!offers.length||deferred(movie,saved,'tonight')||isSeen(movie)&&!own||hubState.feedback.some(r=>r.id===movie.id&&r.kind==='notforme'))continue;const cost=ReleaseModel.cost(offers,rentalBudget),fit=HubModel.affinity({...movie,meta:movie.meta||movie.detailsSnapshot},seeds,hubState.feedback,seedFeatures),category=cost.offer.kind==='physical'?'physical':cost.offer.kind==='rent'?'rental':'included';
   const change=WatchlistModel.actionable(movie,saved,hubState.changeReceipts,rentalBudget),newlyAffordable=change?.type==='price'&&change.from>rentalBudget&&change.to<=rentalBudget;
   const reason=change?change.text:movie.pinned?'You pinned this one.':fit.connection?.directors?.length?'From '+fit.connection.directors.join(' and ')+'.':HubModel.watchlistPriority(movie)>0?'Newly included after a confirmed availability change.':category==='physical'?(isSeen(movie)?'Your own copy, ready for a rewatch.':'Your own copy. No rental checkout.'):category==='rental'?'A verified rental within your $'+rentalBudget.toFixed(2)+' limit.':'On your watchlist and included tonight.';
   eligible.push({movie,cost,category,reason,fit,score:(movie.pinned?100:0)+(newlyAffordable?60:change?.type==='included'?50:change?20:0)+(isSeen(movie)?-8:0)+fit.score+HubModel.watchlistPriority(movie)});
  }
  eligible.sort((a,b)=>b.score-a.score||a.movie.title.localeCompare(b.movie.title));const chosen=[];
  for(const [category,label] of [['included','Included'],['rental','At your price']]){const next=eligible.find(x=>x.category===category);if(next)chosen.push({...next,slot:label});}
  const owned=eligible.find(x=>x.category==='physical'&&!chosen.some(c=>c.movie.id===x.movie.id));
  const moment=owned||eligible.find(x=>x.fit.score>=3&&!chosen.some(c=>c.movie.id===x.movie.id));
  if(moment)chosen.push({...moment,slot:owned?'On your shelf':'A little further out'});
  $('tonight-shelf').hidden=!chosen.length;
  $('tonight-status').textContent=chosen.length?'A few distinct ways to spend the next couple of hours.':'';
  for(const {movie,cost,reason,fit,slot} of chosen){
   const saved=watchlist.find(m=>m.id===movie.id),owned=hubState.taste.find(m=>m.id===movie.id&&m.owned),snapshot=movie.availabilitySnapshot||{};
   const status={...snapshot,offers:[...(owned?HubModel.shelfStatus(owned).offers:[]),...(!snapshot.stale?snapshot.offers||[]:[])],stale:false};
   const card=renderCard(movie,{context:saved?'watchlist':owned?'physical':'picker',status,collectionCost:cost});card.classList.add('tonight-card');
   card.setAttribute('aria-label',slot+': '+movie.title);
   const note=node('p',WatchlistModel.actionable(movie,snapshot,hubState.changeReceipts,rentalBudget)?.text||FilmOracle.reading({...movie,meta:movie.meta||movie.detailsSnapshot||movie},fit).heading,'tonight-reason');card.querySelector('.film-details-trigger').before(note);balanceCardUpdates(card);grid.appendChild(card);
  }
 }
 function watched(movie,undo){$('return-stamp').textContent='RETURNED '+new Date().toLocaleDateString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',year:'numeric'}).toUpperCase();$('watched-film-name').textContent=movie.title;$('watched-letterboxd').href=HubModel.letterboxd(movie);$('watched-undo').onclick=()=>{undo();$('watched-dialog').close();};$('watched-dialog').showModal();document.body.classList.add('film-dialog-open');}
 async function refreshCalendarReleases(){
  // Only the currently relevant future films are rechecked. Don't spam hundreds of
  // watched or old watchlist titles every time the user taps Refresh.
  const end=addDays(anchor,28);
  const targets=watchlist.filter(m=>m.pinned||HubModel.upcoming(m,today()).some(r=>r.date>=today()&&r.date<=end)).slice(0,30);
  let updated=0,failed=0;
  await mapLimited(targets,3,async movie=>{
   const current=watchlist.find(m=>m.id===movie.id);if(!current)return;
   const draft={...current};
   try{
    const status=await deriveStatus(draft,true);
    if(!status||status.stale&&!status.physical){failed++;return;}
    Object.assign(current,draft);updated++;
   }catch{failed++;}
  });
  if(updated)saveWatchlist();
  return {total:targets.length,updated,failed};
 }
 function stateChanged(){renderCalendar();renderNews();decorateCards();if($('tab-watchlist').classList.contains('active')){renderTonight();renderReceipts();}renderPhysicalShelf();renderAsides();}
 function init(){const news=node('details',null,'hub-news');news.id='hub-news';news.hidden=true;$('card-summary').after(news);document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.tab==='upcoming'){loadCinema();renderCalendar();}if(b.dataset.tab==='import'){renderTaste();$('event-email-alerts').checked=!!hubState.eventAlerts;}}));document.querySelectorAll('[data-find-mode]').forEach(b=>b.onclick=()=>setFindMode(b.dataset.findMode));$('calendar-view').onclick=()=>{calendarView='calendar';renderCalendar();};$('calendar-list').onclick=()=>{calendarView='list';renderCalendar();};const goWeek=date=>{anchor=date;openCalendarEvent=null;$('event-detail').hidden=true;renderCalendar();loadCinema();};$('calendar-prev').onclick=()=>goWeek(addDays(anchor,-7));$('calendar-next').onclick=()=>goWeek(addDays(anchor,7));$('calendar-today').onclick=()=>goWeek(today());$('calendar-search').oninput=renderCalendar;$('cinema-refresh').onclick=async()=>{
  const btn=$('cinema-refresh');if(btn.disabled)return;
  btn.disabled=true;
  const note=$('cinema-status');note.textContent='Refreshing theater dates and upcoming tracked releases…';
  try{
   horizonFeed=null;announcementPromise=null;calendarCache=null;calendarFailure=null;
   await loadCinema(true);
   await refreshTrackedReleases().catch(()=>{});
   const result=await refreshCalendarReleases();

   renderCalendar();
   if(result.total)note.textContent+=' | Film checks: '+result.updated+'/'+result.total+(result.failed?' · '+result.failed+' unavailable':'');
  }finally{btn.disabled=false;}
 };$('pick-film').onclick=pickFilm;$('pick-again').onclick=pickFilm;$('banish-pick').onclick=()=>findMode==='oracle'?correctPick('notforme'):setAsideCurrent('forever');$('undo-banish').onclick=undoLastAside;$('import-taste').onchange=importTaste;$('event-email-alerts').checked=!!hubState.eventAlerts;$('event-email-alerts').onchange=()=>{hubState.eventAlerts=$('event-email-alerts').checked;save();showToast('Event email preference saved');};$('watched-close').onclick=()=>$('watched-dialog').close();renderTaste();const tasteReady=loadTasteBaseline();window.RewindStartup?.track('taste',tasteReady);fetch('taste-profile.json',{cache:'no-cache'}).then(r=>r.json()).then(p=>{$('written-taste').textContent=p.profile||'';}).catch(()=>{});const cinemaReady=loadCinema();window.RewindStartup?.track('screenings',cinemaReady);refreshTrackedReleases().catch(()=>{});
 const legacy=$('legacy-links');for(const [name,url] of [['KALISPELL SHOWTIMES','https://github.com/bmbailey96/kalispell-showtimes'],['MOVIE ORACLE','https://github.com/bmbailey96/movie-oracle'],['MOVIE ROULETTE','https://github.com/bmbailey96/movie-roulette']])legacy.appendChild(link(name,url));window.addEventListener('rewind:state',stateChanged);window.addEventListener('rewind:card-rendered',decorateCards);window.addEventListener('rewind:watchlist-ready',()=>{if($('tab-watchlist').classList.contains('active')){renderTonight();renderReceipts();}});document.querySelector('[data-tab=watchlist]').addEventListener('click',()=>{renderTonight();renderReceipts();});}
 function initCalmControls(){
  const viewSwitch=node('div',null,'calendar-view-switch');viewSwitch.setAttribute('aria-label','Calendar layout');for(const [id,label] of [['calendar-view','Timeline'],['calendar-list','List']]){const control=$(id);control.textContent=label;viewSwitch.appendChild(control);}document.querySelector('.board-head').insertBefore(viewSwitch,document.querySelector('.board-nav'));if(typeof matchMedia==='function'){const phone=matchMedia('(max-width:700px)'),labelView=()=>{$('calendar-view').textContent=phone.matches?'Week':'Timeline';};labelView();phone.addEventListener?.('change',labelView);}
  let preferences={};try{preferences=JSON.parse(localStorage.getItem('rewind-ui-v1')||'{}')||{};}catch{}
  const remember=(key,value)=>{preferences[key]=value;try{localStorage.setItem('rewind-ui-v1',JSON.stringify(preferences));}catch{}};
  const picker=$('picker-cost');
  if([...picker.options].some(o=>o.value===preferences.pickerCost))picker.value=preferences.pickerCost;
  if(['smart','shuffle'].includes(preferences.pickerOrder))$('picker-order').value=preferences.pickerOrder;
  $('picker-order').addEventListener('change',()=>remember('pickerOrder',$('picker-order').value));
  calendarSource='kalispell';
  $('calendar-saved-only').checked=preferences.calendarSavedOnly===true;
  const venue=$('calendar-venue');venue.value='kalispell';
  const paintFilters=()=>{for(const control of document.querySelectorAll('[data-calendar-source]'))control.setAttribute('aria-pressed',String(control.dataset.calendarSource===calendarSource));venue.value=calendarSource==='local'?'all':'kalispell';venue.closest('label').hidden=true;const mediaFilter=$('calendar-media-filter');if(mediaFilter)mediaFilter.hidden=calendarSource!=='digital';};
  const redrawCalendar=()=>{openCalendarEvent=null;$('event-detail').hidden=true;paintFilters();if(cinema)updateCinemaStatus();renderCalendar();};
  const selectSource=value=>{calendarSource=value;remember('calendarSource',value);redrawCalendar();};
  document.querySelectorAll('[data-calendar-source]').forEach(control=>control.onclick=()=>selectSource(control.dataset.calendarSource));
  venue.onchange=()=>{remember('calendarVenue',venue.value);redrawCalendar();};
  $('calendar-saved-only').onchange=()=>{remember('calendarSavedOnly',$('calendar-saved-only').checked);redrawCalendar();};
  calendarView=preferences.calendarView==='list'?'list':'calendar';paintFilters();
  picker.addEventListener('change',()=>{remember('pickerCost',picker.value);++pickRequest;currentPick=null;$('picker-results').replaceChildren();$('picker-status').textContent='Viewing source changed. Make a fresh pick.';$('pick-film').disabled=false;$('pick-again').disabled=false;updatePickActions();});
  for(const [id,value] of [['calendar-view','calendar'],['calendar-list','list']])$(id).addEventListener('click',()=>remember('calendarView',value));
  document.querySelectorAll('[data-find-mode]').forEach(b=>b.addEventListener('click',()=>{if(['oracle','roulette'].includes(b.dataset.findMode))remember('pickerMode',b.dataset.findMode);}));
  $('choose-tonight').onclick=()=>{document.querySelector('[data-tab="discover"]').click();setFindMode(preferences.pickerMode==='oracle'?'oracle':'roulette');$('pick-film').focus();};
  for(const block of document.querySelectorAll('#tab-import>.import-block')){
   const heading=block.querySelector('h3');if(!heading)continue;
   const group=document.createElement('details');group.className='settings-group';
   const summary=node('summary',heading.textContent);group.appendChild(summary);heading.remove();
   block.replaceWith(group);group.appendChild(block);
  }
  const settingsGroups=new Map([...document.querySelectorAll('#tab-import>.settings-group')].map(g=>[g.querySelector('summary').textContent,g]));
  for(const [section,items] of [
   ['Watching',[['Your streaming services','Streaming services'],['Email alerts','Email alerts']]],
   ['Your collection',[['Letterboxd diary','Letterboxd diary'],['Existing Watchlist','Import watchlist'],['Already Seen','Import watched films'],['Your taste','Taste & physical shelf']]],
   ['Connections',[['Sync Across Devices','Sync across devices']]],
   ['Advanced',[['Live rental and purchase prices','Optional price connection'],['Project sources','Project sources']]]
  ]){const heading=node('h3',section,'settings-section-title');$('tab-import').append(heading);for(const [old,label] of items){const group=settingsGroups.get(old);if(group){group.querySelector('summary').textContent=label;$('tab-import').append(group);}}}
  const maintenance=$('tab-import').querySelector('.maintenance-controls');if(maintenance)$('tab-import').append(maintenance);
  $('feedback-seen').onclick=()=>correctPick('seen');$('feedback-familiar').onclick=()=>correctPick('familiar');$('feedback-tonight').onclick=()=>correctPick('tonight');$('feedback-weak').onclick=()=>correctPick('weak');$('changes-read').onclick=()=>{hubState.receiptsReadAt=Date.now();save();renderReceipts();};$('physical-format').onchange=renderPhysicalShelf;$('shelf-import-link').onclick=()=>{document.querySelector('[data-tab=import]').click();$('taste-import-kind').value='owned';const group=$('import-taste').closest('details');if(group)group.open=true;$('import-taste').scrollIntoView({block:'center'});$('import-taste').focus();};renderCalendar();renderTonight();renderPhysicalShelf();renderReceipts();renderAsides();
 }
 $('watched-dialog').addEventListener('close',()=>{if(!document.querySelector('dialog[open]'))document.body.classList.remove('film-dialog-open');});
 init();initCalmControls();return {mediaChanged:()=>{++pickRequest;currentPick=null;$('picker-results').replaceChildren();$('pick-film').disabled=false;$('pick-again').disabled=false;updatePickActions();renderCalendar();renderTonight();renderPhysicalShelf();},localListing,watched,stateChanged,loadTasteBaseline,setFindMode,loadOccasions,renderPhysicalShelf,renderTaste,hasPhysicalShelf:()=>hubState.taste.some(m=>m.owned)};
})();
