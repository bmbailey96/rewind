import {getStore} from '@netlify/blobs';
import * as psn from 'psn-api';
import helpers from '../../lib/psn-sync.cjs';
export default async()=>{
 await helpers.sync({store:getStore({name:'rewind-playstation-private',consistency:'strong'}),api:psn,npsso:process.env.PSN_NPSSO});
 return new Response(null,{status:204});
};
