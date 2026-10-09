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
 w.IntersectionObserver=class {constructor(callback){this.callback=callback;w.offerObserver=this;}observe(){}unobserve(){}};
 w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
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
 w.eval(['rewind-model.js','release-model.js','availability-ui.js','counter-model.js','discovery-model.js','taste-model.js','hub-model.js','artwork-model.js','occasion-model.js','oracle.js','storage-model.js','sync-model.js','static-model.js','watchlist-model.js','app.js','hub.js','static-experience.js'].map(file=>fs.readFileSync(__dirname+'/../'+file,'utf8')).join('\n')+'\nwindow.testState={movies:()=>watchlist,hub:()=>hubState,changed:()=>Hub.stateChanged()};');
 await wait();w.document.querySelector('[data-watchlist-scope="all"]').click();await w.eval("renderWatchlist()");
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
 assert.ok([...w.document.querySelectorAll('#tab-import>.settings-group>summary')].some(s=>s.textContent==='Your taste'));assert.ok(w.document.getElementById('gh-connect-btn').closest('details.settings-group'));

 assert.match(w.document.getElementById('watch-now-grid').textContent,/Included Movie/);assert.match(w.document.getElementById('paid-grid').textContent,/Coyote/);assert.match(w.document.getElementById('waiting-grid').textContent,/The Cycle/);
 assert.equal(JSON.parse(w.localStorage.getItem('rewind-watchlist-v1')).find(m=>m.id===3).includedSince,undefined,'First observation is not a new arrival');
 included3=false;await w.eval('renderWatchlist(true)');included3=true;await w.eval('renderWatchlist(true)');
 assert.equal(JSON.parse(w.localStorage.getItem('rewind-watchlist-v1')).find(m=>m.id===3).includedSince,w.Date.now(),'Only a confirmed transition earns arrival priority');
 assert.match(w.document.getElementById('waiting-grid').textContent,/Shudder on Oct 23/);
 assert.match(w.document.getElementById('waiting-grid').textContent,/Shudder official US lineup/);
 assert.match(w.document.getElementById('paid-grid').textContent,/\$19\.99/);assert.match(w.document.getElementById('paid-grid').textContent,/No announced reduction date/);assert.match(w.document.getElementById('paid-grid').textContent,/32 days after theatrical/);
 assert.ok(discoverQueries.every(p=>!p.has('vote_count.gte')));assert.match(w.document.getElementById('discover-grid').textContent,/Small Feature/);assert.doesNotMatch(w.document.getElementById('discover-grid').textContent,/Short/);
 const select=w.document.querySelector('[aria-label="Alert preference for Coyote vs. Acme"]');select.value='rental';select.dispatchEvent(new w.Event('change'));const amount=w.document.querySelector('[aria-label="Maximum rental price for Coyote vs. Acme"]');amount.value='6.99';amount.dispatchEvent(new w.Event('change'));
 const saved=JSON.parse(w.localStorage.getItem('rewind-watchlist-v1'));assert.deepEqual(saved[0].alert,{mode:'rental',maxPrice:6.99});assert.equal(saved[0].priceHistory.length,1);assert.ok(!saved[0].detailsSnapshot.credits);
 w.localStorage.setItem('rewind-gh-token','fake');await w.eval('syncEmailCard(true)');assert.deepEqual(posted.movies[0].alert,{mode:'rental',maxPrice:6.99});assert.equal(JSON.stringify(posted).includes('fixture'),false);
 price=5.99;await w.eval('renderWatchlist(true)');assert.match(w.document.getElementById('change-receipts').textContent,/rental fell from \$19.99 to \$5.99/);assert.match(w.document.getElementById('change-receipts').textContent,/Previous check:/);assert.match(w.document.getElementById('paid-grid').textContent,/19\.99 → \$5\.99/);
 failed=true;await w.eval('renderWatchlist(true)');assert.match(w.document.getElementById('waiting-grid').textContent,/Previous availability/);assert.match(w.document.getElementById('waiting-grid').textContent,/Coyote/);
 failed=false;await w.eval('renderWatchlist(true)');
 w.document.querySelector('[data-cost-filter=cheap]').click();await wait();assert.match(w.document.getElementById('paid-grid').textContent,/Coyote/);assert.equal(w.document.getElementById('watch-now-section').hidden,true);w.document.querySelector('[data-cost-filter=all]').click();await wait();
 const card=w.document.querySelector('[data-movie-id="3"]');[...card.querySelectorAll('button')].find(b=>b.textContent==='MARK WATCHED').click();await wait();assert.equal(JSON.parse(w.localStorage.getItem('rewind-watchlist-v1')).length,2);w.document.querySelector('#toast button').click();await wait();assert.equal(JSON.parse(w.localStorage.getItem('rewind-watchlist-v1')).length,3);
 w.document.getElementById('search-input').value='Cycle';w.document.getElementById('search-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await wait();assert.equal(w.document.getElementById('search-grid').hidden,false);assert.match(w.document.getElementById('search-grid').textContent,/TRACKED/);w.document.getElementById('search-clear-btn').click();assert.equal(w.document.getElementById('discover-grid').hidden,false);
 assert.equal(w.document.querySelectorAll('#calendar-bars .run-bar.local').length,2,'Exact-date gaps must split bars');assert.equal(w.document.querySelector('#calendar-bars .run-bar.local').style.gridColumn,'2 / 4');
 w.document.getElementById('calendar-list').click();assert.equal(JSON.parse(w.localStorage.getItem('rewind-ui-v1')).calendarView,'list');assert.equal(w.document.getElementById('calendar-listings').hidden,false);w.document.querySelector('#calendar-listings button').click();assert.match(w.document.getElementById('event-detail').textContent,/KALISPELL|FATHOM/);
 w.document.querySelector('[data-find-mode=roulette]').click();assert.equal(w.document.getElementById('hub-picker').hidden,false);assert.equal(w.document.getElementById('discover-grid').hidden,true);w.document.getElementById('picker-cost').value='included';w.document.getElementById('pick-film').click();await wait();await wait();assert.match(w.document.getElementById('picker-results').textContent,/Included Movie/);assert.match(w.document.getElementById('picker-results').textContent,/Confirmed newly included/);assert.equal(w.document.querySelectorAll('#picker-results .rental-card').length,1);
 w.document.querySelector('[data-find-mode=oracle]').click();w.document.getElementById('picker-cost').value='any';w.document.getElementById('pick-film').click();await wait();await wait();assert.doesNotMatch(w.document.getElementById('picker-results').textContent,/Included Movie/);assert.equal(deckRequests,0,'The old horror deck must never be fetched');assert.match(w.document.querySelector('.oracle-pool-label').textContent,/FROM YOUR WATCHLIST/,'Oracle includes intended films and identifies the pool');assert.ok(w.document.querySelector('.oracle-comparison'),'Oracle pick includes its comparison drawer');assert.match(w.document.querySelector('.oracle-comparison').textContent,/Why this won|checked batch/);assert.equal(w.document.getElementById('roulette-controls'),null);assert.equal(w.document.querySelectorAll('#picker-results .rental-card').length,1);assert.ok(w.document.querySelector('.visual-release .release-graphic'));assert.ok(w.document.querySelector('.source-disclosure:not([open])'));assert.equal(w.document.querySelectorAll('.screening-date.active').length,3,'Visual screening strip preserves exact dates and gaps');
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
 rw.HTMLElement.prototype.scrollIntoView=function(){};rw.HTMLDialogElement.prototype.showModal=function(){this.open=true};rw.HTMLDialogElement.prototype.close=function(){this.open=false};rw.fetch=w.fetch;
 for(const key of ['rewind-watchlist-v1','rewind-skipped-v1','rewind-seen-v1','rewind-coyote-seeded-v1']){const value=w.localStorage.getItem(key);if(value!=null)rw.localStorage.setItem(key,value);}
 rw.eval(['rewind-model.js','release-model.js','availability-ui.js','counter-model.js','discovery-model.js','taste-model.js','hub-model.js','artwork-model.js','occasion-model.js','oracle.js','storage-model.js','sync-model.js','static-model.js','watchlist-model.js','app.js','hub.js','static-experience.js'].map(file=>fs.readFileSync(__dirname+'/../'+file,'utf8')).join('\n'));await wait();
 rw.document.getElementById('search-input').value='Unwanted';rw.document.getElementById('search-form').dispatchEvent(new rw.Event('submit',{cancelable:true}));await wait();
 assert.equal(rw.document.querySelectorAll('#search-grid .rental-card').length,1,'Passed films stay hidden after opening a new browser session');assert.equal(rw.document.querySelector('#search-grid .rental-card').dataset.movieId,'3');reopened.window.close();
 w.eval('skipMovie(99)');w.document.querySelector('#toast button').click();
 assert.deepEqual(JSON.parse(w.localStorage.getItem('rewind-skipped-v1')),[99],'Undo preserves a later unrelated dismissal');
 assert.equal(w.document.querySelectorAll('#search-grid .rental-card').length,3);
 w.document.getElementById('search-grid').hidden=true;w.document.getElementById('discover-grid').hidden=false;
 const skipCard=w.eval('renderCard('+JSON.stringify(passFilms[0])+')');
 w.document.body.appendChild(skipCard);
 const options=skipCard.querySelector('.film-details');options.open=true;await wait();await wait();
 assert.ok([...skipCard.querySelectorAll('.card-actions button')].some(b=>b.textContent==='HIDE'),'Hide remains directly on the film after details load');
 options.open=false;options.open=true;await wait();
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
 assert.match(w.document.getElementById('watchlist-load-status').textContent,/Checking offers and prices/);
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
 assert.match(pricedCard.querySelector('.cost-block').textContent,/\$3\.99/);assert.equal(pricedCard.querySelector('.film-details').open,false);assert.match(pricedCard.querySelector('.watch-link').href,/tv.apple.com/);
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
 const shelfDetails=w.document.querySelector('#physical-grid .film-details');shelfDetails.open=true;await wait();
 const shelfRemove=[...shelfDetails.querySelectorAll('button')].find(b=>b.textContent==='REMOVE FROM PHYSICAL SHELF');assert.ok(shelfRemove);shelfRemove.click();await wait();
 assert.equal(JSON.parse(w.localStorage.getItem('rewind-hub-v1')).taste.find(m=>m.id===1290418).owned,false);
 assert.equal(JSON.parse(w.localStorage.getItem('rewind-hub-v1')).taste.find(m=>m.id===1290418).rating,4.5,'Shelf removal preserves the rating');
 assert.doesNotMatch(w.document.getElementById('watch-now-grid').textContent,/The Cycle/,'Removed ownership does not remain in cached offers');
 w.document.querySelector('#toast button').click();await wait();assert.match(w.document.getElementById('physical-grid').textContent,/The Cycle/);
 // Include recommendations only on request; hiding a theater film leaves its digital releases alone.
 w.eval("testState.movies().find(m=>m.id===1204680).availabilitySnapshot.announcements=[{date:'2026-10-08',provider:'Apple TV',kind:'digital'}];testState.hub().suggestionsVersion=3;testState.hub().suggestions=[{id:98,title:'Suggested Film',release_date:'2026-10-01',suggestionReason:'Same writer',availabilitySnapshot:{announcements:[{date:'2026-10-09',provider:'Shudder'}]}}];testState.changed()");
 assert.doesNotMatch(w.document.getElementById('calendar-listings').textContent,/Suggested Film/);
 w.document.getElementById('calendar-recommendations').click();assert.match(w.document.getElementById('calendar-listings').textContent,/Suggested Film/);
 w.document.getElementById('calendar-recommendations').click();
 const openCoyote=()=>[...w.document.querySelectorAll('#calendar-bars .board-label')].find(b=>b.textContent.includes('Coyote')).click();
 openCoyote();[...w.document.querySelectorAll('#event-detail button')].find(b=>b.textContent==='HIDE').click();
 assert.equal(w.document.querySelectorAll('#calendar-bars .run-bar.local').length,0);
 assert.doesNotMatch(w.document.getElementById('calendar-listings').textContent,/Arrives on Apple TV/);
 assert.equal(JSON.parse(w.localStorage.getItem('rewind-hub-v1')).hiddenTheaterFilms.length,1,'Hide always persists and syncs');
 [...w.document.querySelectorAll('#cinema-hidden button')].find(b=>b.textContent.startsWith('RESTORE')).click();assert.equal(w.document.querySelectorAll('#calendar-bars .run-bar.local').length,2);
 openCoyote();[...w.document.querySelectorAll('#event-detail button')].find(b=>b.textContent==='HIDE').click();
 w.eval('testState.hub().hiddenTheaterFilms=[]');await w.eval('renderWatchlist(true)');const hiddenSaved=JSON.parse(w.localStorage.getItem('rewind-hub-v1')).hiddenTheaterFilms;assert.equal(hiddenSaved.length,1,'Saving from a stale open tab cannot erase a newer permanent hide');assert.equal(hiddenSaved[0].id,1204680);
 assert.equal(w.eval('collectSyncData().hub.hiddenTheaterFilms.length'),1);w.eval('applySyncData({...collectSyncData(),hub:{...collectSyncData().hub,hiddenTheaterFilms:[]}});testState.changed()');assert.equal(w.document.querySelectorAll('#calendar-bars .run-bar.local').length,0,'An older sync response cannot erase a new local hide');
 cinemaRevision++;w.document.getElementById('cinema-refresh').click();await wait();await wait();assert.equal(w.document.querySelectorAll('#calendar-bars .run-bar.local').length,0,'A fresh listing ID does not defeat permanent movie hiding');
 // A second page load retains permanent hiding, and restore brings the current listings back.
 const reload=new JSDOM(fs.readFileSync(__dirname+'/../index.html','utf8'),{url:'https://bekind-rewind.netlify.app',runScripts:'outside-only'}),r=reload.window;
 r.Date=w.Date;r.HTMLElement.prototype.scrollIntoView=function(){};r.HTMLDialogElement.prototype.showModal=function(){this.open=true};r.HTMLDialogElement.prototype.close=function(){this.open=false};r.fetch=w.fetch;
 for(let i=0;i<w.localStorage.length;i++){const key=w.localStorage.key(i);if(key!=='rewind-gh-token')r.localStorage.setItem(key,w.localStorage.getItem(key));}
 r.eval(['rewind-model.js','release-model.js','availability-ui.js','counter-model.js','discovery-model.js','taste-model.js','hub-model.js','artwork-model.js','occasion-model.js','oracle.js','storage-model.js','sync-model.js','static-model.js','watchlist-model.js','app.js','hub.js','static-experience.js'].map(file=>fs.readFileSync(__dirname+'/../'+file,'utf8')).join('\n')+'\nwindow.changed=()=>Hub.stateChanged();window.reloadMovies=()=>watchlist;');await wait();await wait();
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
 w.document.querySelector('[data-find-mode="shelf"]').click();w.document.querySelector('[data-discovery-stage="circuit"]').click();await wait();await wait();const chrono=w.document.querySelector('#discover-grid [data-movie-id="1599181"]');assert.ok(chrono);assert.match(chrono.textContent,/Missoula/);assert.match(chrono.textContent,/No US home date listed/);assert.match(chrono.textContent,/You asked to keep an eye/);[...chrono.querySelectorAll('button')].find(b=>b.textContent==='TRACK').click();assert.equal(w.testState.movies().find(m=>m.id===1599181).alert.mode,'any');assert.equal(w.testState.hub().taste.some(m=>m.id===1599181),false,'Interest does not manufacture a rating');assert.equal(w.testState.movies().find(m=>m.id===1599181).releaseFile.screenings[0].location,'Missoula, MT');w.document.querySelector('[data-find-mode="oracle"]').click();assert.equal(w.document.getElementById('discovery-stages').hidden,true);w.document.querySelector('[data-find-mode="shelf"]').click();assert.equal(w.document.getElementById('discover-more').hidden,true,'Circuit has no ineffective paging button');
 w.document.querySelector('.header-saved').click();assert.equal(w.document.getElementById('film-drawer').open,true,'Saved films opens the side drawer');assert.ok(w.document.querySelector('#film-drawer').textContent.includes('Chronovisor'));w.document.getElementById('film-drawer').close();
 w.document.querySelector('[data-tab=upcoming]').click();[...w.document.querySelectorAll('.calendar-kind')].find(b=>b.textContent==='Film dates').click();await wait();assert.equal(w.document.querySelector('.anniversary-panel').hidden,false);assert.equal(w.document.querySelector('.cinema-board').hidden,true);[...w.document.querySelectorAll('.calendar-kind')].find(b=>b.textContent==='Screenings & releases').click();assert.equal(w.document.querySelector('.cinema-board').hidden,false);assert.equal(w.document.querySelector('.anniversary-panel').hidden,true);
 const syncTestFetch=w.fetch;w.fetch=async()=>({ok:false,status:401,json:async()=>({})});w.localStorage.setItem('rewind-gh-token','test-only-invalid-token');await assert.rejects(w.eval('pushToGist()'));assert.equal(w.document.getElementById('sync-status').dataset.tone,'error');assert.doesNotMatch(w.document.getElementById('sync-status').textContent,/^Synced/);w.localStorage.removeItem('rewind-gh-token');w.fetch=syncTestFetch;
 console.log('Rewind hub flow: three shelves, source timeline, no vote floor, thresholds persist/sync, real price drops, stale checks, watched undo, inline search passed');
 await wait();await wait();dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1});

assert.ok(fs.readFileSync(__dirname+'/../index.html','utf8').indexOf('id="browse-dismiss-bar"')>fs.readFileSync(__dirname+'/../index.html','utf8').indexOf('id="discover-more"'),'Bulk dismissal follows the browse results');
