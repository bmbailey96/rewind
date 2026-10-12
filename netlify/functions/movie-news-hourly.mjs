import {getStore} from '@netlify/blobs';
import news from '../../lib/movie-news.cjs';
export default async()=>{const store=getStore({name:'movie-news',consistency:'strong'}),previous=await store.get('feed',{type:'json'})||{};await store.setJSON('feed',await news.refresh(previous));};
export const config={schedule:'37 */3 * * *'};
