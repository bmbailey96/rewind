const assert=require('node:assert/strict');
const {durationMinutes,normalizeTitles,publicSnapshot,sync}=require('../lib/psn-sync.cjs');
const G=require('../games/game-history.js');
class Store{
 constructor(){this.items=new Map();this.etags=new Map();this.sequence=0;}
 async get(k){return this.items.get(k)||null;}
 async getWithMetadata(k){return this.items.has(k)?{data:this.items.get(k),etag:this.etags.get(k)}:null;}
 async setJSON(k,v,o={}){if(o.onlyIfNew&&this.items.has(k)||o.onlyIfMatch&&o.onlyIfMatch!==this.etags.get(k))return {modified:false};this.items.set(k,structuredClone(v));this.etags.set(k,String(++this.sequence));return {modified:true,etag:this.etags.get(k)};}
 async delete(k){this.items.delete(k);}
}
const now=Date.parse('2026-10-11T18:00:00Z');
(async()=>{
 assert.equal(durationMinutes('PT2H4M30S'),125);assert.equal(durationMinutes(null),null);
 assert.equal(normalizeTitles([{name:'Unknown',category:'ps5_native_game'}])[0].minutes,null);
 const store=new Store();let calls=0,refreshes=0;
 const api={exchangeNpssoForAccessCode:async()=> 'secret-code',exchangeAccessCodeForAuthTokens:async()=>({accessToken:'secret-access',refreshToken:'secret-refresh',expiresIn:60}),exchangeRefreshTokenForAuthTokens:async()=>{refreshes++;return {accessToken:'new-secret',refreshToken:'rotated-secret',expiresIn:7200};},getUserPlayedGames:async(auth,who,o)=>{calls++;assert.equal(who,'me');return o.offset===0?{titles:[{name:'CONTROL Resonant',category:'ps5_native_game',playDuration:'PT3H',lastPlayedDateTime:'2026-10-11T17:00:00Z'}],totalItemCount:2,nextOffset:1}:{titles:[{name:'Other',category:'ps4_game',playDuration:'PT1H'}],totalItemCount:2,nextOffset:2};}};
 let s=await sync({store,api,npsso:'a'.repeat(64),now});assert.equal(s.status,'connected');assert.equal(s.records.length,2);assert.equal(calls,2);assert.equal(s.records[0].minutes,180);
 assert(!/secret|fingerprint|Token/.test(JSON.stringify(publicSnapshot(s))));
 await sync({store,api,npsso:'a'.repeat(64),now:now+60000});assert.equal(calls,2,'One-hour cache');
 await sync({store,api,npsso:'a'.repeat(64),now:now+3600001});assert.equal(refreshes,1);assert.equal((await store.get('credentials')).refreshToken,'rotated-secret');
 api.getUserPlayedGames=async()=>{throw Error('Sony outage secret-access');};
 s=await sync({store,api,npsso:'a'.repeat(64),now:now+7200002});assert.equal(s.status,'temporarily_unavailable');assert.equal(s.records.length,2);assert(!JSON.stringify(publicSnapshot(s)).includes('secret-access'));
 api.exchangeRefreshTokenForAuthTokens=async()=>{throw Error('invalid_grant secret-refresh');};
 s=await sync({store,api,npsso:'a'.repeat(64),now:now+10800003});assert.equal(s.status,'reconnect_required');assert.equal(s.records.length,2);
 const merged=G.overlay([{name:'Control',platform:'PS4',minutes:2940},{name:'Control',platform:'PS5',minutes:1320,lastPlayed:'2026-08-30',cover:'art'}],[{name:'Control',platform:'PS5',minutes:1500,lastPlayed:'2026-10-11',cover:null,source:'psn'}]);
 assert.equal(merged[1].lastPlayed,'2026-10-11');assert.equal(merged[1].cover,'art');assert.equal(G.merge([],merged)[0].history.minutes,4440,'PS4 hours preserved, PS5 hours replaced not doubled');
 const empty=new Store();assert.equal((await sync({store:empty,api,now})).status,'not_connected');
 await empty.setJSON('lock',{until:now+1000});assert.equal((await sync({store:empty,api,npsso:'a'.repeat(64),now})).status,'not_connected','Concurrent reader cannot rotate credentials');
 console.log('PSN pagination, cache, automatic rotation, sanitized failures, saved history and platform overlay passed');
})().catch(e=>{console.error(e);process.exitCode=1});
