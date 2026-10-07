const assert=require('node:assert/strict'),H=require('../hub-model');
assert.ok(H.matchEvent({title:'Guillermo del Toro’s Pan’s Labyrinth 20th Anniversary'},{title:"Pan's Labyrinth"}));assert.equal(H.matchEvent({title:'Spirited Away: Live on Stage – Studio Ghibli Fest 2026'},{title:'Spirited Away'}),false);
assert.equal(H.letterboxd({id:123,letterboxdURL:'javascript:alert(1)'}),'https://letterboxd.com/tmdb/123/');
assert.equal(H.evidence([{id:1},{id:2,rating:3},{id:3,rating:4},{id:4,owned:true},{id:5,rewatches:2}]).length,3);
const seed={id:1,title:'A Favorite',rating:5,meta:{genres:[{name:'Horror'}],credits:{crew:[{job:'Director',name:'Director A'}]}}};const match={id:2,title:'The Sequel',meta:{genres:[{name:'Horror'}],credits:{crew:[{job:'Director',name:'Director A'}]}}};assert.match(H.affinity(match,[seed]).reasons.join(' '),/Same director.*rated/);assert.equal(H.affinity(match,[]).score,0);
assert.equal(H.roulettePass({tags:[]},{noGore:true}),false);assert.equal(H.roulettePass({tags:['gore']},{noGore:true}),false);assert.equal(H.roulettePass({tags:['folk'],tones:{cozy:80}},{preset:'folk'}),true);assert.equal(H.weightedPick([],()=>1),null);
const merged=H.mergeRecords([{id:1,rating:5,rewatches:3}],[{id:1,owned:true,rewatches:1}]);assert.equal(merged[0].rating,5);assert.equal(merged[0].rewatches,3);assert.ok(merged[0].owned);
const movie={id:2,title:'Film',availabilitySnapshot:{announcements:[{date:'2026-10-23',provider:'Shudder'}]}};assert.equal(H.upcoming(movie,'2026-10-05')[0].label,'Arrives on Shudder');
console.log('Hub: exact event matching, safe Letterboxd links, positive taste evidence, explanations, content exclusions and non-destructive imports passed');
const writerSeed={id:700,title:'Liked Writer Film',rating:4.5,meta:{genres:[],credits:{crew:[{job:'Screenplay',name:'Writer Person'}]}}};const writerMovie={id:701,title:'New Writer Film',meta:{genres:[],credits:{crew:[{job:'Writer',name:'Writer Person'}]}}};const writerFit=H.affinity(writerMovie,[writerSeed]);assert.ok(writerFit.score>2);assert.match(writerFit.reasons[0],/Same writer/);
const genericSeed={id:900,title:'Liked Horror',rating:5,meta:{keywords:{keywords:[{name:'sequel'},{name:'supernatural'},{name:'witty'}]},genres:[{name:'Horror'}]}},genericMovie={id:901,title:'Generic Horror',meta:{keywords:{keywords:[{name:'sequel'},{name:'supernatural'},{name:'witty'}]},genres:[{name:'Horror'}]}};assert.ok(H.affinity(genericMovie,[genericSeed]).score<2,'Generic sequel/tone tags must not become a strong recommendation');

const included={stale:false,offers:[{kind:'subscription',included:true,provider:'Prime Video'}]},pickAt=Date.UTC(2026,9,6),pickPool=[{id:1,title:'Ordinary'},{id:2,title:'Pinned',pinned:true},{id:3,title:'Newly included',includedSince:pickAt-86400000,availabilitySnapshot:included},{id:4,title:'Old arrival',includedSince:pickAt-20*86400000,availabilitySnapshot:included}];
assert.equal(H.orderWatchlist(pickPool,'smart',pickAt,()=>.5)[0].id,2);
assert.equal(H.orderWatchlist(pickPool,'smart',pickAt,()=>.5)[1].id,3);
assert.equal(H.watchlistPriority({...pickPool[2],availabilitySnapshot:{...included,stale:true}},pickAt),0);
assert.equal(H.watchlistPriority({...pickPool[2],includedSince:pickAt+86400000},pickAt),0);
assert.equal(H.watchlistPriority({availabilitySnapshot:included},pickAt),0,'An included first observation does not invent an arrival');
assert.deepEqual(H.orderWatchlist(pickPool,'shuffle',pickAt,()=>.5).map(m=>m.id),H.shuffle(pickPool,()=>.5).map(m=>m.id));
assert.equal(H.affinity(match,[seed]).connection.seedTitle,'A Favorite');
console.log('Watchlist priority: pins, confirmed recent arrivals, stale and first-check exclusions, and pure shuffle passed');

assert.deepEqual(H.shelfRow({'Movie Title':'The Thing','Production Year':'1982','Media Format':'Blu-ray','TMDB ID':'1091'}),{title:'The Thing',year:'1982',format:'Blu-ray',tmdbId:'1091'});
assert.equal(H.sameTheaterFilm({id:1091,title:'The Thing',year:'1982'},{id:60935,title:'The Thing',year:'2011'}),false);
assert.equal(H.sameTheaterFilm({id:1091,title:'The Thing',year:'1982'},{title:'The Thing',year:'1982'}),true);
assert.equal(H.theaterIdentity({title:'The Thing 40th Anniversary'},{id:1091,release_date:'1982-06-25'}).title,'The Thing');
assert.equal(H.shelfStatus({physicalFormats:['DVD','VHS']}).offers.length,2);
