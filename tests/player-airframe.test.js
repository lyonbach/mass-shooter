import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../renderer.js';

function context(){
  const calls=[],stack=[];
  let matrix=[1,0,0,1,0,0];
  const multiply=b=>{
    const a=matrix;
    matrix=[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
  };
  const c=new Proxy({calls,stack,globalAlpha:1,fillStyle:'',strokeStyle:'',
    save(){stack.push({matrix:[...matrix],alpha:c.globalAlpha});},
    restore(){const state=stack.pop();assert.ok(state);matrix=state.matrix;c.globalAlpha=state.alpha;},
    translate(x,y){multiply([1,0,0,1,x,y]);},
    rotate(a){multiply([Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0]);},
    scale(x,y){multiply([x,0,0,y,0,0]);},
    fillRect(...args){calls.push({name:'fillRect',args,matrix:[...matrix],style:c.fillStyle});},
    drawImage(...args){calls.push({name:'drawImage',args,matrix:[...matrix],alpha:c.globalAlpha});},
    stroke(){calls.push({name:'stroke',style:c.strokeStyle});},
    createRadialGradient(){return {addColorStop(){}};}
  },{get(target,key){return key in target?target[key]:(...args)=>calls.push({name:key,args,style:target.fillStyle});}});
  return c;
}
function document(){
  const canvases=[];
  return {canvases,createElement(){const canvas={getContext:()=>context()};canvases.push(canvas);return canvas;}};
}
const point=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
function near(actual,expected){assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);}

test('gun barrel and muzzle preserve 5678270 firing-axis transform through bank, pitch and headings',()=>{
  const doc=document(),renderer=new Renderer({getContext:()=>context(),ownerDocument:doc},{effects:true});
  for(const angle of [0,.9,-2.1])for(const cannonAngle of [-2.4,.5,2.2])for(const bank of [-.3,0,.3]){
    const c=context(),p={x:170,y:80,angle,cannonAngle,bank,pitch:.2,muzzle:.04,muzzleSmoke:.1};
    const before=structuredClone(p);
    renderer.helicopter(c,p,.7);
    const tip=c.calls.find(call=>call.name==='fillRect'&&call.style==='#e0e5b9');
    const flash=c.calls.find(call=>call.name==='drawImage'&&call.args[0]===renderer.playerFlash);
    assert.ok(tip&&flash);
    for(const matrix of [tip.matrix,flash.matrix]){
      const [x,y]=point(matrix,42,0);
      near(x,p.x+41*Math.cos(cannonAngle));
      near(y,p.y+41*Math.sin(cannonAngle));
    }
    assert.deepEqual(flash.matrix,tip.matrix);
    assert.deepEqual(p,before);assert.equal(c.stack.length,0);
  }
});

test('engine exhaust responds to speed and hot barrels retain warmth and smoke',()=>{
  const doc=document(),renderer=new Renderer({getContext:()=>context(),ownerDocument:doc},{effects:true});
  const p={x:10,y:20,angle:0,cannonAngle:0,vx:0,vy:0,heat:0};
  const idle=context(),moving=context(),hot=context();
  renderer.helicopter(idle,p,1);
  renderer.helicopter(moving,{...p,vx:270},1);
  renderer.helicopter(hot,{...p,heat:.8},1);
  const exhaust=c=>c.calls.filter(call=>call.name==='drawImage');
  assert.equal(exhaust(idle).length,2);assert.equal(exhaust(moving).length,2);
  assert.ok(exhaust(moving)[0].args[3]>exhaust(idle)[0].args[3]);
  assert.ok(exhaust(moving)[0].alpha>exhaust(idle)[0].alpha);
  assert.equal(exhaust(hot).length,3);
  assert.ok(hot.calls.some(call=>call.name==='fillRect'&&call.style==='#e78955'));
  assert.equal(idle.calls.some(call=>call.name==='fillRect'&&call.style==='#e78955'),false);
  assert.equal(hot.calls.filter(call=>call.name==='stroke'&&call.style==='#dce8ca55').length,1);
  assert.equal(hot.stack.length,0);
});

test('exhaust uses bounded cache, avoids gameplay randomness, and respects effects and motion settings',()=>{
  const doc=document(),renderer=new Renderer({getContext:()=>context(),ownerDocument:doc},{effects:true});
  const p={x:10,y:20,angle:1,bank:.2,pitch:-.1};
  const random=Math.random;Math.random=()=>{throw Error('renderer used gameplay RNG');};
  try{
    for(let i=0;i<20;i++)renderer.helicopter(context(),p,i*.1);
    assert.equal(doc.canvases.length,2);
    const ghost=context();renderer.helicopter(ghost,p,0,true);
    assert.equal(ghost.calls.filter(call=>call.name==='drawImage').length,0);
    assert.equal(ghost.stack.length,0);
    renderer.settings.effects=false;
    const low=context();renderer.helicopter(low,p,0);
    assert.equal(low.calls.filter(call=>call.name==='drawImage').length,0);
    assert.equal(low.calls.filter(call=>call.name==='stroke'&&call.style==='#e2bc8944').length,0);
    renderer.settings.effects=true;
    const old=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:true});
    try{
      const a=context(),b=context();renderer.helicopter(a,p,0);renderer.helicopter(b,p,3);
      assert.deepEqual(a.calls,b.calls);assert.equal(a.calls.filter(call=>call.name==='drawImage').length,0);
      assert.equal(a.stack.length,0);
    }finally{if(old===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=old;}
    const noDocument=new Renderer({getContext:()=>context()},{effects:true}),fallback=context();
    noDocument.helicopter(fallback,{...p,muzzle:.04,muzzleSmoke:.1},0);
    assert.equal(fallback.stack.length,0);
  }finally{Math.random=random;}
});
