const assert=require('node:assert/strict'),H=require('../hub-model');
assert.ok(H.matchEvent({title:'Guillermo del Toro’s Pan’s Labyrinth 20th Anniversary'},{title:"Pan's Labyrinth"}));assert.equal(H.matchEvent({title:'Spirited Away: Live on Stage – Studio Ghibli Fest 2026'},{title:'Spirited Away'}),false);
assert.equal(H.letterboxd({id:123,letterboxdURL:'javascript:alert(1)'}),'https://letterboxd.com/tmdb/123/');
assert.equal(H.evidence([{id:1},{id:2,rating:3},{id:3,rating:4},{id:4,owned:true},{id:5,rewatches:2}]).length,3);
const seed={id:1,title:'A Favorite',rating:5,meta:{genres:[{name:'Horror'}],credits:{crew:[{job:'Director',name:'Director A'}]}}};const match={id:2,title:'The Sequel',meta:{genres:[{name:'Horror'}],credits:{crew:[{job:'Director',name:'Director A'}]}}};assert.match(H.affinity(match,[seed]).reasons.join(' '),/Same director.*rated/);assert.equal(H.affinity(match,[]).score,0);
assert.equal(H.roulettePass({tags:[]},{noGore:true}),false);assert.equal(H.roulettePass({tags:['gore']},{noGore:true}),false);assert.equal(H.roulettePass({tags:['folk'],tones:{cozy:80}},{preset:'folk'}),true);assert.equal(H.weightedPick([],()=>1),null);
const merged=H.mergeRecords([{id:1,rating:5,rewatches:3}],[{id:1,owned:true,rewatches:1}]);assert.equal(merged[0].rating,5);assert.equal(merged[0].rewatches,3);assert.ok(merged[0].owned);
const movie={id:2,title:'Film',availabilitySnapshot:{announcements:[{date:'2026-10-23',provider:'Shudder'}]}};assert.equal(H.upcoming(movie,'2026-10-05')[0].label,'Arrives on Shudder');
console.log('Hub: exact event matching, safe Letterboxd links, positive taste evidence, explanations, content exclusions and non-destructive imports passed');
