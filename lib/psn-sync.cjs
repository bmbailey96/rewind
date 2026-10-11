const {createHash,randomUUID}=require('node:crypto');
function durationMinutes(value){const m=String(value||'').match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);return m?Math.round((Number(m[1]||0)*86400+Number(m[2]||0)*3600+Number(m[3]||0)*60+Number(m[4]||0))/60):null;}
function normalizeTitles(titles){return titles.filter(x=>x.name).map(x=>({name:x.name,platform:x.category==='ps5_native_game'?'PS5':x.category==='ps4_game'?'PS4':x.category||'unknown',minutes:durationMinutes(x.playDuration),playtimeText:x.playDuration?`${durationMinutes(x.playDuration)} minutes`:'Not supplied by Sony',lastPlayed:x.lastPlayedDateTime||null,firstPlayed:x.firstPlayedDateTime||null,cover:x.imageUrl||null,source:'psn',titleId:x.titleId||null}));}
function publicSnapshot(s){return {records:s.records||[],syncedAt:s.syncedAt||null,checkedAt:s.checkedAt||null,status:s.status||'not_connected',message:s.message||null};}
async function sync({store,api,npsso,now=Date.now()}){
 let snapshot=await store.get('snapshot',{type:'json'})||{status:'not_connected',records:[]};
 let tokens=await store.get('credentials',{type:'json'});
 const fingerprint=npsso?createHash('sha256').update(npsso).digest('hex'):null;
 if(!tokens&&!npsso)return snapshot;
 const changed=fingerprint&&tokens?.fingerprint!==fingerprint;
 if(!changed&&snapshot.checkedAt&&now-Date.parse(snapshot.checkedAt)<3600000)return snapshot;
 const existing=await store.getWithMetadata('lock',{type:'json'});
 if(existing?.data?.until>now)return snapshot;
 const id=randomUUID(),lock=await store.setJSON('lock',{id,until:now+120000},existing?{onlyIfMatch:existing.etag}:{onlyIfNew:true});
 if(!lock.modified)return snapshot;
 try{
  if(changed||!tokens){
   if(!/^[A-Za-z0-9_-]{64}$/.test(npsso||''))throw Object.assign(Error('Invalid Sony session token'),{authRequired:true});
   const code=await api.exchangeNpssoForAccessCode(npsso);
   const auth=await api.exchangeAccessCodeForAuthTokens(code);
   tokens={...auth,fingerprint,expiresAt:now+Number(auth.expiresIn)*1000};
   await store.setJSON('credentials',tokens);
  }else if(!tokens.expiresAt||tokens.expiresAt<now+300000){
   const auth=await api.exchangeRefreshTokenForAuthTokens(tokens.refreshToken);
   tokens={...tokens,...auth,expiresAt:now+Number(auth.expiresIn)*1000};
   // Persist rotation before fetching titles, even if the title request fails.
   await store.setJSON('credentials',tokens);
  }
  const titles=[];let offset=0;
  for(let page=0;page<20;page++){
   const result=await api.getUserPlayedGames({accessToken:tokens.accessToken},'me',{limit:200,offset});
   if(!Array.isArray(result.titles))throw Error('Sony returned no title list');
   titles.push(...result.titles);
   if(!result.titles.length||titles.length>=result.totalItemCount||result.nextOffset==null||result.nextOffset<=offset)break;
   offset=result.nextOffset;
   if(page===19)throw Error('Incomplete title pagination');
  }
  snapshot={status:'connected',records:normalizeTitles(titles),syncedAt:new Date(now).toISOString(),checkedAt:new Date(now).toISOString(),message:null};
 }catch(error){
  // Do not expose upstream messages, which may include credential material.
  const authRequired=error.authRequired||/invalid_grant|invalid.*token|expired.*token|unauthorized|401|npsso/i.test(String(error.message));
  snapshot={...snapshot,status:authRequired?'reconnect_required':'temporarily_unavailable',checkedAt:new Date(now).toISOString(),message:authRequired?'Sony needs a fresh authorization. Your last successful game history remains available.':'Sony could not be checked. Your last successful game history remains available.'};
 }
 try{await store.setJSON('snapshot',snapshot);}finally{const current=await store.get('lock',{type:'json'});if(current?.id===id)await store.delete('lock');}
 return snapshot;
}
module.exports={durationMinutes,normalizeTitles,publicSnapshot,sync};
