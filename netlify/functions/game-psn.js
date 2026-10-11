const {connectLambda,getStore}=require('@netlify/blobs');
const {publicSnapshot,sync}=require('../../lib/psn-sync.cjs');
exports.handler=async event=>{
 const headers={'content-type':'application/json','cache-control':'no-store'};
 if(event.httpMethod&&event.httpMethod!=='GET')return {statusCode:405,headers,body:JSON.stringify({error:'Read-only endpoint'})};
 try{
  connectLambda(event);
  const store=getStore({name:'rewind-playstation-private',consistency:'strong'});
  const snapshot=await sync({store,api:require('psn-api'),npsso:process.env.PSN_NPSSO});
  return {statusCode:200,headers,body:JSON.stringify(publicSnapshot(snapshot))};
 }catch(_){return {statusCode:503,headers,body:JSON.stringify({error:'PlayStation storage is unavailable. Your imported game shelf remains available.'})};}
};
