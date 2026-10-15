const assert=require('node:assert/strict'),W=require('../watchlist-model'),R=require('../release-model');
const now=Date.now(),today=new Date(now).toISOString().slice(0,10),future=new Date(now+7*86400000).toISOString().slice(0,10);
function row(id,offers=[],extra={}){return {entry:{id,title:'Film '+id,detailsSnapshot:{release_dates:{results:[{iso_3166_1:'US',release_dates:[{type:3,release_date:today+'T00:00:00Z'}]}]}}},status:{offers,checkedAt:now,stale:false,...extra}};}
const rent=price=>({kind:'rent',provider:'Prime Video',price,format:'4K'}),included={kind:'subscription',provider:'HBO Max',included:true};
const rows=[row(1,[rent(19.99)],{stale:true,checkedAt:now-2*86400000}),row(2,[included],{stale:true,checkedAt:now-2*86400000,digitalDate:future}),row(3,[rent(5.99)],{announcements:[{kind:'subscription',provider:'HBO Max',date:future}]}),row(4),row(5),row(6,[rent(2.99)]),row(7,[{kind:'buy',provider:'Apple TV',price:4.99}]),row(8,[],{digitalDate:future}),row(9,[{kind:'rent',provider:'Prime Video'}])];
const options={model:R,today,budget:7.99,limit:100,localListing:m=>m.id===4||m.id===3?{date:today,stale:false}:null};
const page=W.releaseWatchPage(rows,options),byId=new Map(page.rows.map(r=>[r.entry.id,r]));
assert.equal(byId.get(1).stage.group,'premium','Old rental remains priced instead of falling back to a theatrical date');
assert.equal(byId.get(1).stage.stale,true);assert.equal(byId.get(2).stage.group,'included','Included film must not move to Coming Home');
assert.equal(byId.get(3).stage.group,'cheap');assert.equal(byId.get(3).stage.home.label,'HBO Max');assert.equal(byId.get(3).stage.local.date,today);
assert.equal(byId.get(4).stage.group,'theater');assert.equal(byId.get(5).stage.group,'waiting','A US theatrical date is not a local booking');
assert.equal(byId.get(9).stage.group,'premium');assert.equal(byId.get(9).cost.price,null,'Unpriced rental is never free');
assert.deepEqual(page.rows.filter(r=>r.stage.group==='cheap').map(r=>r.entry.id),[6,3]);
assert.deepEqual(page.rows.filter(r=>r.stage.group==='premium').map(r=>r.entry.id),[1,7,9],'Purchase-only stays clearly behind rentals');
assert.equal(page.rows.filter(r=>r.entry.id===3).length,1,'Streaming and local screening must not duplicate a film');
assert.equal(page.rows.at(-2).entry.id,8,'Dated future home arrival precedes an undated wait');
const one=W.releaseWatchPage(rows,{...options,limit:1});assert.equal(one.total,9);assert.equal(one.rows.length,1);assert.deepEqual(one.counts,{included:1,cheap:2,premium:3,theater:1,upcoming:0,waiting:2});
assert.equal(W.releaseWatchPage(rows,{...options,filter:'free'}).total,1);assert.equal(W.releaseWatchPage(rows,{...options,filter:'premium'}).total,3);
const big=Array.from({length:600},(_,i)=>row(1000+i,[rent(i===599?0.99:5.99)]));const first=W.releaseWatchPage(big,{...options,limit:24});assert.equal(first.rows[0].entry.id,1599);assert.equal(first.counts.cheap,600);assert.equal(first.rows.length,24);
console.log('Release Watch: last-known offers, upcoming notes, actual local dates, price order, unknown quotes, one film per shelf and full counts before pagination passed');

const futureFilm=row(50);futureFilm.entry.detailsSnapshot.release_dates.results[0].release_dates[0].release_date=future+'T00:00:00Z';
const unknownFilm={entry:{id:51,title:'Undated'},status:{offers:[],stale:true}};
const separated=W.releaseWatchPage([futureFilm,row(52),unknownFilm],options);
assert.equal(separated.rows[0].stage.group,'upcoming');assert.equal(separated.rows[0].stage.opening.date,future);
assert.equal(separated.rows.find(r=>r.entry.id===52).stage.group,'waiting','Released today is awaiting home availability');
assert.equal(separated.rows.find(r=>r.entry.id===51).stage.opening,null,'Unknown release dates never imply released');
assert.equal(W.releaseWatchPage([futureFilm,row(52)],{...options,filter:'waiting'}).total,2,'Waiting filter includes both distinct shelves');
const alreadyRenting={...futureFilm,status:{offers:[rent(5.99)],checkedAt:now}};
assert.equal(W.releaseWatchPage([alreadyRenting],options).rows[0].stage.group,'cheap','Actual home availability outranks a future catalog date');
console.log('Waiting shelves: future release, released today, unknown date, dated home release and actual offer precedence passed');

function pin(r){r.entry.pinned=true;return r;}
const affordable=[row(61,[rent(1.99)]),pin(row(62,[rent(6.99)])),pin(row(63,[rent(4.99)]))];
assert.deepEqual(W.releaseWatchPage(affordable,options).rows.map(r=>r.entry.id),[63,62,61],'Pinned films lead their section, with price ordering within pins');
const premiumPins=[row(64,[rent(15.99)]),pin(row(65,[{kind:'buy',provider:'Apple TV',price:24.99}]))];
assert.deepEqual(W.releaseWatchPage(premiumPins,options).rows.map(r=>r.entry.id),[65,64],'Pin priority beats the usual rental / purchase subgroup');
const later=pin(row(66,[],{digitalDate:future})),earlier=row(67,[],{digitalDate:today});
assert.deepEqual(W.releaseWatchPage([earlier,later],options).rows.map(r=>r.entry.id),[66,67],'A pin beats date order in a waiting section');
const mixed=W.releaseWatchPage([pin(row(68,[rent(19.99)])),row(69,[included])],options);
assert.deepEqual(mixed.rows.map(r=>r.entry.id),[69,68],'Pins never cross availability sections');
affordable[1].entry.pinned=false;affordable[2].entry.pinned=false;
assert.deepEqual(W.releaseWatchPage(affordable,options).rows.map(r=>r.entry.id),[61,63,62],'Unpin restores normal price ordering');
const many=Array.from({length:600},(_,i)=>row(2000+i,[rent(1.99)]));many[599].entry.pinned=true;
assert.equal(W.releaseWatchPage(many,{...options,limit:24}).rows[0].entry.id,2599,'Pins are sorted across the whole collection before pagination');
console.log('Section pins: price/date/subgroup precedence, unchanged section order, unpin restoration and 600-film pagination passed');
