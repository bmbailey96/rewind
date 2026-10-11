const {connectLambda,getStore}=require('@netlify/blobs');
const {sync}=require('../../lib/psn-sync.cjs');
exports.handler=async event=>{
 connectLambda(event);
 await sync({store:getStore({name:'rewind-playstation-private',consistency:'strong'}),api:require('psn-api'),npsso:process.env.PSN_NPSSO});
 return {statusCode:200};
};
