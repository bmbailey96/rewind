const {JSDOM}=require('jsdom');
const fs=require('node:fs'),assert=require('node:assert/strict');
const feed=JSON.parse(fs.readFileSync(__dirname+'/../release-announcements.json'));
const films=[{id:1204680,title:'Coyote vs. Acme',release_date:'2026-08-28',poster_path:'/c.jpg',alert:{mode:'any',maxPrice:5.99}},{id:1290418,title:'The Cycle',release_date:'2026-09-24',poster_path:'/s.jpg',alert:{mode:'mine',maxPrice:5.99}},{id:3,title:'Included Movie',release_date:'2026-08-28',poster_path:'/i.jpg',alert:{mode:'mine',maxPrice:5.99}}];
const details=m=>({...m,runtime:m.id===7?4:100,overview:'A useful synopsis. More details after that.',credits:{crew:[{job:'Director',name:'Jane Director'}]},release_dates:{results:[{iso_3166_1:'US',release_dates:[{type:3,release_date:m.release_date+'T00:00:00Z'},...(m.id===1204680?[{type:4,release_date:'2026-09-29T00:00:00Z'}]:[])]}]}});
const wait=()=>new Promise(r=>setTimeout(r,100));
(async()=>{
 const dom=new JSDOM(fs.readFileSync(__dirname+'/../index.html','utf8'),{url:'https://bekind-rewind.netlify.app',runScripts:'outside-only'}),w=dom.window;let failed=false,price=19.99,posted,discoverQueries=[],deckRequests=0,included3=true,searchMatches=[films[1]];
 // Keep dated screening fixtures independent of the day CI runs.
 const NativeDate=w.Date;
 w.Date=class extends NativeDate {
  constructor(...args){super(...(args.length?args:['2026-10-05T18:00:00Z']));}
  static now(){return NativeDate.parse('2026-10-05T18:00:00Z');}
 };
 w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.localStorage.setItem('rewind-ui-v1',JSON.stringify({pickerCost:'included',pickerMode:'oracle'}));
 w.localStorage.setItem('rewind-watchlist-v1',JSON.stringify(films));w.localStorage.setItem('rewind-coyote-seeded-v1','1');w.localStorage.setItem('rewind-watchmode-key','fixture');
 w.fetch=async(raw,opts={})=>{const u=new URL(raw,'https://bekind-rewind.netlify.app');let body;
  if(u.pathname.includes('rewind-cinema')||u.pathname==='/cinema-snapshot.json')body={events:{items:[{id:'event-a',title:'Coyote vs. Acme Special Screening',dates:['2026-10-06','2026-10-08'],ranges:[],start:'2026-10-06',end:'2026-10-08',dateLabel:'Oct 6 · Oct 8',url:'https://www.fathomentertainment.com/releases/test/'}],checkedAt:Date.now(),stale:false},local:{items:[{id:'local-coyote',title:'Coyote vs. Acme',dates:['2026-10-06','2026-10-07','2026-10-09'],start:'2026-10-06',end:'2026-10-09',screenings:[{date:'2026-10-06',time:'7:00pm',format:'Standard',url:'https://tickets.fandango.com/test'}],url:'https://www.cinemark.com/theatres/test'}],checkedAt:Date.now(),stale:false}};
  else if(u.pathname==='/roulette-deck.json'){deckRequests++;body=[{...films[2],tags:['folk'],tones:{cozy:80},runtime:100}];}
  else if(u.pathname==='/release-announcements.json')body=feed;
  else if(u.pathname.includes('rewind-watchlist')){if(opts.method==='POST'){posted=JSON.parse(opts.body);body={count:posted.movies.length};}else body={enabled:true,movies:films,pricesConfigured:false};}
  else if(u.pathname.includes('rewind-status'))body={enabled:true,tracked:3,pricesConfigured:false};
  else if(u.hostname==='api.watchmode.com') {assert.equal(opts.headers['X-API-Key'],'fixture');if(u.pathname.includes('/releases'))body={releases:[]};else body=u.pathname.includes('1204680')?[{name:'Apple TV Store',type:'rent',region:'US',price,format:'HD',web_url:'https://tv.apple.com/test'}]:[];}
  else if(u.pathname.endsWith('/watch/providers')){if(failed)throw Error('offline');body={results:{US:u.pathname.includes('/1204680/')?{rent:[{provider_id:2,provider_name:'Apple TV Store'}]}:u.pathname.includes('/movie/3/')&&included3?{flatrate:[{provider_id:386,provider_name:'Peacock Premium'}]}:{}}};}
  else if(u.pathname.includes('/discover/')){discoverQueries.push(u.searchParams);body={results:[{id:5,title:'Small Feature',release_date:'2026-08-28',poster_path:'/f.jpg',vote_count:2},{id:7,title:'Short',release_date:'2026-08-28',poster_path:'/z.jpg',vote_count:300}],total_pages:1};}
  else if(u.pathname.includes('/search/'))body={results:searchMatches};
  else {const id=Number(u.pathname.split('/').at(-1));body=details(films.find(m=>m.id===id)||{id,title:'Feature',release_date:'2026-08-28',poster_path:'/f.jpg'});}
  return {ok:true,json:async()=>body};
 };
 w.eval(['rewind-model.js','release-model.js','availability-ui.js','hub-model.js','oracle.js','app.js','hub.js'].map(file=>fs.readFileSync(__dirname+'/../'+file,'utf8')).join('\n')); 
 await wait();await w.eval("renderWatchlist()");
 assert.equal(w.document.querySelectorAll('.tabs button').length,4);
 assert.equal(w.document.getElementById('card-options').open,false);
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
 price=5.99;await w.eval('renderWatchlist(true)');assert.match(w.document.getElementById('paid-grid').textContent,/19\.99 → \$5\.99/);
 failed=true;await w.eval('renderWatchlist(true)');assert.match(w.document.getElementById('waiting-grid').textContent,/Previous availability/);assert.match(w.document.getElementById('waiting-grid').textContent,/Coyote/);
 failed=false;await w.eval('renderWatchlist(true)');
 w.document.querySelector('[data-cost-filter=cheap]').click();await wait();assert.match(w.document.getElementById('paid-grid').textContent,/Coyote/);assert.equal(w.document.getElementById('watch-now-section').hidden,true);w.document.querySelector('[data-cost-filter=all]').click();await wait();
 const card=w.document.querySelector('[data-movie-id="3"]');[...card.querySelectorAll('button')].find(b=>b.textContent==='MARK WATCHED').click();await wait();assert.equal(JSON.parse(w.localStorage.getItem('rewind-watchlist-v1')).length,2);w.document.querySelector('#toast button').click();await wait();assert.equal(JSON.parse(w.localStorage.getItem('rewind-watchlist-v1')).length,3);
 w.document.getElementById('search-input').value='Cycle';w.document.getElementById('search-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await wait();assert.equal(w.document.getElementById('search-grid').hidden,false);assert.match(w.document.getElementById('search-grid').textContent,/ADDED/);w.document.getElementById('search-clear-btn').click();assert.equal(w.document.getElementById('discover-grid').hidden,false);
 assert.equal(w.document.querySelectorAll('#calendar-bars .run-bar.local').length,2,'Exact-date gaps must split bars');assert.equal(w.document.querySelector('#calendar-bars .run-bar.local').style.gridColumn,'2 / 4');
 w.document.getElementById('calendar-list').click();assert.equal(JSON.parse(w.localStorage.getItem('rewind-ui-v1')).calendarView,'list');assert.equal(w.document.getElementById('calendar-listings').hidden,false);w.document.querySelector('#calendar-listings button').click();assert.match(w.document.getElementById('event-detail').textContent,/KALISPELL|FATHOM/);
 w.document.querySelector('[data-find-mode=roulette]').click();assert.equal(w.document.getElementById('hub-picker').hidden,false);assert.equal(w.document.getElementById('discover-grid').hidden,true);w.document.getElementById('picker-cost').value='included';w.document.getElementById('pick-film').click();await wait();await wait();assert.match(w.document.getElementById('picker-results').textContent,/Included Movie/);assert.match(w.document.getElementById('picker-results').textContent,/Confirmed newly included/);assert.equal(w.document.querySelectorAll('#picker-results .rental-card').length,1);
 w.document.querySelector('[data-find-mode=oracle]').click();w.document.getElementById('picker-cost').value='any';w.document.getElementById('pick-film').click();await wait();await wait();assert.doesNotMatch(w.document.getElementById('picker-results').textContent,/Included Movie/);assert.equal(deckRequests,0,'The old horror deck must never be fetched');assert.ok(w.document.querySelector('.oracle-comparison'),'Oracle pick includes its comparison drawer');assert.match(w.document.querySelector('.oracle-comparison').textContent,/Why this won|checked batch/);assert.equal(w.document.getElementById('roulette-controls'),null);assert.equal(w.document.querySelectorAll('#picker-results .rental-card').length,1);assert.ok(w.document.querySelector('.visual-release .release-graphic'));assert.ok(w.document.querySelector('.source-disclosure:not([open])'));assert.equal(w.document.querySelectorAll('.screening-date.active').length,3,'Visual screening strip preserves exact dates and gaps');
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
 rw.eval(['rewind-model.js','release-model.js','availability-ui.js','hub-model.js','oracle.js','app.js','hub.js'].map(file=>fs.readFileSync(__dirname+'/../'+file,'utf8')).join('\n'));await wait();
 rw.document.getElementById('search-input').value='Unwanted';rw.document.getElementById('search-form').dispatchEvent(new rw.Event('submit',{cancelable:true}));await wait();
 assert.equal(rw.document.querySelectorAll('#search-grid .rental-card').length,1,'Passed films stay hidden after opening a new browser session');assert.equal(rw.document.querySelector('#search-grid .rental-card').dataset.movieId,'3');reopened.window.close();
 w.eval('skipMovie(99)');w.document.querySelector('#toast button').click();
 assert.deepEqual(JSON.parse(w.localStorage.getItem('rewind-skipped-v1')),[99],'Undo preserves a later unrelated dismissal');
 assert.equal(w.document.querySelectorAll('#search-grid .rental-card').length,3);
 w.document.getElementById('search-grid').hidden=true;w.document.getElementById('discover-grid').hidden=false;
 const skipCard=w.eval('renderCard('+JSON.stringify(passFilms[0])+')');
 w.document.body.appendChild(skipCard);
 const options=skipCard.querySelector('.film-details');options.open=true;await wait();await wait();
 assert.ok([...options.querySelectorAll('button')].some(b=>b.textContent==='PASS OVER THIS FILM'),'Secondary actions survive lazy detail loading');
 options.open=false;options.open=true;await wait();
 assert.equal([...options.querySelectorAll('button')].filter(b=>b.textContent==='PASS OVER THIS FILM').length,1,'Reopening keeps exactly one skip action');
 w.document.getElementById('picker-cost').value='physical';w.document.getElementById('picker-cost').dispatchEvent(new w.Event('change'));
 assert.equal(JSON.parse(w.localStorage.getItem('rewind-ui-v1')).pickerCost,'physical');
 assert.ok(w.document.getElementById('watched-dialog').open);assert.match(w.document.getElementById('watched-letterboxd').href,/letterboxd.com\/tmdb\/3/);
 console.log('Rewind hub flow: three shelves, source timeline, no vote floor, thresholds persist/sync, real price drops, stale checks, watched undo, inline search passed');
 dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1});

assert.ok(fs.readFileSync(__dirname+'/../index.html','utf8').indexOf('id="browse-dismiss-bar"')>fs.readFileSync(__dirname+'/../index.html','utf8').indexOf('id="discover-more"'),'Bulk dismissal follows the browse results');
