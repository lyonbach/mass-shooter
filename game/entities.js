import { TAU, COMMANDER } from '../core.js';
import { WRECK_COAST_TIME, WRECK_FIRE_TIME, WRECK_SMOKE_TIME, SCREEN_SMOKE_INTERVAL, SCREEN_SMOKE_LOW_INTERVAL, SCREEN_SMOKE_LIFETIME, SCREEN_SMOKE_DRIFT, TREAD_MARK_SPACING, TREAD_MARK_LIFETIME, TREAD_MARK_LIMIT } from './constants.js';
export function createEntities(runtime){
  const {g,settings,sound}=runtime;
function burst(x,y,color,count=10,force=1,smoke=false){
  const limit=settings.effects?650:180,amount=settings.effects?count:Math.ceil(count*.45);
  for(let i=0;i<amount&&g.particles.length<limit;i++){
    const a=Math.random()*TAU,speed=(30+Math.random()*170)*force,life=smoke?1.1+Math.random():.15+Math.random()*.5;
    g.particles.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life,maxLife:life,color,size:smoke?6+Math.random()*12:1+Math.random()*2.5,smoke});
  }
}
function fireSplinters(x,y,size){
  const limit=settings.effects?650:180,amount=settings.effects?Math.ceil(10+size/12):Math.ceil(5+size/24);
  for(let i=0;i<amount&&g.particles.length<limit;i++){
    const a=Math.random()*TAU,speed=(100+Math.random()*240)*size/75,life=.16+Math.random()*.28;
    g.particles.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life,maxLife:life,color:Math.random()<.45?'#fff0ad':'#ff9b59',size:.8+Math.random()*1.7,fireSplinter:true});
  }
}
function destructionSound(x,y,gain=1){sound.play('explode',{position:{x,y},gain});}
function explosion(x,y,size=75,life=.65,gain=1){
  g.explosions.push({x,y,size,life,maxLife:life});burst(x,y,'#f9c57f',46,size/65);burst(x,y,'#28342a',16,.45,true);fireSplinters(x,y,size);
  g.shake=Math.max(g.shake,size/6);destructionSound(x,y,gain);
}
function flakBurst(x,y){
  const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  const limit=settings.effects?650:180,full=settings.effects&&!reduced;
  const add=(particle,essential=false)=>{
    if(g.particles.length<limit)g.particles.push(particle);
    else if(essential&&g.particles.length){const index=g.particles.findIndex(p=>!p.screenSmoke&&!p.flakFlash);g.particles[index<0?0:index]=particle;}
  };
  if(!reduced)add({x,y,vx:0,vy:0,life:.1,maxLife:.1,flakFlash:true,size:12},true);
  for(let i=0;i<(full?4:2);i++){
    const a=i*TAU/4+.4,life=1.15+i*.12;
    add({x:x+Math.cos(a)*4,y:y+Math.sin(a)*4,vx:Math.cos(a)*9,vy:Math.sin(a)*9-5,life,maxLife:life,smoke:true,flakSmoke:true,smokeVariant:i%3,size:10+i},reduced&&i===0);
  }
  if(full)for(let i=0;i<5;i++){
    const a=i*TAU/5+.25,life=.18;
    add({x,y,vx:Math.cos(a)*90,vy:Math.sin(a)*90,life,maxLife:life,color:'#ffc078',size:1.5});
  }
  g.shake=Math.max(g.shake,3);destructionSound(x,y);
}
function missileContact(x,y){
  const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  const limit=settings.effects?650:180;
  const flash={x,y,vx:0,vy:0,life:.18,maxLife:.18,contactFlash:true,size:reduced?10:15};
  if(g.particles.length<limit)g.particles.push(flash);
  else {
    const index=g.particles.findIndex(p=>!p.screenSmoke&&!p.flakFlash&&!p.contactFlash&&!p.flare);
    if(index>=0)g.particles[index]=flash;
  }
  if(!settings.effects||reduced)return;
  for(let i=0;i<4&&g.particles.length<limit;i++){
    const a=i*TAU/4+.4;
    g.particles.push({x,y,vx:Math.cos(a)*70,vy:Math.sin(a)*70,life:.16,maxLife:.16,color:'#ffd28b',size:1.5});
  }
  for(let i=0;i<2&&g.particles.length<limit;i++){
    g.particles.push({x,y,vx:(i?1:-1)*12,vy:-15,life:.55,maxLife:.55,smoke:true,smokeVariant:i,size:7});
  }
}
function float(text,x,y,color='#e2eda9',big=false){g.floaters.push({text,x,y,life:1.2,color,big});}
function emitWreckSmoke(source){
  const limit=settings.effects?650:180;
  for(let i=0;i<(settings.effects?2:1)&&g.particles.length<limit;i++){
    const life=4.5+Math.random()*2;
    g.particles.push({x:source.x+(Math.random()-.5)*16,y:source.y-12,vx:(Math.random()-.5)*16,vy:-22-Math.random()*28,life,maxLife:life,smoke:true,persistent:true,color:'#111812b8',size:14+Math.random()*12});
  }
  source.timer=settings.effects?.32:.6;
}
function emitScreenSmoke(tank){
  const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  const limit=settings.effects?650:180;
  if(g.particles.length<limit){
    const a=tank.angle,life=SCREEN_SMOKE_LIFETIME*(.85+Math.random()*.3),side=(Math.random()-.5)*28,spread=(Math.random()-.5)*8;
    g.particles.push({x:tank.x-Math.cos(a)*15-Math.sin(a)*side,y:tank.y-Math.sin(a)*15+Math.cos(a)*side,
      vx:-Math.cos(a)*SCREEN_SMOKE_DRIFT-Math.sin(a)*spread,vy:-Math.sin(a)*SCREEN_SMOKE_DRIFT+Math.cos(a)*spread-3,
      life,maxLife:life,smoke:true,screenSmoke:true,size:15+Math.random()*7});
  }
  tank.screenSmokeTimer=(settings.effects&&!reduced?SCREEN_SMOKE_INTERVAL:SCREEN_SMOKE_LOW_INTERVAL);
}
function emitCommanderFume(tank,dt){
  const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!settings.effects||reduced)return;
  tank.engineFumeTimer=(tank.engineFumeTimer||0)-dt;
  if(tank.engineFumeTimer>0)return;
  tank.engineFumeTimer=.09;
  const cos=Math.cos(tank.angle),sin=Math.sin(tank.angle),forward=COMMANDER.exhaustForward*COMMANDER.scale;
  for(const side of [-1,1]){
    if(g.particles.length>=650)return;
    const n=tank.engineFumeCount=(tank.engineFumeCount||0)+1,lateral=side*COMMANDER.exhaustOffset*COMMANDER.scale,life=.8+(Math.sin(n*4.1)+1)*.2;
    g.particles.push({x:tank.x+forward*cos-lateral*sin,y:tank.y+forward*sin+lateral*cos,
      vx:-cos*22+Math.sin(n*12.9898)*4,vy:-sin*22-5+Math.sin(n*78.233)*4,
      life,maxLife:life,smoke:true,tankFume:true,smokeVariant:n%3,size:5+(Math.sin(n*2.3)+1)*1.5});
  }
}
function emitCommanderSparks(tank,dt){
  if(!tank.damageFires?.length)return;
  const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!settings.effects||reduced)return;
  tank.damageSparkTimer=(tank.damageSparkTimer||0)-dt;
  if(tank.damageSparkTimer>0)return;
  tank.damageSparkTimer=1.3+Math.random()*2;
  const point=tank.damageFires[Math.floor(Math.random()*tank.damageFires.length)],x=point.x*COMMANDER.scale,y=point.y*COMMANDER.scale;
  burst(tank.x+x*Math.cos(tank.angle)-y*Math.sin(tank.angle),tank.y+x*Math.sin(tank.angle)+y*Math.cos(tank.angle),'#ffc66d',5,.35);
}
function updateEffects(dt){
  for(const burst of g.deathBursts)burst.delay-=dt;
  const pendingBursts=[];
  for(const burst of g.deathBursts){if(burst.delay<=0)explosion(burst.x,burst.y,burst.size,burst.life);else pendingBursts.push(burst);}
  g.deathBursts=pendingBursts;
  for(const decal of g.decals){
    if(!decal.wreck)continue;
    const oldAge=decal.age||0,newAge=oldAge+dt;
    if(decal.transition&&!decal.stopped){
      const start=Math.min(oldAge,WRECK_COAST_TIME),end=Math.min(newAge,WRECK_COAST_TIME);
      const travel=(end-start)-(end*end-start*start)/(2*WRECK_COAST_TIME);
      const dx=decal.initialVx*travel,dy=decal.initialVy*travel,x=decal.x,y=decal.y;
      decal.x+=dx;decal.y+=dy;
      const vehicle=decal.movingVehicle;
      const forward=dx*Math.cos(decal.angle)+dy*Math.sin(decal.angle),scale=vehicle?.scale??(decal.specialBoss?COMMANDER.scale:decal.type==='boss'?1.8:1);
      decal.leftTrackPhase=((decal.leftTrackPhase??decal.trackPhase??0)+forward/scale)%6;
      decal.rightTrackPhase=((decal.rightTrackPhase??decal.trackPhase??0)+forward/scale)%6;
      decal.trackPhase=((decal.trackPhase||0)+forward/scale)%6;
      const distance=Math.abs(forward),previous=decal.treadDistance||0;
      for(let at=TREAD_MARK_SPACING-previous;at<=distance;at+=TREAD_MARK_SPACING){
        const boss=decal.type==='boss',fraction=at/distance;
        g.treadMarks.push({x:x+dx*fraction,y:y+dy*fraction,angle:decal.angle,life:TREAD_MARK_LIFETIME,maxLife:TREAD_MARK_LIFETIME,trackOffset:vehicle?.trackOffset??(decal.specialBoss?COMMANDER.trackOffset:boss?36:18),trackLength:vehicle?.trackLength??(decal.specialBoss?COMMANDER.trackLength:boss?30:16),trackWidth:vehicle?.trackWidth??(boss?24:6)});
        if(g.treadMarks.length>TREAD_MARK_LIMIT)g.treadMarks.shift();
      }
      decal.treadDistance=(previous+distance)%TREAD_MARK_SPACING;
      decal.vx=end===WRECK_COAST_TIME?0:decal.initialVx*(1-end/WRECK_COAST_TIME);decal.vy=end===WRECK_COAST_TIME?0:decal.initialVy*(1-end/WRECK_COAST_TIME);
      if(end===WRECK_COAST_TIME){decal.stopped=true;decal.transitionAge=newAge-WRECK_COAST_TIME;}
    }else if(decal.transition&&decal.stopped){
      decal.transitionAge+=dt;
    }
    decal.age=newAge;decal.burnTime=Math.max(0,WRECK_FIRE_TIME-newAge);
    if(decal.type==='artillery'&&decal.burnTime>0){
      decal.ammoSparkTimer=(decal.ammoSparkTimer??.5)-dt;
      decal.ammoExplosionTimer=(decal.ammoExplosionTimer??(1.5+Math.random()))-dt;
      if(decal.ammoSparkTimer<=0||decal.ammoExplosionTimer<=0){
        const forward=-26+Math.random()*12,side=(Math.random()<.5?-1:1)*(9+Math.random()*5);
        const x=decal.x+Math.cos(decal.angle)*forward-Math.sin(decal.angle)*side,y=decal.y+Math.sin(decal.angle)*forward+Math.cos(decal.angle)*side;
        if(decal.ammoSparkTimer<=0){
          if(settings.effects&&!(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches))burst(x,y,'#ffc66d',7,.55);
          decal.ammoSparkTimer=.6+Math.random()*1.1;
        }
        if(decal.ammoExplosionTimer<=0){
          explosion(x,y,16+Math.random()*12,.35,.5);
          decal.ammoExplosionTimer=1.8+Math.random()*2.2;
        }
      }
    }
  }
  for(const enemy of g.enemies){
    if(enemy.health<=0)continue;
    if(enemy.specialBoss){
      enemy.spotlightFlicker=Math.max(0,(enemy.spotlightFlicker||0)-dt);
      emitCommanderFume(enemy,dt);emitCommanderSparks(enemy,dt);
    }
    if(!enemy.smokeScreen)continue;
    enemy.screenSmokeTimer-=dt;
    if(enemy.screenSmokeTimer<=0)emitScreenSmoke(enemy);
  }
  for(const source of g.wreckSmoke){
    if(source.wreck&&!g.decals.includes(source.wreck)){source.life=0;continue;}
    if(source.wreck){source.x=source.wreck.x;source.y=source.wreck.y;}
    source.life-=dt;source.timer-=dt;
    if(source.life>0&&source.timer<=0){emitWreckSmoke(source);source.timer*=1+(1-source.life/WRECK_SMOKE_TIME)*2;}
    const wreck=source.wreck;
    if(wreck&&wreck.type!=='artillery'&&wreck.burnTime>0&&settings.effects&&!(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches)){
      wreck.sparkTimer=(wreck.sparkTimer??(1+(wreck.seed||0)*.3))-dt;
      if(wreck.sparkTimer<=0){burst(wreck.x,wreck.y,'#ffb65f',3,.35);wreck.sparkTimer=1.5+(wreck.seed||0)*.25;}
    }
  }
  g.wreckSmoke=g.wreckSmoke.filter(source=>source.life>0&&(!source.wreck||g.decals.includes(source.wreck)));
  for(const p of g.particles){
    const drag=p.screenSmoke?.12:p.persistent?0.35:p.smoke?1.5:3;
    const flareDrift=p.flare?Math.sin(g.time*15+p.flarePhase)*p.flareWobble:0;
    p.x+=(p.vx+flareDrift)*dt;p.y+=(p.vy+flareDrift*.55)*dt;p.vx*=Math.exp(-dt*drag);p.vy*=Math.exp(-dt*drag);p.life-=dt;
  }
  g.particles=g.particles.filter(p=>p.life>0);
  for(const e of g.explosions)e.life-=dt;g.explosions=g.explosions.filter(e=>e.life>0);
  for(const f of g.floaters){f.y-=dt*30;f.life-=dt;}g.floaters=g.floaters.filter(f=>f.life>0);
}
  return {burst,fireSplinters,destructionSound,explosion,flakBurst,missileContact,float,emitWreckSmoke,emitScreenSmoke,updateEffects};
}
