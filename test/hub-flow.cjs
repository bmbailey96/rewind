const {JSDOM}=require('jsdom');
const fs=require('node:fs'),assert=require('node:assert/strict');
const feed=JSON.parse(fs.readFileSync(__dirname+'/../release-announcements.json'));
const films=[{id:1204680,title:'Coyote vs. Acme',release_date:'2026-08-28',poster_path:'/c.jpg',alert:{mode:'any',maxPrice:5.99}},{id:1290418,title:'The Cycle',release_date:'2026-09-24',poster_path:'/s.jpg',alert:{mode:'mine',maxPrice:5.99}},{id:3,title:'Included Movie',release_date:'2026-08-28',poster_path:'/i.jpg',alert:{mode:'mine',maxPrice:5.99}}];
const details=m=>({...m,runtime:m.id===7?4:100,overview:'A useful synopsis. More details after that.',credits:{crew:[{job:'Director',name:'Jane Director'}]},release_dates:{results:[{iso_3166_1:'US',release_dates:[{type:3,release_date:m.release_date+'T00:00:00Z'},...(m.id===1204680?[{type:4,release_date:'2026-09-29T00:00:00Z'}]:[])]}]}});
const wait=()=>new Promise(r=>setTimeout(r,100));
(async()=>{
 const dom=new JSDOM(fs.readFileSync(__dirname+'/../index.html','utf8'),{url:'https://bekind-rewind.netlify.app',runScripts:'outside-only'}),w=dom.window;let failed=false,price=19.99,posted,discoverQueries=[],deckRequests=0,included3=true,searchMatches=[films[1]],cinemaRevision=0;
 // Keep dated screening fixtures independent of the day CI runs.
 const NativeDate=w.Date;
 w.Date=class extends NativeDate {
  constructor(...args){super(...(args.length?args:['2026-10-05T18:00:00Z']));}
  static now(){return NativeDate.parse('2026-10-05T18:00:00Z');}
 };
 w.document.getElementById('letterboxd-export-additions').remove();w.document.getElementById('letterboxd-export-note').remove(); // A cached pre-export page must still boot with the new script.
 w.IntersectionObserver=class {constructor(callback){this.callback=callback;w.offerObserver=this;}observe(target){if(target?.id==='watchlist-more')w.watchlistScrollObserver=this;}unobserve(){}};
 w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new this.ownerDocument.defaultView.Event('close'))};
 w.localStorage.setItem('rewind-last-visit-v1',String(w.Date.now()-3600000));
 w.localStorage.setItem('rewind-ui-v1',JSON.stringify({pickerCost:'included',pickerMode:'oracle'}));
 w.localStorage.setItem('rewind-watchlist-v1',JSON.stringify(films));w.localStorage.setItem('rewind-coyote-seeded-v1','1');w.localStorage.setItem('rewind-watchmode-key','fixture');
 w.fetch=async(raw,opts={})=>{const u=new URL(raw,'https://bekind-rewind.netlify.app');let body;
  if(u.pathname.includes('rewind-cinema')||u.pathname==='/cinema-snapshot.json')body={events:{items:[{id:'event-a',title:'Coyote vs. Acme Special Screening',dates:['2026-10-06','2026-10-08'],ranges:[],start:'2026-10-06',end:'2026-10-08',dateLabel:'Oct 6 · Oct 8',url:'https://www.fathomentertainment.com/releases/test/'}],checkedAt:Date.now(),stale:false},local:{items:[{id:'local-coyote-'+cinemaRevision,title:'Coyote vs. Acme',dates:['2026-10-06','2026-10-07','2026-10-09'],start:'2026-10-06',end:'2026-10-09',screenings:[{date:'2026-10-06',time:'7:00pm',format:'Standard',url:'https://tickets.fandango.com/test'}],url:'https://www.cinemark.com/theatres/test'}],checkedAt:Date.now(),stale:false}};
  else if(u.pathname.includes('rewind-horizon')||u.pathname==='/horizon-snapshot.json')body={checkedAt:w.Date.now(),stale:false,items:[{id:1599181,title:'Chronovisor',source:'Grasshopper Film',sourceURL:'https://grasshopperfilm.com/film/chronovisor/',sourceStatus:'limited',checkedAt:w.Date.now(),screenings:[{date:'2026-10-24',time:'5:30pm',location:'Missoula, MT',label:'Montana Film Festival',sourceURL:'https://www.montanafilmfestival.org/films/feature/chronovisor/',checkedAt:w.Date.now()}]}]};
  else if(u.pathname==='/roulette-deck.json'){deckRequests++;body=[{...films[2],tags:['folk'],tones:{cozy:80},runtime:100}];}
  else if(u.pathname==='/release-announcements.json')body=feed;
  else if(u.pathname.includes('rewind-watchlist')){if(opts.method==='POST'){posted=JSON.parse(opts.body);body={count:posted.movies.length};}else body={enabled:true,movies:films,pricesConfigured:false};}
  else if(u.pathname.includes('rewind-prices'))body={id:Number(u.searchParams.get('id')),offers:[],checkedAt:w.Date.now(),source:'JustWatch US prices'};
  else if(u.pathname.includes('rewind-status'))body={enabled:true,tracked:3,pricesConfigured:false};
  else if(u.hostname==='api.watchmode.com') {assert.equal(opts.headers['X-API-Key'],'fixture');if(u.pathname.includes('/releases'))body={releases:[]};else body=u.pathname.includes('1204680')?[{name:'Apple TV Store',type:'rent',region:'US',price,format:'HD',web_url:'https://tv.apple.com/test'}]:[];}
  else if(u.pathname.endsWith('/watch/providers')){if(failed)throw Error('offline');body={results:{US:u.pathname.includes('/1204680/')?{rent:[{provider_id:2,provider_name:'Apple TV Store'}]}:u.pathname.includes('/movie/3/')&&included3?{flatrate:[{provider_id:386,provider_name:'Peacock Premium'}]}:{}}};}
  else if(u.pathname.includes('/discover/')){discoverQueries.push(u.searchParams);body={results:[{id:5,title:'Small Feature',release_date:'2026-08-28',poster_path:'/f.jpg',vote_count:2},{id:7,title:'Short',release_date:'2026-08-28',poster_path:'/z.jpg',vote_count:300}],total_pages:1};}
  else if(u.pathname.includes('/search/'))body={results:searchMatches};
  else {const id=Number(u.pathname.split('/').at(-1));body=details(films.find(m=>m.id===id)||{id,title:'Feature',release_date:'2026-08-28',poster_path:'/f.jpg'});}
  return {ok:true,json:async()=>body};
 };
 w.eval(['rewind-model.js','release-model.js','availability-ui.js','counter-model.js','discovery-model.js','taste-model.js','hub-model.js','artwork-model.js','occasion-model.js','oracle.js','storage-model.js','sync-model.js','static-model.js','watchlist-model.js','movie-news-model.js','app.js','hub.js','static-experience.js','movie-news.js','letterboxd-diary.js'].map(file=>fs.readFileSync(__dirname+'/../'+file,'utf8')).join('\n')+'\nwindow.testState={movies:()=>watchlist,replaceMovies:m=>watchlist=m,hub:()=>hubState,hubInterface:Hub,syncBase,seen:()=>seenSet,changed:()=>Hub.stateChanged()};');
 await wait();
 assert.equal(w.document.getElementById('tab-watchlist').dataset.scope,'release','Release Watch is the initial film view');
 assert.equal(w.document.getElementById('release-watch-empty').hidden,false,'Release Watch gives a clear empty state for uncertain old saves');
 assert.equal(w.document.getElementById('rw-recovery').hidden,false,'Old watchlist candidates can be followed individually');
 assert.ok(w.document.getElementById('rw-recovery').closest('#film-drawer'),'Recovery is inside Collection, not above movie shelves');
 assert.ok(w.document.querySelectorAll('#rw-recovery-list button').length>0,'Uncertain old films are offered for manual review, not silently flagged');
 w.document.querySelector('[data-watchlist-scope="all"]').click();await w.eval("renderWatchlist()");
 const waitingFixture=w.testState.movies()[0],waitingStatus={offers:[],stale:true,checkedAt:w.Date.now()-2*86400000};
 const releaseFixture={...waitingFixture,releaseFile:{title:waitingFixture.title,screenings:[],source:'Catalog',sourceURL:'https://example.com/film'}};
 for(const film of [waitingFixture,releaseFixture]){
  const card=w.renderCard(film,{context:'watchlist',status:waitingStatus,collectionCost:{...w.ReleaseModel.cost([],7.99,false),stale:true}});
  assert.equal(card.querySelector('.cost-badge').textContent,'WAITING','Release metadata must not hide the availability label');
  assert.ok(card.querySelector('.cost-warning'),'Both card types show the previous-check date');
 }
 const pinButton=w.document.querySelector('.poster-pin[aria-label="Pin Coyote vs. Acme"]');assert.ok(pinButton,'Saved films expose a poster pin');
 pinButton.click();await wait();
 assert.equal(w.testState.movies().find(m=>m.id===1204680).pinned,true);assert.equal(w.StorageModel.read(w.localStorage,'rewind-watchlist-v1').find(m=>m.id===1204680).pinned,true,'Pin persists locally');
 assert.equal(w.document.querySelector('.poster-pin[aria-label="Unpin Coyote vs. Acme"]').getAttribute('aria-pressed'),'true');
 assert.ok(!w.document.querySelector('#film-detail-dialog[open]'),'Pin does not open film details');
 w.document.querySelector('.poster-pin[aria-label="Unpin Coyote vs. Acme"]').click();await wait();
 assert.equal(w.testState.movies().find(m=>m.id===1204680).pinned,false);assert.equal(w.StorageModel.read(w.localStorage,'rewind-watchlist-v1').find(m=>m.id===1204680).pinned,false,'Unpin persists locally');
 assert.equal(w.document.querySelector('.poster-pin[aria-label="Pin Coyote vs. Acme"]').getAttribute('aria-pressed'),'false');

 const forecastMovie={id:88991,title:'Past estimate fixture',detailsSnapshot:{release_dates:{results:[{iso_3166_1:'US',release_dates:[{type:4,release_date:'2026-09-01T00:00:00Z'}]}]}}};
 const forecastStatus={offers:[{kind:'rent',provider:'Apple TV',format:'4K',price:19.99}],checkedAt:w.Date.now()-86400000,stale:true};
 const forecastCard=w.renderCard(forecastMovie,{context:'watchlist',status:forecastStatus,collectionCost:{...w.ReleaseModel.cost(forecastStatus.offers,7.99,false),stale:true}});
 assert.equal(forecastCard.querySelector('.forecast-note-date').textContent,'Sep 22');
 assert.equal(forecastCard.querySelector('.forecast-note-away').textContent,'13 days past estimate');
 assert.match(forecastCard.querySelector('.rental-forecast-note').title,/Price needs a fresh check/);
 assert.doesNotMatch(forecastCard.querySelector('.rental-forecast-note').textContent,/ to /,'Card uses one date rather than a wrapping range');
 const forecastDetails=w.renderRentalForecast(forecastMovie,forecastStatus,{});
 assert.match(forecastDetails.textContent,/Sep 22 · 13 days past estimate/);
 assert.doesNotMatch(forecastDetails.textContent,/still above|has not fallen/,'An old quote cannot prove the current price has not fallen');
 assert.equal(w.document.querySelectorAll('.tabs [data-tab]').length,4);
 assert.equal(w.document.getElementById('card-options').open,false);
 assert.equal(w.document.getElementById('calendar-scope').value,'personal');assert.equal(w.document.getElementById('calendar-recommendations').checked,false);
 assert.match(w.document.getElementById('tonight-grid').textContent,/Included Movie/);assert.doesNotMatch(w.document.getElementById('tonight-grid').textContent,/Coyote/,'Over-budget rental is absent from Tonight');
 assert.equal(w.document.getElementById('picker-cost').value,'included');
 w.document.getElementById('choose-tonight').click();
 assert.equal(w.document.getElementById('tab-discover').classList.contains('active'),true);
 assert.equal(w.document.querySelector('[data-find-mode=oracle]').getAttribute('aria-pressed'),'true');
 w.document.querySelector('[data-tab=watchlist]').click();
 await w.eval('renderWatchlist()');
 assert.ok([...w.document.querySelectorAll('#tab-import>.settings-group>summary')].some(s=>s.textContent==='Taste & physical shelf'));assert.ok(w.document.getElementById('gh-connect-btn').closest('details.settings-group'));

 assert.match(w.document.getElementById('watch-now-grid').textContent,/Included Movie/);assert.match(w.document.getElementById('paid-grid').textContent,/Coyote/);assert.match(w.document.getElementById('waiting-grid').textContent,/The Cycle/);
 assert.equal(JSON.parse(w.localStorage.getItem('rewind-watchlist-v1')).find(m=>m.id===3).includedSince,undefined,'First observation is not a new arrival');
 included3=false;await w.eval('renderWatchlist(true)');included3=true;await w.eval('renderWatchlist(true)');
 assert.equal(JSON.parse(w.localStorage.getItem('rewind-watchlist-v1')).find(m=>m.id===3).includedSince,w.Date.now(),'Only a confirmed transition earns arrival priority');
 assert.match(w.document.getElementById('waiting-grid').textContent,/Shudder on Oct 23/);
 w.document.querySelector('#waiting-grid .film-details-trigger').click();await wait();assert.match(w.document.getElementById('film-detail-dialog').textContent,/Shudder official US lineup/);w.document.querySelector('.film-detail-close').click();
 assert.match(w.document.getElementById('paid-grid').textContent,/\$19\.99/);w.document.querySelector('#paid-grid .film-details-trigger').click();await wait();assert.match(w.document.getElementById('film-detail-dialog').textContent,/Cheaper rental estimate: Oct 20 · in 15 days/);assert.match(w.document.getElementById('film-detail-dialog').textContent,/32 days after theatrical/);
 assert.ok(discoverQueries.every(p=>!p.has('vote_count.gte')));assert.match(w.document.getElementById('discover-grid').textContent,/Small Feature/);assert.ok(discoverQueries.length<=3,'Initial Discover does not scan six catalog pages');
 const select=w.document.querySelector('[aria-label="Alert preference for Coyote vs. Acme"]');select.value='rental';select.dispatchEvent(new w.Event('change'));const amount=w.document.querySelector('[aria-label="Maximum rental price for Coyote vs. Acme"]');amount.value='6.99';amount.dispatchEvent(new w.Event('change'));
 const saved=JSON.parse(w.localStorage.getItem('rewind-watchlist-v1'));assert.deepEqual(saved[0].alert,{mode:'rental',maxPrice:6.99});assert.equal(saved[0].priceHistory.length,1);assert.ok(!saved[0].detailsSnapshot.credits);w.document.querySelector('.film-detail-close').click();
 w.localStorage.setItem('rewind-gh-token','fake');await w.eval('testState.movies()[0].followRelease=true;syncEmailCard(true)');assert.deepEqual(posted.movies[0].alert,{mode:'rental',maxPrice:6.99});assert.equal(JSON.stringify(posted).includes('fixture'),false);
 price=5.99;await w.eval('renderWatchlist(true)');assert.match(w.document.getElementById('change-receipts').textContent,/rental fell from \$19.99 to \$5.99/);assert.match(w.document.getElementById('change-receipts').textContent,/Previous check:/);w.document.querySelector('#paid-grid .film-details-trigger').click();await wait();assert.match(w.document.getElementById('film-detail-dialog').textContent,/19\.99 → \$5\.99/);w.document.querySelector('.film-detail-close').click();
 failed=true;await w.eval('renderWatchlist(true)');assert.match(w.document.getElementById('waiting-grid').textContent,/PREVIOUS CHECK/);assert.match(w.document.getElementById('waiting-grid').textContent,/Coyote/);
 failed=false;await w.eval('renderWatchlist(true)');
 w.document.querySelector('[data-cost-filter=cheap]').click();await wait();assert.match(w.document.getElementById('paid-grid').textContent,/Coyote/);assert.equal(w.document.getElementById('watch-now-section').hidden,true);w.document.querySelector('[data-cost-filter=all]').click();await wait();
 const card=w.document.querySelector('#watch-now-grid .rental-card[data-movie-id="3"]');card.querySelector('.film-details-trigger').click();await wait();[...w.document.querySelectorAll('#film-detail-dialog button')].find(b=>b.textContent==='MARK WATCHED').click();w.document.querySelector('.film-detail-close').click();await wait();assert.equal(JSON.parse(w.localStorage.getItem('rewind-watchlist-v1')).length,2);w.document.querySelector('#toast button').click();await wait();assert.equal(JSON.parse(w.localStorage.getItem('rewind-watchlist-v1')).length,3);
 w.document.getElementById('search-input').value='Cycle';w.document.getElementById('search-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await wait();assert.equal(w.document.getElementById('search-grid').hidden,false);assert.match(w.document.getElementById('search-grid').textContent,/FOLLOW RELEASE/);const trackedBeforeSearch=w.testState.movies().length;w.document.querySelector('#search-grid .track-action').click();await wait();assert.equal(w.testState.movies().find(m=>m.id===1290418).followRelease,true,'Search can follow an already saved film');assert.equal(w.testState.movies().length,trackedBeforeSearch,'Following an existing film does not duplicate it');
 const cycleDetails=w.document.querySelector('#waiting-grid [data-movie-id="1290418"] .film-details-trigger');
 assert.ok(cycleDetails,'Followed film remains accessible from All Watchlist');
 cycleDetails.click();await wait();
 const unfollow=[...w.document.querySelectorAll('#film-detail-dialog .collection-tools button')].find(b=>b.textContent.includes('Unfollow release'));
 assert.ok(unfollow,'A film can leave Release Watch without being deleted');
 unfollow.click();await wait();
 assert.equal(w.testState.movies().find(m=>m.id===1290418).followRelease,false);
 assert.equal(w.testState.movies().length,trackedBeforeSearch,'Unfollow keeps the permanent watchlist entry');
 w.document.querySelector('#toast button').click();await wait();
 assert.equal(w.testState.movies().find(m=>m.id===1290418).followRelease,true,'Undo restores special monitoring');w.document.getElementById('search-clear-btn').click();assert.equal(w.document.getElementById('discover-grid').hidden,false);
 assert.equal(w.document.querySelectorAll('#calendar-bars .run-bar.local').length,2,'Exact-date gaps must split bars');assert.equal(w.document.querySelector('#calendar-bars .run-bar.local').style.gridColumn,'2 / 4');
 w.document.getElementById('calendar-list').click();assert.equal(JSON.parse(w.localStorage.getItem('rewind-ui-v1')).calendarView,'list');assert.equal(w.document.getElementById('calendar-listings').hidden,false);w.document.querySelector('#calendar-listings button').click();assert.match(w.document.getElementById('event-detail').textContent,/KALISPELL|FATHOM/);
 w.document.querySelector('[data-find-mode=roulette]').click();assert.equal(w.document.getElementById('hub-picker').hidden,false);assert.equal(w.document.getElementById('discover-grid').hidden,true);w.document.getElementById('picker-cost').value='included';w.document.getElementById('pick-film').click();await wait();await wait();assert.match(w.document.getElementById('picker-results').textContent,/Included Movie/);assert.match(w.document.getElementById('picker-results').textContent,/Confirmed newly included/);assert.equal(w.document.querySelectorAll('#picker-results .rental-card').length,1);
 w.document.querySelector('[data-find-mode=oracle]').click();w.document.getElementById('picker-cost').value='any';w.document.getElementById('pick-film').click();await wait();await wait();assert.doesNotMatch(w.document.getElementById('picker-results').textContent,/Included Movie/);assert.equal(deckRequests,0,'The old horror deck must never be fetched');assert.match(w.document.querySelector('.oracle-pool-label').textContent,/FROM YOUR WATCHLIST/,'Oracle includes intended films and identifies the pool');assert.ok(w.document.querySelector('.oracle-comparison'),'Oracle pick includes its comparison drawer');assert.match(w.document.querySelector('.oracle-comparison').textContent,/Why this won|checked batch/);assert.equal(w.document.getElementById('roulette-controls'),null);assert.equal(w.document.querySelectorAll('#picker-results .rental-card').length,1);w.document.querySelector('#picker-results .film-details-trigger').click();await wait();assert.ok(w.document.querySelector('#film-detail-dialog .visual-release .release-milestones'));w.document.querySelector('.film-detail-close').click();assert.ok(w.document.querySelector('.source-disclosure:not([open])'));assert.equal(w.document.querySelectorAll('.screening-date.active').length,3,'Visual screening strip preserves exact dates and gaps');
 assert.equal(w.document.getElementById('pick-again').textContent,'ANOTHER FILM');assert.equal(w.document.getElementById('banish-pick').textContent,'NOT FOR ME');assert.equal(w.document.querySelector('#picker-results .oracle-moment'),null,'Atmospheric tiles no longer interrupt the written case');
 const rejectedId=Number(w.document.querySelector('#picker-results .rental-card').dataset.movieId),originalCollection=w.testState.movies().map(m=>m.id);w.document.getElementById('banish-pick').click();await wait();await wait();assert.ok(w.testState.hub().feedback.some(r=>r.id===rejectedId&&r.kind==='notforme'));assert.deepEqual(w.testState.movies().map(m=>m.id),originalCollection,'Not for me retains the collection');assert.equal(w.document.querySelector('#picker-results [data-movie-id="'+rejectedId+'"]'),null);w.document.querySelector('#toast button').click();await wait();assert.ok(!w.testState.hub().feedback.some(r=>r.id===rejectedId&&r.kind==='notforme'),'Undo restores recommendation eligibility');
 // Produce a new pick for the existing correction tests.
 w.document.getElementById('pick-again').click();await wait();await wait();
 const correctionTitle=w.document.querySelector('#picker-results .card-title').textContent;
 w.document.getElementById('feedback-familiar').click();await wait();await wait();
 const familiar=JSON.parse(w.localStorage.getItem('rewind-hub-v1')).setAsides.find(r=>r.title===correctionTitle);assert.ok(familiar);assert.equal(familiar.scope,'oracle');assert.equal(familiar.mode,'forever');assert.ok(JSON.parse(w.localStorage.getItem('rewind-hub-v1')).feedback.some(r=>r.kind==='familiar'&&r.title===correctionTitle));
 const restoreCorrection=[...w.document.querySelectorAll('#set-aside-records .aside-record')].find(r=>r.textContent.includes(correctionTitle));restoreCorrection.querySelector('button').click();assert.ok(!JSON.parse(w.localStorage.getItem('rewind-hub-v1')).setAsides.some(r=>r.title===correctionTitle));
 const profile=w.document.getElementById('import-taste');Object.defineProperty(profile,'files',{value:[{text:async()=>"Name,Year,Rating,Watched,Watched Date,Recorded Date,Diary Count,Liked\nThe Cycle,2026,4.5,yes,2026-10-04,2026-10-05,2,yes\n"}],configurable:true});w.document.getElementById('taste-import-kind').value='profile';profile.dispatchEvent(new w.Event('change'));await wait();await wait();const taste=JSON.parse(w.localStorage.getItem('rewind-hub-v1')).taste;assert.equal(taste[0].rating,4.5);assert.equal(taste[0].meta.credits.crew[0].name,'Jane Director');assert.equal(taste[0].watchedAt,'2026-10-04');assert.ok(JSON.parse(w.localStorage.getItem('rewind-seen-v1')).includes('thecycle|2026'));assert.equal(w.eval("formatFilmDate('Mon, 05 Oct 2026 14:00:00 GMT')"),'Oct 5, 2026');
 Object.defineProperty(profile,'files',{value:[{text:async()=>"Title,Release Year,Media Type\nThe Cycle,2026,VHS\n"}],configurable:true});w.document.getElementById('taste-import-kind').value='owned';profile.dispatchEvent(new w.Event('change'));await wait();await wait();const ownedStatus=await w.eval("deriveStatus("+JSON.stringify(films[1])+")");assert.equal(ownedStatus.offers[0].kind,'physical');assert.equal(ownedStatus.offers[0].format,'VHS');assert.equal(w.ReleaseModel.cost(ownedStatus.offers).badge,'ON YOUR SHELF');assert.equal(w.ReleaseModel.group(ownedStatus),'now');
 const passFilms=[{id:55,title:'Unwanted A',release_date:'2026-08-28'},{id:56,title:'Unwanted B',release_date:'2026-08-28'},films[2]];
 searchMatches=passFilms;w.document.querySelector('[data-find-mode=shelf]').click();
 w.document.getElementById('search-input').value='Unwanted';w.document.getElementById('search-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await wait();
 w.document.getElementById('browse-dismiss').click();
 assert.deepEqual(JSON.parse(w.localStorage.getItem('rewind-skipped-v1')).sort((a,b)=>a-b),[55,56]);
 assert.equal(w.document.querySelectorAll('#search-grid .rental-card').length,1,'Added film survives clearing the visible search shelf');
 assert.equal(w.document.querySelector('#search-grid .rental-card').dataset.movieId,'3');
 const reopened=new JSDOM(fs.readFileSync(__dirname+'/../index.html','utf8'),{url:'https://bekind-rewind.netlify.app',runScripts:'outside-only'}),rw=reopened.window;
 rw.HTMLElement.prototype.scrollIntoView=function(){};rw.HTMLDialogElement.prototype.showModal=function(){this.open=true};rw.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new this.ownerDocument.defaultView.Event('close'))};rw.fetch=w.fetch;
 for(const key of ['rewind-watchlist-v1','rewind-skipped-v1','rewind-seen-v1','rewind-coyote-seeded-v1']){const value=w.localStorage.getItem(key);if(value!=null)rw.localStorage.setItem(key,value);}
 rw.eval(['rewind-model.js','release-model.js','availability-ui.js','counter-model.js','discovery-model.js','taste-model.js','hub-model.js','artwork-model.js','occasion-model.js','oracle.js','storage-model.js','sync-model.js','static-model.js','watchlist-model.js','movie-news-model.js','app.js','hub.js','static-experience.js','movie-news.js','letterboxd-diary.js'].map(file=>fs.readFileSync(__dirname+'/../'+file,'utf8')).join('\n')+'\nwindow.slowState={replaceMovies:m=>watchlist=m};');await wait();
 rw.document.getElementById('search-input').value='Unwanted';rw.document.getElementById('search-form').dispatchEvent(new rw.Event('submit',{cancelable:true}));await wait();
 assert.equal(rw.document.querySelectorAll('#search-grid .rental-card').length,1,'Passed films stay hidden after opening a new browser session');assert.equal(rw.document.querySelector('#search-grid .rental-card').dataset.movieId,'3');reopened.window.close();
 w.eval('skipMovie(99)');w.document.querySelector('#toast button').click();
 assert.deepEqual(JSON.parse(w.localStorage.getItem('rewind-skipped-v1')),[99],'Undo preserves a later unrelated dismissal');
 assert.equal(w.document.querySelectorAll('#search-grid .rental-card').length,3);
 w.document.getElementById('search-grid').hidden=true;w.document.getElementById('discover-grid').hidden=false;
 const skipCard=w.eval('renderCard('+JSON.stringify(passFilms[0])+')');
 w.document.body.appendChild(skipCard);
 const options=skipCard.querySelector('.film-details-trigger'),cardChildren=skipCard.children.length;options.click();await wait();await wait();assert.equal(skipCard.children.length,cardChildren,'Opening a modal never expands or moves card content');assert.ok(w.document.getElementById('film-detail-dialog').open);assert.ok(w.document.body.classList.contains('film-dialog-open'));
 assert.ok([...skipCard.querySelectorAll('.card-actions button')].some(b=>b.textContent==='HIDE'),'Hide remains directly on the film after details load');
 w.document.querySelector('.film-detail-close').click();assert.equal(w.document.getElementById('film-detail-dialog').open,false);assert.equal(w.document.body.classList.contains('film-dialog-open'),!!w.document.querySelector('dialog[open]'),'Background remains locked while another modal is open');skipCard.querySelector('.card-poster').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.equal(w.document.getElementById('film-detail-dialog').open,true,'Posters open details with the keyboard');w.document.querySelector('.film-detail-close').click();options.click();await wait();w.document.querySelector('.film-detail-close').click();
 assert.equal([...skipCard.querySelectorAll('.card-actions button')].filter(b=>b.textContent==='HIDE').length,1,'Reopening keeps exactly one skip action');
 w.document.getElementById('picker-cost').value='physical';w.document.getElementById('picker-cost').dispatchEvent(new w.Event('change'));
 assert.equal(JSON.parse(w.localStorage.getItem('rewind-ui-v1')).pickerCost,'physical');
 assert.match(w.document.getElementById('return-stamp').textContent,/RETURNED OCT 5, 2026/);
 assert.ok(w.document.getElementById('watched-dialog').open);assert.match(w.document.getElementById('watched-letterboxd').href,/letterboxd.com\/tmdb\/3/);
 // Native search clear and an empty query result must restore a usable shelf.
 w.document.querySelector('[data-find-mode=shelf]').click();searchMatches=[];
 w.document.getElementById('search-input').value='NoSuchFilm';w.document.getElementById('search-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await wait();
 assert.match(w.document.getElementById('search-grid').textContent,/No films found/);
 w.document.getElementById('search-input').value='';w.document.getElementById('search-input').dispatchEvent(new w.Event('search'));
 assert.equal(w.document.getElementById('search-grid').hidden,true);assert.equal(w.document.getElementById('search-clear-btn').hidden,true);
 assert.equal(w.document.getElementById('discover-grid').hidden,false);
 // Removing a film can be reversed without touching its alert, pin or history.
 const beforeRemove=JSON.parse(w.localStorage.getItem('rewind-watchlist-v1'));w.eval('removeFromWatchlist(1204680)');await wait();
 assert.equal(JSON.parse(w.localStorage.getItem('rewind-watchlist-v1')).some(m=>m.id===1204680),false);
 w.document.querySelector('#toast button').click();await wait();
 const restored=JSON.parse(w.localStorage.getItem('rewind-watchlist-v1')).find(m=>m.id===1204680);
 assert.deepEqual(restored.alert,beforeRemove.find(m=>m.id===1204680).alert);
 // A slow lookup keeps saved cards visible and exposes progress outside the closed controls.
 const steadyFetch=w.fetch;let releaseRefresh;const refreshGate=new Promise(resolve=>releaseRefresh=resolve);
 w.fetch=async(raw,opts)=>{if(String(raw).includes('/watch/providers'))await refreshGate;return steadyFetch(raw,opts);};
 const refreshing=w.eval('renderWatchlist(true)');await wait();
 assert.ok(w.document.querySelectorAll('#tab-watchlist .rental-card').length>0,'Saved cards remain during refresh');
 assert.match(w.document.getElementById('watchlist-load-status').textContent,/Checking shown films · 0 of 3/);
 releaseRefresh();await refreshing;w.fetch=steadyFetch;assert.equal(w.document.getElementById('watchlist-load-status').textContent,'');
 // An optional key is no longer required for verified public store quotes.
 w.localStorage.removeItem('rewind-watchmode-key');const publicFilm={id:1091,title:'The Thing'};
 const underlying=w.fetch;w.fetch=async(raw,opts)=>String(raw).includes('rewind-prices?id=1091')?{ok:true,json:async()=>({id:1091,checkedAt:w.Date.now(),source:'JustWatch US prices',offers:[{provider:'Apple TV Store',kind:'rent',price:3.99,format:'HD',link:'https://tv.apple.com/us/movie/the-thing',region:'US',source:'JustWatch US prices'}]})}:underlying(raw,opts);
 const publicStatus=await w.eval('deriveStatus('+JSON.stringify(publicFilm)+')');assert.ok(publicStatus.offers.some(o=>o.price===3.99&&o.format==='HD'));
 assert.ok(publicStatus.priceSources.includes('JustWatch US prices'));
 assert.equal(w.document.querySelectorAll('.tab-btn[aria-current=page]').length,1);

 // Visible Browse cards obtain a price and a direct link without opening Details.
 const pricedCard=w.eval('renderCard('+JSON.stringify(publicFilm)+',{context:"search"})');w.document.body.appendChild(pricedCard);
 assert.equal(pricedCard.querySelector('.cost-block'),null);w.offerObserver.callback([{target:pricedCard,isIntersecting:true}]);await wait();await wait();
 assert.match(pricedCard.querySelector('.cost-block').textContent,/\$3\.99/);assert.equal(pricedCard.querySelector('.film-details-trigger').getAttribute('aria-haspopup'),'dialog');assert.match(pricedCard.querySelector('.watch-link').href,/tv.apple.com/);
 // Tonight never substitutes stale or unquoted rentals, while owned discs survive an outage.
 w.eval("testState.movies().find(m=>m.id===1204680).availabilitySnapshot.stale=true;testState.changed()");
 assert.doesNotMatch(w.document.getElementById('tonight-grid').textContent,/Coyote/);
 assert.match(w.document.getElementById('tonight-grid').textContent,/The Cycle/);
 w.eval("testState.movies().find(m=>m.id===1204680).availabilitySnapshot.stale=false;testState.changed()");
 assert.ok(w.document.querySelectorAll('#tonight-grid .tonight-card').length<=3);
 assert.match(w.document.querySelector('#paid-grid .card-meta').textContent,/100 min/);
 // The owned shelf keeps rewatches and exposes a reversible removal, even after opening details.
 w.document.querySelector('[data-find-mode=physical]').click();assert.equal(w.document.getElementById('hub-picker').hidden,true);
 assert.match(w.document.getElementById('physical-grid').textContent,/VHS|A REWATCH/);
 w.document.querySelector('#physical-grid .film-details-trigger').click();await wait();const shelfDetails=w.document.getElementById('film-detail-dialog');
 assert.equal(shelfDetails.querySelector('.availability h4').textContent,'Where to watch');
 assert.ok(shelfDetails.querySelector('.availability>.visual-release'),'Release timeline is visible without opening sources');
 const shelfRemove=[...shelfDetails.querySelectorAll('button')].find(b=>/^remove from physical shelf$/i.test(b.textContent));assert.ok(shelfRemove);shelfRemove.click();w.document.querySelector('.film-detail-close').click();await wait();
 assert.equal(JSON.parse(w.localStorage.getItem('rewind-hub-v1')).taste.find(m=>m.id===1290418).owned,false);
 assert.equal(JSON.parse(w.localStorage.getItem('rewind-hub-v1')).taste.find(m=>m.id===1290418).rating,4.5,'Shelf removal preserves the rating');
 assert.doesNotMatch(w.document.getElementById('watch-now-grid').textContent,/The Cycle/,'Removed ownership does not remain in cached offers');
 w.document.querySelector('#toast button').click();await wait();assert.match(w.document.getElementById('physical-grid').textContent,/The Cycle/);
 // Include recommendations only on request; hiding a theater film leaves its digital releases alone.
 w.eval("testState.movies().find(m=>m.id===1204680).availabilitySnapshot.announcements=[{date:'2026-10-08',provider:'Apple TV',kind:'digital'}];testState.hub().suggestionsVersion=3;testState.hub().suggestions=[{id:98,title:'Suggested Film',release_date:'2026-10-01',suggestionReason:'Same writer',availabilitySnapshot:{announcements:[{date:'2026-10-09',provider:'Shudder'}]}}];testState.changed()");
 const digitalCard=[...w.document.querySelectorAll('#calendar-mobile .calendar-mobile-card')].find(c=>c.querySelector('.calendar-source-note')?.textContent.includes('On Apple TV'));
 assert.ok(digitalCard,'Digital release should display its platform');
 assert.match(digitalCard.querySelector('.calendar-source-note').textContent,/Price not listed/);
 assert.equal(digitalCard.querySelectorAll('.mobile-week-day').length,7,'Each film retains a complete week');
 const digitalDay=[...digitalCard.querySelectorAll('button.mobile-week-day')].find(b=>b.textContent.includes('8'));
 assert.ok(digitalDay,'Release dates must be tappable');
 digitalDay.click();
 assert.match(digitalCard.querySelector('.calendar-inline-details').textContent,/Platform: Apple TV/);
 assert.match(digitalCard.querySelector('.calendar-inline-details').textContent,/Price: Not listed/);
 assert.doesNotMatch(digitalCard.querySelector('.calendar-inline-details').textContent,/Showtimes & event options/);
 assert.equal(digitalCard.querySelector('.calendar-inline-details .screening-strip'),null,'No repeated date strip on mobile');
 digitalCard.querySelector('.calendar-film-head').click();
 assert.equal(digitalCard.querySelector('.calendar-inline-details').hidden,true,'Tapping the header again closes details');
 w.eval("testState.movies().find(m=>m.id===3).availabilitySnapshot.announcements=[{date:'2026-10-08',kind:'theatrical'}];testState.changed()");
 const digitalScope=w.document.getElementById('calendar-scope');digitalScope.value='streaming';digitalScope.dispatchEvent(new w.Event('change'));
 assert.match(w.document.getElementById('calendar-listings').textContent,/Arrives on Apple TV/,'Streaming filter retains digital provider dates');
 assert.doesNotMatch(w.document.getElementById('calendar-listings').textContent,/US theatrical release/,'Streaming filter excludes theatrical-only dates');
 digitalScope.value='personal';digitalScope.dispatchEvent(new w.Event('change'));
 assert.doesNotMatch(w.document.getElementById('calendar-listings').textContent,/Suggested Film/);
 w.document.getElementById('calendar-recommendations').click();assert.match(w.document.getElementById('calendar-listings').textContent,/Suggested Film/);
 w.document.getElementById('calendar-recommendations').click();
 const openCoyote=()=>[...w.document.querySelectorAll('#calendar-bars .board-label')].find(b=>b.textContent.includes('Coyote')).click();
 openCoyote();[...w.document.querySelectorAll('#event-detail button')].find(b=>b.textContent==='HIDE').click();
 assert.equal(w.document.querySelectorAll('#calendar-bars .run-bar.local').length,0);
 assert.match(w.document.getElementById('calendar-listings').textContent,/Arrives on Apple TV/,'Hiding theater listings must not remove an independent digital date');
 const digitalToHide=[...w.document.querySelectorAll('#calendar-mobile .calendar-mobile-card')].find(c=>c.querySelector('.calendar-source-note')?.textContent.includes('On Apple TV'));
 assert.ok(digitalToHide,'Digital release remains after its local theater listing is hidden');
 digitalToHide.querySelector('.hide-action').click();
 assert.doesNotMatch(w.document.getElementById('calendar-listings').textContent,/Arrives on Apple TV/,'Hiding a digital date works independently');
 assert.equal(JSON.parse(w.localStorage.getItem('rewind-hub-v1')).hiddenTheaterFilms.length,1,'Digital hide does not clear theater hide');
 const restoreDigital=[...w.document.querySelectorAll('#cinema-hidden button')].find(b=>b.textContent.startsWith('SHOW ')&&b.textContent.includes('Coyote'));
 assert.ok(restoreDigital,'A hidden digital date has a named restore control');
 restoreDigital.click();
 assert.match(w.document.getElementById('calendar-listings').textContent,/Arrives on Apple TV/,'Restoring the digital date does not restore theater listings');

 assert.equal(JSON.parse(w.localStorage.getItem('rewind-hub-v1')).hiddenTheaterFilms.length,1,'Hide always persists and syncs');
 [...w.document.querySelectorAll('#cinema-hidden button')].find(b=>b.textContent.startsWith('RESTORE')).click();assert.equal(w.document.querySelectorAll('#calendar-bars .run-bar.local').length,2);
 openCoyote();[...w.document.querySelectorAll('#event-detail button')].find(b=>b.textContent==='HIDE').click();
 w.eval('testState.hub().hiddenTheaterFilms=[]');await w.eval('renderWatchlist(true)');const hiddenSaved=JSON.parse(w.localStorage.getItem('rewind-hub-v1')).hiddenTheaterFilms;assert.equal(hiddenSaved.length,1,'Saving from a stale open tab cannot erase a newer permanent hide');assert.equal(hiddenSaved[0].id,1204680);
 assert.equal(w.eval('collectSyncData().hub.hiddenTheaterFilms.length'),1);w.eval('applySyncData({...collectSyncData(),hub:{...collectSyncData().hub,hiddenTheaterFilms:[]}});testState.changed()');assert.equal(w.document.querySelectorAll('#calendar-bars .run-bar.local').length,0,'An older sync response cannot erase a new local hide');
 cinemaRevision++;w.document.getElementById('cinema-refresh').click();await wait();await wait();assert.equal(w.document.querySelectorAll('#calendar-bars .run-bar.local').length,0,'A fresh listing ID does not defeat permanent movie hiding');
 // A second page load retains permanent hiding, and restore brings the current listings back.
 const reload=new JSDOM(fs.readFileSync(__dirname+'/../index.html','utf8'),{url:'https://bekind-rewind.netlify.app',runScripts:'outside-only'}),r=reload.window;
 r.Date=w.Date;r.HTMLElement.prototype.scrollIntoView=function(){};r.HTMLDialogElement.prototype.showModal=function(){this.open=true};r.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new this.ownerDocument.defaultView.Event('close'))};r.fetch=w.fetch;
 for(let i=0;i<w.localStorage.length;i++){const key=w.localStorage.key(i);if(key!=='rewind-gh-token')r.localStorage.setItem(key,w.localStorage.getItem(key));}
 r.eval(['rewind-model.js','release-model.js','availability-ui.js','counter-model.js','discovery-model.js','taste-model.js','hub-model.js','artwork-model.js','occasion-model.js','oracle.js','storage-model.js','sync-model.js','static-model.js','watchlist-model.js','movie-news-model.js','app.js','hub.js','static-experience.js','movie-news.js','letterboxd-diary.js'].map(file=>fs.readFileSync(__dirname+'/../'+file,'utf8')).join('\n')+'\nwindow.changed=()=>Hub.stateChanged();window.reloadMovies=()=>watchlist;');await wait();await wait();
 assert.equal(r.document.querySelectorAll('#calendar-bars .run-bar.local').length,0);
 [...r.document.querySelectorAll('#cinema-hidden button')].find(b=>b.textContent.startsWith('RESTORE')).click();assert.equal(r.document.querySelectorAll('#calendar-bars .run-bar.local').length,2);
 r.eval('applySyncData({...collectSyncData(),hub:{...collectSyncData().hub,hiddenTheaterFilms:'+JSON.stringify(hiddenSaved)+'}});changed()');assert.equal(r.document.querySelectorAll('#calendar-bars .run-bar.local').length,2,'Restore tombstones defeat old synced hide records');r.eval("reloadMovies().find(m=>m.id===1204680).availabilitySnapshot.announcements=[{date:'2026-10-08',provider:'Apple TV'}];changed()");r.document.getElementById('calendar-theaters').click();assert.equal(r.document.querySelectorAll('#calendar-bars .run-bar.local').length,0);assert.match(r.document.getElementById('calendar-listings').textContent,/Arrives on Apple TV/);
 await wait();await wait();reload.window.close();
 // A date-only backup with a newer generated timestamp must not displace a
 // bounded, detailed audited snapshot during an outage.
 const originalFetch=w.fetch,localAudit={id:'audit-film',title:'Audited Film',dates:['2026-10-07'],start:'2026-10-07',end:'2026-10-07',screenings:[{date:'2026-10-07',time:'7:00pm',url:'https://tickets.fandango.com/test'}]};
 w.fetch=async(raw,opts)=>{if(String(raw).includes('rewind-cinema'))return {ok:true,json:async()=>({events:{items:[],stale:false,checkedAt:w.Date.now()},local:{items:[{...localAudit,dates:['2026-10-06'],screenings:[]}],stale:true,checkedAt:w.Date.now()}})};if(raw==='cinema-snapshot.json')return {ok:true,json:async()=>({events:{items:[],checkedAt:w.Date.now()-3600000},local:{items:[localAudit],checkedAt:w.Date.now()-3600000}})};return originalFetch(raw,opts);};
 w.document.getElementById('calendar-scope').value='all';w.document.getElementById('cinema-refresh').click();await wait();await wait();
 const auditCard=[...w.document.querySelectorAll('#calendar-mobile article')].find(c=>c.textContent.includes('Audited Film'));assert.ok(auditCard);assert.equal(auditCard.querySelectorAll('.mobile-week-day.listed').length,1);assert.equal(auditCard.querySelector('.mobile-week-day.listed strong').textContent,'7');assert.match(auditCard.textContent,/PREVIOUS CHECK/);
 w.document.querySelector('[data-find-mode="shelf"]').click();w.document.querySelector('[data-discovery-stage="circuit"]').click();await wait();await wait();const chrono=w.document.querySelector('#discover-grid [data-movie-id="1599181"]');assert.ok(chrono);assert.match(chrono.textContent,/Missoula/);assert.match(chrono.textContent,/No US home date listed/);assert.match(chrono.textContent,/You asked to keep an eye/);assert.equal(chrono.querySelector('.release-file a'),null);chrono.querySelector('.film-details-trigger').click();await wait();assert.match(w.document.getElementById('film-detail-dialog').textContent,/Grasshopper|film page/);assert.match(w.document.getElementById('film-detail-dialog').textContent,/What we’re watching for|Next development/);w.document.querySelector('.film-detail-close').click();[...chrono.querySelectorAll('button')].find(b=>b.textContent==='FOLLOW RELEASE').click();assert.equal(w.testState.movies().find(m=>m.id===1599181).followRelease,true,'Discover follows the release without creating a second list');assert.equal(w.testState.movies().find(m=>m.id===1599181).alert.mode,'any');assert.equal(w.testState.hub().taste.some(m=>m.id===1599181),false,'Interest does not manufacture a rating');assert.equal(w.testState.movies().find(m=>m.id===1599181).releaseFile.screenings[0].location,'Missoula, MT');w.document.querySelector('[data-find-mode="oracle"]').click();assert.equal(w.document.getElementById('discovery-stages').hidden,true);w.document.querySelector('[data-find-mode="shelf"]').click();assert.equal(w.document.getElementById('discover-more').hidden,true,'Circuit has no ineffective paging button');
 w.document.querySelector('.header-saved').click();assert.equal(w.document.getElementById('film-drawer').open,true,'Saved films opens the side drawer');assert.ok(w.document.querySelector('#film-drawer').textContent.includes('Chronovisor'));const drawerSearch=w.document.querySelector('#film-drawer input[type=search]');drawerSearch.value='no such title xyz';drawerSearch.dispatchEvent(new w.Event('input'));assert.match(w.document.querySelector('#film-drawer [role=status]').textContent,/No watchlist films match/);assert.ok([...w.document.querySelectorAll('#film-drawer .drawer-film')].every(row=>row.hidden));drawerSearch.value='';drawerSearch.dispatchEvent(new w.Event('input'));w.document.getElementById('film-drawer').close();
 w.document.querySelector('[data-tab=upcoming]').click();[...w.document.querySelectorAll('.calendar-kind')].find(b=>b.textContent==='Film dates').click();await wait();assert.equal(w.document.querySelector('.anniversary-panel').hidden,false);assert.equal(w.document.querySelector('.cinema-board').hidden,true);[...w.document.querySelectorAll('.calendar-kind')].find(b=>b.textContent==='Screenings & releases').click();assert.equal(w.document.querySelector('.cinema-board').hidden,false);assert.equal(w.document.querySelector('.anniversary-panel').hidden,true);
 const syncTestFetch=w.fetch;w.fetch=async()=>({ok:false,status:401,json:async()=>({})});w.localStorage.setItem('rewind-gh-token','test-only-invalid-token');await assert.rejects(w.eval('pushToGist()'));assert.equal(w.document.getElementById('sync-status').dataset.tone,'error');assert.doesNotMatch(w.document.getElementById('sync-status').textContent,/^Synced/);w.localStorage.removeItem('rewind-gh-token');w.fetch=syncTestFetch;
 // Large gists must not send a token to the raw host or trigger its rejected preflight.
 const savedSync=w.eval('collectSyncData()');let rawRead=false;
 w.fetch=async(url,opts={})=>{if(String(url).startsWith('https://gist.githubusercontent.com/')){rawRead=true;assert.equal(opts.headers,undefined);assert.equal(opts.credentials,'omit');return {ok:true,text:async()=>JSON.stringify(savedSync)};}return {ok:true,json:async()=>({files:{'rewind-sync.json':{truncated:true,raw_url:'https://gist.githubusercontent.com/fixture/abc/raw/profile/rewind-sync.json'}}})};};
 await w.eval("readGist('test-gist')");assert.equal(rawRead,true);
 w.localStorage.setItem('rewind-gh-token','test-only-invalid-token');const beforeNetworkFailure=JSON.stringify(w.testState.movies());w.fetch=async()=>{throw new TypeError('Failed to fetch');};await assert.rejects(w.eval('pushToGist()'));assert.match(w.document.getElementById('sync-status').textContent,/Could not reach GitHub/);assert.equal(JSON.stringify(w.testState.movies()),beforeNetworkFailure);w.localStorage.removeItem('rewind-gh-token');w.fetch=syncTestFetch;

 w.Hub=w.testState.hubInterface;const flowErrors=[];w.addEventListener('error',e=>flowErrors.push(e.error));
 w.eval(fs.readFileSync(__dirname+'/../flow.js','utf8'));
 assert.equal(w.document.querySelectorAll('.discover-intents button').length,4,'Oracle, Explore, Surprise and Movie news have distinct destinations');
 assert.equal(w.document.querySelector('[data-tab=import]').getAttribute('aria-label'),'Settings');
 assert.ok(w.document.querySelector('.counter-inner [data-tab=import]'));
 w.document.querySelector('[data-discover-intent=pick]').click();assert.equal(w.document.getElementById('hub-picker').hidden,false);assert.ok(w.document.querySelector('.pick-adjust #picker-source'));assert.ok(w.document.querySelector('.pick-adjust #picker-cost'));
 assert.match(w.document.querySelector('.flow-note').textContent,/One film for right now/);assert.equal(w.document.querySelector('.picker-actions .text-action'),null,'Surprise is a destination, not an Oracle action');
 const surpriseFetch=w.fetch,discoveryFixtures=[{id:911111,title:'Sonic the Hedgehog 3',release_date:'2024-12-20',genre_ids:[16]},{id:911112,title:'Recovered Tapes',release_date:'2020-10-01',genre_ids:[27]}];
 w.fetch=async(raw,opts)=>{const u=new URL(raw,'https://bekind-rewind.netlify.app');if(u.hostname==='api.themoviedb.org'){let body;if(/discover\/movie|recommendations/.test(u.pathname))body={results:discoveryFixtures};else if(/91111[12]\/keywords/.test(u.pathname))body={keywords:[]};else if(/movie\/91111[12]$/.test(u.pathname)){const m=discoveryFixtures.find(m=>u.pathname.endsWith('/'+m.id));body={...m,runtime:100,overview:m.id===911112?'An experimental found footage film.':'A speedy family adventure.',genres:[{id:m.genre_ids[0],name:m.id===911112?'Horror':'Animation'}],credits:{crew:[{job:'Director',name:m.id===911112?'A New Director':'Jeff Fowler'}]}};}if(body)return {ok:true,json:async()=>body};}return surpriseFetch(raw,opts);};
 w.document.querySelector('[data-discover-intent=surprise]').click();w.document.querySelector('[data-surprise-source=discovery]').click();await wait();await wait();assert.equal(w.document.querySelector('#signal-shelf [data-movie-id="911111"]'),null,'Genre popularity alone cannot qualify Sonic 3');assert.ok(w.document.querySelector('#signal-shelf [data-movie-id="911112"]'),'Specific taste-profile themes qualify discoveries');assert.ok(JSON.parse(w.localStorage.getItem('rewind-recommendations-v1')).some(m=>m.id===911112),'Surprise history persists across visits');w.document.querySelector('.signal-actions button:first-child').click();await wait();await wait();assert.equal(w.document.querySelector('#signal-shelf [data-movie-id="911112"]'),null,'Shuffle avoids recently suggested films');w.fetch=surpriseFetch;
assert.equal(w.document.querySelector('[data-discover-intent=surprise]').getAttribute('aria-pressed'),'true');assert.equal(w.document.getElementById('signal-shelf').hidden,false);assert.match(w.document.querySelector('.flow-note').textContent,/blind draw/);w.document.querySelector('.signal-actions button:last-child').click();assert.equal(w.document.getElementById('hub-picker').hidden,false);assert.equal(w.document.getElementById('signal-shelf').hidden,true);
 const drawOriginal=w.testState.movies(),drawFixture=(id,title,genre,date='2020-01-01')=>({id,title,release_date:date,genre_ids:[genre],source:'Letterboxd watchlist',detailsSnapshot:{id,title,runtime:90,release_date:date,genres:[{id:genre,name:genre===27?'Horror':'Comedy'}]},availabilitySnapshot:{checkedAt:w.Date.now(),offers:[{kind:'subscription',provider:'Shudder',included:true}]}});w.testState.replaceMovies([drawFixture(14001,'Watchlist horror',27),drawFixture(14002,'Wrong genre',35),drawFixture(14003,'Future horror',27,'2027-01-01'),drawFixture(14004,'The Cycle',27,'2026-09-24')]);w.document.querySelector('[data-surprise-source=watchlist]').click();w.document.querySelector('.surprise-genre-choice summary').click();w.document.querySelector('[data-surprise-genre="27"]').click();await wait();await wait();assert.equal(w.document.querySelectorAll('#signal-shelf .rental-card').length,1);assert.equal(w.document.querySelector('#signal-shelf .rental-card').dataset.movieId,'14001','Watchlist draw honors genre and excludes future and positively watched films');assert.match(w.document.querySelector('.draw-origin').textContent,/WATCHLIST.*BLIND DRAW/);w.document.querySelector('.signal-actions button:first-child').click();await wait();await wait();assert.equal(w.document.querySelectorAll('#signal-shelf .rental-card').length,0,'The hat does not immediately repeat its only eligible film');w.testState.replaceMovies(drawOriginal);w.document.querySelector('[data-discover-intent=explore]').click();
 const filterToggle=w.document.getElementById('watchlist-filter-toggle');filterToggle.click();assert.equal(w.document.getElementById('card-options').open,true);assert.equal(filterToggle.getAttribute('aria-expanded'),'true');filterToggle.click();assert.equal(w.document.getElementById('card-options').open,false);
 const oldCollection=w.testState.movies(),scaleFilms=Array.from({length:600},(_,i)=>({id:100000+i,title:'Scale film '+i,release_date:i<400?'2026-09-01':'2020-01-01',genre_ids:[i%2?27:35],source:'Letterboxd watchlist',followRelease:i>=500,addedAt:w.Date.now(),runtime:100,availabilitySnapshot:{checkedAt:w.Date.now(),quoteCheckedAt:w.Date.now(),offers:[{kind:'rent',provider:'Apple TV',price:600-i,format:'HD'}]}}));let priceCalls=0;const scaleFetch=w.fetch;w.fetch=async(raw,opts)=>{if(/rewind-prices|watch\/providers/.test(String(raw)))priceCalls++;return scaleFetch(raw,opts);};w.testState.replaceMovies(scaleFilms);w.document.querySelector('[data-watchlist-scope=all]').click();await w.eval('renderWatchlist()');assert.equal(priceCalls,0,'600 fresh films reuse saved availability rather than 600 network checks');assert.equal(w.document.querySelectorAll('#paid-grid>.rental-card').length,24);assert.equal(w.document.querySelector('#paid-grid>.rental-card').dataset.movieId,'100599','Sort the whole 600-film list before rendering the first 24');
 w.document.querySelector('[data-tab="watchlist"]').click();await w.eval('renderWatchlist()');
 const retainedCard=w.document.querySelector('#paid-grid>.rental-card');
 assert.ok(w.watchlistScrollObserver,'The shelf bottom is observed for automatic loading');
 for(const film of scaleFilms)film.availabilitySnapshot.checkedAt-=7*3600000;
 w.watchlistScrollObserver.callback([{isIntersecting:true,target:w.document.getElementById('watchlist-more')}]);await wait();
 assert.equal(w.document.querySelectorAll('#paid-grid>.rental-card').length,48,'Reaching the bottom adds the next saved batch automatically');
 assert.equal(w.document.querySelector('#paid-grid>.rental-card'),retainedCard,'Automatic loading retains existing cards and poster nodes');
 assert.equal(priceCalls,0,'Automatic loading never restarts price or provider requests, even when cached quotes have aged out');
 for(const film of scaleFilms)film.availabilitySnapshot.checkedAt+=7*3600000;

 // Release Watch is an intentional subset, independent of age or Letterboxd membership.
 w.testState.seen().add('scalefilm510|2020');
 const priorTaste=w.testState.hub().taste.slice();
 w.testState.hub().taste.push({id:100520,title:'Scale film 520',rating:4.5});
 w.document.querySelector('[data-watchlist-scope=release]').click();await w.eval('renderWatchlist()');
 assert.match(w.document.getElementById('watchlist-count').textContent,/98 followed releases · 600 total/,'Only intentional unseen follows appear');
 assert.equal(w.document.querySelectorAll('#tab-watchlist .shelf-group[id^="rw-"] .rental-card').length,24,'Release Watch first page displays 24 of 98');
 assert.equal(w.document.getElementById('rw-coming-count').textContent,'(91)','Section total includes films beyond the first page');
 assert.equal(w.document.querySelector('#rw-available-grid>.rental-card').dataset.movieId,'100599','Release Watch sorts all followed films by price before pagination');
 assert.equal(w.document.querySelector('#rw-available-grid>.rental-card[data-movie-id="100510"]'),null,'Watched titles are excluded');
 assert.equal(w.document.querySelector('#rw-available-grid>.rental-card[data-movie-id="100520"]'),null,'Rated films are excluded');
 w.document.getElementById('watchlist-more').click();await w.eval('renderWatchlist()');
 assert.equal(w.document.querySelectorAll('#tab-watchlist .shelf-group[id^="rw-"] .rental-card').length,48,'Show More grows Release Watch without revealing the other 500');
 w.document.querySelector('[data-watchlist-scope=all]').click();await w.eval('renderWatchlist()');
 assert.match(w.document.getElementById('watchlist-count').textContent,/600 total/);
 assert.equal(w.document.querySelectorAll('#paid-grid>.rental-card').length,24,'All Watchlist is paginated, not truncated');
 assert.equal(priceCalls,0,'Switching views never forces 600 availability requests');
 w.testState.seen().delete('scalefilm510|2020');
 w.testState.hub().taste=priorTaste;
 w.fetch=scaleFetch;w.testState.replaceMovies(oldCollection);await w.eval('renderWatchlist(false,true)');
 const compressedCollection=JSON.stringify(w.testState.movies());w.localStorage.setItem('rewind-watchlist-v1',w.StorageModel.encode(compressedCollection));assert.equal(JSON.stringify(w.eval('loadWatchlist()')),compressedCollection,'App reload reader understands compressed film storage');w.localStorage.setItem('rewind-watchlist-v1',compressedCollection);
 const compressedBase=w.eval('collectSyncData()');w.localStorage.setItem('rewind-sync-base-v1',w.StorageModel.encode(JSON.stringify(compressedBase)));assert.equal(JSON.stringify(w.testState.syncBase()),JSON.stringify(compressedBase),'Cloud merge baseline reader understands compressed storage');
 const trackedBefore=w.testState.movies().length;
 w.document.querySelector('[data-collection=physical]').click();assert.equal(w.document.getElementById('physical-shelf').hidden,false);assert.equal(w.document.getElementById('watchlist-filter-toggle').hidden,true,'Physical shelf has no watchlist filter trigger');assert.equal(w.document.getElementById('watch-now-section').hidden,true);assert.equal(w.testState.movies().length,trackedBefore,'Switching collection never changes films');
 w.document.querySelector('[data-collection=tracked]').click();assert.equal(w.document.querySelector('.watchlist-scope').hidden,false);assert.equal(w.document.getElementById('physical-shelf').hidden,true);
 w.document.querySelector('[data-discover-intent=explore]').click();assert.equal(w.document.getElementById('discovery-stages').hidden,false);
 const newsFetch=w.fetch;w.fetch=async(url,...args)=>String(url).includes('/.netlify/functions/movie-news')?{ok:true,json:async()=>({checkedAt:w.Date.now(),items:[{id:'news-test',headline:'Evil Dead Wrath test-screening rumor',project:'Evil Dead Wrath',source:'Test source',url:'https://example.com/news',status:'rumor',publishedAt:new w.Date().toISOString()}],sources:[]})}:newsFetch(url,...args);
 w.document.querySelector('[data-discover-intent=news]').click();await wait();await wait();
 assert.equal(w.document.getElementById('movie-news-panel').hidden,false);assert.equal(w.document.getElementById('hub-picker').hidden,true);assert.equal(w.document.getElementById('discover-grid').hidden,true);assert.equal(w.document.getElementById('discovery-stages').hidden,true);
 assert.match(w.document.getElementById('movie-news-grid').textContent,/RUMOR/);
 const beforeNews=w.testState.movies().length;w.document.querySelector('#movie-news-grid button').click();await wait();await wait();
 assert.equal(w.testState.hub().newsFollows.length,1);assert.equal(w.testState.movies().length,beforeNews,'Unmatched news is followed without making up a catalog ID');
 w.document.querySelector('#news-followed-list button').click();assert.equal(w.testState.hub().newsFollows.length,0);
 w.document.querySelector('[data-discover-intent=pick]').click();assert.equal(w.document.getElementById('movie-news-panel').hidden,true);assert.equal(w.document.getElementById('hub-picker').hidden,false);
 w.document.querySelector('[data-discover-intent=explore]').click();assert.equal(w.document.getElementById('discover-grid').hidden,false);w.fetch=newsFetch;

 // A stalled GitHub connection must not prevent the first Discover page from painting.
 // Individual catalog detail requests are deliberately left unresolved as well.
 const slowDom=new JSDOM(fs.readFileSync(__dirname+'/../index.html','utf8'),{url:'https://bekind-rewind.netlify.app',runScripts:'outside-only'});
 const slow=slowDom.window;
 slow.HTMLElement.prototype.scrollIntoView=function(){};
 slow.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 slow.HTMLDialogElement.prototype.close=function(){this.open=false};
 slow.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
 slow.localStorage.setItem('rewind-gh-token','test-slow-sync');
 slow.localStorage.setItem('rewind-watchlist-v1',JSON.stringify([]));
 slow.localStorage.setItem('rewind-coyote-seeded-v1','1');
 let fastCatalogCalls=0,detailCalls=0;
 slow.fetch=async raw=>{
   const url=new URL(raw,'https://bekind-rewind.netlify.app');
   if(url.hostname==='api.github.com')return new Promise(()=>{});
   if(url.pathname==='/watchlist-baseline.json')return {ok:true,json:async()=>({version:'fixture',films:[]})};
   if(url.pathname.includes('/discover/')){fastCatalogCalls++;return {ok:true,json:async()=>({results:Array.from({length:16},(_,i)=>({id:30000+i,title:'Slow network feature '+i,release_date:'2026-08-28',poster_path:null})),total_pages:4})};}
   if(url.pathname.includes('/movie/')){detailCalls++;return new Promise(()=>{});}
   return {ok:false,status:503,json:async()=>({})};
 };
 slow.eval(['rewind-model.js','release-model.js','availability-ui.js','counter-model.js','discovery-model.js','taste-model.js','hub-model.js','artwork-model.js','occasion-model.js','oracle.js','storage-model.js','sync-model.js','static-model.js','watchlist-model.js','movie-news-model.js','app.js','hub.js','static-experience.js','flow.js','movie-news.js','letterboxd-diary.js'].map(file=>fs.readFileSync(__dirname+'/../'+file,'utf8')).join('\n')+'\nwindow.slowState={replaceMovies:m=>watchlist=m};');
 slow.document.querySelector('[data-tab=discover]').click();
 await wait();
 assert.equal(fastCatalogCalls,4,'Discover fills sparse batches across catalog pages without waiting for cloud sync');
 assert.equal(detailCalls,0,'Individual film details do not block the first Discover paint');
 assert.equal(slow.document.querySelectorAll('#discover-grid .rental-card').length,16,'Discover remains usable while GitHub and film details hang');
 // A full saved page must be skipped and More Films must advance beyond the last page.
 slow.slowState.replaceMovies(Array.from({length:20},(_,i)=>({id:40000+i,title:'Saved '+i,followRelease:true})));
 const batches=[];
 slow.fetch=async raw=>{const url=new URL(raw,'https://bekind-rewind.netlify.app');
  if(url.pathname.includes('/discover/')){const page=Number(url.searchParams.get('page'));batches.push(page);return {ok:true,json:async()=>({total_pages:5,results:Array.from({length:20},(_,i)=>({id:40000+(page-1)*20+i,title:'Catalog '+page+' '+i,release_date:'2026-08-28',poster_path:null}))})};}
  return new Promise(()=>{});
 };
 await slow.eval('renderDiscover(false)');
 assert.deepEqual(batches,[1,2]);
 let discoverIds=[...slow.document.querySelectorAll('#discover-grid .rental-card')].map(el=>Number(el.dataset.movieId));
 assert.equal(discoverIds.length,20);assert.ok(discoverIds.every(id=>id>=40020),'Saved titles never fill Explore');
 slow.document.getElementById('discover-more').click();await wait();
 assert.deepEqual(batches,[1,2,3]);
 discoverIds=[...slow.document.querySelectorAll('#discover-grid .rental-card')].map(el=>Number(el.dataset.movieId));
 assert.equal(discoverIds.length,40);assert.equal(new Set(discoverIds).size,40,'More Films adds a useful batch without repeats');
 slowDom.window.close();

 const originalLibraryMovies=w.testState.movies().map(m=>({...m})),originalReceipts=[...w.testState.hub().changeReceipts],libraryTestFetch=w.fetch;
 w.testState.replaceMovies([{id:88001,title:'A useful arrival',followRelease:true,manualNote:'Keep my note',pinned:true,availabilitySnapshot:{checkedAt:w.Date.now()-10000,offers:[]}}]);w.testState.hub().changeReceipts=[];w.testState.hub().receiptsReadAt=0;
 w.localStorage.setItem('rewind-gh-token','fixture-library');
 w.fetch=async(raw,options)=>{assert.match(String(raw),/rewind-library/);const registry=JSON.parse(options.body);assert.equal(registry.movies[0].followRelease,true);return {ok:true,json:async()=>({generatedAt:w.Date.now(),films:[{id:88001,checkedAt:w.Date.now(),offers:[{kind:'subscription',provider:'Peacock',included:false}]}]})};};
 await w.eval('syncBackgroundLibrary()');w.document.querySelector('[data-watchlist-scope=release]').click();
 const arrival=w.testState.movies()[0];assert.equal(arrival.manualNote,'Keep my note');assert.equal(arrival.pinned,true);assert.equal(arrival.availabilitySnapshot.offers[0].included,true,'Server snapshots use current device subscriptions');
 assert.equal(w.testState.hub().changeReceipts.filter(r=>r.type==='included').length,1);
 w.eval('renderChangeStrip()');
 assert.match(w.document.getElementById('since-visit').textContent,/1 newly included/);assert.doesNotMatch(w.document.getElementById('since-visit').textContent,/514/);
 w.document.querySelector('#since-visit button').click();assert.match(w.document.getElementById('rw-arrived-grid').textContent,/A useful arrival/);
 w.testState.replaceMovies(originalLibraryMovies);w.testState.hub().changeReceipts=originalReceipts;w.fetch=libraryTestFetch;w.localStorage.removeItem('rewind-gh-token');
 assert.equal(flowErrors.length,0,'Navigation has no runtime errors');
 console.log('Rewind hub flow: three shelves, source timeline, no vote floor, thresholds persist/sync, real price drops, stale checks, watched undo, inline search passed');
 await wait();await wait();dom.window.close();
})().catch(e=>{console.error(e);process.exit(1)});

assert.ok(fs.readFileSync(__dirname+'/../index.html','utf8').indexOf('id="browse-dismiss-bar"')>fs.readFileSync(__dirname+'/../index.html','utf8').indexOf('id="discover-more"'),'Bulk dismissal follows the browse results');
