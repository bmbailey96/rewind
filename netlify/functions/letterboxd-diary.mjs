import {getStore} from '@netlify/blobs';
import diary from '../../lib/letterboxd-diary.cjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),snapshot=require('../../letterboxd-diary-snapshot.json');
export default async request=>{if(request.method!=='GET')return new Response(null,{status:405,headers:{Allow:'GET'}});let store,feed;try{store=getStore({name:'letterboxd-diary',consistency:'strong'});feed=await store.get('feed',{type:'json'});}catch{}feed=feed||snapshot;if(Date.now()-(feed.attemptedAt||0)>1800000){feed=await diary.refresh(feed);if(store)await store.setJSON('feed',feed);}return Response.json(feed,{headers:{'Cache-Control':'public,max-age=300'}});};
