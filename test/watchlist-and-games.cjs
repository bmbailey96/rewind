const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),W=require('../watchlist-model'),G=require('../games/game-history');
const now=Date.parse('2026-10-09T18:00:00Z');
assert.equal(W.addedAt({Date:'2026-05-27'}),Date.parse('2026-05-27T12:00:00Z'));assert.equal(W.addedAt({}),null);
const old={id:1,pinned:true,addedAt:12,availabilitySnapshot:{offers:[{price:3}]}};const merged=W.merge([old],[{id:1,title:'Fixture',addedDate:'2026-01-01'},{id:2,title:'Second',addedDate:'2025-01-01'},{title:'Ambiguous',unresolved:true}]);assert.equal(merged.length,2);assert.equal(merged[0],old);assert.equal(merged[1].addedAt,Date.parse('2025-01-01T12:00:00Z'));assert.equal(merged[1].rating,undefined);
const fixture=[{name:'Fixture',bucket:'Never Started',genre:'Surreal puzzle',type:'Puzzle',energy:'low'},{name:'Second',bucket:'Never Started',genre:'Surreal puzzle',type:'Puzzle',energy:'low'}];const pool=G.merge(fixture,[{name:'Fixture™',platform:'PS5',minutes:600,lastPlayed:'2021-01-01'},{name:'Fixture',platform:'PS5',minutes:10},{name:'Fixture',platform:'PS4',minutes:60},{name:'Netflix',platform:'PS5',minutes:10000}]);assert.equal(pool.length,2);assert.equal(pool[0].history.minutes,660);assert.equal(pool[0].bucket,'Played · progress unknown');assert.equal(pool[0].history.duplicateEntries,1);assert(G.evidence(pool[1],pool).score>0);assert(!pool[0].finished);assert.equal(G.key('The Stanley Parable: Ultra Deluxe'),G.key('Stanley Parable: Ultra Deluxe'));
const c={window:{}};vm.runInNewContext(fs.readFileSync(__dirname+'/../games/playstation-stats.js','utf8'),c);assert.equal(c.window.PlayStationStats.records.length,127);const data=c.window.PlayStationStats.records;assert.equal(data.filter(r=>r.lastPlayed&&r.firstPlayed).length,127);assert.equal(data.find(r=>r.name==='Stray').minutes,5100);assert(data.find(r=>r.name==='CONTROL Resonant').cover.startsWith('https://image.api.playstation.com/'));
console.log('Watchlist dates and original-state preservation; PS platform deduplication, app exclusion, positive-only connections and full 127-record snapshot passed');

const R=require('../release-model');
const entries=Array.from({length:70},(_,i)=>({entry:{id:i+1,title:'Fixture '+String(i+1).padStart(2,'0'),addedAt:now-i*1000},status:{offers:[{kind:'rent',provider:'Apple TV',format:'HD',price:i===69?0.99:10+i}]}}));
let page=W.page(entries,{model:R,limit:60});assert.equal(page.total,70);assert.equal(page.rows.length,60);assert.equal(page.rows[0].entry.id,70,'Lowest price outside the first 60 must reach page one');
page=W.page(entries,{model:R,limit:60,filter:'cheap'});assert.equal(page.total,1);assert.equal(page.rows[0].entry.id,70,'Filters apply to the entire collection before pagination');
page=W.page([...entries,{entry:{id:71,title:'Stale bargain'},status:{stale:true,offers:[{kind:'rent',price:0.01}]}},{entry:{id:72,title:'Unknown price'},status:{offers:[{kind:'rent'}]}}],{model:R,limit:100});assert.equal(page.rows[0].entry.id,70);assert.equal(page.rows.at(-1).entry.id,71,'An old quote must not outrank confirmed prices');assert.equal(entries[0].entry.id,1,'Sorting must not reorder the original collection');
assert.equal(W.match({title:'Fixture',year:'2026'},[{id:1,title:'Fixture',release_date:'2025-01-01'}]),null);
assert.equal(W.match({title:'Fixture',year:'2026'},[{id:1,title:'Fixture',release_date:'2026-01-01'},{id:2,title:'Fixture',release_date:'2026-02-01'}]),null);
assert.equal(W.match({title:'Amélie',year:'2001'},[{id:3,title:'Amelie',release_date:'2001-04-25'}]).id,3);
console.log('Full-collection price sorting and filters before pagination; stale and unknown prices; unique title/year matching passed');

assert.deepEqual(W.releaseYears({results:[{release_dates:[{type:1,release_date:'2011-03-01'},{type:3,release_date:'2012-02-01'},{type:4,release_date:'2010-01-01'}]}]}),['2011','2012']);assert.equal(W.match({title:'Festival film',year:'2011'},[{id:99,title:'Festival film',release_date:'2012-02-01',catalogReleaseYears:['2011','2012']}]).id,99);

const changeTime=Date.now(),freshStatus={checkedAt:changeTime,quoteCheckedAt:changeTime,offers:[{kind:'rent',provider:'Apple TV',format:'4K',price:5.99}]},drop={movieId:8,type:'price',provider:'Apple TV',format:'4K',from:19.99,to:5.99,at:changeTime,text:'Apple TV rental fell from $19.99 to $5.99'};
assert.equal(W.actionable({id:8},freshStatus,[drop],7.99,changeTime),drop);assert.equal(W.actionable({id:8},{...freshStatus,stale:true},[drop],7.99,changeTime),null);assert.equal(W.actionable({id:8},{...freshStatus,offers:[{kind:'rent',provider:'Apple TV',format:'HD',price:5.99}]},[drop],7.99,changeTime),null,'A different format does not prove this drop');assert.equal(W.actionable({id:8},freshStatus,[{...drop,at:changeTime-15*86400000}],7.99,changeTime),null);
const arrival={movieId:8,type:'included',provider:'Shudder',at:changeTime,text:'Now included with Shudder'};assert.equal(W.actionable({id:8},{checkedAt:changeTime,offers:[{kind:'subscription',provider:'Shudder',included:false}]},[arrival],7.99,changeTime),null);assert.equal(W.actionable({id:8},{checkedAt:changeTime,offers:[{kind:'subscription',provider:'Shudder',included:true}]},[arrival],7.99,changeTime),arrival);
console.log('Useful changes require current matching-format quotes or genuinely included services; stale, expired and unrelated offers stay out');

const cacheAt=Date.now(),cacheFilm={availabilitySnapshot:{checkedAt:cacheAt,quoteCheckedAt:cacheAt,offers:[{kind:'rent',price:5.99}]}};assert(W.freshSnapshot(cacheFilm,cacheAt));assert(!W.freshSnapshot(cacheFilm,cacheAt+6*3600000));assert(!W.freshSnapshot({availabilitySnapshot:{...cacheFilm.availabilitySnapshot,quoteCheckedAt:cacheAt-7*3600000}},cacheAt));assert(!W.freshSnapshot({availabilitySnapshot:{...cacheFilm.availabilitySnapshot,stale:true}},cacheAt));assert(!W.freshSnapshot(cacheFilm,cacheAt-1));assert(W.freshSnapshot({availabilitySnapshot:{checkedAt:cacheAt,offers:[{kind:'subscription',included:true}]}},cacheAt));
const importedFilm={id:80,title:'Imported',release_date:'2001-01-01',source:'Letterboxd watchlist'},baselineFilm={id:81,title:'Baseline',release_date:'2002-01-01'},newFilm={id:82,title:'The "Odd", Film',release_date:'2027-01-01',source:'Rewind watchlist'};assert.deepEqual(W.rewindAdditions([importedFilm,baselineFilm,newFilm],[W.sourceKey(baselineFilm)]),[newFilm]);const csv=W.exportCSV([importedFilm,baselineFilm,newFilm],[W.sourceKey(baselineFilm)]);assert.match(csv,/^tmdbID,Title,Year\r\n82,/);assert.match(csv,/"The ""Odd"", Film",2027/);assert.doesNotMatch(csv,/Rating|Watched/);assert.deepEqual(W.genreIds({detailsSnapshot:{genres:[{id:27,name:'Horror'}]}}),[27]);
const sixHundred=Array.from({length:600},(_,i)=>({entry:{id:i+1,title:'Film '+i},status:{checkedAt:cacheAt,offers:[{kind:'rent',price:600-i}]}}));assert.equal(W.page(sixHundred,{model:R,limit:60}).rows[0].entry.id,600);assert.equal(W.page(sixHundred,{model:R,limit:60}).rows.length,60);
console.log('600-film sorting, fresh-cache boundaries, cached genres and exact-ID Letterboxd addition exports passed');
const releaseToday='2026-10-12';
const releaseFilms=[
 {id:1,title:'Lower boundary',release_date:'2025-10-12',addedAt:Date.parse('2020-01-01')},
 {id:2,title:'Released yesterday',release_date:'2026-10-11',importedAt:Date.parse('2026-10-12')},
 {id:3,title:'Latest',release_date:'2026-10-12'},
 {id:4,title:'Already watched',release_date:'2026-02-01'},
 {id:5,title:'Older',release_date:'2025-10-11',addedAt:Date.now()},
 {id:6,title:'Future',release_date:'2026-10-13'},
 {id:7,title:'Unknown'},
 {id:8,title:'Just a year',release_date:'2026'},
 {id:9,title:'Invalid calendar',release_date:'2026-02-30'},
 {id:10,title:'US release fallback',usReleaseDate:'2026-04-03'}
];
const eligible=W.recentReleases(releaseFilms,releaseToday,m=>m.id===4);
assert.deepEqual(eligible.map(m=>m.id),[1,2,3,10],'Include only dated last-year releases and exclude known watched titles');
assert.equal(W.recentRelease(releaseFilms[4],releaseToday),false,'An old movie added today is not a new release');
assert.equal(W.recentRelease(releaseFilms[5],releaseToday),false,'A future title is not recently released');
assert.equal(W.recentRelease(releaseFilms[7],releaseToday),false,'Do not turn a release year into a date');
assert.equal(W.recentRelease({release_date:'2025-02-28'},'2026-02-28'),true,'Calendar-year cutoff handles February');
assert.equal(W.recentRelease({release_date:'2023-02-28'},'2024-02-29'),true,'Leap-day cutoff clamps to February 28');
const hugeReleaseList=Array.from({length:600},(_,i)=>({id:10000+i,title:'Film '+i,release_date:i<520?'2026-04-01':'2020-04-01',addedAt:Date.parse('2026-10-12')}));
assert.equal(W.recentReleases(hugeReleaseList,releaseToday).length,520,'Recent is not artificially limited to 30 or 24 films');
assert.equal(hugeReleaseList.length,600,'All retains older films, future titles, and watched entries');
console.log('Recent includes only unwatched dated releases in the last twelve months, with no artificial cap or import-date contamination');


const legacyManual={id:11,source:'Rewind watchlist',title:'Hand saved',addedAt:Date.parse('2026-01-01')};
const imported={id:12,source:'Letterboxd watchlist',title:'Imported',addedAt:Date.parse('2026-01-01')};
const declined={id:13,source:'Rewind watchlist',title:'Unfollowed',addedAt:Date.now(),followRelease:false};
const ambiguous={id:14,title:'Unknown origin',release_date:'2026-01-01',addedAt:Date.now()};
const migrated=[legacyManual,imported,declined,ambiguous];
assert.equal(W.backfillReleaseFollows(migrated),1,'Migrate only explicit manual Rewind records');
assert.equal(W.backfillReleaseFollows(migrated),0,'Migration is idempotent');
assert.equal(legacyManual.followRelease,true);
assert.equal(imported.followRelease,undefined,'Letterboxd alone never starts special monitoring');
assert.equal(declined.followRelease,false,'Do not resurrect an intentional unfollow');
assert.equal(ambiguous.followRelease,undefined,'Do not guess a follow from a recent release date');
const reclassifiedManual={id:17,source:'Letterboxd watchlist',letterboxdWatchlist:true,addedAt:Date.parse('2026-09-01')};
const importedReclassified={id:18,source:'Letterboxd watchlist',letterboxdWatchlist:true,importedAt:Date.parse('2026-10-12'),addedAt:Date.parse('2026-09-01')};
assert.equal(W.backfillReleaseFollows([reclassifiedManual,importedReclassified]),1,'Recover old Rewind saves whose source was overwritten by CSV import');
assert.equal(reclassifiedManual.followRelease,true);
assert.equal(importedReclassified.followRelease,undefined,'CSV-only additions are not assumed to have been manually followed');
assert.equal(W.backfillReleaseFollows([{id:1204680,source:'Rewind watchlist',addedAt:Date.now()}]),0,'Do not auto-follow seeded catalog entry');

const day=86400000,releaseWatchToday=new Date().toISOString().slice(0,10);
const tomorrowWatch=new Date(Date.now()+2*day).toISOString().slice(0,10);
const theatricalWatch=new Date(Date.now()+20*day).toISOString().slice(0,10);
const checkedWatch=Date.now();
const group=(id,title,offers=[],extra={})=>({entry:{id,title,followRelease:true,addedAt:checkedWatch-id*1000},status:{checkedAt:checkedWatch,offers,...extra}});
const rows=[
 group(1,'Waiting'),
 group(2,'Theaters',[],{details:{release_dates:{results:[{iso_3166_1:'US',release_dates:[{type:3,release_date:theatricalWatch+'T00:00:00Z'}]}]}}}),
 group(3,'Coming',[],{announcements:[{kind:'subscription',date:tomorrowWatch,provider:'Shudder',sourceUrl:'https://example.org/announcement'}]}),
 group(4,'Available',[{kind:'subscription',provider:'Shudder',included:true}]),
 group(5,'Arrival',[{kind:'subscription',provider:'Shudder',included:true}])
];
const arrivals=[{movieId:5,at:checkedWatch-1000,type:'included',provider:'Shudder'}];
const releasePage=W.releaseWatchPage(rows,{model:R,budget:7.99,today:releaseWatchToday,receipts:arrivals});
assert.deepEqual(releasePage.rows.map(r=>r.stage.group),['included','included','upcoming','waiting','waiting']);
assert.equal(W.releaseStage(rows[3].entry,rows[3].status,releaseWatchToday,7.99,[],R).group,'included','A first check is not an arrival');
assert.equal(W.releaseStage(rows[4].entry,{...rows[4].status,stale:true},releaseWatchToday,7.99,arrivals,R).newArrival,false,'A stale provider listing is not a new arrival');
assert.equal(W.releaseStage({id:6},{checkedAt:checkedWatch,offers:[{kind:'rent',price:19.99,provider:'Apple TV'}]},releaseWatchToday,7.99,[],R).group,'premium','High premium rental belongs above the rental limit');
assert.equal(W.releaseStage(rows[1].entry,rows[1].status,releaseWatchToday,7.99,[],R).group,'upcoming','A future US theatrical date is not a local screening');
assert.equal(W.releaseWatchPage(rows,{model:R,budget:7.99,today:releaseWatchToday,receipts:arrivals,limit:2}).total,5,'Pagination does not truncate tracked collection');
console.log('Release follows, conservative legacy migration, verified arrivals, published dates and entire-collection grouping passed');
