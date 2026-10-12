import {getStore} from '@netlify/blobs';
import news from '../../lib/movie-news.cjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),snapshot=require('../../movie-news-snapshot.json');
export default async request=>{
 if(request.method!=='GET')return new Response(null,{status:405,headers:{Allow:'GET'}});
 let store,feed;try{store=getStore({name:'movie-news',consistency:'strong'});feed=await store.get('feed',{type:'json'});}catch{}
 feed=feed||snapshot;
 if(feed.schema!==2||Date.now()-(feed.attemptedAt||0)>3*3600000){try{feed=await news.refresh(feed);if(store)await store.setJSON('feed',feed);}catch{feed={...feed,stale:true};}}
 return Response.json(feed,{headers:{'Cache-Control':'public, max-age=300'}});
};
