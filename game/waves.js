import { TAU, enemyType, mapForWave, wavePlan, ENEMIES, COMMANDER } from '../core.js';
import { SCREEN_SMOKE_CHANCE } from './constants.js';
export function createWaves(runtime){
  const {g,settings,renderer,sound,$,pad,t}=runtime;
  const announce=(...args)=>runtime.announce(...args);
function nextWave(){
  g.wave++;g.plan=wavePlan(g.wave,settings.difficulty);g.spawnRemaining=g.plan.count;g.spawnIndex=0;g.spawnTimer=2.4;g.waveWait=-1;
  g.specialBossPending=g.plan.specialBoss;
  g.map=mapForWave(g.wave);g.decals=[];g.treadMarks=[];g.wreckSmoke=[];g.particles=g.particles.filter(particle=>!particle.smoke);renderer.setMap(g.map);runtime.buildProps();
  renderer.mapLabel=t(`map.${g.map.layout}`);$('sector-name').textContent=renderer.mapLabel;
  $('wave').innerHTML=`${t('hud.wave')} <b>${pad(g.wave,2)}</b>`;
  const boss=g.plan.boss&&!g.plan.specialBoss;
  announce(t(boss?'wave.bossTag':'wave.enemyTag'),t(boss?'wave.bossTitle':'wave.title',{wave:pad(g.wave,2)}),`${renderer.mapLabel} · ${t(boss?'wave.bossNote':g.wave===1?'wave.firstNote':'wave.note')}`,3.2);
  sound.play(boss?'alert':'wave');
  if(boss)runtime.spawnEnemy('boss');
  sound.setMusicScene(boss?'boss':'waves');
}
function spawnEnemy(forced){
  const specialBoss=forced==='commander';
  if(specialBoss&&g.map.environment?.time!=='night'){
    g.map={...g.map,environment:{...g.map.environment,time:'night'}};renderer.setMap(g.map);
  }
  const {width:W,height:H}=g.world,p=g.player;let x,y;
  for(let attempt=0;attempt<8;attempt++){
    const side=Math.floor(Math.random()*4);x=side===0?-45:side===1?W+45:60+Math.random()*(W-120);y=side===2?-45:side===3?H+45:110+Math.random()*(H-170);
    if(Math.hypot(x-p.x,y-p.y)>(g.testRange?.distance??300)&&!g.geometry?.inWater(x,y,30))break;
  }
  const type=specialBoss?'boss':forced||enemyType(g.wave,g.spawnIndex++);
  const stats=ENEMIES[type],health=(stats.health+stats.healthPerWave*g.wave)*g.plan.health;
  const enemy={x,y,type,health,maxHealth:health,speed:(stats.speed+Math.min(g.wave*stats.speedPerWave,stats.speedWaveCap))*stats.speedMultiplier,points:stats.points,radius:stats.radius,angle:Math.atan2(p.y-y,p.x-x),turret:0,cooldown:stats.initialCooldown+Math.random()*stats.initialRandom,charge:0,hit:0,seed:Math.random()*TAU};
  if(specialBoss){
    enemy.specialBoss=true;enemy.health*=COMMANDER.healthMultiplier;enemy.maxHealth=enemy.health;
    enemy.speed=COMMANDER.speed;enemy.radius=COMMANDER.radius;enemy.points*=COMMANDER.healthMultiplier;
    enemy.turret=enemy.angle;enemy.cannonAngle=enemy.angle;enemy.phase='entry';enemy.shotsFired=0;
    enemy.damageStage=0;enemy.damageFires=[];
  }
  if(type==='tank'){
    enemy.smokeScreen=Math.random()<SCREEN_SMOKE_CHANCE;
    if(enemy.smokeScreen){enemy.screenSmokeTimer=0;runtime.emitScreenSmoke(enemy);}
  }
  if(type==='artillery'){enemy.artilleryPhase='moving';enemy.supportLegs=0;enemy.volleysFired=0;}
  if(g.testRange){enemy.health*=g.testRange.health;enemy.maxHealth=enemy.health;}
  g.enemies.push(enemy);return enemy;
}
  return {nextWave,spawnEnemy};
}
