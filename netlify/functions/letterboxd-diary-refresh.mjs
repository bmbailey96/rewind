import {getStore} from '@netlify/blobs';
import diary from '../../lib/letterboxd-diary.cjs';
import {createRequire} from 'node:module';
const snapshot=createRequire(import.meta.url)('../../letterboxd-diary-snapshot.json');
export default async()=>{const store=getStore({name:'letterboxd-diary',consistency:'strong'}),previous=await store.get('feed',{type:'json'})||snapshot;await store.setJSON('feed',await diary.refresh(previous));};
export const config={schedule:'53 */3 * * *'};
