import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../renderer.js';

const linearGradient={addColorStop(){}};
function context() {
  const calls=[];
  const c=new Proxy({calls,fillStyle:'',globalAlpha:1,createRadialGradient:(...args)=>{calls.push({name:'createRadialGradient',args});return {addColorStop(){}};},createLinearGradient:()=>linearGradient},{
    get(target,key) {
      if(key in target)return target[key];
      return (...args)=>calls.push({name:key,args,fillStyle:target.fillStyle});
    }
  });
  return c;
}

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
  const renderer=new Renderer({getContext:()=>context()},{});
  const c=context();
  renderer.helicopter(c,{x:100,y:100,angle:0,cannonAngle:Math.PI/2,bank:0,pitch:0,muzzle:1},0);
  assert.ok(c.calls.some(call=>call.name==='translate'&&call.args[0]===20&&call.args[1]===0));
  assert.ok(c.calls.some(call=>call.name==='scale'&&call.args[0]===.5&&call.args[1]===.5));
  assert.ok(c.calls.some(call=>call.name==='fill'&&call.fillStyle==='#fff2a8'));
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
    assert.equal(c.calls.filter(call=>call.name==='arc'&&call.args[2]===7.5).length,8);
    assert.equal(new Set(c.calls.filter(call=>call.name==='arc'&&call.args[2]===7.5).map(call=>call.args[3])).size,8);
    assert.equal(c.calls.filter(call=>call.name==='save').length,c.calls.filter(call=>call.name==='restore').length);
    poses.push(c.calls.filter(call=>call.name==='lineTo').map(call=>call.args));
  }
  assert.notDeepEqual(poses[0],poses[1]);
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
  for(const type of ['tank','rocketSemi','boss']){
    const renderer=new Renderer({getContext:()=>context()},{effects:true});
    const wreck={x:50,y:70,angle:.4,turret:1.2,type,wreck:true,transition:true,transitionAge:3,age:4,burnTime:12,seed:1};
    const c=context();renderer.wreck(c,wreck);
    const liveFill=type==='tank'?'#8c8e69':type==='boss'?'#727356':'#6c7857';
    const charFill=type==='rocketSemi'?'#353b31':'#3d4436';
    assert.ok(c.calls.some(call=>call.fillStyle===liveFill));
    assert.ok(c.calls.some(call=>call.fillStyle===charFill));
    assert.ok(c.calls.some(call=>call.fillStyle==='#b83f20'));
    assert.ok(c.calls.some(call=>call.fillStyle==='#ffe09a'));
    assert.equal(c.calls.filter(call=>call.name==='save').length,c.calls.filter(call=>call.name==='restore').length);
    assert.ok(c.calls.some(call=>call.name==='rotate'&&Math.abs(call.args[0]-.8)<1e-10));
    const coast=context();renderer.wreck(coast,{...wreck,transitionAge:0});
    assert.ok(coast.calls.some(call=>call.fillStyle===liveFill));
    assert.equal(coast.calls.some(call=>call.fillStyle===charFill),false);
    assert.ok(coast.calls.some(call=>call.fillStyle==='#ffe09a'));
    const final=context();renderer.wreck(final,{...wreck,transitionAge:6,age:20,burnTime:0});
    assert.equal(final.calls.some(call=>call.fillStyle===liveFill),false);
    assert.equal(final.calls.some(call=>call.fillStyle==='#ffe09a'),false);
  }
  const low=new Renderer({getContext:()=>context()},{effects:false}),c=context();
  low.wreck(c,{x:0,y:0,angle:0,type:'tank',wreck:true,transition:true,age:0,burnTime:14});
  assert.equal(c.calls.filter(call=>call.name==='fill'&&call.fillStyle==='#b83f20').length,1);
  const state=context(),stack=[];state.globalAlpha=.7;
  state.save=()=>stack.push(state.globalAlpha);state.restore=()=>{state.globalAlpha=stack.pop();};
  low.wreck(state,{x:0,y:0,angle:0,type:'tank',wreck:true,transition:true,age:1,burnTime:10});
  assert.equal(state.globalAlpha,.7);assert.equal(stack.length,0);
});
