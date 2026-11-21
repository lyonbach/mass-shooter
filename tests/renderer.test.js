import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, wreckFireState } from '../renderer.js';
import { ENEMIES } from '../core.js';
import { DEFAULTS, makeScene } from '../visual-review.js';

const linearGradient={addColorStop(){}};
function context() {
  const calls=[];
  const c=new Proxy({calls,fillStyle:'',globalAlpha:1,createRadialGradient:(...args)=>{calls.push({name:'createRadialGradient',args});return {addColorStop(){}};},createLinearGradient:()=>linearGradient},{
    get(target,key) {
      if(key in target)return target[key];
      return (...args)=>calls.push({name:key,args,fillStyle:target.fillStyle,strokeStyle:target.strokeStyle,lineWidth:target.lineWidth,lineCap:target.lineCap,alpha:target.globalAlpha});
    }
  });
  return c;
}
function canvasDocument(){
  const created=[],stops=[];
  return {created,stops,createElement:()=>{const pc=context();pc.createRadialGradient=(...args)=>{pc.calls.push({name:'createRadialGradient',args});return{addColorStop:(...stop)=>stops.push(stop)};};const canvas={getContext:()=>pc,pc};created.push(canvas);return canvas;}};
}

test('ordinary bullets retain base stroke geometry, color and width; tracers use a cached gradient',()=>{
  const document=canvasDocument(),c=context(),renderer=new Renderer({getContext:()=>c,ownerDocument:document},{effects:true});
  for(const [vx,vy] of [[0,-5],[3,4],[-5,0],[0,0]]){
    const b={x:10,y:20,vx,vy,friendly:true,kind:'gun',tracer:false},round=context(),sp=Math.hypot(vx,vy)||1;
    renderer.bullet(round,b);
    assert.deepEqual(round.calls.map(call=>call.name),['beginPath','moveTo','lineTo','stroke']);
    assert.deepEqual(round.calls[1].args,[10-vx/sp*20,20-vy/sp*20]);
    assert.deepEqual(round.calls[2].args,[10,20]);
    assert.equal(round.calls[3].strokeStyle,'#f4f1ab');assert.equal(round.calls[3].lineWidth,2);assert.equal(round.calls[3].lineCap,'round');
  }
  const tracer={x:10,y:20,vx:0,vy:-5,tracer:true};
  for(let i=0;i<20;i++)renderer.gunProjectile(c,tracer);
  assert.equal(c.calls.find(call=>call.name==='rotate').args[0],-Math.PI/2);
  assert.equal(document.created.length,1);
  assert.equal(c.calls.filter(call=>call.name==='drawImage').length,20);
  assert.equal(c.calls.filter(call=>call.name==='save').length,c.calls.filter(call=>call.name==='restore').length);
  assert.deepEqual(tracer,{x:10,y:20,vx:0,vy:-5,tracer:true});
});

test('draw dispatches only tracer gun rounds to the special renderer',()=>{
  const c=context(),renderer=new Renderer({getContext:()=>c,ownerDocument:canvasDocument()},{effects:false,shake:false});
  renderer.scale=1;renderer.terrain={};renderer.helicopter=()=>{};
  const ordinary=[],tracers=[];
  renderer.bullet=(ctx,b)=>ordinary.push(b);renderer.gunProjectile=(ctx,b)=>tracers.push(b);
  const scene=makeScene({...DEFAULTS,round:true});
  scene.bullets.push({...scene.bullets[0],tracer:true},{...scene.bullets[0],friendly:false,tracer:true});
  renderer.draw(scene,0);
  assert.deepEqual(ordinary,[scene.bullets[0],scene.bullets[2]]);
  assert.deepEqual(tracers,[scene.bullets[1]]);
});

test('flare preserves base stroke and circular footprint with one cached gradient',()=>{
  const document=canvasDocument(),c=context(),renderer=new Renderer({getContext:()=>c,ownerDocument:document},{effects:true});
  const p={x:10,y:20,vx:100,vy:-40,life:.5,maxLife:.85,size:5,color:'#ff9b59',flarePhase:1};
  const original={...p},random=Math.random;Math.random=()=>{throw new Error('rendering consumed gameplay randomness');};
  try{for(let i=0;i<30;i++)renderer.flare(c,p);}finally{Math.random=random;}
  assert.deepEqual(p,original);
  assert.equal(document.created.length,1);
  assert.equal(c.calls.filter(call=>call.name==='drawImage').length,30);
  assert.deepEqual(c.calls.find(call=>call.name==='moveTo').args,[10,20]);
  assert.deepEqual(c.calls.find(call=>call.name==='lineTo').args,[7.5,21]);
  const stroke=c.calls.find(call=>call.name==='stroke');
  assert.equal(stroke.strokeStyle,p.color);assert.equal(stroke.lineWidth,p.size);assert.equal(stroke.alpha,p.life/p.maxLife);
  const glow=c.calls.find(call=>call.name==='drawImage');
  assert.deepEqual(glow.args.slice(1),[-7,3,34,34]);assert.equal(glow.alpha,p.life/p.maxLife);
  assert.ok(document.stops.some(([stop,color])=>stop===0&&color.startsWith('#fff')));
  assert.ok(document.stops.some(([stop,color])=>stop===1&&color.endsWith('00')));
  assert.equal(c.calls.filter(call=>call.name==='save').length,c.calls.filter(call=>call.name==='restore').length);
  const low=context();renderer.settings.effects=false;renderer.flare(low,p);
  assert.equal(low.calls.filter(call=>call.name==='drawImage').length,1);
  const expired=context();renderer.flare(expired,{...p,life:0});
  assert.equal(expired.calls.length,0);
});

test('flare lifetime and arbitrary particle counts use bounded texture allocation',()=>{
  const document=canvasDocument(),c=context(),renderer=new Renderer({getContext:()=>c,ownerDocument:document},{effects:true});
  for(let i=0;i<17;i++){
    const p={x:i*3,y:i,vx:i-8,vy:40,life:.85,maxLife:.85,size:5,color:'#ff9b59',flarePhase:i};
    for(const life of [.85,.81,.5,.1,0])renderer.flare(c,{...p,life});
  }
  assert.equal(document.created.length,1);
  assert.equal(c.calls.filter(call=>call.name==='save').length,c.calls.filter(call=>call.name==='restore').length);
  const low=context();renderer.settings.effects=false;
  renderer.flare(low,{x:0,y:0,vx:1,vy:0,life:.5,maxLife:.85,size:5,color:'#ff9b59'});
  assert.equal(low.calls.filter(call=>call.name==='drawImage').length,1);
});

test('player muzzle matches the base oval bounds, timing and soft gradient',()=>{
  const document=canvasDocument(),c=context(),renderer=new Renderer({getContext:()=>c,ownerDocument:document},{effects:true});
  renderer.playerMuzzle(c,{muzzle:.04,muzzleSmoke:.22});
  assert.equal(c.calls.filter(call=>call.name==='drawImage').length,2);
  const flash=renderer.launchFlame;
  assert.deepEqual(flash.pc.calls.find(call=>call.name==='createRadialGradient').args,[32,32,0,32,32,32]);
  assert.deepEqual(c.calls.filter(call=>call.name==='drawImage').at(-1).args.slice(1),[38.4,-9.9,28.8,19.8]);
  assert.ok(document.stops.some(([stop,color])=>stop===0&&color.startsWith('#fff')));
  assert.ok(document.stops.some(([stop,color])=>stop===1&&color.endsWith('00')));
  const firing=context();renderer.playerMuzzle(firing,{muzzle:.001,muzzleSmoke:0});
  assert.equal(firing.calls.filter(call=>call.name==='drawImage').length,2);
  const cooling=context();renderer.playerMuzzle(cooling,{muzzle:0,muzzleSmoke:.1});
  assert.equal(cooling.calls.filter(call=>call.name==='drawImage').length,1);
  const settled=context();renderer.playerMuzzle(settled,{muzzle:0,muzzleSmoke:0});
  assert.equal(settled.calls.length,0);
  assert.equal(document.created.length,2);
});

test('smoke puffs use bounded offscreen gradients and stable variants across transforms',()=>{
    const created=[],document={createElement:()=>{const pc=context(),canvas={getContext:()=>pc,pc};created.push(canvas);return canvas;}};
    const renderer=new Renderer({getContext:()=>context(),ownerDocument:document},{effects:true}),c=context();
    for(const flags of [{screenSmoke:true},{persistent:true},{},{exhaust:true}]){
      for(let variant=0;variant<3;variant++){
        const p={x:10,y:20,size:10,life:1,maxLife:2,smoke:true,smokeVariant:variant,...flags};
        renderer.smoke(c,p);p.x=60;p.y=80;p.size=30;renderer.smoke(c,p);
      }
    }
    assert.equal(created.length,12);
    assert.ok(created.every(canvas=>canvas.width===64&&canvas.height===64&&canvas.pc.calls.filter(call=>call.name==='createRadialGradient').length===1));
    const draws=c.calls.filter(call=>call.name==='drawImage');
    assert.equal(draws.length,24);
    for(let i=0;i<draws.length;i+=2){assert.equal(draws[i].args[0],draws[i+1].args[0]);assert.notDeepEqual(draws[i].args.slice(1),draws[i+1].args.slice(1));}
    const p={x:1,y:2,size:10,life:1,maxLife:2,smoke:true};
    renderer.smoke(c,p);const variant=p.smokeVariant;p.x=999;renderer.smoke(c,p);assert.equal(p.smokeVariant,variant);
    assert.equal(created.length,12);
    assert.equal(c.calls.filter(call=>call.name==='createRadialGradient').length,0);
    assert.equal(c.calls.filter(call=>call.name==='save').length,c.calls.filter(call=>call.name==='restore').length);
  });

test('screen smoke alone has denser white gradients and wider coverage',()=>{
  const gradients=[];
  const document={createElement:()=>{const pc=context();pc.createRadialGradient=()=>{const stops=[];gradients.push(stops);return{addColorStop:(...args)=>stops.push(args)};};return{getContext:()=>pc};}};
  const renderer=new Renderer({getContext:()=>context(),ownerDocument:document},{effects:false}),c=context();
  for(const flags of [{screenSmoke:true},{persistent:true},{},{exhaust:true}]){
    renderer.smoke(c,{x:10,y:20,size:10,life:1,maxLife:2,smokeVariant:0,...flags});
  }
  assert.deepEqual(gradients.map(stops=>stops[0][1]),['#f8f9f4f2','#202820cc','#606858cc','#e4d9bccc']);
  assert.ok(gradients.every(stops=>stops.at(-1)[1].endsWith('00')));
  const widths=c.calls.filter(call=>call.name==='drawImage').map(call=>call.args[3]);
  assert.ok(widths[0]>widths[1]);assert.equal(widths[1],widths[2]);assert.equal(widths[2],widths[3]);
  assert.equal(renderer.smokePuffs.size,4);
});

test('AA muzzle flashes follow the rotating turret and the recoiling barrel tip without state mutation',()=>{
  const renderer=new Renderer({getContext:()=>context()},{effects:false});
  for(const barrel of [0,1]){
    const c=context(),stack=[],points=[];let matrix=[1,0,0,1,0,0],current=[];
    const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
    c.save=()=>stack.push([...matrix]);c.restore=()=>{matrix=stack.pop();};
    c.translate=(x,y)=>{matrix=multiply(matrix,[1,0,0,1,x,y]);};
    c.rotate=a=>{matrix=multiply(matrix,[Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0]);};
    c.scale=(x,y)=>{matrix=multiply(matrix,[x,0,0,y,0,0]);};
    c.beginPath=()=>{current=[];};c.moveTo=(x,y)=>current.push([matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]]);
    c.lineTo=c.moveTo;c.fill=()=>{if(c.fillStyle==='#ffac58')points.push(current[0]);};
    const e={x:100,y:120,angle:.7,turret:1.9,type:'aa',health:2,maxHealth:2,aaMuzzle:{barrel,life:.24}};
    const before=structuredClone(e),random=Math.random;Math.random=()=>{throw Error('renderer consumed RNG');};
    try{renderer.enemy(c,e,0);}finally{Math.random=random;}
    assert.deepEqual(e,before);assert.equal(stack.length,0);assert.equal(points.length,1);
    const y=(barrel?8:-8)-3,s=ENEMIES.aa.scale;
    assert.ok(Math.abs(points[0][0]-(e.x+s*(29*Math.cos(e.turret)-y*Math.sin(e.turret))))<1e-9);
    assert.ok(Math.abs(points[0][1]-(e.y+s*(29*Math.sin(e.turret)+y*Math.cos(e.turret))))<1e-9);
  }
});
test('flak smoke uses its own bounded cached palette',()=>{
  const stops=[],document={createElement:()=>{const pc=context();pc.createRadialGradient=()=>({addColorStop:(...args)=>stops.push(args)});return{getContext:()=>pc};}};
  const renderer=new Renderer({getContext:()=>context(),ownerDocument:document},{effects:true}),c=context();
  for(let i=0;i<30;i++)renderer.smoke(c,{x:1,y:2,size:10,life:1,maxLife:2,flakSmoke:true,smokeVariant:i%3});
  assert.equal(renderer.smokePuffs.size,3);assert.equal(stops[0][1],'#30342fd9');assert.ok(stops[2][1].endsWith('00'));
  assert.equal(c.calls.filter(call=>call.name==='save').length,c.calls.filter(call=>call.name==='restore').length);
});
test('AA recoil returns smoothly and reduced motion suppresses the muzzle flash',()=>{
  const renderer=new Renderer({getContext:()=>context()},{effects:false}),e={x:0,y:0,angle:0,turret:0,type:'aa',health:2,maxHealth:2,aaMuzzle:{barrel:0,life:.24}};
  const positions=[];
  for(const life of [.24,.12,.01]){
    const c=context();renderer.enemy(c,{...e,aaMuzzle:{barrel:0,life}},0);
    positions.push(c.calls.find(call=>call.name==='fillRect'&&call.args[1]===-10&&call.args[2]===27).args[0]);
  }
  assert.ok(positions[0]<positions[1]&&positions[1]<positions[2]&&positions[2]<5);
  const old=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:true});
  try{
    const c=context();renderer.enemy(c,e,0);
    assert.ok(c.calls.some(call=>call.name==='fillRect'&&call.args[0]===5&&call.args[1]===-10&&call.args[2]===27));
    assert.equal(c.calls.some(call=>call.fillStyle==='#ffac58'),false);
  }finally{if(old===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=old;}
});

test('launcher ignition is cached and anchored to the active tube without changing render state',()=>{
  const created=[],document={createElement:()=>{const pc=context(),canvas={getContext:()=>pc,pc};created.push(canvas);return canvas;}};
  const renderer=new Renderer({getContext:()=>context(),ownerDocument:document},{effects:false});
  const e={x:100,y:120,angle:.7,turret:1.9,type:'rocketSemi',health:2,maxHealth:2,launchIgnition:.24};
  const c=context(),stack=[],draws=[];let matrix=[1,0,0,1,0,0];
  const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
  c.save=()=>stack.push([...matrix]);c.restore=()=>{matrix=stack.pop();};
  c.translate=(x,y)=>{matrix=multiply(matrix,[1,0,0,1,x,y]);};
  c.rotate=a=>{matrix=multiply(matrix,[Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0]);};
  c.scale=(x,y)=>{matrix=multiply(matrix,[x,0,0,y,0,0]);};
  c.drawImage=(image,x,y,w,h)=>draws.push({image,matrix:[...matrix],x,y,w,h});
  const before=structuredClone(e),random=Math.random;Math.random=()=>{throw Error('renderer consumed RNG');};
  try{for(let i=0;i<8;i++)renderer.enemy(c,e,0);}finally{Math.random=random;}
  assert.deepEqual(e,before);assert.equal(stack.length,0);assert.equal(created.length,1);assert.equal(draws.length,16);
  const first=draws[0],m=first.matrix;
  assert.ok(Math.abs((m[0]*30+m[4])-(e.x+30*Math.cos(e.turret)))<1e-9);
  assert.ok(Math.abs((m[1]*30+m[5])-(e.y+30*Math.sin(e.turret)))<1e-9);
  assert.equal(first.image,created[0]);assert.equal(created[0].pc.calls.filter(call=>call.name==='createRadialGradient').length,1);
  const old=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:true});
  try{const reduced=context();renderer.enemy(reduced,e,0);assert.equal(reduced.calls.some(call=>call.name==='drawImage'),false);}
  finally{if(old===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=old;}
});

test('launcher wreck retains cab, rack, openings and hull-attached fire positions',()=>{
  const renderer=new Renderer({getContext:()=>context(),ownerDocument:canvasDocument()},{effects:true});
  const wreck={x:50,y:70,angle:.4,turret:1.2,type:'rocketSemi',wreck:true,transition:true,transitionAge:3,age:4,burnTime:12,seed:1};
  const c=context();renderer.wreck(c,wreck);
  assert.ok(c.calls.some(call=>call.name==='fillRect'&&call.fillStyle==='#a1a582'&&call.args.join(',')==='12,-14,22,28'));
  assert.ok(c.calls.some(call=>call.name==='fillRect'&&call.fillStyle==='#484c3e'&&call.args.join(',')==='12,-14,22,28'));
  assert.equal(c.calls.filter(call=>call.name==='ellipse'&&call.args[0]===30&&call.args[2]===1).length,6);
  for(const [x,y] of [[-20,0],[12,-3]]){
    const tx=x*Math.cos(wreck.angle)-y*Math.sin(wreck.angle),ty=x*Math.sin(wreck.angle)+y*Math.cos(wreck.angle);
    assert.ok(c.calls.some(call=>call.name==='translate'&&Math.abs(call.args[0]-tx)<1e-9&&Math.abs(call.args[1]-ty)<1e-9));
  }
  assert.equal(c.calls.filter(call=>call.name==='save').length,c.calls.filter(call=>call.name==='restore').length);
});

test('top-down launcher tires are paired and the rack housing matches its wreck',()=>{
  const renderer=new Renderer({getContext:()=>context(),ownerDocument:canvasDocument()},{effects:false});
  const truck={x:100,y:100,angle:.8,turret:1.6,type:'rocketSemi',health:8,maxHealth:8};
  const live=context(),dead=context();renderer.enemy(live,truck,0);renderer.wreck(dead,{...truck,wreck:true,transition:false,burnTime:0});
  const wheels=c=>c.calls.filter(call=>call.name==='roundRect').map(call=>call.args);
  assert.deepEqual(wheels(live),wheels(dead));assert.equal(wheels(live).length,6);
  assert.deepEqual(wheels(live).map(args=>args.slice(0,2)),[[-32,-16],[-32,13],[-20,-16],[-20,13],[16,-16],[16,13]]);
  assert.ok(live.calls.some(call=>call.name==='fillRect'&&call.args.join(',')==='-23,-11,52,22'));
  assert.equal(live.calls.some(call=>call.name==='ellipse'&&call.args[2]===3.2),false);
  assert.ok(dead.calls.some(call=>call.name==='rotate'&&Math.abs(call.args[0]-.8)<1e-10));
});

test('weapon effects use barrel-tip transforms and recoil smoothly without mutating state',()=>{
  const renderer=new Renderer({getContext:()=>context(),ownerDocument:canvasDocument()},{effects:true});
  for(const [type,tip,recoil,size] of [['tank',32,2.5,10],['artillery',42,5,18],['boss',32,4,17]]){
    const e={x:100,y:120,angle:.7,turret:1.9,type,health:8,maxHealth:8,weaponMuzzle:.22};
    const positions=[];
    for(const life of [.22,.11,.001]){
      const c=context(),original=structuredClone(e);renderer.enemy(c,{...e,weaponMuzzle:life},0);assert.deepEqual(e,original);
      const move=c.calls.find(call=>call.name==='translate'&&call.args[1]===0&&call.args[0]<0);
      positions.push(move.args[0]);
      if(life===.22){
        const flash=c.calls.find(call=>call.name==='drawImage'&&call.args[0]===renderer.launchFlame);
        assert.ok(flash);assert.equal(flash.args[1],tip-size*.2);
      }
    }
    assert.equal(positions[0],-recoil);assert.ok(positions[0]<positions[1]&&positions[1]<positions[2]&&positions[2]<0);
  }
  const drone={x:100,y:120,angle:.5,visualHeading:.5,turret:1.1,type:'drone',health:3,maxHealth:3,weaponMuzzle:.22};
  const firing=context(),idle=context();renderer.enemy(firing,drone,0);renderer.enemy(idle,{...drone,weaponMuzzle:0},0);
  assert.ok(firing.calls.some(call=>call.name==='translate'&&call.args[0]===10.4));
  assert.ok(firing.calls.some(call=>call.name==='rotate'&&Math.abs(call.args[0]-.6)<1e-9));
  assert.ok(firing.calls.some(call=>call.name==='drawImage'&&call.args[0]===renderer.launchFlame));
  assert.equal(idle.calls.some(call=>call.name==='drawImage'&&call.args[0]===renderer.launchFlame),false);
  const old=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:true});
  try{const c=context();renderer.enemy(c,drone,0);assert.equal(c.calls.some(call=>call.name==='drawImage'),false);}
  finally{if(old===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=old;}
});
test('weapon muzzle follows rotated turret and recoiling tip in world coordinates',()=>{
  const renderer=new Renderer({getContext:()=>context(),ownerDocument:canvasDocument()},{effects:false});
  for(const [type,tip,recoil,size] of [['tank',32,2.5,10],['artillery',42,5,18],['boss',32,4,17]]){
    const e={x:100,y:120,angle:.7,turret:1.9,type,health:8,maxHealth:8,weaponMuzzle:.22};
    const c=context(),stack=[],draws=[];let matrix=[1,0,0,1,0,0];
    const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
    c.save=()=>stack.push([...matrix]);c.restore=()=>{matrix=stack.pop();};
    c.translate=(x,y)=>{matrix=multiply(matrix,[1,0,0,1,x,y]);};
    c.rotate=a=>{matrix=multiply(matrix,[Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0]);};
    c.scale=(x,y)=>{matrix=multiply(matrix,[x,0,0,y,0,0]);};
    c.drawImage=(image,x)=>draws.push({image,x,matrix:[...matrix]});
    renderer.enemy(c,e,0);const draw=draws.find(draw=>draw.image===renderer.launchFlame),m=draw.matrix;
    assert.equal(draw.x,tip-size*.2);
    assert.ok(Math.abs(m[0]*tip+m[4]-(e.x+ENEMIES[type].scale*(tip-recoil)*Math.cos(e.turret)))<1e-9);
    assert.ok(Math.abs(m[1]*tip+m[5]-(e.y+ENEMIES[type].scale*(tip-recoil)*Math.sin(e.turret)))<1e-9);
    assert.equal(stack.length,0);
  }
});

test('missile flame starts at ignition and both factions use procedural silhouettes',()=>{
    const renderer=new Renderer({getContext:()=>context()},{effects:true});
    for(const friendly of [true,false]){
      const b={x:20,y:30,vx:0,vy:1,kind:friendly?'rocket':'enemyRocket',friendly,launchDelay:friendly?.3:0};
      const c=context();renderer.missile(c,b);
      assert.ok(c.calls.some(call=>call.name==='rotate'&&call.args[0]===Math.PI/2));
      assert.ok(c.calls.some(call=>call.name==='fill'&&call.fillStyle===(friendly?'#e4dfb2':'#ee9875')));
      assert.equal(c.calls.some(call=>call.name==='fill'&&call.fillStyle==='#fff1aa'),!friendly);
      b.launchDelay=0;const lit=context();renderer.missile(lit,b);
      assert.ok(lit.calls.some(call=>call.name==='fill'&&call.fillStyle==='#fff1aa'));
    }
  });
test('helicopter movement changes the rendered pose',()=>{
  const renderer=new Renderer({getContext:()=>context()},{});
  const stationary=context(),moving=context();
  const player={x:100,y:100,angle:0,bank:0,pitch:0};
  renderer.helicopter(stationary,player,0);
  renderer.helicopter(moving,{...player,bank:.3,pitch:.2},0);
  const pose=c=>c.calls.filter(call=>['translate','scale'].includes(call.name));
  assert.notDeepEqual(pose(stationary),pose(moving));
  assert.ok(moving.calls.some(call=>call.name==='translate'&&call.args[0]===6&&call.args[1]===9));
  assert.ok(moving.calls.some(call=>call.name==='scale'&&call.args[1]<.9));
});

test('helicopter uses a projected hull silhouette and rotor blade shadow',()=>{
  const renderer=new Renderer({getContext:()=>context()},{});
  const c=context();
  renderer.helicopter(c,{x:100,y:100,angle:0,bank:0,pitch:0},0);
  assert.equal(c.calls.filter(call=>call.name==='fill'&&call.fillStyle==='#0b170c4d').length,2);
  assert.ok(c.calls.some(call=>call.name==='fillRect'&&call.fillStyle==='#0b170c24'&&call.args[0]===-48&&call.args[2]===96));
});

test('cannon is half-sized and fires from its barrel tip',()=>{
  const renderer=new Renderer({getContext:()=>context(),ownerDocument:canvasDocument()},{});
  const c=context();
  renderer.helicopter(c,{x:100,y:100,angle:0,cannonAngle:Math.PI/2,bank:0,pitch:0,muzzle:1},0);
  assert.ok(c.calls.some(call=>call.name==='translate'&&call.args[0]===20&&call.args[1]===0));
  assert.ok(c.calls.some(call=>call.name==='scale'&&call.args[0]===.5&&call.args[1]===.5));
  assert.ok(c.calls.some(call=>call.name==='drawImage'&&call.args[0]===renderer.launchFlame&&call.args[1]===38.4));
});

test('helicopter strobe lights flash once every two seconds',()=>{
  const renderer=new Renderer({getContext:()=>context()},{});
  const flashing=context(),dark=context(),player={x:100,y:100,angle:0,bank:0,pitch:0};
  renderer.helicopter(flashing,player,0);
  renderer.helicopter(dark,player,1);
  const hasStrobes=c=>c.calls.some(call=>call.name==='fill'&&['#ffffff','#ff5d52'].includes(call.fillStyle));
  assert.equal(hasStrobes(flashing),true);
  assert.equal(hasStrobes(dark),false);
});

test('helicopter tail strobe flashes once every 1.5 seconds',()=>{
  const renderer=new Renderer({getContext:()=>context()},{});
  const flashing=context(),dark=context(),player={x:100,y:100,angle:0,bank:0,pitch:0};
  renderer.helicopter(flashing,player,1.5);
  renderer.helicopter(dark,player,1);
  const hasTailStrobe=c=>c.calls.some(call=>call.name==='fill'&&call.fillStyle==='#ffb35c');
  assert.equal(hasTailStrobe(flashing),true);
  assert.equal(hasTailStrobe(dark),false);
});

test('tail rotor is rendered edge-on',()=>{
  const renderer=new Renderer({getContext:()=>context()},{});
  const c=context();
  renderer.helicopter(c,{x:100,y:100,angle:0,bank:0,pitch:0},0);
  assert.ok(c.calls.some(call=>call.name==='ellipse'&&call.args[0]===0&&call.args[1]===0&&call.args[2]===15&&call.args[3]===2&&call.fillStyle==='#d8dfb699'));
  assert.equal(c.calls.some(call=>call.name==='fillRect'&&call.args[0]===-12&&call.args[1]===-1&&call.args[2]===24&&call.args[3]===2),false);
});

test('tail rotor blur cycles as it spins',()=>{
  const renderer=new Renderer({getContext:()=>context()},{});
  const still=context(),spinning=context(),player={x:100,y:100,angle:0,bank:0,pitch:0};
  renderer.helicopter(still,player,0);
  renderer.helicopter(spinning,player,.04);
  const blur=c=>c.calls.find(call=>call.name==='ellipse'&&call.fillStyle==='#d8dfb699').args;
  assert.notDeepEqual(blur(still),blur(spinning));
});

test('tank tread marks visibly shift with track phase',()=>{
  const renderer=new Renderer({getContext:()=>context()},{});
  const stationary=context(),moving=context();
  const enemy={x:0,y:0,angle:0,type:'tank',health:4,maxHealth:4};
  renderer.enemy(stationary,enemy,0);
  renderer.enemy(moving,{...enemy,trackPhase:2},0);
  const treads=c=>c.calls.filter(call=>call.name==='fillRect'&&call.fillStyle==='#a1a582').map(call=>call.args);
  assert.ok(treads(stationary).length>4);
  assert.notDeepEqual(treads(stationary),treads(moving));
  for(const [x,,width] of treads(moving))assert.ok(x>=-23&&x+width<=20);
});

test('tank uses reusable track, hull and turret layers with cached depth shading',()=>{
  const renderer=new Renderer({getContext:()=>context()},{effects:true}),c=context();
  let gradients=0;c.createLinearGradient=()=>{gradients++;return linearGradient;};
  const e={x:0,y:0,angle:0,turret:.4,type:'tank',health:4,maxHealth:4};
  renderer.enemy(c,e,0);renderer.enemy(c,e,0);
  assert.equal(gradients,1);
  assert.ok(c.calls.some(call=>call.name==='fill'&&call.fillStyle==='#8c8e69'));
  assert.ok(c.calls.some(call=>call.name==='fill'&&call.fillStyle===linearGradient));
  assert.ok(c.calls.some(call=>call.name==='fillRect'&&call.fillStyle==='#5b694d'));
  assert.ok(c.calls.some(call=>call.name==='rotate'&&call.args[0]===.4));
  assert.ok(c.calls.some(call=>call.name==='fillRect'&&call.fillStyle==='#d0c799'));
});

test('Goliath uses its own command hull while retaining track phases and turret world aim in wrecks',()=>{
  const renderer=new Renderer({getContext:()=>context()},{effects:true});
  const e={x:50,y:70,angle:.4,turret:1.2,type:'boss',health:10,maxHealth:10,leftTrackPhase:1,rightTrackPhase:3};
  const live=context(),char=context(),tank=context();
  renderer.enemy(live,e,0);renderer.enemy(char,{...e,charred:true},0);renderer.enemy(tank,{...e,type:'tank'},0);
  for(const c of [live,char]){
    assert.ok(c.calls.some(call=>call.name==='lineTo'&&call.args[0]===29&&call.args[1]===0));
    assert.ok(c.calls.some(call=>call.name==='rotate'&&Math.abs(call.args[0]-.8)<1e-10));
    assert.equal(c.calls.filter(call=>call.name==='save').length,c.calls.filter(call=>call.name==='restore').length);
  }
  assert.equal(tank.calls.some(call=>call.name==='lineTo'&&call.args[0]===29&&call.args[1]===0),false);
  const treads=c=>c.calls.filter(call=>call.name==='fillRect'&&['#a1a582','#4b5041'].includes(call.fillStyle)).map(call=>call.args);
  assert.deepEqual(treads(live),treads(char));
  const wreck=context();renderer.wreck(wreck,{...e,wreck:true,transition:true,transitionAge:3,burnTime:0});
  assert.equal(wreck.calls.filter(call=>call.name==='lineTo'&&call.args[0]===29&&call.args[1]===0).length,4);
});

test('kamikaze drone is rendered at quarter scale',()=>{
  const renderer=new Renderer({getContext:()=>context()},{});
  const c=context();
  renderer.enemy(c,{x:0,y:0,angle:0,type:'kamikaze',health:1,maxHealth:1},0);
  assert.ok(c.calls.some(call=>call.name==='scale'&&call.args[0]===.55&&call.args[1]===.55));
});

test('drone silhouettes have four phased rotors and independent, ground anchored shadows',()=>{
  const renderer=new Renderer({getContext:()=>context()},{effects:true});
  const poses=[];
  for(const type of ['drone','kamikaze']){
    const e={x:100,y:120,angle:.2,turret:2,visualHeading:1,visualBank:.1,visualPitch:.07,type,health:1,maxHealth:1,seed:1};
    const before=structuredClone(e),c=context();renderer.enemy(c,e,2);
    assert.deepEqual(e,before);
    assert.ok(c.calls.some(call=>call.name==='translate'&&call.args[0]===105&&call.args[1]===128));
    assert.ok(c.calls.some(call=>call.name==='rotate'&&call.args[0]===1));
    assert.equal(c.calls.filter(call=>call.name==='arc'&&call.args[2]===9).length,8);
    assert.equal(new Set(c.calls.filter(call=>call.name==='arc'&&call.args[2]===9).map(call=>call.args[3])).size,8);
    assert.ok(c.calls.some(call=>call.name==='scale'&&call.args[0]===(type==='drone'?.8:1)&&call.args[1]===(type==='drone'?.8:.75)));
    assert.equal(c.calls.filter(call=>call.name==='ellipse'&&call.args[2]===10.5&&call.args[3]===10.5).length,4);
    assert.equal(c.calls.filter(call=>call.name==='save').length,c.calls.filter(call=>call.name==='restore').length);
    poses.push(c.calls.filter(call=>call.name==='lineTo').map(call=>call.args));
  }
  assert.notDeepEqual(poses[0],poses[1]);
});

test('reduced motion freezes drone hover and rotor animation while retaining the shadow',()=>{
  const old=globalThis.matchMedia;
  globalThis.matchMedia=()=>({matches:true});
  try{
    const renderer=new Renderer({getContext:()=>context()},{effects:false}),e={x:50,y:60,type:'drone',angle:.5,visualHeading:1,visualBank:.2,visualPitch:.1,health:1,maxHealth:1};
    const first=context(),second=context();renderer.enemy(first,e,0);renderer.enemy(second,e,10);
    assert.deepEqual(first.calls,second.calls);
    assert.ok(first.calls.some(call=>call.name==='translate'&&call.args[0]===55&&call.args[1]===68));
    assert.equal(first.calls.filter(call=>call.name==='save').length,first.calls.filter(call=>call.name==='restore').length);
  }finally{if(old===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=old;}
});

test('smoke screen selection does not change tank paint, tracks or hit feedback',()=>{
  const renderer=new Renderer({getContext:()=>context()},{effects:true});
  const tank={x:0,y:0,angle:0,type:'tank',health:3,maxHealth:4,smokeScreen:true,hit:.1};
  const first=context(),second=context(),normal=context();
  renderer.enemy(first,tank,0);renderer.enemy(second,tank,10);renderer.enemy(normal,{...tank,smokeScreen:false},0);
  assert.deepEqual(first.calls,second.calls);
  assert.deepEqual(first.calls,normal.calls);
  assert.ok(first.calls.some(call=>call.name==='fillRect'&&call.fillStyle==='#a1a582'));
  assert.ok(first.calls.some(call=>call.name==='fill'&&call.fillStyle==='#fff6c4'));
  assert.ok(normal.calls.some(call=>call.name==='fill'&&call.fillStyle==='#8c8e69'));
});

test('wrecks blend matching poses into charred silhouettes with layered fire and balanced canvas state',()=>{
  const document=canvasDocument();
  for(const type of ['tank','rocketSemi','boss']){
    const renderer=new Renderer({getContext:()=>context(),ownerDocument:document},{effects:true});
    const wreck={x:50,y:70,angle:.4,turret:1.2,type,wreck:true,transition:true,transitionAge:3,age:4,burnTime:12,seed:1};
    const c=context();renderer.wreck(c,wreck);
    const liveFill=type==='tank'?'#8c8e69':type==='boss'?'#727356':'#6c7857';
    const charFill=type==='rocketSemi'?'#353b31':'#3d4436';
    assert.ok(c.calls.some(call=>call.fillStyle===liveFill));
    assert.ok(c.calls.some(call=>call.fillStyle===charFill));
    assert.ok(c.calls.filter(call=>call.name==='drawImage'&&call.args[0]===renderer.wreckFlame).length>=4);
    assert.equal(c.calls.filter(call=>call.name==='save').length,c.calls.filter(call=>call.name==='restore').length);
    assert.ok(c.calls.some(call=>call.name==='rotate'&&Math.abs(call.args[0]-.8)<1e-10));
    const coast=context();renderer.wreck(coast,{...wreck,transitionAge:0});
    assert.ok(coast.calls.some(call=>call.fillStyle===liveFill));
    assert.equal(coast.calls.some(call=>call.fillStyle===charFill),false);
    assert.ok(coast.calls.some(call=>call.name==='drawImage'&&call.args[0]===renderer.wreckFlame));
    const final=context();renderer.wreck(final,{...wreck,transitionAge:6,age:20,burnTime:0});
    assert.equal(final.calls.some(call=>call.fillStyle===liveFill),false);
    assert.equal(final.calls.some(call=>call.name==='drawImage'&&call.args[0]===renderer.wreckFlame),false);
  }
  const low=new Renderer({getContext:()=>context(),ownerDocument:document},{effects:false}),c=context();
  low.wreck(c,{x:0,y:0,angle:0,type:'tank',wreck:true,transition:true,age:0,burnTime:14});
  assert.equal(c.calls.filter(call=>call.name==='drawImage'&&call.args[0]===low.wreckFlame).length,1);
  const state=context(),stack=[];state.globalAlpha=.7;
  state.save=()=>stack.push(state.globalAlpha);state.restore=()=>{state.globalAlpha=stack.pop();};
  low.wreck(state,{x:0,y:0,angle:0,type:'tank',wreck:true,transition:true,age:1,burnTime:10});
  assert.equal(state.globalAlpha,.7);assert.equal(stack.length,0);
});

test('wreck fire uses bounded cached soft gradients and independently evolving points',()=>{
  const document=canvasDocument(),renderer=new Renderer({getContext:()=>context(),ownerDocument:document},{effects:true});
  const base={x:100,y:120,angle:.6,turret:1.2,type:'boss',health:0,wreck:true,transition:true,seed:1};
  const frames=[
    {...base,age:0,transitionAge:0,burnTime:14},
    {...base,age:2,transitionAge:0,burnTime:12},
    {...base,age:6.5,transitionAge:4,burnTime:7.5},
    {...base,age:12,transitionAge:9.5,burnTime:2}
  ];
  const states=frames.map(wreckFireState),active=s=>s.points.filter(p=>p.strength>0);
  assert.deepEqual(states.map(s=>active(s).length),[1,2,5,1]);
  assert.ok(states[0].level<states[1].level&&states[1].level<states[2].level&&states[3].level<states[2].level);
  const random=Math.random;Math.random=()=>{throw Error('renderer consumed RNG');};
  try{
    for(let i=0;i<40;i++){const c=context(),frame=frames[i%frames.length],before=structuredClone(frame);renderer.wreck(c,frame);assert.deepEqual(frame,before);assert.equal(c.calls.filter(call=>call.name==='save').length,c.calls.filter(call=>call.name==='restore').length);}
  }finally{Math.random=random;}
  assert.equal(document.created.length,1);assert.equal(document.created[0].width,64);assert.equal(document.created[0].height,64);
  assert.equal(document.created[0].pc.calls.filter(call=>call.name==='createRadialGradient').length,1);
  assert.deepEqual(document.stops.map(stop=>stop[1]),['#fff6c9ed','#ffd77acb','#f77c38aa','#b7352066','#922b1a00']);
  const initial=context(),peak=context(),late=context();
  renderer.wreck(initial,frames[0]);renderer.wreck(peak,frames[2]);renderer.wreck(late,frames[3]);
  const dimensions=c=>c.calls.filter(call=>call.name==='drawImage').map(call=>call.args.slice(1));
  assert.equal(dimensions(initial).length,2);assert.equal(dimensions(peak).length,10);assert.equal(dimensions(late).length,2);
  assert.ok(dimensions(peak)[0][3]>dimensions(initial)[0][3]);assert.ok(dimensions(late)[0][3]<dimensions(peak)[0][3]);
  const changed=context();renderer.wreck(changed,{...frames[2],age:6.8,transitionAge:4.3,burnTime:7.2});
  assert.notDeepEqual(dimensions(changed),dimensions(peak));
  const fade=context(),alphas=[],stack=[];fade.save=()=>stack.push(fade.globalAlpha);fade.restore=()=>{fade.globalAlpha=stack.pop();};
  fade.drawImage=()=>alphas.push(fade.globalAlpha);
  renderer.wreck(fade,{...base,age:13.999,transitionAge:11.499,burnTime:.001});
  assert.ok(alphas.length>0&&alphas.every(alpha=>alpha<.02));
  const old=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:true});
  try{
    const first=context(),second=context();renderer.wreck(first,frames[0]);renderer.wreck(second,{...frames[0],age:.2});
    assert.equal(first.calls.filter(call=>call.name==='drawImage').length,2);
    assert.equal(second.calls.filter(call=>call.name==='drawImage').length,2);
  }finally{if(old===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=old;}
});

test('fresh wreck smoke is visible and fades out using the shared cache',()=>{
  const document=canvasDocument(),renderer=new Renderer({getContext:()=>context(),ownerDocument:document},{effects:true});
  const c=context(),alphas=[],stack=[];c.save=()=>stack.push(c.globalAlpha);c.restore=()=>{c.globalAlpha=stack.pop();};
  c.drawImage=()=>alphas.push(c.globalAlpha);
  for(const life of [5,2.5,0])renderer.smoke(c,{x:0,y:0,size:10,life,maxLife:5,persistent:true,smokeVariant:0});
  assert.ok(alphas[0]>0);assert.ok(alphas[1]>alphas[0]);assert.equal(alphas[2],0);
  assert.equal(document.created.length,1);assert.equal(c.globalAlpha,1);
});
