import { clamp, distance, turn, ENEMIES, ARTILLERY, COMMANDER } from '../core.js';
import { TANK_TRACK_HALF_WIDTH, GOLIATH_TRACK_HALF_WIDTH, TREAD_MARK_SPACING, TREAD_MARK_LIFETIME, TREAD_MARK_LIMIT } from './constants.js';

export function updateDroneVisual(e,dt,reduced=false){
  const vx=Number.isFinite(e.vx)?e.vx:0,vy=Number.isFinite(e.vy)?e.vy:0,speed=Math.hypot(vx,vy);
  const fast=e.movingVehicle?.contactDetonation??(e.type==='kamikaze'),rate=fast?6:3.5,response=1-Math.exp(-rate*Math.max(0,dt));
  const heading=Number.isFinite(e.visualHeading)?e.visualHeading:(Number.isFinite(e.angle)?e.angle:0);
  const delta=speed>3?Math.atan2(Math.sin(Math.atan2(vy,vx)-heading),Math.cos(Math.atan2(vy,vx)-heading)):0;
  e.visualHeading=heading+delta*response;
  const bank=reduced?0:clamp(delta,-1,1)*(fast?.18:.14);
  const pitch=reduced?0:clamp(speed/(e.speed||1),0,1)*(fast?.12:.09);
  e.visualBank=(Number.isFinite(e.visualBank)?e.visualBank:0)+(bank-(Number.isFinite(e.visualBank)?e.visualBank:0))*response;
  e.visualPitch=(Number.isFinite(e.visualPitch)?e.visualPitch:0)+(pitch-(Number.isFinite(e.visualPitch)?e.visualPitch:0))*response;
}

export class MovingVehicle {
  constructor(stats){
    this.stats=stats;this.scale=stats.scale;this.airborne=false;this.directionalArmor=true;this.antenna=true;this.contactDetonation=false;
    this.trackOffset=TANK_TRACK_HALF_WIDTH;this.trackLength=16;this.trackWidth=6;this.turnMultiplier=1;
  }

  initialize(e){}
  prepare(e,context){}
  wantsMove(e,target,goal){return distance(e,target)>this.stats.stopDistance||goal!==target;}
  canSeparate(e,moving){return true;}
  canTurn(e,moving){return true;}
  canFire(e){return true;}

  move(e,context){
    const {target,goal,enemies,time,dt,resolveMove,treadMarks,reduced}=context;
    this.prepare(e,context);
    const stats=this.stats,a=Math.atan2(target.y-e.y,target.x-e.x),ga=goal===target?a:Math.atan2(goal.y-e.y,goal.x-e.x);
    const moving=this.wantsMove(e,target,goal),previousAngle=e.angle;
    let vx=moving?Math.cos(ga)*e.speed:0,vy=moving?Math.sin(ga)*e.speed:0;
    if(stats.strafeSpeed){
      vx+=Math.cos(a+Math.PI/2)*Math.sin(time*1.3+e.seed)*stats.strafeSpeed;
      vy+=Math.sin(a+Math.PI/2)*Math.sin(time*1.3+e.seed)*stats.strafeSpeed;
    }
    if(this.canSeparate(e,moving))for(const other of enemies){
      if(e===other||other.health<=0)continue;
      const dist=distance(e,other),min=e.radius+other.radius+9;
      if(dist>0&&dist<min){vx+=(e.x-other.x)/dist*(min-dist)*1.5;vy+=(e.y-other.y)/dist*(min-dist)*1.5;}
    }
    [vx,vy]=resolveMove(e,vx,vy,dt);
    e.vx=vx;e.vy=vy;e.x+=vx*dt;e.y+=vy*dt;
    if(this.airborne)updateDroneVisual(e,dt,reduced);
    const heading=Math.hypot(vx,vy)>3?Math.atan2(vy,vx):a;
    if(this.canTurn(e,moving))e.angle=turn(e.angle,heading,dt*stats.turnRate*this.turnMultiplier);
    if(!this.airborne){
      const forwardDistance=(vx*Math.cos(previousAngle)+vy*Math.sin(previousAngle))*dt;
      const turnDistance=Math.atan2(Math.sin(e.angle-previousAngle),Math.cos(e.angle-previousAngle))*this.trackOffset;
      const leftTrackDistance=forwardDistance+turnDistance,rightTrackDistance=forwardDistance-turnDistance;
      e.leftTrackPhase=((e.leftTrackPhase||0)+leftTrackDistance/this.scale)%6;
      e.rightTrackPhase=((e.rightTrackPhase||0)+rightTrackDistance/this.scale)%6;
      e.trackPhase=((e.trackPhase||0)+forwardDistance/this.scale)%6;
      e.treadDistance=(e.treadDistance||0)+Math.max(Math.abs(leftTrackDistance),Math.abs(rightTrackDistance));
      if(e.treadDistance>=TREAD_MARK_SPACING){
        e.treadDistance%=TREAD_MARK_SPACING;
        treadMarks.push({x:e.x,y:e.y,angle:e.angle,life:TREAD_MARK_LIFETIME,maxLife:TREAD_MARK_LIFETIME,trackOffset:this.trackOffset,trackLength:this.trackLength,trackWidth:this.trackWidth});
        if(treadMarks.length>TREAD_MARK_LIMIT)treadMarks.shift();
      }
    }
  }

  draw(renderer,c,e,char){
    c.fillStyle='#14231655';c.fillRect(-22+6,-21+7,47,46);
    renderer.tankTracks(c,e,false,char);renderer.tankHull(c,false,char);
  }
}

export class AAVehicle extends MovingVehicle {
  constructor(stats){super(stats);this.antenna=false;}

  draw(renderer,c,e,char){
    c.fillStyle='#14231655';c.fillRect(-15,-14,42,43);
    renderer.tankTracks(c,e,false,char,{left:-21,right:21,outer:22,inner:12});
    renderer.aaHull(c,char);
  }
}

export class ArtilleryVehicle extends MovingVehicle {
  constructor(stats){super(stats);this.antenna=false;}
  initialize(e){e.artilleryPhase='moving';e.supportLegs=0;e.volleysFired=0;}

  prepare(e,{target,goal,world,dt}){
    e.artilleryPhase??='moving';e.supportLegs??=0;e.volleysFired??=0;
    const inField=e.x>0&&e.x<world.width&&e.y>60&&e.y<world.height;
    const reposition=distance(e,target)>this.stats.stopDistance+(e.artilleryPhase==='moving'?0:ARTILLERY.repositionMargin)||goal!==target||!inField;
    if(reposition&&e.artilleryPhase!=='moving'&&e.artilleryPhase!=='retracting')e.artilleryPhase='retracting';
    if(e.artilleryPhase==='moving'&&!reposition){e.artilleryPhase='deploying';e.cooldown=0;}
    if(e.artilleryPhase==='deploying'){
      e.supportLegs=Math.min(1,e.supportLegs+dt/ARTILLERY.deploymentTime);
      if(e.supportLegs===1){e.artilleryPhase='firing';e.volleysFired=0;e.cooldown=0;}
    }else if(e.artilleryPhase==='retracting'){
      e.supportLegs=Math.max(0,e.supportLegs-dt/ARTILLERY.deploymentTime);
      if(e.supportLegs===0){e.artilleryPhase='moving';e.volleysFired=0;e.cooldown=0;}
    }
  }

  wantsMove(e){return e.artilleryPhase==='moving';}
  canSeparate(e,moving){return moving;}
  canTurn(e,moving){return moving;}
  canFire(e){return e.artilleryPhase==='firing'&&e.supportLegs===1&&Math.hypot(e.vx||0,e.vy||0)===0;}

  draw(renderer,c,e,char){
    renderer.artillerySupports(c,e,char);
    c.fillStyle='#14231655';c.fillRect(-22+6,-21+7,47,46);
    renderer.tankTracks(c,e,false,char);renderer.artilleryHull(c,char);
  }
}

export class GoliathVehicle extends MovingVehicle {
  constructor(stats){
    super(stats);this.antenna=false;this.trackOffset=GOLIATH_TRACK_HALF_WIDTH;this.trackLength=30;this.trackWidth=24;
  }

  draw(renderer,c,e,char){
    c.fillStyle='#14231655';c.fillRect(-22+6,-21+7,47,46);
    renderer.tankTracks(c,e,true,char);renderer.goliathHull(c,char);
  }
}

export class CommanderVehicle extends GoliathVehicle {
  constructor(stats){
    super(stats);this.scale=COMMANDER.scale;this.turnMultiplier=COMMANDER.turnMultiplier;
    this.trackOffset=COMMANDER.trackOffset;this.trackLength=COMMANDER.trackLength;
  }

  prepare(e,{world}){
    if(e.phase==='entry'&&e.x>0&&e.x<world.width&&e.y>60&&e.y<world.height){e.phase='shells';e.cooldown=2;}
  }

  wantsMove(e){return e.phase==='entry'||e.phase==='advance';}
  draw(renderer,c,e,char,t){renderer.commanderHull(c,e,char,t);}
}

export class RocketVehicle extends MovingVehicle {
  constructor(stats){super(stats);this.antenna=false;this.directionalArmor=false;}
  draw(renderer,c,e,char){renderer.rocketHull(c,e,char);}
}

export class DroneVehicle extends MovingVehicle {
  constructor(stats,{dart=false}={}){
    super(stats);this.airborne=true;this.antenna=false;this.directionalArmor=false;this.contactDetonation=dart;
  }
  draw(renderer,c,e,char,t,reduced){renderer.drone(c,e,t,reduced,this.contactDetonation);}
}

export function createVehicle(type,specialBoss=false){
  const stats=ENEMIES[type];
  if(specialBoss)return new CommanderVehicle(stats);
  switch(type){
    case 'tank':return new MovingVehicle(stats);
    case 'aa':return new AAVehicle(stats);
    case 'artillery':return new ArtilleryVehicle(stats);
    case 'boss':return new GoliathVehicle(stats);
    case 'rocketSemi':return new RocketVehicle(stats);
    case 'drone':return new DroneVehicle(stats);
    case 'kamikaze':return new DroneVehicle(stats,{dart:true});
    default:throw new RangeError(`Unknown vehicle type: ${type}`);
  }
}
