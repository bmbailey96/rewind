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
  if(u.pathname==='/tv-catalog.json')body=[];
  else if(u.pathname.includes('rewind-cinema')||u.pathname==='/cinema-snapshot.json')body={events:{items:[{id:'event-a',title:'Coyote vs. Acme Special Screening',dates:['2026-10-06','2026-10-08'],ranges:[],start:'2026-10-06',end:'2026-10-08',dateLabel:'Oct 6 · Oct 8',url:'https://www.fathomentertainment.com/releases/test/'}],checkedAt:Date.now(),stale:false},local:{items:[{id:'local-coyote-'+cinemaRevision,title:'Coyote vs. Acme',dates:['2026-10-06','2026-10-07','2026-10-09'],start:'2026-10-06',end:'2026-10-09',screenings:[{date:'2026-10-06',time:'7:00pm',format:'Standard',url:'https://tickets.fandango.com/test'}],url:'https://www.cinemark.com/theatres/test'}],checkedAt:Date.now(),stale:false}};
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
 w.localStorage.setItem('rewind-services-v1',JSON.stringify(['Netflix']));
 const tvFixture={seriesRecords:[
 {id:'tv:fixtureseries:1:answer',seriesId:'tv:fixtureseries',title:'Fixture Series',season:1,status:'watched',rating:5,partial:false},
 {id:'tv:fixtureseries:2:answer',seriesId:'tv:fixtureseries',title:'Fixture Series',season:2,status:'watched',rating:null,partial:true,scope:'Season 2 · partly watched: episode 3'},
 {id:'tv:fixtureseries:series:intent',seriesId:'tv:fixtureseries',title:'Fixture Series',season:null,status:'watchlist',rating:null},
 {id:'tv:neutral:1:answer',seriesId:'tv:neutral',title:'Neutral Series',season:1,status:'unseen',rating:null}
 ],seriesCatalog:[{id:'tv:fixtureseries',tmdbId:42,checkedAt:w.Date.now(),providers:[{id:8,name:'Netflix'}],providerURL:'https://www.themoviedb.org/tv/42/watch',detail:{id:42,name:'Fixture Series',first_air_date:'2020-01-01',overview:'An actual series synopsis.',poster_path:'/tv.jpg',genres:[{id:18,name:'Drama'}],created_by:[{name:'Series Creator'}],credits:{crew:[]},seasons:[{season_number:1,air_date:'2020-01-01'},{season_number:2,air_date:'2026-09-01'}],next_episode_to_air:{air_date:'2026-10-06',season_number:2,episode_number:4},episode_run_time:[45]}}],seriesFollows:['tv:fixtureseries']};
 w.localStorage.setItem('rewind-hub-v1',JSON.stringify(tvFixture));
 w.eval(['startup.js','rewind-model.js','release-model.js','availability-ui.js','counter-model.js','discovery-model.js','taste-model.js','hub-model.js','artwork-model.js','occasion-model.js','oracle.js','storage-model.js','sync-model.js','static-model.js','watchlist-model.js','movie-news-model.js','media-model.js','app.js','tv-model.js','tv.js','media.js','hub.js','static-experience.js','movie-news.js','letterboxd-diary.js'].map(file=>fs.readFileSync(__dirname+'/../'+file,'utf8')).join('\n')+'\nwindow.testState={movies:()=>watchlist,replaceMovies:m=>watchlist=m,hub:()=>hubState,hubInterface:Hub,saveFailure:()=>{cloudSavePhase="synced";failedStorageKeys.add("test-failure");renderSaveState()},clearSaveFailure:()=>{failedStorageKeys.delete("test-failure");cloudSavePhase="idle";renderSaveState()},syncBase,seen:()=>seenSet,changed:()=>Hub.stateChanged()};window.mediaTest=RewindMedia;window.mediaModel=MediaModel;');

 await wait();await wait();await wait();
 const media=w.mediaTest;
 assert.equal(media.next(media.groups().find(g=>g.id==='tv:fixtureseries')).number,2);
 assert.equal(media.evidence().filter(r=>r.title.startsWith('Neutral')).length,0,'Unseen is neutral, not a negative taste score');
 assert.equal(media.evidence().find(r=>r.title.startsWith('Fixture')).rating,5,'Use the supplied season rating');
 w.document.querySelector('[data-watchlist-scope=all]').click();await wait();await wait();
 await w.eval('renderWatchlist(false,true)');
 assert.ok(w.document.querySelector('#tab-watchlist .shelf-group [data-media-type=tv]'),'TV is inside the existing watchlist shelves');
 assert.match(w.document.querySelector('#tab-watchlist [data-media-type=tv]').textContent,/Continue season 2/);
 assert.match(w.document.querySelector('#tab-watchlist [data-media-type=tv]').textContent,/TV SERIES/);
 assert.ok(w.document.querySelector('#tab-watchlist [data-media-type=movie] .media-type-badge.movie'));
 media.setFilter('tv');await wait();await wait();
 assert.equal(w.document.querySelector('#tab-watchlist .shelf-group [data-media-type=movie]'),null);
 assert.ok(w.document.querySelector('#tab-watchlist .shelf-group [data-media-type=tv]'));
 media.setFilter('movie');await wait();await wait();
 assert.equal(w.document.querySelector('#tab-watchlist .shelf-group [data-media-type=tv]'),null);
 media.setFilter('all');await wait();
 const prior=w.testState.movies();
 w.testState.replaceMovies([...prior,{id:42,title:'Numeric collision movie',release_date:'2021-01-01'},{id:998,title:'Midnight Mass',release_date:'2021-09-24',letterboxdURL:'https://letterboxd.com/film/midnight-mass-2021/'}]);
 const combined=media.collection();
 assert.ok(combined.some(m=>m.id===42));
 assert.ok(combined.some(m=>m.id==='tv:fixtureseries'),'TV and movie catalog numbers cannot collide');
 assert.equal(combined.filter(m=>m.title==='Midnight Mass').length,1);
 assert.equal(combined.find(m=>m.title==='Midnight Mass').mediaType,'tv');
 assert.ok(w.testState.movies().some(m=>m.id===998),'Displaying a linked series does not delete the Letterboxd record');
 w.testState.replaceMovies(prior);
 w.document.querySelector('[data-tab=upcoming]').click();await wait();
 assert.equal(w.document.querySelector('[data-calendar-source=kalispell]').getAttribute('aria-pressed'),'true');
 assert.equal(w.document.querySelector('[data-calendar-source=both]'),null);
 assert.equal(w.document.querySelector('#calendar-mobile [data-channel=digital]'),null);
 w.document.querySelector('[data-calendar-source=digital]').click();await wait();
 assert.match(w.document.getElementById('calendar-mobile').textContent,/Fixture Series/);
 assert.ok(w.document.querySelector('#calendar-mobile .media-type-badge.tv'));
 assert.equal(w.document.querySelector('#calendar-mobile [data-channel=theater]'),null);
 media.setFilter('movie');await wait();
 assert.doesNotMatch(w.document.getElementById('calendar-mobile').textContent,/Fixture Series/);
 media.setFilter('all');
 const fit=w.HubModel.affinity({id:'tv:new',meta:{created_by:[{name:'Series Creator'}]}},media.evidence());
 assert.match(fit.reasons.join(' '),/Same creator.*season 1/);
 assert.ok(fit.score>=3);
 const stateBefore=JSON.stringify(w.testState.hub().seriesRecords);
 const tv=media.savedTV().find(m=>m.id==='tv:fixtureseries');
 const card=w.renderCard(tv,{context:'picker'});
 assert.match(card.textContent,/TV SERIES/);assert.ok(card.querySelector('.film-details-trigger'));
 assert.equal(JSON.stringify(w.testState.hub().seriesRecords),stateBefore,'Rendering never marks an unseen season watched');
 assert.ok(w.eval('collectSyncData().hub.seriesRecords').length);
 assert.ok(w.eval('collectSyncData().hub.seriesFollows').includes('tv:fixtureseries'));
 assert.equal(w.document.querySelectorAll('[data-media-filter=tv]').length,3,'Same explicit type choice exists in collection, Discover and digital Calendar');
 dom.window.close();
 console.log('Integrated TV: shared watchlist shelves, filters, season evidence, creator links, partial progress, Letterboxd identity, numeric ID collisions, default Kalispell and exclusive digital calendar passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
