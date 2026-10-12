import {getStore} from '@netlify/blobs';
import * as psn from 'psn-api';
import helpers from '../../lib/psn-sync.cjs';
export default async request=>{
 const headers={'content-type':'application/json','cache-control':'no-store'};
 if(request.method!=='GET')return new Response(JSON.stringify({error:'Read-only endpoint'}),{status:405,headers});
 try{
  const store=getStore({name:'rewind-playstation-private',consistency:'strong'});
  const snapshot=await helpers.sync({store,api:psn,npsso:process.env.PSN_NPSSO});
  return new Response(JSON.stringify(helpers.publicSnapshot(snapshot)),{status:200,headers});
 }catch(error){
  const code=['MissingBlobsEnvironmentError','BlobsConsistencyError'].includes(error.name)?'storage_configuration':'storage_unavailable';
  return new Response(JSON.stringify({error:'PlayStation storage is unavailable. Your imported game shelf remains available.',code}),{status:503,headers});
 }
};
