import { TAU, clamp, turn, ENEMIES, WEAPONS, ARTILLERY, COMMANDER } from '../core.js';
import { AA_MUZZLE_TIME, WEAPON_MUZZLE_TIME, LAUNCHER_IGNITION_TIME, PLAYER_CANNON_TURN_RATE } from './constants.js';

export class Gun {
  constructor(stats,{forward=0,side=0,tip=30,muzzleTip=33,recoil=2.5,flashSize=10}={}){
    this.stats=stats;this.forward=forward;this.side=side;this.tip=tip;this.muzzleTip=muzzleTip;this.recoil=recoil;this.flashSize=flashSize;
    this.projectileKind='shell';this.sound='enemy';
  }

  initialize(e){}

  update(e,aim,dt){
    e.turret=turn(e.turret,aim,dt*this.stats.turretRate);
    e.cooldown-=dt;e.charge=clamp(1-e.cooldown/.7,0,1);
    for(const key of ['aaMuzzle','commanderMuzzle'])if(e[key]){e[key].life-=dt;if(e[key].life<=0)delete e[key];}
    for(const key of ['weaponMuzzle','launchIgnition'])if(e[key]>0){e[key]-=dt;if(e[key]<=0)delete e[key];}
  }

  position(e,tip,aim=e.turret,side=0){
    return {x:e.x+Math.cos(e.angle)*this.forward-Math.sin(e.angle)*this.side+Math.cos(aim)*tip-Math.sin(aim)*side,
      y:e.y+Math.sin(e.angle)*this.forward+Math.cos(e.angle)*this.side+Math.sin(aim)*tip+Math.cos(aim)*side};
  }

  startMuzzle(e){e.weaponMuzzle=WEAPON_MUZZLE_TIME;}

  interval(e,{g}){
    const stats=this.stats;
    return stats.fireInterval-Math.min(g.wave*stats.fireWaveReduction,stats.fireWaveReductionCap)+Math.random()*stats.fireRandom;
  }

  fire(e,runtime,audio){
    if(e.health<=0)return;
    const {g,sound}=runtime,stats=this.stats,a=e.turret;
    this.startMuzzle(e);
    for(let i=0;i<stats.shotCount;i++){
      const angle=a+(i-(stats.shotCount-1)/2)*stats.spread,speed=stats.projectileSpeed+Math.min(g.wave*stats.projectileSpeedPerWave,stats.projectileSpeedCap);
      const point=this.position(e,this.tip);
      g.bullets.push({...point,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:stats.projectileLife,friendly:false,kind:this.projectileKind,damage:stats.projectileDamage,turn:stats.rocketTurn,acceleration:stats.rocketAcceleration,maxSpeed:stats.rocketMaxSpeed,trail:0});
    }
    e.cooldown=this.interval(e,runtime);
    const point=this.position(e,this.muzzleTip);
    runtime.burst(point.x,point.y,'#f0c185',4,.3);sound.play(this.sound,audio.pan,audio.gain);
  }

  drawWeapon(renderer,c,e,char,frame){renderer.tankTurret(c,e,char,this.recoil,this.flashSize);}

  draw(renderer,c,e,char,{heading=e.angle,time=0,reduced=false}={}){
    c.save();c.translate(this.forward,this.side);c.rotate(e.angle-heading);
    this.drawWeapon(renderer,c,e,char,{time,reduced});c.restore();
  }
}

export class AAGun extends Gun {
  initialize(e){e.burstRemaining=0;}

  fire(e,runtime,audio){
    if(e.health<=0)return;
    const {g,sound}=runtime,p=g.player,stats=this.stats;
    if(!e.burstRemaining)e.burstRemaining=stats.shotCount;
    e.aaMuzzle={barrel:(stats.shotCount-e.burstRemaining)%2,life:AA_MUZZLE_TIME};
    const angle=Math.random()*TAU,range=e.burstRemaining===stats.shotCount?0:Math.sqrt(Math.random())*stats.warningSpread;
    g.warnings.push({x:clamp(p.x+Math.cos(angle)*range,0,g.world.width),y:clamp(p.y+Math.sin(angle)*range,0,g.world.height),life:stats.warningDelay,radius:stats.explosionRadius,damage:stats.projectileDamage});
    e.burstRemaining--;
    e.cooldown=e.burstRemaining?stats.burstInterval:stats.fireInterval+Math.random()*stats.fireRandom;
    const point=this.position(e,this.muzzleTip);
    runtime.burst(point.x,point.y,'#f0c185',4,.3);
    sound.play('aa',audio.pan,audio.gain);
  }

  drawWeapon(renderer,c,e,char,{time}){renderer.aaGun(c,e,char,time);}
}

export class ArtilleryGun extends Gun {
  constructor(stats){super(stats,{forward:ARTILLERY.turretOffset,tip:ARTILLERY.barrelTip,muzzleTip:ARTILLERY.barrelTip});}
  initialize(e){e.artilleryPhase??='firing';e.volleysFired=0;}

  update(e,aim,dt){
    super.update(e,aim,dt);
    if(e.artilleryPhase==='reloading'&&e.cooldown<=0){e.artilleryPhase='firing';e.volleysFired=0;}
    if(e.artilleryPhase!=='firing')e.charge=0;
  }

  fire(e,runtime,audio){
    if(e.health<=0||e.artilleryPhase!=='firing')return;
    super.fire(e,runtime,audio);
    e.volleysFired++;
    if(e.volleysFired===ARTILLERY.volleyCount){e.artilleryPhase='reloading';e.cooldown*=ARTILLERY.volleyCount;}
  }

  drawWeapon(renderer,c,e,char){renderer.artilleryTurret(c,e,char);}
}

export class RocketGun extends Gun {
  constructor(stats){super(stats);this.projectileKind='enemyRocket';this.sound='missile';}
  startMuzzle(e){e.launchIgnition=LAUNCHER_IGNITION_TIME;}
  interval(e,runtime){return super.interval(e,runtime)*this.stats[`${runtime.settings.difficulty}Interval`];}
  drawWeapon(renderer,c,e,char,{reduced}){renderer.rocketGun(c,e,char,reduced);}
}

export class DroneGun extends Gun {
  draw(renderer,c,e,char,{heading=e.angle,reduced=false}={}){
    if(e.wreck||char||reduced||e.health<=0||!(e.weaponMuzzle>0))return;
    c.save();c.translate(this.forward+10.4,this.side);c.rotate((e.turret??e.angle)-heading);
    renderer.muzzleEffect(c,e.weaponMuzzle,0,5,.075);c.restore();
  }
}

export class CommanderGun extends Gun {
  initialize(e){e.phase??='shells';e.shotsFired=0;e.cannonAngle=e.turret;}

  update(e,aim,dt){
    super.update(e,aim,dt);
    e.cannonAngle=turn(e.cannonAngle??e.turret,aim,dt*PLAYER_CANNON_TURN_RATE);
  }

  fire(e,runtime,audio){
    if(e.health<=0||e.phase==='entry')return;
    const {g,sound}=runtime,stats=this.stats,a=e.turret;
    if(e.phase==='advance'){e.phase='shells';e.shotsFired=0;}
    if(e.phase==='reload'){e.phase='cannon';e.shotsFired=0;}
    const cannon=e.phase==='cannon',barrel=e.shotsFired%2,aim=cannon?(e.cannonAngle??a):a;
    const side=(barrel?1:-1)*(cannon?COMMANDER.cannonOffset:9)*COMMANDER.scale,forward=(cannon?39:COMMANDER.shellBarrelTip)*COMMANDER.scale;
    const angle=aim+(cannon?(Math.random()-.5)*WEAPONS.gun.spread:0);
    const speed=cannon?WEAPONS.gun.speed:(stats.projectileSpeed+Math.min(g.wave*stats.projectileSpeedPerWave,stats.projectileSpeedCap))*COMMANDER.shellSpeedMultiplier;
    const point=this.position(e,forward,aim,side);
    g.bullets.push({...point,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:cannon?WEAPONS.gun.life:stats.projectileLife,friendly:false,kind:cannon?'enemyGun':'heavyShell',damage:cannon?WEAPONS.gun.damage:stats.projectileDamage*COMMANDER.shellDamageMultiplier});
    e.commanderMuzzle={barrel,cannon,life:WEAPON_MUZZLE_TIME};e.shotsFired++;
    if(e.shotsFired===(cannon?COMMANDER.cannonCount:COMMANDER.shellCount)){
      e.phase=cannon?'advance':'reload';e.cooldown=cannon?COMMANDER.advanceTime:COMMANDER.reloadTime;
    }else e.cooldown=cannon?WEAPONS.gun.cooldown:COMMANDER.shellInterval;
    runtime.burst(point.x,point.y,'#ffd28b',cannon?6:14,cannon?.35:.65);
    sound.play(cannon?'shot':'enemy',audio.pan,audio.gain);
  }

  drawWeapon(renderer,c,e,char){renderer.commanderTurret(c,e,char);}
}

export function createGun(type,specialBoss=false){
  const stats=ENEMIES[type];
  if(specialBoss)return new CommanderGun(stats);
  switch(type){
    case 'tank':return new Gun(stats);
    case 'aa':return new AAGun(stats);
    case 'artillery':return new ArtilleryGun(stats);
    case 'boss':return new Gun(stats,{recoil:4,flashSize:17});
    case 'rocketSemi':return new RocketGun(stats);
    case 'drone':return new DroneGun(stats);
    case 'kamikaze':return null;
    default:throw new RangeError(`Unknown gun type: ${type}`);
  }
}
