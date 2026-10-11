const fs=require('fs'),assert=require('assert'),vm=require('vm');
const arena=fs.readFileSync(__dirname+'/../music/arena/index.html','utf8');
const start=arena.indexOf('// ─── Keyboard shortcuts'),end=arena.indexOf('// ───',start+30);
const handler=arena.slice(start,end<0?arena.indexOf('window.addEventListener',start):end);
let callback,votes=0,skips=0,visible=true,popup=false,interactive=false;
const context={document:{addEventListener:(name,fn)=>{callback=fn}},popupEl:{get offsetParent(){return popup?{}:null}},matchArea:{getClientRects:()=>visible?[{}]:[]},lastRenderedPair:[{id:1},{id:2}],applyWeightedMatch:()=>votes++,renderEverything:()=>{},buildNextMatchup:()=>skips++};
vm.runInNewContext(handler,context);
const press=key=>callback({key,target:{closest:()=>interactive?{}:null},preventDefault(){}});
press('ArrowLeft');assert.equal(votes,1,'Visible matchup accepts a vote');skips=0;
visible=false;press('ArrowRight');press(' ');assert.equal(votes,1,'Other views cannot vote');assert.equal(skips,0);
visible=true;popup=true;press('ArrowRight');assert.equal(votes,1,'Album popup cannot cast a vote');
popup=false;interactive=true;press(' ');assert.equal(skips,0,'Space activates focused controls without skipping');
interactive=false;press(' ');assert.equal(skips,1);
for(const file of ['music/index.html','music/arena/index.html','games/index.html']){const html=fs.readFileSync(__dirname+'/../'+file,'utf8');for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){if(m[1].trim())new vm.Script(m[1],{filename:file});}}
console.log('Interaction audit: Arena keyboard scope, popup/control exclusions, and inline script syntax passed');
