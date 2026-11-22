import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as core from '../core.js';
import * as i18n from '../i18n.js';
import { updateDroneVisual } from '../game/combat.js';
import { createEntities } from '../game/entities.js';
import { wreckFireState } from '../renderer.js';

// Run the actual game module against a small browser adapter. Rendering and
// sound are replaced; combat, input, progression, and persistence are unchanged.
function createGame(reducedMotion=false) {
  const elements=new Map(),storage=new Map(),windowEvents=new Map(),documentEvents=new Map();
  class Element {
    constructor(){this.hidden=false;this.style={};this.dataset={};this.children=[];this.value=60;this.checked=true;this.listeners={};this.classList={add(){},remove(){},toggle(){}};}
    addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
    setAttribute(name,value){this[name]=value;}
    getBoundingClientRect(){return{left:0,top:0,width:1200,height:675};}
    focus(){} setPointerCapture(){} closest(){return null;}
    replaceChildren(){this.children=[];} append(child){this.children.push(child);}
    get firstElementChild(){return this.children[0];}
    showModal(){this.open=true;} close(){this.open=false;}
  }
  const document={hidden:false,fullscreenEnabled:false,documentElement:{},getElementById:id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},querySelectorAll:()=>[],createElement:()=>new Element(),addEventListener:(event,fn)=>documentEvents.set(event,fn)};
  const window={addEventListener:(event,fn)=>windowEvents.set(event,fn)};
  const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
  class Audio{constructor(){this.scene='menu';this.initializations=0;this.plays=[];this.calls=[];}async init(){this.initializations++;} configure(){} setActive(){} setMusicScene(scene){this.scene=scene;} play(name,...args){this.plays.push(name);this.calls.push({name,args});} update(){}}
  class Renderer{resize(){} setMap(){} draw(){}}
  const moduleFiles=['game/constants.js','game/state.js','game/entities.js','game/waves.js','game/loop.js','game/combat.js','game/upgrades.js','game/input.js','game.js'];
  const source=moduleFiles.map(file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'')).join('\n');
  const factory=new Function('document','window','localStorage','matchMedia','ResizeObserver','requestAnimationFrame','SoundEngine','Renderer',...Object.keys(core),...Object.keys(i18n),`${source}\nreturn {g:runtime.g,keys:runtime.keys,settings:runtime.settings,start:runtime.start,pause:runtime.pause,resume:runtime.resume,frame:runtime.frame,update:runtime.update,updateEffects:runtime.updateEffects,spawnEnemy:runtime.spawnEnemy,fireEnemy:runtime.fireEnemy,launchRocket:runtime.launchRocket,dash:runtime.dash,deployFlares:runtime.deployFlares,hitEnemy:runtime.hitEnemy,damagePlayer:runtime.damagePlayer,showUpgrades:runtime.showUpgrades,selectUpgrade:runtime.selectUpgrade,nextWave:runtime.nextWave,movement:runtime.movement,pointerPosition:runtime.pointerPosition,sound:runtime.sound,getChoices:()=>runtime.choices,getUpgrades:()=>runtime.upgrades};`);
  const game=factory(document,window,localStorage,query=>({matches:reducedMotion&&query.includes('prefers-reduced-motion')}),class{observe(){}},()=>{},Audio,Renderer,...Object.values(core),...Object.values(i18n));
  return{...game,elements,storage,windowEvents,documentEvents,sound:game.sound};
}
function enemy(overrides={}){return{x:600,y:300,type:'tank',health:4,maxHealth:4,speed:0,points:110,radius:25,angle:0,turret:0,cooldown:10,charge:0,hit:0,seed:0,...overrides};}

test('drone visual response follows travel by the shortest arc and settles without changing aim',()=>{
  const e=enemy({type:'drone',angle:2,turret:-1,speed:100,vx:-100,vy:-1,visualHeading:Math.PI-.02});
  updateDroneVisual(e,.1);
  assert.ok(e.visualHeading>Math.PI-.02&&e.visualHeading<Math.PI+.02);
  assert.equal(e.angle,2);assert.equal(e.turret,-1);
  e.vx=0;e.vy=100;updateDroneVisual(e,.2);
  assert.notEqual(e.visualBank,0);assert.ok(e.visualPitch>0);
  e.vx=undefined;e.vy=undefined;const heading=e.visualHeading;
  for(let i=0;i<100;i++)updateDroneVisual(e,.1);
  assert.equal(e.visualHeading,heading);assert.ok(Math.abs(e.visualBank)<1e-8);assert.ok(e.visualPitch<1e-8);
  updateDroneVisual(e,.1,true);assert.ok(Number.isFinite(e.visualHeading));
});

test('drone cosmetic state initializes on spawn, freezes in pause and is discarded on reset',async()=>{
  const game=createGame(true);await game.start();const drone=game.spawnEnemy('drone');
  drone.x=game.g.player.x+400;drone.y=game.g.player.y;drone.cooldown=100;
  game.update(.1);assert.ok(Number.isFinite(drone.visualHeading));assert.equal(drone.visualBank,0);assert.equal(drone.visualPitch,0);
  const pose=[drone.visualHeading,drone.visualBank,drone.visualPitch],time=game.g.visualTime;
  game.pause();game.frame(1000);game.frame(1100);
  assert.deepEqual([drone.visualHeading,drone.visualBank,drone.visualPitch],pose);assert.equal(game.g.visualTime,time);
  game.resume();await game.start();assert.ok(!game.g.enemies.includes(drone));
  const next=game.spawnEnemy('drone');assert.equal(next.visualHeading,undefined);
});

test('kamikazes use quarter scale and double drone speed and explode for four shots',async()=>{
  const game=createGame();await game.start();
  game.spawnEnemy('drone');game.spawnEnemy('kamikaze');
  const drone=game.g.enemies[0],kamikaze=game.g.enemies[1],p=game.g.player;
  assert.equal(core.ENEMIES.kamikaze.scale,core.ENEMIES.drone.scale/100*55);
  assert.equal(kamikaze.radius,drone.radius/4);
  assert.equal(kamikaze.speed,drone.speed*2);
  kamikaze.x=p.x+20;kamikaze.y=p.y;
  game.hitEnemy(kamikaze,kamikaze.health);
  assert.equal(p.health,100-4*core.ENEMIES.tank.projectileDamage);
  game.hitEnemy(kamikaze,1);assert.equal(p.health,56);
});
test('kamikazes detonate on contact but do not damage from outside the blast',async()=>{
  const game=createGame();await game.start();const p=game.g.player;
  game.spawnEnemy('kamikaze');
  const kamikaze=game.g.enemies[0];kamikaze.x=p.x+20;kamikaze.y=p.y;kamikaze.speed=0;
  game.update(.01);assert.equal(p.health,56);assert.equal(game.g.enemies.length,0);
  p.invulnerable=0;game.spawnEnemy('kamikaze');
  const distant=game.g.enemies[0];distant.x=p.x+core.ENEMIES.kamikaze.explosionRadius+30;distant.y=p.y;
  game.hitEnemy(distant,distant.health);assert.equal(p.health,56);
});
test('AA fires nine marked delayed explosions that persist after its destruction',async()=>{
  const game=createGame();await game.start();const p=game.g.player;
  game.spawnEnemy('aa');const aa=game.g.enemies[0];
  for(let i=0;i<9;i++)game.fireEnemy(aa);
  assert.equal(game.g.warnings.length,9);assert.equal(aa.burstRemaining,0);
  assert.equal(game.g.warnings[0].x,p.x);assert.equal(game.g.warnings[0].y,p.y);
  game.hitEnemy(aa,aa.health);game.g.spawnRemaining=0;
  game.update(core.ENEMIES.aa.warningDelay-.01);
  assert.equal(p.health,100);assert.equal(game.g.warnings.length,9);assert.equal(game.g.waveWait,-1);
  game.update(.02);assert.equal(p.health,100-core.ENEMIES.aa.projectileDamage);
  assert.equal(game.g.warnings.length,0);
});
test('AA automatically spaces one nine-shot burst and pause freezes warnings',async()=>{
  const game=createGame();await game.start();game.spawnEnemy('aa');
  const aa=game.g.enemies[0],p=game.g.player;
  aa.x=p.x+300;aa.y=p.y;aa.speed=0;aa.cooldown=0;game.g.spawnRemaining=0;
  for(let i=0;i<90;i++)game.update(.02);
  assert.equal(game.g.warnings.length,9);assert.equal(aa.burstRemaining,0);
  assert.ok(aa.cooldown>core.ENEMIES.aa.burstInterval);
  const life=game.g.warnings[0].life;
  game.pause();game.frame(1000);game.frame(5000);
  assert.equal(game.g.warnings[0].life,life);
  game.resume();await game.start();
  assert.equal(game.g.warnings.length,0);
});
test('AA muzzle state alternates, expires, pauses, resets and is removed on death',async()=>{
  const game=createGame();await game.start();const aa=game.spawnEnemy('aa');
  aa.x=game.g.player.x+300;aa.y=game.g.player.y;aa.speed=0;aa.cooldown=100;game.g.spawnRemaining=0;
  game.fireEnemy(aa);assert.equal(aa.aaMuzzle.barrel,0);assert.equal(aa.aaMuzzle.life,.24);
  game.fireEnemy(aa);assert.equal(aa.aaMuzzle.barrel,1);aa.cooldown=100;
  game.update(.1);assert.ok(Math.abs(aa.aaMuzzle.life-.14)<1e-10);
  game.pause();game.frame(1000);game.frame(2000);assert.ok(Math.abs(aa.aaMuzzle.life-.14)<1e-10);
  game.resume();game.update(.15);assert.equal(aa.aaMuzzle,undefined);
  game.fireEnemy(aa);const warnings=game.g.warnings.length;game.hitEnemy(aa,aa.health,'cannon');
  assert.equal(aa.aaMuzzle,undefined);assert.equal(game.g.decals.at(-1).aaMuzzle,undefined);
  game.fireEnemy(aa);assert.equal(game.g.warnings.length,warnings);
  await game.start();assert.equal(game.g.warnings.length,0);assert.equal(game.g.enemies.length,0);
});
test('weapon muzzle state follows firing events without changing projectile or audio behavior',async()=>{
  for(const type of ['tank','artillery','boss','drone']){
    const game=createGame();await game.start();game.g.spawnRemaining=100;
    const e=enemy({type,x:300,y:300,turret:.7,health:100,maxHealth:100}),stats=core.ENEMIES[type];
    game.g.enemies=[e];const random=Math.random;let calls=0;Math.random=()=>{calls++;return .5;};
    const before=game.sound.plays.length;
    try{game.fireEnemy(e);}finally{Math.random=random;}
    assert.equal(calls,17);assert.equal(e.weaponMuzzle,.22);assert.equal(game.g.bullets.length,stats.shotCount);
    for(let i=0;i<stats.shotCount;i++){
      const b=game.g.bullets[i],angle=.7+(i-(stats.shotCount-1)/2)*stats.spread;
      const speed=stats.projectileSpeed+Math.min(game.g.wave*stats.projectileSpeedPerWave,stats.projectileSpeedCap);
      assert.equal(b.x,300+Math.cos(.7)*30);assert.equal(b.y,300+Math.sin(.7)*30);
      assert.equal(b.vx,Math.cos(angle)*speed);assert.equal(b.vy,Math.sin(angle)*speed);
      assert.equal(b.damage,stats.projectileDamage);assert.equal(b.life,stats.projectileLife);
    }
    assert.equal(e.cooldown,stats.fireInterval-Math.min(game.g.wave*stats.fireWaveReduction,stats.fireWaveReductionCap)+.5*stats.fireRandom);
    assert.deepEqual(game.sound.plays.slice(before),['enemy']);
    e.cooldown=100;game.update(.1);assert.ok(Math.abs(e.weaponMuzzle-.12)<1e-10);
    game.pause();game.frame(1000);game.frame(2000);assert.ok(Math.abs(e.weaponMuzzle-.12)<1e-10);
    game.resume();game.update(.13);assert.equal(e.weaponMuzzle,undefined);
    game.fireEnemy(e);game.hitEnemy(e,1000,'cannon');assert.equal(e.weaponMuzzle,undefined);
    if(type!=='drone')assert.equal(game.g.decals.at(-1).weaponMuzzle,undefined);
  }
});
test('player cannon flash and smoke timers follow a real shot without changing the shot',async()=>{
  const game=createGame();await game.start();game.g.spawnRemaining=100;
  const p=game.g.player;game.keys.add('Space');const random=Math.random;Math.random=()=>.5;
  const before=game.sound.plays.length;
  try{game.update(.01);}finally{Math.random=random;}
  const b=game.g.bullets.find(b=>b.kind==='gun');
  assert.ok(b);assert.equal(p.muzzle,core.WEAPONS.gun.muzzleTime);assert.equal(p.muzzleSmoke,.22);
  assert.equal(b.damage,core.WEAPONS.gun.damage);assert.equal(b.life,core.WEAPONS.gun.life-.01);
  assert.ok(Math.abs(Math.hypot(b.vx,b.vy)-core.WEAPONS.gun.speed)<1e-8);
  assert.deepEqual(game.sound.plays.slice(before),['shot']);
  game.keys.delete('Space');game.pause();game.frame(1000);game.frame(2000);assert.equal(p.muzzleSmoke,.22);
  game.resume();game.update(.23);assert.equal(p.muzzleSmoke,0);
});
test('cannon tracer selection follows emitted shots across bursts and toggles and resets on a new run',async()=>{
  const game=createGame();await game.start();game.g.spawnRemaining=100;
  const shots=[],random=Math.random;let randomCalls=0;
  Math.random=()=>{randomCalls++;return .5;};
  const fire=()=>{
    const p=game.g.player;
    p.cooldown=0;p.heat=0;p.overheated=false;
    game.keys.add('Space');game.update(.001);game.keys.delete('Space');
    shots.push(game.g.bullets.at(-1));
  };
  try{
    for(let i=0;i<5;i++)fire();
    assert.deepEqual(shots.map(b=>b.tracer),[false,false,false,false,true]);
    game.g.cannonTracersEnabled=false;
    for(let i=0;i<5;i++)fire();
    assert.equal(shots[4].tracer,true);
    assert.deepEqual(shots.slice(5).map(b=>b.tracer),[false,false,false,false,false]);
    game.g.cannonTracersEnabled=true;
    for(let i=0;i<5;i++)fire();
    assert.deepEqual(shots.slice(10).map(b=>b.tracer),[false,false,false,false,true]);
    assert.equal(randomCalls,15);
    await game.start();game.g.spawnRemaining=100;fire();
    assert.equal(shots.at(-1).tracer,false);
  }finally{Math.random=random;}
});
test('cannon tracers retain their spawn selection across mid-cycle toggles without changing gun shots',async()=>{
  const game=createGame();await game.start();game.g.spawnRemaining=100;game.g.spawnTimer=100;
  const p=game.g.player,w=core.WEAPONS.gun,shots=[],random=Math.random;let calls=0;
  game.getUpgrades().damage=2;game.getUpgrades().fireRate=1;
  p.cannonAngle=.4;
  Math.random=()=>{calls++;return .75;};
  const fire=()=>{
    p.cooldown=0;p.heat=0;p.overheated=false;game.keys.add('Space');game.update(0);game.keys.delete('Space');
    const b=game.g.bullets.at(-1),angle=.4+.25*w.spread;
    assert.equal(b.x,p.x+Math.cos(angle)*39);assert.equal(b.y,p.y+Math.sin(angle)*39);
    assert.equal(b.vx,Math.cos(angle)*w.speed);assert.equal(b.vy,Math.sin(angle)*w.speed);
    assert.equal(b.life,w.life);assert.equal(b.damage,w.damage+2*w.damagePerUpgrade);
    assert.equal(b.kind,'gun');assert.equal(b.friendly,true);
    assert.equal(p.cooldown,w.cooldown*w.cooldownUpgradeFactor);assert.equal(p.heat,w.heatPerShot);
    shots.push(b);
  };
  try{
    for(let i=0;i<3;i++)fire();
    game.g.cannonTracersEnabled=false;
    for(let i=0;i<4;i++)fire();
    game.g.cannonTracersEnabled=true;
    for(let i=0;i<4;i++)fire();
    game.g.cannonTracersEnabled=false;
    for(let i=0;i<2;i++)fire();
    game.g.cannonTracersEnabled=true;
    for(let i=0;i<2;i++)fire();
    assert.deepEqual(shots.map(b=>b.tracer),[false,false,false,false,false,false,false,false,false,true,false,false,false,false,true]);
    game.g.cannonTracersEnabled=false;
    assert.equal(shots[9].tracer,true);assert.equal(shots[14].tracer,true);assert.equal(shots[4].tracer,false);
    game.g.cannonTracersEnabled=true;assert.equal(shots[4].tracer,false);
    assert.equal(calls,15);
  }finally{Math.random=random;}
});
test('AA flak preserves detonation timing, radius, sound and bounded cosmetic lifetime',async()=>{
  for(const reduced of [false,true]){
    const game=createGame(reduced);await game.start();game.g.spawnRemaining=0;
    const p=game.g.player,stats=core.ENEMIES.aa;
    game.g.warnings=[{x:p.x+stats.explosionRadius+16,y:p.y,life:.2,radius:stats.explosionRadius,damage:stats.projectileDamage}];
    game.update(.19);assert.equal(p.health,100);assert.equal(game.g.particles.filter(p=>p.flakSmoke).length,0);
    const sounds=game.sound.plays.filter(name=>name==='explode').length;game.update(.02);
    assert.equal(p.health,100-stats.projectileDamage);assert.equal(game.sound.plays.filter(name=>name==='explode').length,sounds+1);
    assert.equal(game.g.explosions.length,0);assert.equal(game.g.decals.length,0);
    assert.equal(game.g.particles.filter(p=>p.flakSmoke).length,reduced?2:4);
    assert.equal(game.g.particles.filter(p=>p.flakFlash).length,reduced?0:1);
    game.updateEffects(.11);assert.equal(game.g.particles.filter(p=>p.flakFlash).length,0);
    assert.ok(game.g.particles.some(p=>p.flakSmoke));game.updateEffects(2);
    assert.equal(game.g.particles.filter(p=>p.flakSmoke).length,0);
    p.invulnerable=0;p.health=100;
    game.g.warnings=[{x:p.x+stats.explosionRadius+17,y:p.y,life:.01,radius:stats.explosionRadius,damage:stats.projectileDamage}];
    game.update(.02);assert.equal(p.health,100);
    game.g.particles=Array.from({length:reduced?650:649},()=>({x:0,y:0,vx:0,vy:0,life:10,maxLife:10,size:1}));
    game.g.warnings=[{x:0,y:0,life:.01,radius:stats.explosionRadius,damage:stats.projectileDamage}];
    game.update(.02);assert.ok(game.g.particles.length<=650);
    assert.ok(game.g.particles.some(p=>reduced?p.flakSmoke:p.flakFlash));
  }
  const low=createGame();await low.start();low.settings.effects=false;low.g.spawnRemaining=0;
  low.g.particles=Array.from({length:179},()=>({x:0,y:0,vx:0,vy:0,life:10,maxLife:10,size:1}));
  low.g.warnings=[{x:0,y:0,life:.01,radius:38,damage:11}];low.update(.02);
  assert.equal(low.g.particles.length,180);
});
test('flak cosmetic creation does not consume gameplay random numbers',()=>{
  const g={particles:[],shake:0},sounds=[];
  const {flakBurst}=createEntities({g,settings:{effects:true},sound:{play:(...args)=>sounds.push(args)}});
  const random=Math.random;Math.random=()=>{throw Error('flak consumed gameplay RNG');};
  try{flakBurst(40,50);}finally{Math.random=random;}
  assert.equal(g.particles.length,10);assert.equal(sounds.length,1);assert.equal(sounds[0][0],'explode');
});
test('rocket semi homing rockets fire faster on harder difficulty',async()=>{
  const game=createGame();await game.start();game.spawnEnemy('rocketSemi');
  const semi=game.g.enemies[0],delays=[];
  const random=Math.random;Math.random=()=>0;
  try{for(const difficulty of ['easy','normal','hard']){game.settings.difficulty=difficulty;game.fireEnemy(semi);delays.push(semi.cooldown);}}
  finally{Math.random=random;}
  assert.ok(delays[0]>delays[1]&&delays[1]>delays[2]);
  const rocket=game.g.bullets[0];assert.equal(rocket.kind,'enemyRocket');assert.equal(rocket.damage,core.ENEMIES.rocketSemi.projectileDamage);
  rocket.x=game.g.player.x-300;rocket.y=game.g.player.y-100;rocket.vx=100;rocket.vy=0;
  game.g.bullets=[rocket];game.update(.1);
  assert.ok(rocket.vy>0);assert.ok(Math.hypot(rocket.vx,rocket.vy)>100);
});
test('launcher ignition follows firing without changing projectile or combat timing',async()=>{
  const game=createGame();await game.start();game.g.spawnRemaining=100;
  const truck=game.spawnEnemy('rocketSemi'),stats=core.ENEMIES.rocketSemi;
  Object.assign(truck,{x:300,y:300,turret:.7,speed:0});
  const random=Math.random;let calls=0;Math.random=()=>{calls++;return .5;};
  const audio=game.sound.plays.length;
  try{game.fireEnemy(truck);}finally{Math.random=random;}
  assert.equal(calls,17);assert.equal(truck.launchIgnition,.24);
  assert.equal(game.g.bullets.length,stats.shotCount);
  const rocket=game.g.bullets[0],speed=stats.projectileSpeed+Math.min(game.g.wave*stats.projectileSpeedPerWave,stats.projectileSpeedCap);
  assert.equal(rocket.x,truck.x+Math.cos(.7)*30);assert.equal(rocket.y,truck.y+Math.sin(.7)*30);
  assert.equal(rocket.vx,Math.cos(.7)*speed);assert.equal(rocket.vy,Math.sin(.7)*speed);
  assert.equal(rocket.damage,stats.projectileDamage);assert.equal(rocket.life,stats.projectileLife);
  assert.equal(truck.cooldown,(stats.fireInterval-Math.min(game.g.wave*stats.fireWaveReduction,stats.fireWaveReductionCap)+.5*stats.fireRandom)*stats.normalInterval);
  assert.deepEqual(game.sound.plays.slice(audio),['missile']);
  truck.cooldown=100;game.update(.1);assert.ok(Math.abs(truck.launchIgnition-.14)<1e-10);
  game.pause();game.frame(1000);game.frame(2000);assert.ok(Math.abs(truck.launchIgnition-.14)<1e-10);
  game.resume();game.update(.15);assert.equal(truck.launchIgnition,undefined);
  game.fireEnemy(truck);game.hitEnemy(truck,truck.health,'cannon');
  assert.equal(truck.launchIgnition,undefined);assert.equal(game.g.decals.at(-1).launchIgnition,undefined);
  assert.equal(game.g.wreckSmoke.at(-1).wreck,game.g.decals.at(-1));
});
test('enemy missile contact visuals use swept entry without changing damage or protection',async()=>{
  for(const kind of ['enemyRocket','shell']){
    for(const protectedHit of [false,true]){
      const game=createGame();await game.start();game.settings.difficulty='hard';game.g.spawnRemaining=100;
      const p=game.g.player;p.invulnerable=protectedHit?1:0;
      const before=game.sound.plays.length;
      game.g.bullets=[{x:p.x-100,y:p.y,vx:1000,vy:0,life:2,friendly:false,kind,damage:7,turn:0,acceleration:0,maxSpeed:1000,trail:10}];
      game.update(.2);
      const flashes=game.g.particles.filter(particle=>particle.contactFlash);
      assert.equal(flashes.length,kind==='enemyRocket'?1:0);
      if(flashes.length){assert.ok(Math.abs(flashes[0].x-(p.x-17))<1e-8);assert.equal(flashes[0].y,p.y);}
      assert.equal(p.health,protectedHit?100:100-7*game.g.plan.damage);
      assert.equal(game.g.bullets.length,0);
      assert.equal(game.sound.plays.slice(before).filter(name=>name==='damage').length,protectedHit?0:1);
      assert.equal(game.g.shake,protectedHit?0:10);
    }
  }
});
test('missile contact particles are bounded and consume no random values',()=>{
  const g={particles:[],shake:0},settings={effects:true},sound={play(){throw Error('unexpected sound');}};
  const {missileContact}=createEntities({g,settings,sound}),random=Math.random;
  Math.random=()=>{throw Error('unexpected random value');};
  try{
    missileContact(5,6);
    assert.equal(g.particles.length,7);
    assert.equal(g.particles.filter(p=>p.contactFlash).length,1);
    g.particles=Array.from({length:650},()=>({}));
    missileContact(7,8);
    assert.equal(g.particles.length,650);
    assert.equal(g.particles.filter(p=>p.contactFlash).length,1);
    assert.equal(g.shake,0);
  }finally{Math.random=random;}
});
test('test range spawns only the configured enemy with selected upgrades',async()=>{
  const game=createGame();
  await game.start('test');
  Object.assign(game.elements.get('test-enemy'),{value:'aa'});
  Object.assign(game.elements.get('test-interval'),{value:'.2'});
  Object.assign(game.elements.get('test-max-active'),{value:'1'});
  Object.assign(game.elements.get('test-health'),{value:'2'});
  Object.assign(game.elements.get('test-distance'),{value:'220'});
  Object.assign(game.elements.get('test-damage'),{value:'2'});
  Object.assign(game.elements.get('test-fire-rate'),{value:'1'});
  Object.assign(game.elements.get('test-armor'),{value:'3'});
  Object.assign(game.elements.get('test-engine'),{value:'2'});
  Object.assign(game.elements.get('test-rockets'),{value:'1'});
  await game.start('test');game.update(.01);
  assert.equal(game.g.testRange.enemy,'aa');assert.equal(game.g.enemies.length,1);assert.equal(game.g.enemies[0].type,'aa');
  assert.equal(game.g.enemies[0].health,game.g.enemies[0].maxHealth);assert.equal(game.g.player.maxHealth,175);assert.equal(game.g.player.maxRockets,4);
  game.g.player.invulnerable=0;game.damagePlayer(1000);
  assert.equal(game.g.state,'playing');assert.equal(game.g.player.health,game.g.player.maxHealth);
});
test('flares deploy automatically below Ace and require manual activation on Ace',async()=>{
  const automatic=createGame();await automatic.start();automatic.g.spawnRemaining=100;
  const p=automatic.g.player,rocket={x:p.x-150,y:p.y,vx:100,vy:0,life:5,kind:'enemyRocket',turn:0,acceleration:0,maxSpeed:100,trail:10};
  automatic.g.bullets=[rocket];const random=Math.random;Math.random=()=>0;
  try{automatic.update(.05);}finally{Math.random=random;}
  assert.equal(rocket.decoyed,true);assert.ok(p.flareCooldown>2);assert.equal(automatic.g.particles.filter(particle=>particle.flare).length,3);
  const flare=automatic.g.particles.find(particle=>particle.flare),straightX=flare.x+flare.vx*.1;
  assert.ok(Math.hypot(flare.vx,flare.vy)>380);
  automatic.updateEffects(.1);assert.notEqual(flare.x,straightX);

  const manual=createGame();await manual.start();manual.settings.difficulty='hard';manual.g.spawnRemaining=100;
  const hardRocket={...rocket,x:manual.g.player.x-150,y:manual.g.player.y,decoyed:false};
  manual.g.bullets=[hardRocket];manual.update(.05);assert.equal(hardRocket.decoyed,false);
  Math.random=()=>0;
  try{assert.equal(manual.deployFlares(),true);}finally{Math.random=random;}
  assert.equal(hardRocket.decoyed,true);
});
test('flare salvo preserves spawn, trajectory, cooldown and lifetime',async()=>{
  const game=createGame();await game.start();game.g.spawnRemaining=100;game.g.spawnTimer=100;
  const p=game.g.player;Object.assign(p,{x:500,y:300,vx:40,vy:-20,angle:.6});game.g.time=.31;
  const values=[.1,.2,.3,.4,.5,.6,.7,.8,.9,.4,.2,.1],random=Math.random;let calls=0;
  Math.random=()=>{assert.ok(calls<values.length);return values[calls++];};
  try{
    const before=game.sound.plays.length;
    assert.equal(game.deployFlares(),true);assert.equal(calls,12);assert.equal(p.flareCooldown,2.2);
    assert.deepEqual(game.sound.plays.slice(before),['flare']);
    const flares=game.g.particles.filter(particle=>particle.flare);
    assert.equal(flares.length,3);
    for(let i=0;i<3;i++){
      const flare=flares[i],angle=.6+Math.PI+[-.3,0,.3][i]+(values[4*i]-.5)*.24;
      const speed=(130+values[4*i+1]*70)*3,phase=values[4*i+2]*Math.PI*2,wobble=35+values[4*i+3]*40;
      const x=500+Math.cos(angle)*25,y=300+Math.sin(angle)*25,vx=40+Math.cos(angle)*speed,vy=-20+Math.sin(angle)*speed;
      assert.equal(flare.x,x);assert.equal(flare.y,y);assert.equal(flare.vx,vx);assert.equal(flare.vy,vy);
      assert.equal(flare.life,.85);assert.equal(flare.maxLife,.85);
      assert.equal(flare.flarePhase,phase);assert.equal(flare.flareWobble,wobble);
    }
    assert.equal(game.deployFlares(),false);assert.equal(calls,12);assert.equal(game.g.particles.length,3);
    const initial=flares.map(({x,y,vx,vy,flarePhase,flareWobble})=>({x,y,vx,vy,flarePhase,flareWobble}));
    game.updateEffects(.1);
    for(let i=0;i<3;i++){
      const flare=flares[i],start=initial[i],drift=Math.sin(.31*15+start.flarePhase)*start.flareWobble;
      assert.equal(flare.x,start.x+(start.vx+drift)*.1);assert.equal(flare.y,start.y+(start.vy+drift*.55)*.1);
      assert.equal(flare.vx,start.vx*Math.exp(-.1*3));assert.equal(flare.vy,start.vy*Math.exp(-.1*3));
      assert.equal(flare.life,.85-.1);
    }
    game.updateEffects(.74);assert.equal(game.g.particles.filter(particle=>particle.flare).length,3);
    game.updateEffects(.02);assert.equal(game.g.particles.filter(particle=>particle.flare).length,0);
    game.update(.5);assert.ok(Math.abs(p.flareCooldown-1.7)<1e-12);assert.equal(game.deployFlares(),false);
    game.update(1.7);assert.ok(p.flareCooldown<1e-12);game.update(.01);assert.equal(p.flareCooldown,0);
    calls=0;assert.equal(game.deployFlares(),true);assert.equal(calls,12);assert.equal(p.flareCooldown,2.2);
  }finally{Math.random=random;}
});
test('flares decoy only the nearest incoming missile within range at the deflection threshold',async()=>{
  for(const [roll,decoyed] of [[.319,true],[.32,false]]){
    const game=createGame();await game.start();const p=game.g.player;
    Object.assign(p,{x:500,y:300,angle:.6});
    const rocket=(x,vx,extra={})=>({x,y:300,vx,vy:0,life:5,kind:'enemyRocket',...extra});
    const nearest=rocket(400,100),farther=rocket(300,100),outOfRange=rocket(240,100),receding=rocket(490,-100),alreadyDecoyed=rocket(480,100,{decoyed:true});
    game.g.bullets=[farther,outOfRange,receding,alreadyDecoyed,nearest];
    const random=Math.random;let calls=0;Math.random=()=>++calls===13?roll:.5;
    try{assert.equal(game.deployFlares(),true);}finally{Math.random=random;}
    assert.equal(calls,13);assert.equal(!!nearest.decoyed,decoyed);
    assert.equal(!!farther.decoyed,false);assert.equal(!!outOfRange.decoyed,false);assert.equal(!!receding.decoyed,false);
    assert.equal(alreadyDecoyed.decoyed,true);
    if(decoyed){
      assert.equal(nearest.decoyTimer,.85);
      assert.equal(nearest.decoyX,p.x-Math.cos(p.angle)*48);assert.equal(nearest.decoyY,p.y-Math.sin(p.angle)*48);
    }else assert.equal(nearest.decoyTimer,undefined);
  }
});
test('decoyed missiles expire after their decoy timer',async()=>{
  const game=createGame();await game.start();game.settings.difficulty='hard';game.g.spawnRemaining=100;game.g.spawnTimer=100;
  const p=game.g.player,rocket={x:p.x-150,y:p.y,vx:1,vy:0,life:5,kind:'enemyRocket',turn:0,acceleration:0,maxSpeed:1,trailDistance:0};
  game.g.bullets=[rocket];const random=Math.random;Math.random=()=>0;
  try{
    assert.equal(game.deployFlares(),true);assert.equal(rocket.decoyTimer,.85);
    game.update(.84);assert.ok(game.g.bullets.includes(rocket));assert.ok(Math.abs(rocket.decoyTimer-.01)<1e-12);
    game.update(.02);assert.equal(rocket.life,0);assert.ok(!game.g.bullets.includes(rocket));assert.equal(p.health,100);
  }finally{Math.random=random;}
});
test('critical health and close missiles trigger repeating cockpit alarms',async()=>{
  const critical=createGame();await critical.start();critical.g.spawnRemaining=100;
  critical.g.player.health=25;critical.update(.01);
  assert.equal(critical.sound.plays.filter(name=>name==='lowHealth').length,1);
  critical.update(.5);assert.equal(critical.sound.plays.filter(name=>name==='lowHealth').length,1);
  critical.update(1);assert.equal(critical.sound.plays.filter(name=>name==='lowHealth').length,2);

  const missile=createGame();await missile.start();missile.g.spawnRemaining=100;missile.settings.difficulty='hard';
  const p=missile.g.player;
  missile.g.bullets.push({x:p.x-250,y:p.y,vx:1,vy:0,life:5,kind:'enemyRocket',turn:0,acceleration:0,maxSpeed:1,trail:10});
  missile.update(.01);assert.equal(missile.sound.plays.filter(name=>name==='missileAlert').length,1);
  missile.update(.5);assert.equal(missile.sound.plays.filter(name=>name==='missileAlert').length,1);
  missile.update(.8);assert.equal(missile.sound.plays.filter(name=>name==='missileAlert').length,2);
});

test('new sortie resets combat, unlocks controls, and schedules wave one',async()=>{
  const game=createGame();await game.start();
  assert.equal(game.g.state,'playing');assert.equal(game.g.wave,1);assert.equal(game.g.spawnRemaining,6);
  assert.equal(game.g.player.health,100);assert.equal(game.g.player.rockets,3);
  game.keys.add('KeyD');const x=game.g.player.x;
  for(let i=0;i<30;i++)game.update(1/60);
  assert.ok(game.g.player.x>x+50);
});
test('helicopter acceleration and turning retain momentum',async()=>{
  const game=createGame();await game.start();game.g.spawnRemaining=100;
  const p=game.g.player;
  game.g.pointer.x=p.x+500;game.g.pointer.y=p.y;game.update(.05);
  assert.ok(p.angle<-.5);
  game.keys.add('KeyD');game.update(.05);
  assert.ok(p.vx>0&&p.vx<60);
});
test('cannon tracks aim faster than the helicopter hull',async()=>{
  const game=createGame();await game.start();game.g.spawnRemaining=100;
  const p=game.g.player;
  game.g.pointer.x=p.x+500;game.g.pointer.y=p.y;game.update(.05);
  assert.ok(p.cannonAngle>p.angle);
  assert.ok(p.cannonAngle>-.5);
});
test('pause clears held inputs and the animation loop stops simulation',async()=>{
  const game=createGame();await game.start();game.keys.add('KeyW');game.g.pointer.down=true;game.pause();
  const {x,y}=game.g.player,time=game.g.time;
  game.frame(1000);game.frame(2000);
  assert.equal(game.keys.size,0);assert.equal(game.g.pointer.down,false);
  assert.deepEqual([game.g.player.x,game.g.player.y,game.g.time],[x,y,time]);
  await game.resume();assert.equal(game.g.state,'playing');
});
test('swept bullets destroy targets crossed entirely in a single frame',async()=>{
  const game=createGame();await game.start();game.g.enemies=[enemy({x:200,y:300,health:1})];
  game.g.bullets=[{x:120,y:300,vx:10000,vy:0,life:1,friendly:true,kind:'gun',damage:1}];
  game.update(.02);assert.equal(game.g.enemies.length,0);assert.equal(game.g.kills,1);assert.equal(game.g.score,110);
  assert.equal(game.g.bullets.length,0);
});
test('helicopter banks smoothly toward its movement direction',async()=>{
  const game=createGame();await game.start();game.g.spawnRemaining=100;game.keys.add('KeyD');
  for(let i=0;i<30;i++)game.update(1/60);
  assert.ok(Math.hypot(game.g.player.bank,game.g.player.pitch)>.05);
  game.keys.delete('KeyD');
  for(let i=0;i<240;i++)game.update(1/60);
  assert.ok(Math.hypot(game.g.player.bank,game.g.player.pitch)<0.001);
});
test('tank tracks advance only while the tank moves and freeze when paused',async()=>{
  const game=createGame();await game.start();game.g.spawnRemaining=100;
  const p=game.g.player,tank=enemy({x:p.x+400,y:p.y,speed:40,angle:Math.PI});
  game.g.enemies=[tank];game.update(.05);
  const movingPhase=tank.trackPhase;
  assert.ok(movingPhase>1);
  game.pause();game.frame(1000);game.frame(2000);assert.equal(tank.trackPhase,movingPhase);
  await game.resume();tank.x=p.x+150;tank.y=p.y;game.update(.05);
  assert.equal(tank.trackPhase,movingPhase);
});
test('tank treads turn in opposite directions during an in-place hull turn',async()=>{
  const game=createGame();await game.start();game.g.spawnRemaining=100;
  const p=game.g.player,tank=enemy({x:p.x+100,y:p.y,speed:40,angle:Math.PI/2,cooldown:100});
  game.g.enemies=[tank];game.update(.1);
  assert.ok(tank.leftTrackPhase>0);assert.ok(tank.rightTrackPhase<0);
});
test('moving tanks leave tread marks that fade after twenty seconds',async()=>{
  const game=createGame();await game.start();game.g.spawnRemaining=100;
  const p=game.g.player,tank=enemy({x:p.x+400,y:p.y,speed:40,angle:Math.PI,cooldown:100});
  game.g.enemies=[tank];game.update(.5);
  assert.ok(game.g.treadMarks.length>0);
  tank.speed=0;game.update(20.01);
  assert.equal(game.g.treadMarks.length,0);
});
test('Goliath leaves wide, aligned tread marks',async()=>{
  const game=createGame();await game.start();game.g.spawnRemaining=100;
  const p=game.g.player,boss=enemy({x:p.x+400,y:p.y,type:'boss',speed:100,angle:Math.PI,cooldown:100});
  game.g.enemies=[boss];game.update(.5);
  assert.ok(game.g.treadMarks.some(mark=>mark.trackOffset===36&&mark.trackLength===30&&mark.trackWidth===24));
});
test('armored vehicle wrecks emit lingering black smoke',async()=>{
  const game=createGame();await game.start();game.g.enemies=[enemy()];
  game.hitEnemy(game.g.enemies[0],100);
  assert.equal(game.g.wreckSmoke.length,1);assert.equal(game.g.wreckSmoke[0].life,18);assert.equal(game.g.decals[0].wreck,true);
  game.updateEffects(.1);
  assert.ok(game.g.particles.some(p=>p.persistent&&p.smoke&&p.color==='#111812b8'));
  game.updateEffects(18.1);
  assert.equal(game.g.wreckSmoke.length,0);
});
test('explosions emit fire splinters and Goliath ruptures in stages',async()=>{
  const game=createGame();await game.start();
  const tank=enemy();game.g.enemies=[tank];game.hitEnemy(tank,100);
  assert.ok(game.g.particles.some(p=>p.fireSplinter));
  const boss=enemy({type:'boss',health:1,maxHealth:1,points:2500,radius:49});
  game.g.enemies=[boss];game.hitEnemy(boss,100);
  assert.equal(game.g.deathBursts.length,5);
  const explosions=game.g.explosions.length;game.updateEffects(.2);
  assert.ok(game.g.explosions.length>explosions);
});
test('player rockets leave a thick enemy-style smoke trail after ignition',async()=>{
  const game=createGame();await game.start();game.g.spawnRemaining=100;
  game.g.player.cannonAngle=0;game.launchRocket();game.update(.4);
  assert.ok(game.g.particles.filter(p=>p.smoke&&p.color==='#c1b89b').length>=2);
});
test('rocket trails follow nozzle distance independently of frame partition',async()=>{
  async function simulate(steps,reduced=false){
    const game=createGame(reduced);await game.start();game.settings.difficulty='hard';game.g.spawnRemaining=100;
    game.g.bullets=[{x:100,y:200,vx:120,vy:0,life:5,kind:'enemyRocket',turn:0,acceleration:0,maxSpeed:120}];
    for(const dt of steps)game.update(dt);
    return game.g.particles.filter(p=>p.exhaust);
  }
  const random=Math.random;Math.random=()=>.5;
  try{
    const one=await simulate([1]),many=await simulate(Array(10).fill(.1)),low=await simulate([1],true);
    assert.deepEqual(one.map(p=>[p.x,p.y]),many.map(p=>[p.x,p.y]));
    assert.equal(one.length,10);assert.equal(one[0].x,103);assert.equal(one.at(-1).x,211);
    assert.equal(low.length,5);assert.equal(low[0].x,115);
    assert.ok(one.every(p=>p.color==='#c1b89b'&&p.smoke));
  }finally{Math.random=random;}
});
test('rocket trails suppress ejection and enforce per-step and particle budgets',async()=>{
  const game=createGame();await game.start();game.g.spawnRemaining=100;
  game.g.player.cannonAngle=0;game.launchRocket();game.update(.29);
  assert.equal(game.g.particles.filter(p=>p.exhaust).length,0);
  game.update(.11);assert.ok(game.g.particles.some(p=>p.exhaust));
  game.g.particles=[];game.settings.difficulty='hard';
  game.g.bullets=[{x:100,y:200,vx:10000,vy:0,life:5,kind:'enemyRocket',turn:0,acceleration:0,maxSpeed:10000}];
  game.update(1);assert.equal(game.g.particles.filter(p=>p.exhaust).length,24);
  game.g.particles=Array.from({length:649},()=>({}));
  game.g.bullets=[{x:100,y:200,vx:1000,vy:0,life:5,kind:'enemyRocket',turn:0,acceleration:0,maxSpeed:1000}];
  game.update(.5);assert.equal(game.g.particles.length,650);
});
test('rockets consume ammunition, deal area damage, and replenish over time',async()=>{
  const game=createGame();await game.start();const p=game.g.player;
  p.x=300;p.y=300;game.g.pointer.x=450;game.g.pointer.y=300;
  game.g.enemies=[enemy({x:450,y:300}),enemy({x:480,y:320})];
  game.launchRocket();assert.equal(p.rockets,2);
  for(let i=0;i<30;i++)game.update(1/60);
  assert.equal(game.g.kills,2);
  // Keep an enemy alive so the next-wave screen does not interrupt reloading.
  game.g.enemies=[enemy({x:1200,y:600,cooldown:100})];game.g.spawnRemaining=0;
  for(let i=0;i<420;i++)game.update(1/60);
  assert.equal(p.rockets,3);
});
test('dash grants brief protection and cannot be spammed',async()=>{
  const game=createGame();await game.start();game.keys.add('KeyD');game.dash();const p=game.g.player;
  assert.equal(p.vx,850);assert.ok(p.invulnerable>0);assert.ok(p.dashCooldown>0);
  game.damagePlayer(50);assert.equal(p.health,100);
  p.vx=123;game.dash();assert.equal(p.vx,123);
});
test('wave clear offers upgrades, clears hostile shells, and resumes next wave',async()=>{
  const game=createGame();await game.start();game.g.spawnRemaining=0;game.g.bullets=[{x:10,y:10,vx:0,vy:0,life:6,friendly:false}];
  for(let i=0;i<100&&game.g.state==='playing';i++)game.update(1/60);
  assert.equal(game.g.state,'upgrade');assert.equal(game.g.bullets.length,0);assert.equal(game.getChoices().length,3);
  const choice=game.getChoices()[0];game.selectUpgrade(choice.id);
  assert.equal(game.g.state,'playing');assert.equal(game.g.wave,2);assert.equal(game.getUpgrades()[choice.id],1);
});
test('wave five spawns a boss and destruction saves the record before restart',async()=>{
  const game=createGame();await game.start();for(let i=0;i<4;i++)game.nextWave();
  assert.ok(game.g.enemies.some(e=>e.type==='boss'));game.g.score=1234;game.g.player.invulnerable=0;game.damagePlayer(200);
  assert.equal(game.g.state,'over');assert.equal(JSON.parse(game.storage.get('blackout.best')),1234);
  await game.start();assert.equal(game.g.score,0);assert.equal(game.g.player.health,100);assert.equal(game.g.best,1234);assert.equal(game.g.enemies.length,0);
});
test('music follows menu, wave, and boss transitions',async()=>{
  const game=createGame();assert.equal(game.sound.scene,'menu');
  await game.start();assert.equal(game.sound.scene,'waves');
  for(let i=0;i<4;i++)game.nextWave();
  assert.equal(game.sound.scene,'boss');
  game.hitEnemy(game.g.enemies.find(e=>e.type==='boss'),100000);
  assert.equal(game.sound.scene,'waves');
  game.g.player.invulnerable=0;game.damagePlayer(1000);
  assert.equal(game.sound.scene,'menu');
});
test('first main-menu interaction initializes its soundtrack',async()=>{
  const game=createGame();
  game.documentEvents.get('pointerdown')();
  await Promise.resolve();
  assert.equal(game.sound.initializations,1);
});
test('language selection persists and updates status text',async()=>{
  const game=createGame(),language=game.elements.get('language');
  assert.equal(game.settings.language,'en');
  await game.start();
  language.value='de';
  language.listeners.change[0]({target:language});
  assert.equal(game.settings.language,'de');
  assert.equal(JSON.parse(game.storage.get('blackout.settings')).language,'de');
  assert.equal(game.elements.get('feed-status').textContent,'AKTIV');
});
test('helicopter coasts after release and eventually stops without crossing the boundary',async()=>{
  const game=createGame();await game.start();game.g.spawnRemaining=100;
  game.keys.add('KeyD');for(let i=0;i<60;i++)game.update(1/60);
  game.keys.delete('KeyD');const p=game.g.player,x=p.x,initial=p.vx;
  game.update(1/60);assert.ok(p.vx>0&&p.vx<initial);
  for(let i=0;i<180;i++)game.update(1/60);
  assert.ok(p.x>x+50);assert.ok(p.vx<.1);
  p.x=game.g.world.width-34;p.vx=100;game.update(1/60);assert.equal(p.vx,0);
});
test('gun overheats, locks while cooling, and fires again after three seconds',async()=>{
  const game=createGame();await game.start();game.g.spawnRemaining=100;
  const p=game.g.player;game.keys.add('Space');
  for(let i=0;i<300&&!p.overheated;i++)game.update(1/60);
  assert.equal(p.overheated,true);assert.equal(p.heat,1);
  game.g.bullets=[];for(let i=0;i<120;i++)game.update(1/60);
  assert.equal(p.overheated,true);assert.equal(game.g.bullets.filter(b=>b.kind==='gun').length,0);
  for(let i=0;i<65;i++)game.update(1/60);
  assert.equal(p.overheated,false);assert.ok(p.heat>0);assert.ok(game.g.bullets.some(b=>b.kind==='gun'));
});
test('gun cools when fire is released before overheating and pause freezes heat',async()=>{
  const game=createGame();await game.start();game.g.spawnRemaining=100;
  game.keys.add('Space');for(let i=0;i<30;i++)game.update(1/60);
  const p=game.g.player,heat=p.heat;assert.ok(heat>0&&heat<1);
  game.keys.delete('Space');for(let i=0;i<30;i++)game.update(1/60);
  assert.ok(p.heat<heat);const cooling=p.heat;
  game.pause();game.frame(1000);game.frame(2000);assert.equal(p.heat,cooling);
});
test('rockets accelerate with and without a target and keep their heading',async()=>{
  const game=createGame();await game.start();game.g.spawnRemaining=100;
  const p=game.g.player;p.angle=0;p.cannonAngle=0;game.launchRocket();
  const rocket=game.g.bullets[0],initial=Math.hypot(rocket.vx,rocket.vy),initialX=rocket.x;
  game.update(.29);assert.equal(initial,100);assert.equal(Math.hypot(rocket.vx,rocket.vy),100);assert.equal(rocket.x,initialX+29);
  game.update(.02);assert.ok(Math.hypot(rocket.vx,rocket.vy)>100);assert.equal(rocket.vy,0);
  for(let i=0;i<10;i++)game.update(.05);
  assert.ok(Math.abs(Math.hypot(rocket.vx,rocket.vy)-820)<1e-8);
});
test('rockets alternate between left and right launch rails',async()=>{
  const game=createGame();await game.start();game.g.spawnRemaining=100;
  const p=game.g.player;p.cannonAngle=0;game.launchRocket();
  const first=game.g.bullets[0];p.rocketCooldown=0;game.launchRocket();
  const second=game.g.bullets[1];
  assert.equal(first.x,second.x);assert.equal(first.y-p.y,-(second.y-p.y));
});
test('camera follows the player while pointer world coordinates remain aligned',async()=>{
  const game=createGame();await game.start();game.g.spawnRemaining=100;
  game.pointerPosition({clientX:900,clientY:300});const camera=game.g.camera,old=camera.x;
  game.keys.add('KeyD');for(let i=0;i<120;i++)game.update(1/60);
  assert.ok(camera.x>old);
  assert.ok(Math.abs((game.g.pointer.x-camera.x)*camera.zoom-game.g.pointer.screenX)<1e-8);
  assert.ok(Math.abs((game.g.pointer.y-camera.y)*camera.zoom-game.g.pointer.screenY)<1e-8);
});
test('reduced motion disables camera tracking and zoom',async()=>{
  const game=createGame(true);await game.start();game.g.spawnRemaining=100;
  game.keys.add('KeyD');for(let i=0;i<60;i++)game.update(1/60);
  assert.deepEqual(game.g.camera,{x:0,y:0,zoom:1});
});
test('next wave changes sector and clears persistent battlefield effects',async()=>{
  const game=createGame();await game.start();const first=game.g.map;
  game.g.decals.push({x:100,y:100});game.g.wreckSmoke.push({x:100,y:100,life:18});game.g.particles.push({smoke:true},{smoke:false});game.nextWave();
  assert.notEqual(game.g.map,first);assert.equal(game.g.map,core.mapForWave(2));
  assert.equal(game.g.decals.length,0);assert.equal(game.g.wreckSmoke.length,0);assert.equal(game.g.particles.length,1);assert.equal(game.elements.get('sector-name').textContent,game.g.map.name);
});

test('cannon projectiles create one immediate, silent-visual vehicle death and preserve wave clear',async()=>{
  const game=createGame();await game.start();const {g}=game,p=g.player;
  const tank=enemy({x:p.x+200,y:p.y,health:1,maxHealth:1,cooldown:0});
  g.enemies=[tank];g.spawnRemaining=0;g.kills=3;
  g.bullets=[{x:tank.x-80,y:tank.y,vx:1000,vy:0,life:1,friendly:true,damage:5,kind:'gun'}];
  game.update(.1);
  assert.equal(g.kills,4);assert.equal(g.combo,1);assert.equal(g.pickups.length,1);
  assert.equal(g.enemies.length,0);assert.ok(g.waveWait>0);
  assert.equal(g.explosions.length,0);assert.equal(g.deathBursts.length,0);assert.equal(g.shake,0);
  assert.equal(g.decals.length,1);assert.equal(g.decals[0].transition,true);assert.ok(g.decals[0].burnTime>0);
  assert.ok(g.particles.some(particle=>particle.persistent));
  assert.deepEqual(game.sound.calls.filter(call=>call.name==='explode').map(call=>call.args),[[{position:{x:tank.x,y:tank.y}}]]);
  const score=g.score;game.hitEnemy(tank,100,'cannon');game.fireEnemy(tank);
  assert.equal(g.score,score);assert.equal(g.kills,4);assert.equal(g.pickups.length,1);
  assert.equal(game.sound.plays.filter(name=>name==='explode').length,1);
});

test('rocket AOE and aircraft cannon kills retain explosions while cannon boss skips its chain',async()=>{
  const game=createGame();await game.start();const {g}=game;
  const tank=enemy({x:700,y:350,health:1,maxHealth:1});
  g.enemies=[tank];g.spawnRemaining=100;
  g.bullets=[{x:700,y:350,vx:0,vy:0,life:.01,friendly:true,damage:100,kind:'rocket',trail:1}];
  game.update(.02);
  assert.equal(g.decals[0].transition,false);assert.ok(g.explosions.length>=2);
  const before=g.explosions.length,drone=enemy({type:'drone',health:1});
  game.hitEnemy(drone,10,'cannon');assert.equal(g.explosions.length,before+1);
  const boss=enemy({type:'boss',health:1,angle:1,turret:2});
  game.sound.setMusicScene('boss');game.hitEnemy(boss,10,'cannon');
  assert.equal(game.sound.scene,'waves');assert.equal(g.explosions.length,before+1);
  assert.equal(g.deathBursts.length,0);assert.equal(g.decals.at(-1).type,'boss');
});

test('a lethally hit vehicle cannot fire, contact the player, or be selected by a rocket',async()=>{
  const game=createGame();await game.start();const {g}=game,p=g.player;
  const dead=enemy({x:p.x+1,y:p.y,health:1,cooldown:0}),live=enemy({x:p.x+250,y:p.y});
  g.enemies=[dead,live];g.spawnRemaining=100;game.hitEnemy(dead,10,'cannon');
  game.fireEnemy(dead);assert.equal(g.bullets.length,0);
  g.pointer.x=dead.x;g.pointer.y=dead.y;game.launchRocket();
  assert.equal(g.bullets[0].target,live);
  game.update(.01);assert.equal(p.health,p.maxHealth);assert.equal(g.enemies.includes(dead),false);
  assert.equal(g.bullets.filter(b=>!b.friendly).length,0);
});

test('coasting uses actual movement, keeps smoke aligned, stops, and freezes on pause',async()=>{
  const game=createGame();await game.start();const {g}=game,p=g.player;
  const tank=enemy({x:p.x+400,y:p.y+80,speed:80,seed:1,angle:.5,turret:1});
  const neighbor=enemy({x:tank.x+30,y:tank.y+10,speed:0});
  g.enemies=[tank,neighbor];g.spawnRemaining=100;game.update(.05);
  const {vx,vy,angle,turret,x,y}=tank;
  assert.ok(Math.hypot(vx,vy)>0);
  game.hitEnemy(tank,100,'cannon');const wreck=g.decals[0],source=g.wreckSmoke[0];
  assert.equal(wreck.vx,vx);assert.equal(wreck.vy,vy);assert.equal(wreck.angle,angle);assert.equal(wreck.turret,turret);
  game.updateEffects(1);assert.ok(Math.abs(wreck.x-(x+vx*.8))<1e-8);assert.ok(Math.abs(wreck.y-(y+vy*.8))<1e-8);
  assert.equal(source.x,wreck.x);assert.equal(source.y,wreck.y);assert.ok(Math.hypot(wreck.vx,wreck.vy)<Math.hypot(vx,vy));
  game.pause();const age=wreck.age;game.frame(1000);game.frame(2000);assert.equal(wreck.age,age);
  game.resume();game.updateEffects(2);const restX=wreck.x,restY=wreck.y;
  assert.equal(wreck.vx,0);assert.equal(wreck.vy,0);game.updateEffects(1);assert.equal(wreck.x,restX);assert.equal(wreck.y,restY);
  const stationary=enemy({x:200,y:200});game.hitEnemy(stationary,100,'cannon');const still=g.decals.at(-1);
  game.updateEffects(3);assert.equal(still.x,200);assert.equal(still.y,200);
});

test('wreck effects are bounded, expire, and clear on wave and restart in low-effects mode',async()=>{
  const game=createGame(true);await game.start();game.settings.effects=false;const {g}=game;
  for(let i=0;i<80;i++)game.hitEnemy(enemy({x:300+i,y:300}),100,'cannon');
  assert.equal(g.decals.length,55);assert.ok(g.particles.length<=180);
  for(let i=0;i<250;i++)game.updateEffects(.1);
  assert.equal(g.wreckSmoke.length,0);assert.equal(g.particles.length,0);assert.ok(g.decals.every(wreck=>wreck.burnTime===0));
  game.nextWave();assert.equal(g.decals.length,0);assert.equal(g.wreckSmoke.length,0);
  game.hitEnemy(enemy(),100,'cannon');await game.start();assert.equal(g.decals.length,0);assert.equal(g.particles.length,0);
});

test('tank smoke screens are selected at spawn, cosmetic, and stop emitting on death',async()=>{
  const game=createGame();await game.start();const random=Math.random;
  try{
    Math.random=()=>0;const screened=game.spawnEnemy('tank');assert.equal(screened.smokeScreen,true);
    Math.random=()=>.99;const normal=game.spawnEnemy('tank'),truck=game.spawnEnemy('rocketSemi');
    assert.equal(normal.smokeScreen,false);assert.equal(truck.smokeScreen,undefined);
    assert.equal(screened.health,normal.health);assert.equal(screened.radius,normal.radius);assert.equal(screened.speed,normal.speed);
    assert.ok(game.g.particles.some(p=>p.screenSmoke));
    game.updateEffects(.5);assert.equal(screened.smokeScreen,true);
    const particles=game.g.particles.filter(p=>p.screenSmoke);
    game.hitEnemy(screened,screened.health,'cannon');
    game.updateEffects(.5);
    assert.ok(game.g.particles.filter(p=>p.screenSmoke).every(p=>particles.includes(p)));
    game.g.enemies=[];game.updateEffects(5);
    assert.equal(game.g.particles.filter(p=>p.screenSmoke).length,0);
    Math.random=()=>0;
    for(let i=0;i<200;i++)game.spawnEnemy('tank');
    assert.ok(game.g.particles.length<=650);
    game.nextWave();assert.equal(game.g.particles.filter(p=>p.screenSmoke).length,0);
    game.spawnEnemy('tank');assert.ok(game.g.particles.some(p=>p.screenSmoke));
    await game.start();assert.equal(game.g.particles.length,0);
  }finally{Math.random=random;}
});

test('coast tracks and stopped transition are independent of time partition',async()=>{
  const game=createGame();await game.start();const {g}=game;
  const simulate=steps=>{
    g.decals=[];g.wreckSmoke=[];g.particles=[];g.treadMarks=[];
    const tank=enemy({x:200,y:200,vx:-40,vy:0,angle:0,leftTrackPhase:2,rightTrackPhase:4,trackPhase:1});
    game.hitEnemy(tank,100,'cannon');const wreck=g.decals[0];
    for(const dt of steps)game.updateEffects(dt);
    return {wreck,marks:g.treadMarks.map(({x,y})=>({x,y}))};
  };
  const coast=simulate([1]).wreck;
  assert.equal(coast.stopped,false);assert.equal(coast.transitionAge,0);assert.ok(coast.burnTime>0);
  assert.notEqual(coast.leftTrackPhase,2);assert.notEqual(coast.rightTrackPhase,4);
  const one=simulate([2.5]),many=simulate([.25,.25,.25,.25,.25,.25,.25,.25,.25,.25]);
  for(const key of ['x','y','leftTrackPhase','rightTrackPhase','trackPhase','transitionAge'])assert.ok(Math.abs(one.wreck[key]-many.wreck[key])<1e-8,key);
  assert.deepEqual(one.marks,many.marks);assert.equal(one.wreck.stopped,true);
  const crossing=simulate([3]).wreck;assert.equal(crossing.transitionAge,.5);assert.ok(crossing.burnTime>0);
  g.decals=[many.wreck];
  const phases=[many.wreck.leftTrackPhase,many.wreck.rightTrackPhase];
  game.updateEffects(5.9);assert.ok(many.wreck.transitionAge<6);assert.ok(many.wreck.burnTime>0);
  game.updateEffects(.1);assert.ok(Math.abs(many.wreck.transitionAge-6)<1e-8);assert.ok(many.wreck.burnTime>0);
  assert.deepEqual([many.wreck.leftTrackPhase,many.wreck.rightTrackPhase],phases);
  const still=enemy({vx:0,vy:0,leftTrackPhase:2,rightTrackPhase:4});
  game.hitEnemy(still,100,'cannon');const wreck=g.decals.at(-1);
  assert.equal(wreck.stopped,true);game.updateEffects(3);
  assert.equal(wreck.transitionAge,3);assert.equal(wreck.leftTrackPhase,2);assert.equal(wreck.rightTrackPhase,4);
});

test('moving and stationary cannon wrecks grow, peak and decline without changing death timing',async()=>{
  for(const vx of [40,0]){
    const game=createGame();await game.start();const {g}=game;g.spawnRemaining=100;
    const tank=enemy({x:300,y:300,vx,vy:0,angle:0,health:1,points:110,leftTrackPhase:2});
    const sounds=game.sound.plays.length;game.hitEnemy(tank,10,'cannon');
    const wreck=g.decals[0],source=g.wreckSmoke[0],initial=wreckFireState(wreck),score=g.score,shake=g.shake;
    assert.equal(g.kills,1);assert.equal(score,110);assert.equal(shake,0);
    assert.deepEqual(game.sound.plays.slice(sounds),['explode']);
    assert.ok(g.particles.some(p=>p.persistent));assert.equal(source.wreck,wreck);
    assert.equal(initial.points.filter(p=>p.strength>0).length,1);
    game.updateEffects(1);
    const growth=wreckFireState(wreck);
    assert.ok(growth.level>initial.level);assert.equal(source.x,wreck.x);assert.equal(source.y,wreck.y);
    if(vx){assert.equal(wreck.stopped,false);assert.equal(wreck.transitionAge,0);assert.notEqual(wreck.leftTrackPhase,2);}
    else {assert.equal(wreck.stopped,true);assert.equal(wreck.transitionAge,1);}
    game.updateEffects(vx?5.5:3);
    const peak=wreckFireState(wreck);assert.equal(wreck.stopped,true);
    assert.ok(peak.level>growth.level);assert.equal(peak.points.filter(p=>p.strength>0).length,5);
    assert.equal(wreck.transitionAge,4);
    game.updateEffects(1.9);assert.ok(wreck.transitionAge<6);
    game.updateEffects(.1);assert.equal(wreck.transitionAge,6);
    game.updateEffects(vx?5.5:8);
    assert.equal(wreck.burnTime,0);assert.equal(wreckFireState(wreck).points.length,0);
    assert.equal(g.kills,1);assert.equal(g.score,score);assert.equal(g.shake,shake);
    assert.deepEqual(game.sound.plays.slice(sounds),['explode']);
    assert.equal(source.x,wreck.x);assert.equal(source.y,wreck.y);
  }
});

test('helicopter leaves world-space dark fume at both outlets, skipped in reduced motion',async()=>{
  const game=createGame();await game.start();game.g.spawnRemaining=0;
  const p=game.g.player;
  game.update(.08);
  const fume=game.g.particles.filter(q=>q.fume&&q.smoke);
  assert.equal(fume.length,2);
  const local=q=>{const dx=q.x-p.x,dy=q.y-p.y,c=Math.cos(p.angle),s=Math.sin(p.angle);return{x:dx*c+dy*s,y:-dx*s+dy*c};};
  assert.ok(fume.every(q=>Math.abs(local(q).x+30)<2&&Math.abs(Math.abs(local(q).y)-8)<2));
  assert.ok(local(fume[0]).y*local(fume[1]).y<0);
  const x=fume[0].x;p.x+=200;game.updateEffects(.1);
  assert.ok(Math.abs(fume[0].x-x)<5);
  const reduced=createGame(true);await reduced.start();reduced.g.spawnRemaining=0;reduced.update(.2);
  assert.equal(reduced.g.particles.filter(q=>q.fume).length,0);
});

test('firing the cannon leaves dark world-space fume at the barrel tip, skipped in reduced motion',async()=>{
  for(const reduced of [false,true]){
    const game=createGame(reduced);await game.start();game.g.spawnRemaining=100;
    const p=game.g.player;p.cooldown=0;p.heat=0;p.overheated=false;
    game.keys.add('Space');game.update(.001);game.keys.delete('Space');
    const fume=game.g.particles.filter(q=>q.gunFume&&q.smoke);
    if(reduced){assert.equal(fume.length,0);continue;}
    assert.equal(fume.length,2);
    for(const q of fume)assert.ok(Math.abs(Math.hypot(q.x-p.x,q.y-p.y)-40)<1e-6);
    const x=fume[0].x;p.x+=300;game.updateEffects(.1);
    assert.ok(Math.abs(fume[0].x-x)<10);
  }
});
