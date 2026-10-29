const assert = require('node:assert/strict');
const C = require('../src/core');
const starter = require('../assets/starter-library.json');

assert.equal(starter.sourceDate, '2026-05-27');
assert.equal(starter.films.length, 261, 'Ship the 261 verified movie identities, not unresolved guesses');
assert.equal(new Set(starter.films.map(m => m.id)).size, 261, 'Starter film identities must be unique');
assert.ok(starter.films.every(m => m.id && m.title && m.letterboxdURL), 'Starter items retain matched TMDb IDs and original Letterboxd film URLs');

assert.equal(C.titleKey('Amélie: 2001!'), 'amelie2001');
assert.equal(C.yearOf({ release_date: '1982-05-02' }), '1982');
assert.equal(C.yearOf({ release_date: 'unknown' }), '');
assert.equal(C.canonicalId({ id: 10, title: 'A film' }), 'movie:10');
assert.notEqual(C.canonicalId({ title: 'The Thing', year: '1982' }),
  C.canonicalId({ title: 'The Thing', year: '2011' }), 'Same-title remakes remain distinct');
assert.equal(C.validPoster('/123_abc.jpg'), '/123_abc.jpg');
assert.equal(C.validPoster('https://bad.example/thing.jpg'), null, 'Only trusted TMDB image paths render');
const sample = C.normalizeMovie({ id: 40, title: 'Sample', year: '1982', poster_path: '/p.jpg',
  pinned: true, manualNote: 'Physical and weird', genre_ids: [27], rating: 4.5,
  availabilitySnapshot: { checkedAt: 1000, offers: [] } });
assert.equal(sample.id, 'movie:40');
assert.equal(sample.rating, 4.5);
assert.equal(sample.note, 'Physical and weird');
assert.equal(sample.pinned, 1);
assert.equal(JSON.parse(sample.genres_json)[0], 27);
assert.equal(C.normalizeMovie({ title: '' }), null);
assert.equal(C.normalizeMovie({ title: 'X', id: -1 }), null, 'Invalid IDs without a title/year should not silently duplicate');
assert.throws(() => C.normalizeBackup(null), /not a Rewind/);
assert.throws(() => C.normalizeBackup({ watchlist: 'not-an-array' }), /not a Rewind/);

const imported = C.normalizeBackup({
  watchlist: [{id: 4,title: 'Rewatch', year: '1981', manualNote:'My note',pinned:true},
    {id: 4,title:'Rewatch',year:'1981'}, { id: 9,title:'Other',year:'2006' }],
  hub: { taste: [{ id: 9, rating: 5 }],
    seriesRecords: [{ seriesId:'tv:series', title:'The Outsider',year:'2020',status:'watchlist',season:1 }] },
  rentalBudget: 4.99, services:['Shudder']
});
assert.equal(imported.films.length,3,'Identical movie IDs deduplicate and saved series remain represented');
assert.ok(imported.films.some(m => m.id === 'tv:name:theoutsider:2020'));
assert.equal(imported.films.find(m => m.id === 'movie:9').rating,5,'Imported positive rating informs native sorting');
assert.equal(imported.settings.rentalBudget,4.99);
assert.deepEqual(imported.settings.services,['Shudder']);
const f = {...sample, availability_json: JSON.stringify({
  checkedAt: 1_000_000, stale:false,
  offers:[{kind:'rent',provider:'Apple TV',price:4.99,format:'HD'}]
})};
assert.equal(C.availability(f,1_100_000).label,'RENT $4.99 · Apple TV');
assert.equal(C.availability(f,1_000_000+7*3600000).verified,false,'Old quotes never count as current');
assert.equal(C.availability({...f,availability_json:'garbage'}).verified,false);
assert.equal(C.availability({...f,availability_json:JSON.stringify({
  checkedAt:1_000_000,stale:true,offers:[{kind:'free',provider:'Tubi'}]
})},1_000_000).verified,false);
assert.equal(C.availability({...f,availability_json:JSON.stringify({
  checkedAt:1_000_000,stale:false,offers:[{kind:'subscription',provider:'Shudder',included:true}]
})},1_000_000).label,'INCLUDED · Shudder');
const ranked = C.candidateFilms([
  {id:'movie:2',title:'Along Came Polly',pinned:0,genres_json:'[]'},
  {id:'movie:3',title:'Repo Man',pinned:0,genres_json:'[878]'},
  {id:'movie:4',title:'Gonjiam',pinned:1,genres_json:'[27]'}
]);
assert.deepEqual(ranked.map(m=>m.id),['movie:4','movie:3','movie:2']);
const pick = C.discoverPick(ranked,['movie:4','movie:3']);
assert.equal(pick.id,'movie:2','Unverified films remain eligible for offline recommendation');
assert.equal(C.discoverPick(ranked,ranked.map(m=>m.id)),null);
console.log('Native Rewind: starter identities, deduplication, migration, offline recommendations and price freshness passed');
