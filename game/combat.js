import { environmentFor, environmentGeometry, generateProps } from '../environment.js';
import { TAU, clamp, distance, turn, segmentHitsCircle, armorDamageMultiplier, ENEMIES, WEAPONS, COMMANDER, ROCKET_IGNITION_DELAY } from '../core.js';
import { FLARE_RANGE, FLARE_COOLDOWN, FLARE_DEFLECTION_CHANCE, MISSILE_ALARM_INTERVAL, PLAYER_ACCELERATION, PLAYER_BANK_RESPONSE, PLAYER_DECELERATION, PLAYER_TOUCH_TURN_RATE, PLAYER_TURN_RATE, PLAYER_CANNON_TURN_RATE, ROCKET_RAIL_FORWARD, ROCKET_RAIL_OFFSET, ROCKET_NOZZLE_OFFSET, ROCKET_TRAIL_SPACING, ROCKET_TRAIL_LOW_SPACING, ROCKET_TRAIL_STEP_LIMIT, WRECK_SMOKE_TIME, WRECK_FIRE_TIME, WRECK_STOP_SPEED } from './constants.js';
import { MUZZLE_FUME_OFFSET, HELICOPTER_FUME_INTERVAL, HELICOPTER_FUME_OFFSET, WEAPON_MUZZLE_TIME } from './constants.js';
export { updateDroneVisual } from './vehicles.js';
export function createCombat(runtime){
  const {g,settings,sound,keys,pointer,$,t}=runtime;
  const burst=(...args)=>runtime.burst(...args),explosion=(...args)=>runtime.explosion(...args),float=(...args)=>runtime.float(...args);
  const positionalAudio=source=>{const p=g.player,distanceToSource=distance(source,p);return {pan:clamp((source.x-p.x)/(g.world.width*.35),-1,1),gain:clamp(1-distanceToSource/(g.world.width*.7),.15,1)};};
// Dark gunpowder fume is left in the world at the barrel tip, drifting forward then lingering.
function emitMuzzleFume(){
  const p=g.player,reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!settings.effects||reduced)return;
  const cos=Math.cos(p.cannonAngle),sin=Math.sin(p.cannonAngle);
  for(let i=0;i<2&&g.particles.length<650;i++){
    const n=p.muzzleFumeCount=(p.muzzleFumeCount||0)+1,life=.65+(Math.sin(n*5.7)+1)*.2;
    g.particles.push({x:p.x+cos*MUZZLE_FUME_OFFSET,y:p.y+sin*MUZZLE_FUME_OFFSET,vx:cos*(22+i*10)+Math.sin(n*12.9898)*7,vy:sin*(22+i*10)+Math.sin(n*78.233)*7,
      life,maxLife:life,smoke:true,gunFume:true,smokeVariant:n%3,size:3.2+(Math.sin(n*2.3)+1)*.9});
  }
}
function gun(){
  const p=g.player,w=WEAPONS.gun,a=p.cannonAngle+(Math.random()-.5)*w.spread,speed=w.speed;
  p.cannonShotIndex=((p.cannonShotIndex||0)+1)%5;
  g.bullets.push({x:p.x+Math.cos(a)*39,y:p.y+Math.sin(a)*39,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:w.life,friendly:true,damage:w.damage+(runtime.upgrades.damage||0)*w.damagePerUpgrade,kind:'gun',tracer:g.cannonTracersEnabled!==false&&p.cannonShotIndex===0});
  p.cooldown=w.cooldown*Math.pow(w.cooldownUpgradeFactor,runtime.upgrades.fireRate||0);p.muzzle=w.muzzleTime;p.muzzleSmoke=WEAPON_MUZZLE_TIME;
  p.heat=Math.min(1,p.heat+w.heatPerShot);
  if(p.heat>=1){p.overheated=true;float(t('heat.cooling'),p.x,p.y-55,'#ffb586',true);}
  sound.play('shot',p.x/g.world.width*1.4-.7);
  emitMuzzleFume();
}
const rocketRecharge=()=>WEAPONS.rocket.rechargeTime*Math.pow(WEAPONS.rocket.rechargeUpgradeFactor,runtime.upgrades.rockets||0);
function launchRocket(){
  const p=g.player,w=WEAPONS.rocket;if(g.state!=='playing'||!p.rockets||p.rocketCooldown>0)return;
  let target=null,dist=Infinity;
  for(const e of g.enemies){if(e.health<=0)continue;const d=distance(e,g.touch?p:pointer);if(d<dist){target=e;dist=d;}}
  const a=target?Math.atan2(target.y-p.y,target.x-p.x):p.cannonAngle;
  const railAngle=a+Math.PI/2,side=p.rocketSide;
  p.rocketSide*=-1;
  g.bullets.push({x:p.x+Math.cos(a)*ROCKET_RAIL_FORWARD+Math.cos(railAngle)*ROCKET_RAIL_OFFSET*side,y:p.y+Math.sin(a)*ROCKET_RAIL_FORWARD+Math.sin(railAngle)*ROCKET_RAIL_OFFSET*side,vx:Math.cos(a)*w.launchSpeed,vy:Math.sin(a)*w.launchSpeed,life:w.life,friendly:true,damage:w.damage+(runtime.upgrades.damage||0)*w.damagePerUpgrade,kind:'rocket',target,trail:0,launchAngle:a,launchDelay:ROCKET_IGNITION_DELAY});
  p.rockets--;p.rocketCooldown=w.launchCooldown;sound.play('rocket');runtime.updateHud();
}
function dash(){
  const p=g.player;if(g.state!=='playing'||p.dashCooldown>0)return;
  const move=movement(),len=Math.hypot(move.x,move.y),a=len>.1?Math.atan2(move.y,move.x):p.angle;
  p.vx=Math.cos(a)*850;p.vy=Math.sin(a)*850;p.dashTime=.22;p.invulnerable=.55;p.dashCooldown=3.5*Math.pow(.87,runtime.upgrades.engine||0);
  burst(p.x,p.y,'#b2c382',12,.6);sound.play('dash');
}
function movement(){
  let x=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'))+runtime.joystick.x;
  let y=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'))+runtime.joystick.y;
  const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}return{x,y};
}
function updateCamera(dt,instant=false){
  const {width:W,height:H}=g.world,camera=g.camera,p=g.player;
  camera.zoom=matchMedia('(prefers-reduced-motion: reduce)').matches?1:1.08;
  const x=clamp(p.x-W/(2*camera.zoom),0,W-W/camera.zoom),y=clamp(p.y-H/(2*camera.zoom),0,H-H/camera.zoom);
  const response=instant?1:1-Math.exp(-3*dt);
  camera.x=clamp(camera.x+(x-camera.x)*response,0,W-W/camera.zoom);
  camera.y=clamp(camera.y+(y-camera.y)*response,0,H-H/camera.zoom);
  if(pointer.screenX!==null){pointer.x=camera.x+pointer.screenX/camera.zoom;pointer.y=camera.y+pointer.screenY/camera.zoom;}
}
function hitEnemy(e,damage,source='other',origin){
  if(e.health<=0)return;
  e.health-=damage*armorDamageMultiplier(e,origin);e.hit=.12;
  const ground=!flying(e),cannonWreck=ground&&source==='cannon'&&e.health<=0;
  if(!cannonWreck)burst(e.x,e.y,'#ebd99c',4,.5);
  if(e.specialBoss&&e.health>0){
    const stage=e.health<=e.maxHealth/3?2:e.health<=e.maxHealth*2/3?1:0;
    while((e.damageStage||0)<stage){
      e.damageStage=(e.damageStage||0)+1;e.damageFires??=[];
      e.spotlightFlicker=COMMANDER.spotlightFlickerTime;e.damageSparkTimer=.4;
      for(let i=0;i<3;i++){
        const x=(e.damageStage===1?-42:14)+(i-1)*14+(Math.random()-.5)*6,y=(i%2?1:-1)*(19+Math.random()*5);
        e.damageFires.push({x,y,strength:.55});
        const sx=x*COMMANDER.scale,sy=y*COMMANDER.scale;
        explosion(e.x+sx*Math.cos(e.angle)-sy*Math.sin(e.angle),e.y+sx*Math.sin(e.angle)+sy*Math.cos(e.angle),28+Math.random()*14,.6);
      }
    }
  }
  if(e.health<=0){
    delete e.aaMuzzle;delete e.launchIgnition;delete e.weaponMuzzle;delete e.commanderMuzzle;
    g.kills++;g.combo=g.comboTimer>0?g.combo+1:1;g.comboTimer=4;
    const multiplier=Math.min(5,1+Math.floor(g.combo/3)),points=e.points*multiplier;g.score+=points;
    float(`+${points}${multiplier>1?' ×'+multiplier:''}`,e.x,e.y-35,'#e0efa6',multiplier>1);
    const stats=ENEMIES[e.type];
    if(cannonWreck&&!e.specialBoss)runtime.destructionSound(e.x,e.y);
    else explosion(e.x,e.y,stats.deathExplosion,e.specialBoss?BOSS_EXPLOSION_LIFE*2:e.type==='boss'?BOSS_EXPLOSION_LIFE:undefined);
    if(e.specialBoss){
      const largeBursts=new Set([2+Math.floor(Math.random()*3),7+Math.floor(Math.random()*3),12+Math.floor(Math.random()*3)]);
      for(let i=0;i<15;i++){
        const x=((i%5-2)*24+(Math.random()-.5)*8)*COMMANDER.scale,y=((Math.floor(i/5)-1)*24+(Math.random()-.5)*8)*COMMANDER.scale;
        g.deathBursts.push({x:e.x+x*Math.cos(e.angle)-y*Math.sin(e.angle),y:e.y+x*Math.sin(e.angle)+y*Math.cos(e.angle),size:largeBursts.has(i)?72+Math.random()*28:24+Math.random()*18,life:1.3,delay:.16+i*.13});
      }
    }else if(e.type==='boss'&&!cannonWreck){
      for(let i=0;i<5;i++){
        const a=Math.random()*TAU,distance=10+Math.random()*38;
        g.deathBursts.push({x:e.x+Math.cos(a)*distance,y:e.y+Math.sin(a)*distance,size:58+Math.random()*28,life:BOSS_EXPLOSION_LIFE,delay:(.1+i*.12+Math.random()*.05)*2});
      }
    }
    if(e.type==='kamikaze'&&distance(e,g.player)<stats.explosionRadius+17)damagePlayer(stats.projectileDamage);
    if(e.type==='boss')sound.setMusicScene('waves');
    if(ground){
      let vx=cannonWreck?(e.vx||0):0,vy=cannonWreck?(e.vy||0):0;
      const stopped=Math.hypot(vx,vy)<=WRECK_STOP_SPEED;
      if(stopped)vx=vy=0;
      const wreck={...e,wreck:true,age:0,burnTime:WRECK_FIRE_TIME,transition:cannonWreck,stopped,transitionAge:0,vx,vy,initialVx:vx,initialVy:vy};
      g.decals.push(wreck);if(g.decals.length>55){const removed=g.decals.shift();g.wreckSmoke=g.wreckSmoke.filter(source=>source.wreck!==removed);}
      const smoke={x:e.x,y:e.y,life:WRECK_SMOKE_TIME,timer:0,wreck};
      g.wreckSmoke.push(smoke);runtime.emitWreckSmoke(smoke);
    }
    if(!g.testRange&&(g.kills%4===0||e.type==='boss'))g.pickups.push({x:clamp(e.x,40,g.world.width-40),y:clamp(e.y,120,g.world.height-60),life:25});
  }else sound.play('hit',{position:{x:e.x,y:e.y}});
}
function damagePlayer(amount){
  const p=g.player;if(p.invulnerable>0||g.state!=='playing')return;
  p.health=Math.max(0,p.health-amount*g.plan.damage);p.invulnerable=.65;g.shake=10;g.combo=0;g.comboTimer=0;
  burst(p.x,p.y,'#f5c78d',14);sound.play('damage');
  $('damage-flash').classList.remove('hit');void $('damage-flash').offsetWidth;$('damage-flash').classList.add('hit');
  if(p.health<=25&&p.health>0)runtime.announce(t('hull.repairing'),t('supply.collect'),t('supply.note'),1.8);
  if(p.health<=0){
    if(g.testRange){p.health=p.maxHealth;p.invulnerable=1;p.x=g.world.width*.43;p.y=g.world.height*.52;}
    else runtime.endGame();
  }runtime.updateHud();
}
// Props are plain data from environment.js so missions and generated levels can rebuild them for any map.
const BOSS_EXPLOSION_LIFE=1.3;
function refreshGeometry(){g.geometry=environmentGeometry(environmentFor(g.map),g.world.width,g.world.height,g.map.seed);}
function buildProps(){refreshGeometry();g.props=generateProps(environmentFor(g.map),g.world.width,g.world.height,g.map.seed);}
function damageProp(prop,damage){
  if(prop.destroyed)return;
  prop.health-=damage;prop.hitFlash=.12;
  burst(prop.x,prop.y,prop.type==='sandbags'?'#b9a779':'#c9b27c',3,.2);
  if(prop.health>0)return;
  prop.destroyed=true;prop.scorch=prop.type==='barrel';
  if(prop.hostile){g.score+=prop.points;float(`+${prop.points}`,prop.x,prop.y-20,'#e0efa6');}
  if(prop.type!=='barrel')return;
  explosion(prop.x,prop.y,85);
  for(const e of g.enemies)if(e.health>0&&distance(e,prop)<85+e.radius)hitEnemy(e,40,'other');
  for(const other of g.props)if(!other.destroyed&&distance(other,prop)<85)damageProp(other,2);
}
// Ground units cannot wade through rivers or lakes: they steer to a bridge when water blocks the way
// and are stopped at the shore otherwise. Air units ignore water.
const flying=e=>e.movingVehicle.airborne;
function crossesWater(e,target){
  const w=g.geometry;
  for(let i=1;i<=12;i++){const f=i/12;if(w.inWater(e.x+(target.x-e.x)*f,e.y+(target.y-e.y)*f,e.radius*.5))return true;}
  return false;
}
function groundGoal(e,target){
  const w=g.geometry;
  if(!w||flying(e)||!w.bridges.length||!crossesWater(e,target))return target;
  let best=null,bestCost=Infinity;
  for(const b of w.bridges){const cost=distance(e,b)+distance(b,target);if(cost<bestCost){best=b;bestCost=cost;}}
  const half=best.length/2,ends=[-1,1].map(k=>({x:best.x+Math.cos(best.angle)*half*k,y:best.y+Math.sin(best.angle)*half*k}));
  const [near,far]=distance(e,ends[0])<distance(e,ends[1])?ends:[ends[1],ends[0]];
  return w.onBridge(e.x,e.y)||distance(e,near)<18?far:near;
}
// Water, trees and buildings are solid for ground units; a unit already inside one may still walk out of it.
function groundMove(e,vx,vy,dt){
  const w=g.geometry,r=e.radius*.5,bm=e.radius+22,{width:W,height:H}=g.world;
  if(!w||flying(e))return [vx,vy];
  const treeAt=(x,y)=>w.trees.find(t=>Math.hypot(t.x-x,t.y-y)<t.radius+r);
  // Clearance zones around obstacles: full margin, 60% and the bare footprint. A unit already inside a
  // zone may only move without entering the next, deeper one, so it can slide along walls and back out.
  const at=(x,y,k)=>w.inWater(x,y,r*k)||w.trees.some(t=>Math.hypot(t.x-x,t.y-y)<t.radius+r*k)||w.inBuilding(x,y,bm*k);
  const zone=at(e.x,e.y,1)?(at(e.x,e.y,.6)?(at(e.x,e.y,0)?3:2):1):0;
  // Distance outside the nearest building footprint; used so a unit pressed into a wall may only back away or slide.
  const gap=(x,y)=>w.buildings.reduce((best,b)=>{const cos=Math.cos(-b.angle),sin=Math.sin(-b.angle),dx=x-b.x,dy=y-b.y;return Math.min(best,Math.max(Math.abs(dx*cos-dy*sin)-b.hw,Math.abs(dx*sin+dy*cos)-b.hh));},Infinity);
  const wallOnly=zone===2&&!w.inWater(e.x,e.y,r*.6)&&!w.trees.some(t=>Math.hypot(t.x-e.x,t.y-e.y)<t.radius+r*.6),here=wallOnly?gap(e.x,e.y):0;
  const solid=(x,y)=>x>0&&x<W&&y>0&&y<H&&(zone===3?false:wallOnly?at(x,y,0)||(at(x,y,.6)&&gap(x,y)<here-.01):at(x,y,[1,.6,0][zone]));
  if(!solid(e.x+vx*dt,e.y+vy*dt)){e.detour=0;return [vx,vy];}
  if(!solid(e.x+vx*dt,e.y))return [vx,0];
  if(!solid(e.x,e.y+vy*dt))return [0,vy];
  // Wedged against an obstacle: slide around a tree trunk, or along a wall in a remembered direction.
  const tree=treeAt(e.x+vx*dt,e.y+vy*dt),speed=Math.hypot(vx,vy);
  if(tree){
    const side=Math.sign((e.x-tree.x)*vy-(e.y-tree.y)*vx)||1,nx=-(e.y-tree.y),ny=e.x-tree.x,len=Math.hypot(nx,ny)||1;
    const sx=nx/len*side*speed,sy=ny/len*side*speed;
    if(!solid(e.x+sx*dt,e.y+sy*dt))return [sx,sy];
  }
  if(!e.detour)e.detour=Math.sign(vx*(g.player.y-e.y)-vy*(g.player.x-e.x))||1;
  const px=-vy/(speed||1)*e.detour*speed,py=vx/(speed||1)*e.detour*speed;
  if(!solid(e.x+px*dt,e.y+py*dt))return [px,py];
  return [0,0];
}
function detonate(b){
  explosion(b.x,b.y,135);
  for(const prop of g.props)if(!prop.destroyed&&distance(prop,b)<135)damageProp(prop,4);
  for(const e of g.enemies){const d=distance(e,b);if(d<135+e.radius)hitEnemy(e,b.damage*(1-clamp(d/230,0,.65)),'rocket',b);}
  g.bullets.forEach(other=>{if(!other.friendly&&distance(other,b)<135)other.life=0;});
}
function fireEnemy(e){
  if(e.health<=0||!e.movingVehicle.canFire(e))return;
  if(e.gun)e.gun.fire(e,runtime,positionalAudio(e));
}
function incomingMissile(){
  const p=g.player;let threat=null,nearest=FLARE_RANGE;
  for(const bullet of g.bullets){
    if(bullet.kind!=='enemyRocket'||bullet.life<=0||bullet.decoyed)continue;
    const d=distance(bullet,p),closing=bullet.vx*(p.x-bullet.x)+bullet.vy*(p.y-bullet.y)>0;
    if(closing&&d<nearest){threat=bullet;nearest=d;}
  }
  return threat;
}
function deployFlares(){
  const p=g.player;
  if(g.state!=='playing'||p.flareCooldown>0)return false;
  p.flareCooldown=FLARE_COOLDOWN;
  for(const spread of [-.3,0,.3]){
    const angle=p.angle+Math.PI+spread+(Math.random()-.5)*.24,life=.85;
    const speed=(130+Math.random()*70)*3;
    g.particles.push({x:p.x+Math.cos(angle)*25,y:p.y+Math.sin(angle)*25,vx:p.vx+Math.cos(angle)*speed,vy:p.vy+Math.sin(angle)*speed,life,maxLife:life,color:'#ffc866',size:5,flare:true,flarePhase:Math.random()*TAU,flareWobble:35+Math.random()*40});
  }
  const missile=incomingMissile();
  if(missile&&Math.random()<FLARE_DEFLECTION_CHANCE){
    missile.decoyed=true;missile.decoyTimer=.85;
    missile.decoyX=p.x-Math.cos(p.angle)*48;missile.decoyY=p.y-Math.sin(p.angle)*48;
  }
  sound.play('flare');runtime.updateHud();
  return true;
}
function rocketTrail(b,ox,oy,oldAngle){
  const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  const spacing=settings.effects&&!reduced?ROCKET_TRAIL_SPACING:ROCKET_TRAIL_LOW_SPACING;
  const angle=Math.atan2(b.vy,b.vx),x0=ox-Math.cos(oldAngle)*ROCKET_NOZZLE_OFFSET,y0=oy-Math.sin(oldAngle)*ROCKET_NOZZLE_OFFSET;
  const x1=b.x-Math.cos(angle)*ROCKET_NOZZLE_OFFSET,y1=b.y-Math.sin(angle)*ROCKET_NOZZLE_OFFSET;
  const length=Math.hypot(x1-x0,y1-y0),previous=(b.trailDistance||0)%spacing,limit=settings.effects?650:180;
  let emitted=0;
  for(let at=spacing-previous;at<=length&&emitted<ROCKET_TRAIL_STEP_LIMIT&&g.particles.length<limit;at+=spacing){
    const fraction=at/length,life=.8+Math.random()*.4;
    g.particles.push({x:x0+(x1-x0)*fraction,y:y0+(y1-y0)*fraction,vx:(Math.random()-.5)*8,vy:(Math.random()-.5)*8,life,maxLife:life,smoke:true,exhaust:true,color:'#c1b89b',size:5+Math.random()*3});
    emitted++;
  }
  b.trailDistance=(previous+length)%spacing;
}
// Dark fume is left in the world at both engine outlets, so it trails the helicopter like missile smoke.
function emitHelicopterFume(dt){
  const p=g.player,reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!settings.effects||reduced)return;
  p.fumeTimer=(p.fumeTimer||0)-dt;
  if(p.fumeTimer>0)return;
  p.fumeTimer=HELICOPTER_FUME_INTERVAL;
  const cos=Math.cos(p.angle),sin=Math.sin(p.angle),speed=Math.hypot(p.vx,p.vy)/270;
  for(const side of [-1,1]){
    if(g.particles.length>=650)return;
    // Deterministic jitter keeps cosmetic smoke from consuming gameplay random numbers.
    const n=p.fumeCount=(p.fumeCount||0)+1,jx=Math.sin(n*12.9898)*4,jy=Math.sin(n*78.233)*4,life=.3+(Math.sin(n*4.1)+1)*.08,lx=HELICOPTER_FUME_OFFSET,ly=side*8;
    g.particles.push({x:p.x+lx*cos-ly*sin,y:p.y+lx*sin+ly*cos,vx:-cos*(10+speed*10)+jx,vy:-sin*(10+speed*10)+jy,
      life,maxLife:life,smoke:true,fume:true,smokeVariant:n%3,size:3.6+speed*1.4+(Math.sin(n*2.3)+1)*.6});
  }
}
function update(dt){
  const p=g.player,W=g.world.width,H=g.world.height;g.time+=dt;g.shake=Math.max(0,g.shake-dt*35);
  p.cooldown-=dt;p.invulnerable-=dt;p.dashTime-=dt;p.dashCooldown=Math.max(0,p.dashCooldown-dt);p.flareCooldown=Math.max(0,p.flareCooldown-dt);p.missileAlarm-=dt;p.rocketCooldown-=dt;p.muzzle-=dt;p.muzzleSmoke=Math.max(0,(p.muzzleSmoke||0)-dt);
  const move=movement(),speed=270*Math.pow(1.12,runtime.upgrades.engine||0),response=1-Math.exp(-(Math.hypot(move.x,move.y)>.01?PLAYER_ACCELERATION:PLAYER_DECELERATION)*dt);
  if(p.dashTime<=0){p.vx+=(move.x*speed-p.vx)*response;p.vy+=(move.y*speed-p.vy)*response;}
  p.x=clamp(p.x+p.vx*dt,34,W-34);p.y=clamp(p.y+p.vy*dt,104,H-42);
  if((p.x===34&&p.vx<0)||(p.x===W-34&&p.vx>0))p.vx=0;
  if((p.y===104&&p.vy<0)||(p.y===H-42&&p.vy>0))p.vy=0;
  updateCamera(dt);
  let aimAngle;
  if(g.touch){let nearest=null,near=Infinity;for(const e of g.enemies){if(e.health<=0)continue;const d=distance(p,e);if(d<near){nearest=e;near=d;}}aimAngle=nearest?Math.atan2(nearest.y-p.y,nearest.x-p.x):Math.hypot(move.x,move.y)>.2?Math.atan2(move.y,move.x):p.angle;}
  else aimAngle=Math.atan2(pointer.y-p.y,pointer.x-p.x);
  p.angle=turn(p.angle,aimAngle,dt*(g.touch?PLAYER_TOUCH_TURN_RATE:PLAYER_TURN_RATE));
  p.cannonAngle=turn(p.cannonAngle,aimAngle,dt*PLAYER_CANNON_TURN_RATE);
  const forward=p.vx*Math.cos(p.angle)+p.vy*Math.sin(p.angle);
  const lateral=-p.vx*Math.sin(p.angle)+p.vy*Math.cos(p.angle);
  const tiltResponse=1-Math.exp(-PLAYER_BANK_RESPONSE*dt);
  p.bank+=(clamp(lateral/270,-1,1)*.3-p.bank)*tiltResponse;
  p.pitch+=(clamp(forward/270,-1,1)*.2-p.pitch)*tiltResponse;
  emitHelicopterFume(dt);
  const firing=pointer.down||keys.has('Space');
  if(p.overheated||!firing){p.heat=Math.max(0,p.heat-dt/WEAPONS.gun.coolTime);if(p.overheated&&p.heat===0)p.overheated=false;}
  if(firing&&!p.overheated&&p.cooldown<=0)gun();
  if(p.rockets<p.maxRockets){p.rocketTimer+=dt;const delay=rocketRecharge();if(p.rocketTimer>=delay){p.rockets++;p.rocketTimer=0;}}else p.rocketTimer=0;
  if(g.testRange){
    if(g.enemies.length<g.testRange.maxActive){g.spawnTimer-=dt;if(g.spawnTimer<=0){runtime.spawnEnemy(g.testRange.enemy);g.spawnTimer=g.testRange.interval;}}
  }else if(g.spawnRemaining>0){g.spawnTimer-=dt;if(g.spawnTimer<=0){runtime.spawnEnemy();g.spawnRemaining--;g.spawnTimer=g.plan.interval;}}
  for(const e of g.enemies){
    if(e.health<=0)continue;e.hit=Math.max(0,e.hit-dt);
    const stats=ENEMIES[e.type],a=Math.atan2(p.y-e.y,p.x-e.x),goal=groundGoal(e,p);
    const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    e.movingVehicle.move(e,{target:p,goal,enemies:g.enemies,time:g.time,dt,resolveMove:groundMove,world:g.world,treadMarks:g.treadMarks,reduced});
    if(e.gun)e.gun.update(e,a,dt);
    else{
      e.turret=turn(e.turret,a,dt*stats.turretRate);
      e.cooldown-=dt;e.charge=clamp(1-e.cooldown/.7,0,1);
    }
    if(e.gun&&e.cooldown<=0&&e.x>0&&e.x<W&&e.y>60&&e.y<H)fireEnemy(e);
    if(distance(e,p)<e.radius+22){if(e.movingVehicle.contactDetonation)hitEnemy(e,e.health);else damagePlayer(stats.contactDamage);}
    if(g.state!=='playing')return;
  }
  if(p.health<=p.maxHealth*.25){
    if(!p.lowHealthAlarm){sound.play('lowHealth');p.lowHealthAlarm=true;}
  }else p.lowHealthAlarm=false;
  const missileThreat=incomingMissile();
  if(missileThreat){
    if(p.missileAlarm<=0){sound.play('missileAlert');p.missileAlarm=MISSILE_ALARM_INTERVAL;}
    if(settings.difficulty!=='hard'&&p.flareCooldown<=0)deployFlares();
  }else p.missileAlarm=0;
  for(const b of g.bullets){
    if(b.life<=0)continue;
    let stepDt=dt;
    if(b.kind==='rocket'&&b.launchDelay>0){
      const ejectionDt=Math.min(dt,b.launchDelay);
      b.launchDelay-=ejectionDt;
      b.x+=b.vx*ejectionDt;b.y+=b.vy*ejectionDt;b.life-=ejectionDt;
      if(b.launchDelay>0)continue;
      stepDt-=ejectionDt;
      if(stepDt<=0)continue;
    }
    const ox=b.x,oy=b.y,oldAngle=Math.atan2(b.vy,b.vx);
    if(b.kind==='rocket'){
      if(b.target?.health<=0)b.target=g.enemies.find(e=>e.health>0)||null;
      const speed=Math.min(WEAPONS.rocket.maxSpeed,Math.hypot(b.vx,b.vy)+WEAPONS.rocket.acceleration*stepDt);
      const a=b.target?turn(Math.atan2(b.vy,b.vx),Math.atan2(b.target.y-b.y,b.target.x-b.x),stepDt*WEAPONS.rocket.turnRate):Math.atan2(b.vy,b.vx);
      b.vx=Math.cos(a)*speed;b.vy=Math.sin(a)*speed;
    }else if(b.kind==='enemyRocket'){
      const speed=Math.min(b.maxSpeed,Math.hypot(b.vx,b.vy)+b.acceleration*stepDt);
      if(b.decoyed){b.decoyTimer-=stepDt;if(b.decoyTimer<=0){b.life=0;burst(b.x,b.y,'#ffc866',5,.25);continue;}}
      const target=b.decoyed?{x:b.decoyX,y:b.decoyY}:p;
      const a=turn(Math.atan2(b.vy,b.vx),Math.atan2(target.y-b.y,target.x-b.x),stepDt*b.turn);
      b.vx=Math.cos(a)*speed;b.vy=Math.sin(a)*speed;
    }
    b.x+=b.vx*stepDt;b.y+=b.vy*stepDt;b.life-=stepDt;
    if(b.kind==='rocket'||b.kind==='enemyRocket')rocketTrail(b,ox,oy,oldAngle);
    if(b.friendly){
      let target=null,nearest=Infinity;
      for(const e of g.enemies)if(e.health>0&&segmentHitsCircle(ox,oy,b.x,b.y,e.x,e.y,e.radius+(b.kind==='rocket'?8:2))){const d=Math.hypot(e.x-ox,e.y-oy);if(d<nearest){target=e;nearest=d;}}
      const prop=target?null:g.props.find(q=>!q.destroyed&&segmentHitsCircle(ox,oy,b.x,b.y,q.x,q.y,q.radius+2));
      if(target){b.life=0;if(b.kind==='rocket')detonate(b);else hitEnemy(target,b.damage,b.kind==='gun'?'cannon':'other',{x:target.x-b.vx,y:target.y-b.vy});}
      else if(prop){b.life=0;if(b.kind==='rocket')detonate(b);else damageProp(prop,1);}
      else if(b.kind==='rocket'&&b.life<=0)detonate(b);
    }else if(segmentHitsCircle(ox,oy,b.x,b.y,p.x,p.y,17)){
      if(b.kind==='enemyRocket'||b.kind==='heavyShell'){
        const dx=b.x-ox,dy=b.y-oy,fx=ox-p.x,fy=oy-p.y,a=dx*dx+dy*dy;
        const projection=fx*dx+fy*dy,discriminant=projection*projection-a*(fx*fx+fy*fy-17*17);
        const contact=a>0?clamp((-projection-Math.sqrt(Math.max(0,discriminant)))/a,0,1):0;
        const x=ox+dx*contact,y=oy+dy*contact;
        if(b.kind==='heavyShell')explosion(x,y,55,.45);
        else runtime.missileContact(x,y);
      }
      b.life=0;damagePlayer(b.damage);if(g.state!=='playing')return;
    }
    if(b.x < -90 || b.x > W+90 || b.y < -90 || b.y > H+90)b.life=0;
  }
  g.bullets=g.bullets.filter(b=>b.life>0);g.enemies=g.enemies.filter(e=>e.health>0);
  for(const mark of g.treadMarks)mark.life-=dt;g.treadMarks=g.treadMarks.filter(mark=>mark.life>0);
  for(const warning of g.warnings){
    warning.life-=dt;
    if(warning.life<=0){runtime.flakBurst(warning.x,warning.y);if(distance(warning,p)<warning.radius+17)damagePlayer(warning.damage);if(g.state!=='playing')return;}
  }
  g.warnings=g.warnings.filter(warning=>warning.life>0);
  g.pickups=g.pickups.filter(item=>{
    item.life-=dt;const d=distance(item,p);
    if(d<90&&p.health<p.maxHealth){item.x+=(p.x-item.x)*dt*4;item.y+=(p.y-item.y)*dt*4;}
    if(d<28&&p.health<p.maxHealth){p.health=Math.min(p.maxHealth,p.health+30);float(`+30 ${t('upgrade.repair.detail')}`,p.x,p.y-45);burst(item.x,item.y,'#dbea9b',15);sound.play('pickup');return false;}
    return item.life>0;
  });
  if(!g.testRange&&!g.spawnRemaining&&!g.enemies.length&&!g.warnings.length){
    if(g.specialBossPending){
      g.specialBossPending=false;g.bullets=g.bullets.filter(b=>b.friendly);
      runtime.spawnEnemy('commander');sound.play('alert');sound.setMusicScene('boss');
      runtime.announce(t('wave.bossTag'),t('wave.commanderTitle'),t('wave.commanderNote'),4);
    }else if(g.waveWait<0){g.waveWait=g.decals.some(d=>d.specialBoss)?Math.max(1.4,...g.deathBursts.map(b=>b.delay+b.life)):1.4;g.bullets=g.bullets.filter(b=>b.friendly);g.score+=g.wave*100;float(t('wave.cleared',{score:g.wave*100}),p.x,p.y-65,'#e5f1ac',true);}
    else{g.waveWait-=dt;if(g.waveWait<=0){runtime.showUpgrades();return;}}
  }
  g.comboTimer-=dt;if(g.comboTimer<=0)g.combo=0;
  if(g.bannerTime>0){g.bannerTime-=dt;if(g.bannerTime<=0)$('announcement').classList.remove('visible');}
  g.hudTimer-=dt;if(g.hudTimer<=0){runtime.updateHud();g.hudTimer=.08;}
}
  return {buildProps,refreshGeometry,damageProp,gun,rocketRecharge,launchRocket,dash,movement,updateCamera,hitEnemy,damagePlayer,detonate,fireEnemy,incomingMissile,deployFlares,update};
}
