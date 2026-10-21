import {getStore} from '@netlify/blobs';
import calendar from '../../lib/release-calendar.cjs';
export default async()=>{const store=getStore({name:'rewind-release-calendar-private',consistency:'strong'}),version=await store.getWithMetadata('owner',{type:'json'}),owner=version?.data;if(owner?.enabled)await store.setJSON('owner',await calendar.refresh(owner),{onlyIfMatch:version.etag});};
export const config={schedule:'11 * * * *'};
