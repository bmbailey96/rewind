import {getStore} from '@netlify/blobs';
import roxy from '../../lib/roxy-cinema.cjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),snapshot=require('../../roxy-snapshot.json');
const pending=new Map();
export default async request=>{
 if(request.method!=='GET')return new Response(null,{status:405,headers:{Allow:'GET'}});
 const url=new URL(request.url),week=url.searchParams.get('week')||new Date().toLocaleDateString('en-CA',{timeZone:'America/Denver'});
 if(!/^\d{4}-\d{2}-\d{2}$/.test(week)||!Number.isFinite(Date.parse(week+'T12:00:00Z'))||Math.abs(Date.parse(week)-Date.now())>370*86400000)return new Response('Invalid week',{status:400});
 let store,feed;try{store=getStore('roxy-cinema');feed=await store.get(week,{type:'json'});}catch{}
 if(!feed||Date.now()-feed.checkedAt>15*60000||url.searchParams.has('refresh')){
  try{if(!pending.has(week))pending.set(week,roxy.refresh(week).finally(()=>pending.delete(week)));feed=await pending.get(week);if(store)try{await store.setJSON(week,feed);}catch{}}catch{feed={...(feed||snapshot),stale:true};}
 }
 if(Date.now()-(feed.checkedAt||0)>36*3600000)feed={...feed,items:[],stale:true};
 return Response.json(feed,{headers:{'Cache-Control':url.searchParams.has('refresh')?'no-store':'public, max-age=300'}});
};
