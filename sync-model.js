(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SyncModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),key=x=>x&&typeof x==='object'?String(x.id??x.key??JSON.stringify(x))+(x.at?':'+x.at:''):String(x);
 function merge(base,local,remote){
  if(equal(local,base))return remote;
  if(equal(remote,base)||equal(local,remote))return local;
  if(Array.isArray(local)&&Array.isArray(remote)){const b=new Map((Array.isArray(base)?base:[]).map(x=>[key(x),x])),l=new Map(local.map(x=>[key(x),x])),r=new Map(remote.map(x=>[key(x),x]));return [...new Set([...l.keys(),...r.keys(),...b.keys()])].flatMap(k=>{const value=merge(b.get(k),l.get(k),r.get(k));return value===undefined?[]:[value];});}
  if(local&&remote&&typeof local==='object'&&typeof remote==='object'&&!Array.isArray(local)&&!Array.isArray(remote)){const out={};for(const k of new Set([...Object.keys(local),...Object.keys(remote)])){const v=merge(base?.[k],local[k],remote[k]);if(v!==undefined)out[k]=v;}return out;}
  if(base===undefined)return remote===undefined?local:remote;
  return local;
 }
 return {merge};
});
