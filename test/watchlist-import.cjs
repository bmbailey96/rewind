const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),W=require('../watchlist-model');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const row=(title,year='2001')=>({title,year,addedDate:'2026-05-27',letterboxdURL:'https://boxd.it/fixture'});
const original={id:2,title:'Fresh',year:'2001',pinned:true,manualNote:'Keep this',addedAt:123,availabilitySnapshot:{offers:[{kind:'physical'}]}};
let baseline={version:'v2',films:[{...row('Removed'),id:1},{...row('Fresh'),id:2},row('Exact'),row('Wrong year'),row('Ambiguous')]},refreshes=0;
const context={WatchlistModel:W,hubState:{watchlistBaselineVersion:'v1',watchlistUnmatched:[row('Fresh'),row('Exact'),row('Wrong year'),row('Ambiguous')]},watchlist:[original],watchlistMatching:false,watchlistMatchProgress:'',REGION:'US',AbortController,setTimeout,clearTimeout,saveWatchlist(){},persistHubState(){},scheduleSync(){},renderImportReview(){},showToast(){},document:{getElementById:()=>({textContent:''})},renderWatchlist:async()=>{refreshes++;},fetch:async url=>url.startsWith('/.netlify/functions/catalog-identity')?{ok:false,status:400,json:async()=>({error:'Fixture has no source match'})}:{ok:true,json:async()=>baseline},tmdbGet:async(_path,p)=>{assert.equal(p.region,undefined,'Catalog identity uses the original release year, not the US booking year');return {total_pages:1,results:p.query==='Exact'?[{id:3,title:'Exact',release_date:'2001-04-01',poster_path:'/verified.jpg'}]:p.query==='Wrong year'?[{id:9,title:'Wrong year',release_date:'2002-01-01'}]:[{id:8,title:'Ambiguous',release_date:'2001-01-01'},{id:9,title:'Ambiguous',release_date:'2001-02-01'}]};}};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('async function mapLimited'),source.indexOf('async function fetchDiscover'))+source.slice(source.indexOf('let catalogMatchesPromise'),source.indexOf('// ---------- init')).replace('}catch{ /* Existing tracked films remain available. */ }','}catch(error){throw error;}'),context);
(async()=>{
 await context.loadWatchlistBaseline();assert.equal(context.watchlist.length,1,'A baseline update must not re-add a removed source film');assert.equal(context.watchlist[0],original);assert(context.hubState.watchlistImportedKeys.includes(W.sourceKey(row('Removed'))));
 await context.resolveWatchlistMatches();assert.equal(context.watchlist.length,2);assert.equal(context.watchlist[0],original);assert.equal(context.watchlist[1].addedAt,W.addedAt(row('Exact')));assert.equal(context.watchlist[1].poster_path,'/verified.jpg');assert.equal(context.hubState.watchlistUnmatched.length,2);assert.equal(refreshes,1);assert.equal(context.watchlistMatching,false);
 context.watchlist=context.watchlist.filter(f=>f.id!==3);await context.loadWatchlistBaseline();await context.resolveWatchlistMatches();assert.equal(context.watchlist.length,1,'Finished imports stay finished after the film is removed');
 baseline={version:'v3',films:[...baseline.films.filter(f=>f.title!=='Exact'),{...row('Exact'),id:3},{...row('New'),id:4}]};await context.loadWatchlistBaseline();assert.equal(context.watchlist.some(f=>f.id===3),false,'A later catalog update must not resurrect a removed matched film');assert.equal(context.watchlist.some(f=>f.id===4),true);
 assert.equal(W.match(row('日本'),[{id:5,title:'中国',release_date:'2001-01-01'}]),null);
 context.hubState.watchlistUnmatched.push(row('Festival'));const oldLookup=context.tmdbGet;context.tmdbGet=async(path,params)=>path==='/movie/5/release_dates'?{results:[{release_dates:[{type:1,release_date:'2001-03-01'}]}]}:params.query==='Festival'?{total_pages:1,results:[{id:5,title:'Festival',release_date:'2002-02-01'}]}:oldLookup(path,params);await context.resolveWatchlistMatches();const festival=context.watchlist.find(f=>f.id===5);assert.equal(festival.year,'2001');assert.equal(festival.release_date,'2002-02-01');assert.equal(festival.catalogReleaseYears[0],'2001','A differing catalog year needs a documented theatrical or festival release');
 // Failures at the head of a long queue cannot block later titles.
 const firstTitle='Queued 0',longQueue=Array.from({length:19},(_,i)=>row('Queued '+i));context.hubState.watchlistUnmatched=longQueue;context.hubState.watchlistImportedKeys=[];
 context.tmdbGet=async(path,params)=>{if(params.query===firstTitle)throw Error('offline');const n=Number(params.query.split(' ')[1]);return {total_pages:1,results:[{id:100+n,title:params.query,release_date:'2001-01-01'}]};};
 await context.resolveWatchlistMatches();assert.equal(context.hubState.watchlistUnmatched.find(r=>r.title===firstTitle).catalogMatch.state,'retry');
 await context.resolveWatchlistMatches();await context.resolveWatchlistMatches();
 assert.equal(context.hubState.watchlistUnmatched.length,1,'Every later title is attempted instead of repeating the first 12');assert.equal(context.watchlist.filter(m=>m.id>=100).length,18);
 assert.equal(context.watchlist.filter(m=>m.id>=100).some(m=>m.followRelease===true),false,'Identifying an import never follows its release');
 const pending=Array.from({length:14},(_,i)=>row('Pending '+i));pending[0].catalogMatch={state:'review'};pending[1].catalogMatch={state:'retry',nextAttemptAt:Date.now()+60000,lastAttemptAt:Date.now()};
 assert.equal(W.matchQueue(pending).length,12);assert.deepEqual(W.matchSummary(pending),{pending:12,retry:1,review:1,unsupported:0});
 const removedKey=W.sourceKey(row('Removed cached'));context.hubState.watchlistImportedKeys=[removedKey];context.hubState.watchlistUnmatched=[row('Removed cached'),row('Personal pending'),row('Known title')];
 context.reconcileWatchlistMatches([{key:removedKey,film:{id:900,title:'Removed cached',release_date:'2001-01-01'}},{key:W.sourceKey(row('Known title')),film:{id:901,title:'Known title',release_date:'2001-01-01'}}]);
 assert.equal(context.watchlist.some(m=>m.id===900),false,'Cached matches cannot resurrect a removed film');assert.equal(context.watchlist.some(m=>m.id===901),true);
 assert.equal(context.hubState.watchlistUnmatched[0].title,'Personal pending','User imports outside the baseline survive reconciliation');
 const linkedRow=row('Linked film');context.hubState.watchlistUnmatched=[linkedRow];context.hubState.watchlistImportedKeys=[];
 context.fetch=async()=>({ok:true,json:async()=>({id:700,mediaType:'movie',sourceURL:'https://letterboxd.com/film/linked-film/'})});
 context.tmdbGet=async(path,params)=>path==='/movie/700'?{id:700,title:'Linked film',release_date:'2001-01-01',poster_path:'/linked.jpg'}:{total_pages:1,results:[{id:700,title:'Linked film',release_date:'2001-01-01'},{id:701,title:'Linked film',release_date:'2001-02-01'}]};
 await context.resolveWatchlistMatches();assert.equal(context.hubState.watchlistUnmatched.length,0,'An authoritative source link settles competing title/year records');assert.equal(context.watchlist.some(m=>m.id===700),true);assert.equal(context.watchlist.some(m=>m.id===701),false);
 const shipped=JSON.parse(fs.readFileSync(__dirname+'/../catalog-matches.json','utf8')),baseFilms=JSON.parse(fs.readFileSync(__dirname+'/../watchlist-baseline.json','utf8')).films;
 for(const film of baseFilms){const key=W.sourceKey(film);assert.ok(shipped.matches.some(m=>m.key===key&&m.film.id)||shipped.reviews.some(r=>r.key===key&&r.series?.id),'Every original import row has a verified identity or an explicit series record');}
 assert.equal(shipped.matches.find(m=>m.key==='jasonx|2001').film.id,11470);assert.equal(shipped.matches.find(m=>m.key==='jasonx|2002').film.id,11470);
 const duplicateRow=row('Same name');context.watchlist.push({id:1500,title:'Same name',release_date:'2001-01-01',manualNote:'Other film, keep this'});context.hubState.watchlistUnmatched=[duplicateRow];context.hubState.watchlistImportedKeys=[];
 context.reconcileWatchlistMatches([{key:W.sourceKey(duplicateRow),film:{id:1501,title:'Same name',release_date:'2001-02-01'}}]);
 assert.equal(context.watchlist.some(m=>m.id===1501),true,'Verified catalog identity outranks a coincidentally identical saved title/year');assert.equal(context.watchlist.find(m=>m.id===1500).manualNote,'Other film, keep this');
 // The browser starts matching without another batch button.
 context.hubState.watchlistUnmatched=[row('Auto fixture')];context.hubState.watchlistImportedKeys=[];context.navigator={onLine:true};context.document.visibilityState='visible';
 let timerId=0;const timers=new Map();context.setTimeout=(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;};context.clearTimeout=id=>timers.delete(id);
 context.tmdbGet=async()=>({total_pages:1,results:[{id:990,title:'Auto fixture',release_date:'2001-01-01'}]});
 context.scheduleWatchlistMatching(5);const scheduled=[...timers.values()][0];assert.equal(scheduled.delay,5);scheduled.fn();await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(context.hubState.watchlistUnmatched.length,0);assert.equal(context.watchlist.some(m=>m.id===990),true,'Background scheduling finishes a queued film without a manual click');
 console.log('Resumable import preserves dates, posters and edits; removed films stay removed; wrong-year and ambiguous matches retained');
})().catch(e=>{console.error(e);process.exitCode=1});
