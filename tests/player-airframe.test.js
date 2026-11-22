import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../renderer.js';
import { ENEMIES } from '../core.js';

const linearGradient={addColorStop(){}};
function context(){
  const calls=[],stack=[];
  let matrix=[1,0,0,1,0,0],path=[];
  const multiply=b=>{
    const a=matrix;
    matrix=[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
  };
  const c=new Proxy({calls,stack,globalAlpha:1,fillStyle:'',strokeStyle:'',
    save(){stack.push({matrix:[...matrix],alpha:c.globalAlpha,fillStyle:c.fillStyle,strokeStyle:c.strokeStyle,lineWidth:c.lineWidth,lineJoin:c.lineJoin});},
    restore(){const state=stack.pop();assert.ok(state);matrix=state.matrix;c.globalAlpha=state.alpha;c.fillStyle=state.fillStyle;c.strokeStyle=state.strokeStyle;c.lineWidth=state.lineWidth;c.lineJoin=state.lineJoin;},
    translate(x,y){multiply([1,0,0,1,x,y]);},
    rotate(a){multiply([Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0]);},
    scale(x,y){multiply([x,0,0,y,0,0]);},
    beginPath(){path=[];},
    moveTo(...args){path.push(args);},
    lineTo(...args){path.push(args);},
    closePath(){},
    fill(){calls.push({name:'fill',path:[...path],matrix:[...matrix],style:c.fillStyle});},
    ellipse(...args){calls.push({name:'ellipse',args,matrix:[...matrix],style:c.fillStyle});},
    fillRect(...args){calls.push({name:'fillRect',args,matrix:[...matrix],style:c.fillStyle});},
    drawImage(...args){calls.push({name:'drawImage',args,matrix:[...matrix],alpha:c.globalAlpha});},
    stroke(){calls.push({name:'stroke',style:c.strokeStyle});},
    createRadialGradient(){return {addColorStop(){}};},
    createLinearGradient(){calls.push({name:'createLinearGradient'});return linearGradient;}
  },{get(target,key){return key in target?target[key]:(...args)=>calls.push({name:key,args,style:target.fillStyle});}});
  return c;
}
function document(){
  const canvases=[],stops=[];
  return {canvases,stops,createElement(){
    const c=context();c.createRadialGradient=()=>({addColorStop:(...args)=>stops.push(args)});
    const canvas={getContext:()=>c};canvases.push(canvas);return canvas;
  }};
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
  assert.equal(hot.calls.filter(call=>call.name==='stroke'&&call.style==='#dce8ca38').length,1);
  assert.equal(hot.stack.length,0);
});

test('engine plumes have visible bounded opacity and extend behind the outlets before the hull',()=>{
  const doc=document(),renderer=new Renderer({getContext:()=>context(),ownerDocument:doc},{effects:true});
  for(const [speed,alpha] of [[0,.8],[270,.9]]){
    const c=context(),p={x:0,y:0,angle:0,vx:speed,vy:0},before=structuredClone(p);
    c.globalAlpha=.8;
    renderer.helicopter(c,p,.35);
    const plumes=c.calls.filter(call=>call.name==='drawImage');
    assert.equal(plumes.length,2);
    for(const plume of plumes){
      near(plume.alpha,alpha*.8);
      const [,x,y,w,h]=plume.args;
      const [left]=point(plume.matrix,x,y),[right]=point(plume.matrix,x+w,y+h);
      assert.ok(left < -48 && left > -53);
      assert.ok(right > -27 && right < -23);
      assert.ok(h*plume.matrix[3] < 12);
      assert.ok(c.calls.indexOf(plume)<c.calls.findIndex(call=>call.name==='fill'&&call.style==='#728471'));
    }
    assert.deepEqual(p,before);assert.equal(c.globalAlpha,.8);assert.equal(c.stack.length,0);
  }
  assert.deepEqual(doc.stops.slice(0,3),[[0,'#c8c9bde6'],[.45,'#a8aa9dc0'],[1,'#878c8000']]);
  assert.equal(doc.canvases.length,2);
});

test('hull outline is unchanged with continuous glazing and paired engine covers',()=>{
  const c=context(),renderer=new Renderer({getContext:()=>c},{effects:false});
  const p={x:0,y:0,angle:0};
  renderer.helicopter(c,p,.35);renderer.helicopter(c,p,.4);
  const fills=c.calls.filter(call=>call.name==='fill');
  const hull=fills.find(call=>call.style==='#8b9a78');
  assert.deepEqual(hull.path,[[-25,-9],[-17,-15],[12,-14],[30,-7],[35,0],[28,9],[11,14],[-18,13],[-26,6]]);
  const glass=fills.filter(call=>call.style==='#263e35');
  assert.equal(glass.length,2);
  assert.deepEqual(glass[0].path,[[9,-10],[23,-8],[30,-4],[33,0],[30,4],[23,8],[9,10],[10,0]]);
  const covers=fills.filter(call=>call.style==='#526b56');
  assert.equal(covers.length,4);
  assert.deepEqual(covers[0].path,[[-26,7],[-22,14],[-8,16],[1,12],[1,9],[-5,7]]);
  assert.deepEqual(covers[0].matrix,[1,0,0,-1,0,0]);
  assert.deepEqual(covers[1].matrix,[1,0,0,1,0,0]);
  assert.equal(c.calls.filter(call=>call.name==='createLinearGradient').length,1);
  assert.equal(c.stack.length,0);
});

test('approved ordinary and tracer round colors remain unchanged',()=>{
  const doc=document(),renderer=new Renderer({getContext:()=>context(),ownerDocument:doc},{effects:true});
  const p={x:10,y:20,vx:3,vy:4,friendly:true,kind:'gun'};
  const ordinary=context(),tracer=context();
  renderer.bullet(ordinary,p);renderer.gunProjectile(tracer,{...p,tracer:true});
  assert.equal(ordinary.calls.find(call=>call.name==='stroke').style,'#f4f1ab');
  assert.equal(tracer.calls.find(call=>call.name==='stroke').style,'#ff7043');
  assert.deepEqual(tracer.calls.find(call=>call.name==='drawImage').args.slice(1),[-23,-3,26,6]);
  assert.equal(ordinary.stack.length,0);assert.equal(tracer.stack.length,0);
});

test('ground vehicle shadows keep a fixed world offset and projection at every heading',()=>{
  const renderer=new Renderer({getContext:()=>context()},{effects:false});
  const random=Math.random;Math.random=()=>{throw Error('renderer used gameplay RNG');};
  try{
    for(const type of ['tank','artillery','aa','rocketSemi','boss'])for(const angle of [0,Math.PI/2,-2.1]){
      const e={x:170,y:80,angle,turret:angle,type,health:1,maxHealth:1},before=structuredClone(e),c=context();
      renderer.enemy(c,e,.4);
      const shadow=c.calls.filter(call=>call.name==='fillRect'&&call.style==='#14231655');
      assert.equal(shadow.length,1);
      const m=shadow[0].matrix,s=ENEMIES[type].scale;
      near(m[4],173);near(m[5],84);
      near(m[0],s*Math.cos(angle));near(m[1],s*.9*Math.sin(angle));
      near(m[2],-s*Math.sin(angle));near(m[3],s*.9*Math.cos(angle));
      assert.deepEqual(e,before);assert.equal(c.stack.length,0);
    }
  }finally{Math.random=random;}
});

test('aircraft shadows keep world projection axes and follow visible helicopter pose without flicker',()=>{
  const renderer=new Renderer({getContext:()=>context()},{effects:false});
  for(const angle of [0,Math.PI/2,-2.1])for(const [bank,pitch] of [[0,0],[.3,.2],[-.3,-.2]]){
    const p={x:170,y:80,angle,bank,pitch},before=structuredClone(p),a=context(),b=context();
    renderer.helicopter(a,p,.4);renderer.helicopter(b,p,1.2);
    const shadow=c=>c.calls.find(call=>call.name==='fill'&&call.style==='#0b170c30');
    const m=shadow(a).matrix,theta=angle+bank*.45,sx=1-Math.abs(pitch)*.3,sy=1-Math.abs(bank)*.5;
    near(m[4],183+1.12*(Math.cos(angle)*pitch*30-Math.sin(angle)*bank*30));
    near(m[5],99+.72*(Math.sin(angle)*pitch*30+Math.cos(angle)*bank*30));
    near(m[0],1.12*Math.cos(theta)*sx);near(m[1],.72*Math.sin(theta)*sx);
    near(m[2],-1.12*Math.sin(theta)*sy);near(m[3],.72*Math.cos(theta)*sy);
    assert.deepEqual(shadow(a),shadow(b));assert.deepEqual(p,before);
    assert.equal(a.stack.length,0);assert.equal(b.stack.length,0);
  }
  for(const type of ['drone','kamikaze'])for(const angle of [0,Math.PI/2,-2.1]){
    const e={x:170,y:80,angle,visualHeading:angle,type,health:1,maxHealth:1},before=structuredClone(e),c=context();
    renderer.enemy(c,e,.4);
    const shadow=c.calls.find(call=>call.name==='ellipse'&&call.style==='#10231638'),m=shadow.matrix,s=ENEMIES[type].scale;
    near(m[4],175);near(m[5],88);
    near(m[0],s*Math.cos(angle));near(m[1],s*.8*Math.sin(angle));
    near(m[2],-s*Math.sin(angle));near(m[3],s*.8*Math.cos(angle));
    assert.deepEqual(e,before);assert.equal(c.stack.length,0);
  }
});

test('shadow rendering preserves canvas state and suppresses cosmetic pose in reduced motion',()=>{
  const renderer=new Renderer({getContext:()=>context()},{effects:false}),old=globalThis.matchMedia;
  const p={x:170,y:80,angle:.9,bank:.3,pitch:.2},a=context(),b=context();
  a.fillStyle='initial fill';a.strokeStyle='initial stroke';a.lineWidth=7;a.lineJoin='bevel';a.globalAlpha=.6;
  globalThis.matchMedia=()=>({matches:true});
  try{
    renderer.helicopter(a,p,.4);renderer.helicopter(b,{...p,bank:0,pitch:0},2);
    const shadow=c=>c.calls.find(call=>call.name==='fill'&&call.style==='#0b170c30');
    assert.deepEqual(shadow(a),shadow(b));
    assert.equal(a.fillStyle,'initial fill');assert.equal(a.strokeStyle,'initial stroke');
    assert.equal(a.lineWidth,7);assert.equal(a.lineJoin,'bevel');assert.equal(a.globalAlpha,.6);
    const ghost=context();renderer.helicopter(ghost,p,.4,true);
    assert.equal(shadow(ghost),undefined);assert.equal(ghost.stack.length,0);
    assert.equal(a.stack.length,0);assert.equal(b.stack.length,0);
  }finally{if(old===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=old;}
});

test('exhaust remains attached to both outlets through hull headings and banks',()=>{
  const doc=document(),renderer=new Renderer({getContext:()=>context(),ownerDocument:doc},{effects:true});
  for(const angle of [0,.9,-2.1])for(const bank of [-.3,0,.3])for(const pitch of [-.2,.2]){
    const c=context(),p={x:170,y:80,angle,bank,pitch,vx:270,vy:0};
    renderer.helicopter(c,p,.7);
    const plumes=c.calls.filter(call=>call.name==='drawImage');
    assert.equal(plumes.length,2);
    for(const [i,side] of [-1,1].entries()){
      const localX=pitch*30+Math.cos(bank*.45)*(-27*(1-Math.abs(pitch)*.3))-Math.sin(bank*.45)*(side*10*(1-Math.abs(bank)*.5));
      const localY=bank*30+Math.sin(bank*.45)*(-27*(1-Math.abs(pitch)*.3))+Math.cos(bank*.45)*(side*10*(1-Math.abs(bank)*.5));
      const [x,y]=point(plumes[i].matrix,0,0);
      near(x,p.x+Math.cos(angle)*localX-Math.sin(angle)*localY);
      near(y,p.y+Math.sin(angle)*localX+Math.cos(angle)*localY);
    }
    assert.equal(c.stack.length,0);
  }
});

test('gameplay draw invokes both engine plumes without mutating state or consuming RNG',()=>{
  const c=context(),doc=document(),renderer=new Renderer({getContext:()=>c,ownerDocument:doc},{effects:true,shake:false});
  renderer.scale=1;renderer.terrain={};
  const g={world:{width:800,height:600},camera:{x:0,y:0,zoom:1},visualTime:.7,state:'playing',touch:true,
    player:{x:170,y:80,angle:.9,bank:.3,pitch:.2,vx:120,vy:40,health:100},
    decals:[],pickups:[],particles:[],enemies:[],bullets:[],explosions:[],floaters:[]};
  const before=structuredClone(g),random=Math.random;Math.random=()=>{throw Error('renderer used gameplay RNG');};
  try{
    renderer.draw(g,.016);
    const plumes=c.calls.filter(call=>call.name==='drawImage'&&[...renderer.smokePuffs.values()].includes(call.args[0]));
    assert.equal(plumes.length,2);
    assert.deepEqual(g,before);
    assert.equal(c.stack.length,0);
    assert.equal(doc.canvases.length,2);
  }finally{Math.random=random;}
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
