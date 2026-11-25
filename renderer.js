import { TAU, seededRandom, clamp, ENEMIES, COMMANDER, ARTILLERY } from './core.js';
import { environmentFor, environmentGeometry, TIME_OF_DAY } from './environment.js';
import { WRECK_TRANSITION_TIME, WRECK_COAST_TIME, WRECK_FIRE_TIME, ROCKET_NOZZLE_OFFSET, AA_MUZZLE_TIME, AA_FLASH_TIME, LAUNCHER_IGNITION_TIME, WEAPON_MUZZLE_TIME } from './game/constants.js';
import { createVehicle } from './game/vehicles.js';
import { createGun } from './game/guns.js';

const path = (c, points, fill, stroke) => {
  c.beginPath(); points.forEach(([x,y], i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.stroke(); }
};
function ellipse(c,x,y,rx,ry,color) { c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill(); }
const SCREEN_SMOKE_RENDER={radius:1.15,behind:.65,front:.45,stops:[[0,'#f8f9f4f2'],[.45,'#e8ebe6d0'],[1,'#d7dedb00']]};
const SMOKE_STOPS={
  screen:SCREEN_SMOKE_RENDER.stops,
  wreck:[[0,'#202820cc'],[.45,'#171e18aa'],[1,'#11181200']],
  explosion:[[0,'#606858cc'],[.45,'#394539aa'],[1,'#28342a00']],
  flak:[[0,'#30342fd9'],[.45,'#42463eb0'],[1,'#30383000']],
  exhaust:[[0,'#e4d9bccc'],[.45,'#b5aa91aa'],[1,'#938c7900']],
  fume:[[0,'#c4c8c4d0'],[.5,'#b4b9b4ac'],[1,'#a8aea800']],
  tankFume:[[0,'#101310e8'],[.5,'#181c18c0'],[1,'#20242000']],
  gunFume:[[0,'#3a3e3ad8'],[.5,'#4a4f4aa8'],[1,'#575c5700']]
};
const SMOKE_SHAPES=[[1,1],[1,.78],[.78,1]],SMOKE_PUFF_SIZE=64;
const WRECK_FIRE_PEAK_TRANSITION=4;
const WRECK_FIRE_POINTS={
  rocketSemi:[[-20,0],[12,-3],[-8,-5],[2,5],[20,3]],
  boss:[[-23,0],[-5,-4],[17,3],[-15,8],[9,-8]],
  commander:[[0,0],[-54,-38],[54,38],[-54,38],[54,-38],[-26,0],[26,0],[0,-31],[0,31],[-26,-31],[26,31],[-26,31],[26,-31],[-52,0],[52,0]],
  default:[[-14,0],[0,-3],[12,3],[-7,7],[8,-7]]
};

export function wreckFireState(d){
  if(!(d.burnTime>0))return {level:0,points:[]};
  const age=Math.max(0,d.age||0),transition=d.transition?Math.max(0,d.transitionAge||0):age;
  const growth=.2+.3*clamp(age/WRECK_COAST_TIME,0,1)+.5*clamp(transition/WRECK_FIRE_PEAK_TRANSITION,0,1);
  const sincePeak=Math.max(0,transition-WRECK_FIRE_PEAK_TRANSITION);
  const peakAge=age-sincePeak;
  const decline=clamp(1-sincePeak/Math.max(.001,WRECK_FIRE_TIME-peakAge),0,1);
  const level=growth*decline,locations=d.specialBoss?WRECK_FIRE_POINTS.commander:WRECK_FIRE_POINTS[d.type]||WRECK_FIRE_POINTS.default;
  const random=d.specialBoss?seededRandom(Math.floor((d.seed||0)*1000000)):null;
  const points=locations.map(([x,y],i)=>({x:x+(random?(random()-.5)*8:0),y:y+(random?(random()-.5)*7:0),strength:i===0?level:clamp((level-(d.specialBoss?i*.025:[0,.28,.46,.62,.75][i]))/.2,0,1)*level}));
  return {level,points};
}

export class Renderer {
  constructor(canvas, settings) { this.canvas=canvas; this.ctx=canvas.getContext('2d',{alpha:false}); this.settings=settings; this.smokePuffs=new Map(); this.tankShades=new WeakMap(); }
  tankShade(c){
    let shade=this.tankShades.get(c);
    if(!shade){shade=c.createLinearGradient(0,-16,0,16);shade.addColorStop(0,'#ffffff25');shade.addColorStop(.5,'#ffffff00');shade.addColorStop(1,'#10181055');this.tankShades.set(c,shade);}
    return shade;
  }
  smoke(c,p,alpha=1){
    const progress=clamp(1-p.life/p.maxLife,0,1),radius=p.size*(.8+progress*1.5)*(p.screenSmoke?SCREEN_SMOKE_RENDER.radius:1);
    if(!(radius>0))return;
    const kind=p.screenSmoke?'screen':p.tankFume?'tankFume':p.fume?'fume':p.gunFume?'gunFume':p.exhaust?'exhaust':p.persistent?'wreck':p.flakSmoke?'flak':'explosion';
    if(p.smokeVariant===undefined)p.smokeVariant=Math.abs(Math.floor(p.x*13+p.y*7))%SMOKE_SHAPES.length;
    const variant=((p.smokeVariant%SMOKE_SHAPES.length)+SMOKE_SHAPES.length)%SMOKE_SHAPES.length,key=`${kind}:${variant}`;
    let puff=this.smokePuffs.get(key);
    if(!puff){
      puff=(this.canvas.ownerDocument||document).createElement('canvas');puff.width=puff.height=SMOKE_PUFF_SIZE;
      const pc=puff.getContext('2d'),[sx,sy]=SMOKE_SHAPES[variant],half=SMOKE_PUFF_SIZE/2;
      pc.translate(half,half);pc.scale(sx,sy);
      const gradient=pc.createRadialGradient(0,0,0,0,0,half);
      for(const [stop,color] of SMOKE_STOPS[kind])gradient.addColorStop(stop,color);
      pc.fillStyle=gradient;pc.fillRect(-half,-half,SMOKE_PUFF_SIZE,SMOKE_PUFF_SIZE);
      this.smokePuffs.set(key,puff);
    }
    c.save();c.globalAlpha*=alpha*(p.persistent?Math.min(1,.2+progress*4)*Math.min(1,(1-progress)*2):Math.sin(Math.PI*progress));
    c.drawImage(puff,p.x-radius,p.y-radius,radius*2,radius*2);c.restore();
  }
  wreckFlameTexture(){
    if(!this.wreckFlame){
      const canvas=(this.canvas.ownerDocument||document).createElement('canvas');canvas.width=canvas.height=64;
      const pc=canvas.getContext('2d'),gradient=pc.createRadialGradient(32,32,0,32,32,32);
      gradient.addColorStop(0,'#fff6c9ed');gradient.addColorStop(.24,'#ffd77acb');
      gradient.addColorStop(.52,'#f77c38aa');gradient.addColorStop(.78,'#b7352066');gradient.addColorStop(1,'#922b1a00');
      pc.fillStyle=gradient;pc.fillRect(0,0,64,64);this.wreckFlame=canvas;
    }
    return this.wreckFlame;
  }
  weaponFlameTexture(){
    if(!this.launchFlame){
      const canvas=(this.canvas.ownerDocument||document).createElement('canvas');canvas.width=canvas.height=64;
      const pc=canvas.getContext('2d'),gradient=pc.createRadialGradient(32,32,0,32,32,32);
      gradient.addColorStop(0,'#fff6c9ee');gradient.addColorStop(.24,'#ffd77acc');
      gradient.addColorStop(.53,'#f77c38a0');gradient.addColorStop(.78,'#b7352060');gradient.addColorStop(1,'#a32a1a00');
      pc.fillStyle=gradient;pc.fillRect(0,0,64,64);this.launchFlame=canvas;
    }
    return this.launchFlame;
  }
  tracerGlowTexture(){
    if(!this.tracerGlow){
      const canvas=(this.canvas.ownerDocument||document).createElement('canvas');
      canvas.width=78;canvas.height=18;
      const pc=canvas.getContext('2d');
      pc.strokeStyle='#ffae5960';pc.lineWidth=6;pc.lineCap='round';
      pc.shadowColor='#ffae59';pc.shadowBlur=6;
      pc.beginPath();pc.moveTo(9,9);pc.lineTo(69,9);pc.stroke();
      this.tracerGlow=canvas;
    }
    return this.tracerGlow;
  }
  gunProjectile(c,b){
    c.save();
    if(this.settings.effects){
      c.save();c.translate(b.x,b.y);c.rotate(Math.atan2(b.vy,b.vx));
      c.drawImage(this.tracerGlowTexture(),-23,-3,26,6);c.restore();
    }
    this.bullet(c,b,'#ff7043');
    c.restore();
  }
  bullet(c,b,color){
    if(b.kind==='enemyGun'||b.kind==='enemyRifle'||b.kind==='heavyShell'){
      const heavy=b.kind==='heavyShell',rifle=b.kind==='enemyRifle',length=heavy?26:rifle?6:10,speed=Math.hypot(b.vx,b.vy)||1;
      c.strokeStyle=heavy?'#ffbb6c':'#f4f1ab';c.lineWidth=heavy?5:2;c.lineCap='round';
      c.beginPath();c.moveTo(b.x-b.vx/speed*length,b.y-b.vy/speed*length);c.lineTo(b.x,b.y);c.stroke();
      if(heavy)ellipse(c,b.x,b.y,5,5,'#ffe1a5');
      return;
    }
    c.strokeStyle=color||(b.friendly?'#f4f1ab':'#ffac77');c.lineWidth=b.friendly?2:3;c.lineCap='round';c.beginPath();const len=b.friendly?20:13,sp=Math.hypot(b.vx,b.vy)||1;c.moveTo(b.x-b.vx/sp*len,b.y-b.vy/sp*len);c.lineTo(b.x,b.y);c.stroke();if(!b.friendly)ellipse(c,b.x,b.y,3,3,'#ffd2a5');
  }
  flareTexture(){
    if(!this.flareGlow){
      const canvas=(this.canvas.ownerDocument||document).createElement('canvas');canvas.width=canvas.height=64;
      const pc=canvas.getContext('2d'),gradient=pc.createRadialGradient(32,32,0,32,32,32);
      gradient.addColorStop(0,'#fffbe0');gradient.addColorStop(.42,'#fff0b7');
      gradient.addColorStop(.62,'#ffc079cc');gradient.addColorStop(.86,'#ff9b5970');gradient.addColorStop(1,'#ff9b5900');
      pc.fillStyle=gradient;pc.fillRect(0,0,64,64);this.flareGlow=canvas;
    }
    return this.flareGlow;
  }
  flare(c,p){
    if(!(p.life>0&&p.maxLife>0))return;
    const radius=p.size*3.4;
    c.save();c.globalAlpha=clamp(p.life/p.maxLife,0,1);
    c.strokeStyle=p.color;c.lineWidth=p.size;c.beginPath();c.moveTo(p.x,p.y);c.lineTo(p.x-p.vx*.025,p.y-p.vy*.025);c.stroke();
    c.drawImage(this.flareTexture(),p.x-radius,p.y-radius,radius*2,radius*2);
    c.restore();
  }
  muzzleEffect(c,life,tip,size,flashTime,glow=false){
    if(!(life>0))return;
    const progress=clamp(1-life/WEAPON_MUZZLE_TIME,0,1);
    if(this.settings.effects)this.smoke(c,{x:tip+size*.35,y:0,size:size*.35,life,maxLife:WEAPON_MUZZLE_TIME,exhaust:true,smokeVariant:0},.55);
    if(progress*WEAPON_MUZZLE_TIME<flashTime){
      if(glow){
        const flash={muzzle:flashTime-progress*WEAPON_MUZZLE_TIME,muzzleSmoke:0};
        c.save();c.translate(tip-42*.8,0);c.scale(.8,.8);
        this.playerMuzzle(c,flash);c.restore();
        for(const side of [-1,1]){
          c.save();c.translate(tip-4,side*3);c.rotate(side*Math.PI/2);c.scale(.28,.28);c.translate(-42,0);c.globalAlpha*=.6;
          this.playerMuzzle(c,flash);c.restore();
        }
        return;
      }
      c.save();c.globalAlpha*=clamp((flashTime-progress*WEAPON_MUZZLE_TIME)/flashTime,0,1);
      c.drawImage(this.weaponFlameTexture(),tip-size*.2,-size*.55,size*1.6,size*1.1);c.restore();
    }
  }
  playerMuzzleTexture(){
    if(!this.playerFlash){
      const canvas=(this.canvas.ownerDocument||document).createElement('canvas');
      canvas.width=100;canvas.height=48;
      const pc=canvas.getContext('2d');
      pc.scale(2,2);pc.translate(-40,12);
      const gradient=pc.createRadialGradient(57,0,1,57,0,34);
      gradient.addColorStop(0,'#fffbe0ff');gradient.addColorStop(.24,'#ffe9a6ed');
      gradient.addColorStop(.58,'#ff9b4ac0');gradient.addColorStop(1,'#b7392300');
      const shape=[[42,-10],[88,0],[42,10],[56,0]];
      for(const [x,y] of [[-.6,0],[.6,0],[0,-.6],[0,.6]]){
        pc.save();pc.translate(x,y);pc.globalAlpha=.16;path(pc,shape,gradient);pc.restore();
      }
      path(pc,shape,gradient);
      this.playerFlash=canvas;
    }
    return this.playerFlash;
  }
  playerGlowTexture(){
    if(!this.playerFlashGlow){
      const canvas=(this.canvas.ownerDocument||document).createElement('canvas');canvas.width=canvas.height=64;
      const pc=canvas.getContext('2d'),gradient=pc.createRadialGradient(32,32,0,32,32,32);
      gradient.addColorStop(0,'#fff3c8d0');gradient.addColorStop(.3,'#ffb25ca0');
      gradient.addColorStop(.65,'#ff7a2a40');gradient.addColorStop(1,'#ff6a1a00');
      pc.fillStyle=gradient;pc.fillRect(0,0,64,64);this.playerFlashGlow=canvas;
    }
    return this.playerFlashGlow;
  }
  playerMuzzle(c,p){
    const life=p.muzzleSmoke||0;
    if(this.settings.effects&&life>0)this.smoke(c,{x:48,y:0,size:5,life,maxLife:WEAPON_MUZZLE_TIME,exhaust:true,smokeVariant:0},.4);
    if(!(p.muzzle>0))return;
    // Additive halo around the barrel tip, strongest at the moment of firing.
    c.save();c.globalCompositeOperation='lighter';c.globalAlpha*=.35+.65*clamp(p.muzzle/.045,0,1);
    c.drawImage(this.playerGlowTexture(),42-48,-48,96,96);c.restore();
    c.drawImage(this.playerMuzzleTexture(),40,-12,50,24);
  }
  launcherIgnition(c,life){
    const texture=this.weaponFlameTexture();
    const progress=clamp(1-life/LAUNCHER_IGNITION_TIME,0,1),alpha=Math.min(1,life/.08);
    c.save();c.globalAlpha*=alpha;
    c.drawImage(texture,24,-7,22+progress*5,14);
    c.drawImage(texture,27,-4,12,8);
    if(this.settings.effects)this.smoke(c,{x:30+progress*7,y:0,size:5,life,maxLife:LAUNCHER_IGNITION_TIME,exhaust:true,smokeVariant:0},.55);
    c.restore();
  }
  missile(c,b){
    const powered=b.kind==='enemyRocket'||!(b.launchDelay>0);
    c.save();c.translate(b.x,b.y);c.rotate(Math.atan2(b.vy,b.vx));
    if(powered)ellipse(c,-14,0,9,5,'#ff9b4838');
    path(c,[[-8,-2],[-12,-6],[-4,-3],[3,-3],[6,0],[3,3],[-4,3],[-12,6],[-8,2]],b.friendly?'#9caa85':'#a35c4c');
    path(c,[[-9,-2],[2,-2],[7,0],[2,2],[-9,2]],b.friendly?'#e4dfb2':'#ee9875');
    c.fillStyle=b.friendly?'#fff5cd':'#ffc0a0';c.fillRect(-6,-2,8,1);
    c.fillStyle=b.friendly?'#849078':'#843f35';c.fillRect(-7,-2,2,4);
    if(powered){path(c,[[-ROCKET_NOZZLE_OFFSET,-2],[-19,0],[-ROCKET_NOZZLE_OFFSET,2]],'#ff9b48');path(c,[[-ROCKET_NOZZLE_OFFSET,-1],[-15,0],[-ROCKET_NOZZLE_OFFSET,1]],'#fff1aa');}
    c.restore();
  }
  resize(world, rect, map) {
    this.world=world;
    const dpr=Math.min(window.devicePixelRatio||1,this.settings.effects?2:1.3);
    this.canvas.width=Math.round(rect.width*dpr);this.canvas.height=Math.round(rect.height*dpr);
    this.scale=this.canvas.width/world.width;
    this.terrain=document.createElement('canvas');this.terrain.width=Math.ceil(world.width);this.terrain.height=Math.ceil(world.height);
    this.setMap(map);
  }
  setMap(map) { this.map=map;this.makeTerrain(); }
  makeTerrain() {
    const c=this.terrain.getContext('2d'),W=this.world.width,H=this.world.height,r=seededRandom(this.map.seed);
    const g=c.createLinearGradient(0,0,W,H);g.addColorStop(0,this.map.colors[0]);g.addColorStop(.5,this.map.colors[1]);g.addColorStop(1,this.map.colors[2]);c.fillStyle=g;c.fillRect(0,0,W,H);
    // Grain is baked into the terrain once rather than regenerated each frame.
    for(let i=0;i<W*H/80;i++){c.fillStyle=r()>.5?'#c6bd8a0b':'#17291c0b';c.fillRect(r()*W,r()*H,r()*4+1,r()*2+1);}
    for(let i=0;i<38;i++){
      let x=r()*W,y=r()*H;c.strokeStyle=i%2?'#a4a57b0e':'#263b2915';c.lineWidth=10+r()*45;
      c.beginPath();c.moveTo(x-130,y+80);c.bezierCurveTo(x-90,y-40,x+50,y+80,x+190,y-70);c.stroke();
    }
    // Broad colored landforms distinguish each sector without obscuring combat.
    for(let i=0;i<16;i++){
      const x=r()*W,y=r()*H,rx=35+r()*140,ry=15+r()*65;
      c.globalAlpha=.12;ellipse(c,x,y,rx,ry,this.map.accent);c.globalAlpha=1;
    }
    // Fine, broken contour rings add a surveyed topographic-map texture.
    for(let i=0;i<25;i++){
      const x=r()*W,y=r()*H,rx=18+r()*55,ry=12+r()*32,rotation=r()*Math.PI;
      c.save();c.translate(x,y);c.rotate(rotation);
      for(let ring=0;ring<4;ring++){
        c.beginPath();c.ellipse(0,0,rx+ring*12,ry+ring*8,0,0,TAU);
        c.strokeStyle=ring===0?'#d9d4ad20':'#d9d4ad12';c.lineWidth=ring===0?1.4:1;c.stroke();
      }
      c.restore();
    }
    if(this.map.layout==='canyon'){
      for(let i=0;i<7;i++){
        const x=W*(.06+i*.15);c.beginPath();c.moveTo(x,-30);c.bezierCurveTo(x+100,H*.25,x-100,H*.6,x+50,H+30);
        c.strokeStyle=i%2?'#563d4b44':'#e5a07844';c.lineWidth=25+i*5;c.stroke();
      }
    }
    const env=this.env=environmentFor(this.map),geo=this.geometry=environmentGeometry(env,W,H,this.map.seed),density=env.density;
    this.drawWater(c,geo);this.drawRoads(c,geo);this.drawBridges(c,geo);
    // Craters and scorched ground, kept clear of roads, water and bases.
    for(let i=0,n=Math.round(14*density.craters);i<n;i++){
      const x=r()*W,y=r()*H,size=9+r()*20;if(geo.blocked(x,y,{margin:size}))continue;
      ellipse(c,x+2,y+3,size*1.25,size*.8,'#0c140e30');ellipse(c,x,y,size*1.12,size*.72,'#2a2c20aa');ellipse(c,x,y,size*.85,size*.54,'#15190f');ellipse(c,x-size*.2,y-size*.12,size*.5,size*.3,'#06080466');
      c.strokeStyle='#b8b08a30';c.lineWidth=1.2;c.beginPath();c.ellipse(x,y,size*1.12,size*.72,0,Math.PI*.9,Math.PI*1.9);c.stroke();
    }
    // Rock clusters and ground cover, kept low contrast so projectiles read clearly.
    for(let i=0,n=Math.round(150*density.rocks);i<n;i++){
      const x=r()*W,y=r()*H,size=2+r()*11;
      if(geo.blocked(x,y,{margin:size,roads:false}))continue;
      if(r()>.44){ellipse(c,x+3,y+4,size*1.2,size*.65,'#24322630');ellipse(c,x,y,size,size*.63,'#46523a');ellipse(c,x-2,y-2,size*.62,size*.4,'#7e8461');
        if(r()>.6)for(let j=0;j<2;j++){const s=size*(.4+r()*.3),ox=(r()-.5)*size*2.4,oy=(r()-.5)*size;ellipse(c,x+ox+2,y+oy+2,s*1.1,s*.6,'#24322630');ellipse(c,x+ox,y+oy,s,s*.63,'#4c583f');}}
      else {for(let j=0;j<3;j++)ellipse(c,x+r()*9,y+r()*9,size*.5,size*.35,'#35463250');}
    }
    this.drawVegetation(c,geo,env,r);
    // Concrete landing area.
    c.save();c.translate(geo.landing.x,geo.landing.y);c.rotate(-.13);c.fillStyle='#1b281c22';c.fillRect(-92,-83,200,186);c.fillStyle='#85867244';c.fillRect(-99,-94,188,176);
    c.strokeStyle='#d2d1a44d';c.lineWidth=2;c.strokeRect(-87,-82,164,152);c.beginPath();c.arc(-5,-6,57,0,TAU);c.stroke();
    c.fillStyle='#d1d0a45c';c.font='bold 63px Arial';c.textAlign='center';c.fillText('H',-5,16);
    c.font='8px monospace';c.fillStyle='#c4c69a77';c.fillText('NIGHTHAWK / 07',-5,63);c.restore();
    for(const k of geo.compounds)this.compound(c,k.x,k.y,k.scale);
    this.drawLighting(c,env,W,H);
    // Sector grid and survey marks.
    c.strokeStyle='#e4edb009';c.lineWidth=1;
    for(let x=0;x<W;x+=100){c.beginPath();c.moveTo(x,0);c.lineTo(x,H);c.stroke();}
    for(let y=0;y<H;y+=100){c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke();}
    c.font='8px monospace';c.fillStyle='#d3d6b533';c.textAlign='left';
    for(let x=90;x<W;x+=260)for(let y=150;y<H-100;y+=250){c.fillText('+',x,y);c.fillText(`${Math.round(x/10)}.${Math.round(y/10)}`,x+10,y+2);}
    const spots=[[.69,.85],[.5,.12],[.08,.55],[.4,.95],[.9,.5],[.6,.1],[.3,.5],[.25,.1],[.9,.95]],spot=spots.find(([x,y])=>!geo.compounds.some(k=>Math.abs(k.x-W*x)<260*k.scale+120&&Math.abs(k.y-H*y)<170*k.scale+60)&&!geo.blocked(W*x,H*y,{margin:40}))||spots[0];
    c.save();c.translate(W*spot[0],H*spot[1]);c.rotate(-.2);c.font='bold 45px Arial';c.fillStyle='#d7d8b620';c.fillText(this.mapLabel||this.map.name,0,0);c.restore();
  }
  traceLine(c,points){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));}
  drawWater(c,geo){
    for(const river of geo.rivers){
      this.traceLine(c,river.points);c.lineCap='round';c.lineJoin='round';
      c.strokeStyle='#2c5a4a55';c.lineWidth=river.width+22;c.stroke();
      c.strokeStyle='#356b7b';c.lineWidth=river.width;c.stroke();c.strokeStyle='#75b5b566';c.lineWidth=river.width*.67;c.stroke();
      c.strokeStyle='#c2dfc655';c.lineWidth=2;c.setLineDash([25,35]);c.stroke();c.setLineDash([]);c.lineCap='butt';
    }
    for(const lake of geo.lakes){
      c.save();c.translate(lake.x,lake.y);c.rotate(lake.rotation);
      ellipse(c,0,0,lake.rx+14,lake.ry+12,'#8c8a5f44');ellipse(c,0,0,lake.rx+5,lake.ry+4,'#2c5a4a88');
      ellipse(c,0,0,lake.rx,lake.ry,'#356b7b');ellipse(c,-lake.rx*.08,-lake.ry*.1,lake.rx*.72,lake.ry*.68,'#75b5b566');
      c.restore();
    }
  }
  drawRoads(c,geo){
    c.lineCap='round';c.lineJoin='round';
    for(const road of geo.roads){
      this.traceLine(c,road.points);
      if(road.edge){c.strokeStyle=road.edge;c.lineWidth=road.shoulder;c.stroke();}
      c.strokeStyle=road.surface;c.lineWidth=road.width;c.stroke();
      if(this.env.weather.type==='rain'){c.strokeStyle='#0a121a40';c.lineWidth=road.width-6;c.stroke();c.strokeStyle='#9fb8c422';c.lineWidth=3;c.stroke();c.lineWidth=road.width;}
      if(road.centre){c.strokeStyle='#b4ac7733';c.lineWidth=2;c.setLineDash([18,24]);c.stroke();c.setLineDash([]);}
    }
    c.lineCap='butt';
  }
  drawBridges(c,geo){
    for(const b of geo.bridges){
      c.save();c.translate(b.x,b.y);c.rotate(b.angle);
      const L=b.length/2,Wd=b.width/2;
      c.fillStyle='#10201a40';c.fillRect(-L+6,-Wd+5,b.length,b.width);
      c.fillStyle='#6b6a55';c.fillRect(-L,-Wd-5,b.length,b.width+10);
      c.fillStyle='#4a4d40';c.fillRect(-L,-Wd,b.length,b.width);
      c.strokeStyle='#9a96757a';c.lineWidth=3;c.beginPath();c.moveTo(-L,-Wd-5);c.lineTo(L,-Wd-5);c.moveTo(-L,Wd+5);c.lineTo(L,Wd+5);c.stroke();
      c.strokeStyle='#2b2e2640';c.lineWidth=1;for(let i=-L+8;i<L;i+=12){c.beginPath();c.moveTo(i,-Wd);c.lineTo(i,Wd);c.stroke();}
      c.restore();
    }
  }
  drawVegetation(c,geo,env,r){
    const W=this.world.width,H=this.world.height,types=env.vegetation,sh=TIME_OF_DAY[env.time].shadow,n=Math.round(60*env.density.vegetation);
    const woods=types.filter(k=>k==='tree'||k==='pine');
    // Ground cover and lone plants scatter freely; trees gather into groves with a few loners.
    for(let i=0;i<n;i++){
      const x=r()*W,y=r()*H,kind=types[i%types.length],s=5+r()*9;
      if(woods.includes(kind)||geo.blocked(x,y,{margin:s}))continue;
      if(kind==='deadtree'){c.strokeStyle='#3a3126';c.lineWidth=1.6;c.beginPath();for(let j=0;j<4;j++){const a=j*1.6+r(),l=s*1.2;c.moveTo(x,y);c.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l*.7);}c.stroke();ellipse(c,x,y,1.8,1.4,'#2a231b');}
      else if(kind==='cactus'){c.strokeStyle='#4f6d3a';c.lineWidth=2.4;c.lineCap='round';c.beginPath();c.moveTo(x,y+s*.4);c.lineTo(x,y-s*.5);c.moveTo(x-s*.5,y);c.lineTo(x-s*.5,y-s*.35);c.moveTo(x-s*.5,y);c.lineTo(x,y);c.stroke();c.lineCap='butt';}
      else{for(let j=0;j<5;j++){c.strokeStyle=j%2?'#5d6b3f':'#6e7a4b';c.lineWidth=1.2;c.beginPath();c.moveTo(x,y);c.lineTo(x+(j-2)*s*.35,y-s*.8+Math.abs(j-2)*2);c.stroke();}}
    }
    for(const t of geo.trees)this.treeShadow(c,t,sh);
    for(const t of geo.trees)this.treeCanopy(c,t);
  }
  treeShadow(c,t,sh){
    const len=Math.hypot(sh[0],sh[1])/10,ox=sh[0]*t.size*.06,oy=sh[1]*t.size*.06;
    c.fillStyle='#0a140c40';c.beginPath();c.ellipse(t.x+ox,t.y+oy,t.size*(.95+len*.1),t.size*.85,Math.atan2(sh[1],sh[0]),0,TAU);c.fill();
  }
  // Canopies are built from overlapping leaf clumps, dark underneath and lit from the upper left.
  treeCanopy(c,t){
    const {x,y,size:s,seed}=t,rnd=seededRandom(Math.floor(seed*1e6)+1);
    if(t.kind==='pine'){
      const shades=['#1f3a28','#27492f','#305a38','#3c6c42'],tones=['#16281c','#1f3a28','#27492f','#305a38'];
      for(let layer=0;layer<4;layer++){
        const radius=s*(1-layer*.2),points=12;c.beginPath();
        for(let i=0;i<points*2;i++){const a=i*Math.PI/points+seed*3,rr=i%2?radius*.55:radius;c.lineTo(x+Math.cos(a)*rr-layer*.6,y+Math.sin(a)*rr-layer*.6);}
        c.closePath();c.fillStyle=shades[layer];c.fill();c.strokeStyle=tones[layer];c.lineWidth=.8;c.stroke();
      }
      ellipse(c,x-s*.12,y-s*.12,s*.12,s*.12,'#8fb06a');
      return;
    }
    const dark=['#1e3a24','#22422a'],mid=['#2f5a30','#386636'],light=['#4b7d3f','#5a9046'];
    const lobes=7+Math.floor(rnd()*3);
    for(let i=0;i<lobes;i++){const a=i/lobes*TAU+rnd()*.5,d=s*.55;ellipse(c,x+Math.cos(a)*d,y+Math.sin(a)*d,s*.5,s*.46,dark[i%2]);}
    ellipse(c,x,y,s*.78,s*.74,dark[1]);
    for(let i=0;i<lobes;i++){const a=i/lobes*TAU+rnd()*.6,d=s*.38;ellipse(c,x-s*.08+Math.cos(a)*d,y-s*.1+Math.sin(a)*d,s*.4,s*.37,mid[i%2]);}
    for(let i=0;i<5;i++){const a=rnd()*TAU,d=rnd()*s*.35;ellipse(c,x-s*.22+Math.cos(a)*d,y-s*.25+Math.sin(a)*d,s*.2,s*.17,light[i%2]);}
    for(let i=0;i<4;i++)ellipse(c,x-s*.3+rnd()*s*.5,y-s*.35+rnd()*s*.5,s*.07,s*.06,'#8fb468');
    for(let i=0;i<3;i++)ellipse(c,x+(rnd()-.3)*s*.9,y+(rnd()-.1)*s*.9,s*.1,s*.08,'#17301c');
  }
  drawLighting(c,env,W,H){
    const tod=TIME_OF_DAY[env.time];
    if(tod.tintAlpha){c.globalAlpha=tod.tintAlpha;c.fillStyle=tod.tint;c.fillRect(0,0,W,H);c.globalAlpha=1;}
    if(env.time==='night'||env.time==='dusk'){
      const lamp=(x,y,r)=>{const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,env.time==='night'?'#ffd98a88':'#ffd98a44');g.addColorStop(1,'#ffd98a00');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);};
      for(const k of this.geometry.compounds)for(const [sx,sy] of [[-1,-1],[1,-1],[-1,1],[1,1]])lamp(k.x+sx*100*k.scale,k.y+sy*80*k.scale,70*k.scale+20);
      const l=this.geometry.landing;for(const [sx,sy] of [[-1,-1],[1,-1],[-1,1],[1,1]])lamp(l.x+sx*80,l.y+sy*75,60);
    }
    const v=c.createRadialGradient(W/2,H/2,Math.min(W,H)*.35,W/2,H/2,Math.hypot(W,H)*.55);
    v.addColorStop(0,'#00000000');v.addColorStop(1,`rgba(4,8,6,${tod.vignette})`);c.fillStyle=v;c.fillRect(0,0,W,H);
  }
  prop(c,p,t) {
    c.save();c.translate(p.x,p.y);c.rotate(p.rot);
    const shadow=this.env?TIME_OF_DAY[this.env.time].shadow:[6,8],flash=p.hitFlash>0;
    if(p.hitFlash>0)p.hitFlash=Math.max(0,p.hitFlash-1/60);
    if(p.destroyed){
      c.rotate(-p.rot);
      if(p.scorch){ellipse(c,0,0,p.radius*2.1,p.radius*1.6,'#0a0c0877');ellipse(c,0,0,p.radius*1.3,p.radius,'#050604aa');}
      else ellipse(c,0,0,p.radius*1.3,p.radius*.9,'#1a1c1488');
      for(let i=0;i<5;i++){const a=i*1.3+p.id;ellipse(c,Math.cos(a)*p.radius*.8,Math.sin(a)*p.radius*.6,2.5,1.6,p.type==='sandbags'?'#6e654a':p.type==='crate'?'#4a3a26':'#3a3d36');}
      c.restore();return;
    }
    c.save();c.rotate(-p.rot);c.translate(shadow[0]*.55,shadow[1]*.55);c.globalAlpha=.4;
    if(p.type==='barrel')ellipse(c,0,0,p.radius,p.radius,'#0a120c');else c.fillRect(-p.radius,-p.radius*.7,p.radius*2,p.radius*1.4);
    c.restore();
    const damaged=p.health<p.maxHealth;
    if(p.type==='crate'){
      const r=p.radius;c.fillStyle=flash?'#e8d9aa':'#7a6240';c.fillRect(-r,-r,r*2,r*2);c.fillStyle=flash?'#fff1c8':'#95794e';c.fillRect(-r+2,-r+2,r*2-4,r*2-4);
      c.strokeStyle='#5a4630';c.lineWidth=1.5;c.beginPath();c.moveTo(-r+2,-r+2);c.lineTo(r-2,r-2);c.moveTo(r-2,-r+2);c.lineTo(-r+2,r-2);c.stroke();
      c.strokeStyle='#4b3a27';c.lineWidth=1;c.strokeRect(-r,-r,r*2,r*2);
      if(damaged){c.strokeStyle='#1a140c';c.beginPath();c.moveTo(-r*.6,-r);c.lineTo(-r*.2,0);c.lineTo(-r*.7,r*.5);c.stroke();}
    }else if(p.type==='barrel'){
      const r=p.radius;c.rotate(-p.rot);
      ellipse(c,0,0,r,r,flash?'#ff9d80':'#9c3d2e');ellipse(c,0,0,r*.78,r*.78,flash?'#ffd0b0':'#c25a44');
      c.strokeStyle='#5c2118';c.lineWidth=1;c.beginPath();c.arc(0,0,r*.5,0,TAU);c.stroke();
      c.fillStyle='#e6c04a';c.fillRect(-r*.35,-1,r*.7,2);
    }else{
      const r=p.radius;
      for(let i=0;i<3;i++){const x=-r+i*r*.67;ellipse(c,x+r*.34,-2,r*.42,r*.34,flash?'#e8dcb4':'#a89868');ellipse(c,x+r*.34,3,r*.42,r*.3,flash?'#f4ecc8':'#b8a878');}
      c.strokeStyle='#6c6044';c.lineWidth=1;c.beginPath();c.moveTo(-r,0.5);c.lineTo(r,0.5);c.stroke();
    }
    c.restore();
  }
  // Sparse twinkling highlights on rivers and lakes; frozen under reduced motion and skipped without effects.
  waterGlints(c,t) {
    const geo=this.geometry;if(!this.settings.effects||!geo||(!geo.rivers.length&&!geo.lakes.length))return;
    const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches,time=reduced?0:t;
    const rain=this.env.weather.type==='rain'?this.env.weather.intensity:0;
    c.save();c.strokeStyle='#e8f6f0';c.lineWidth=1.2;c.lineCap='round';
    const glint=(x,y,i)=>{
      const phase=Math.sin(time*1.7+i*2.3),a=Math.max(0,phase)**3;
      if(a<.05)return;c.globalAlpha=a*.55;c.beginPath();c.moveTo(x-4,y);c.lineTo(x+4,y);c.stroke();
      if(rain){const k=(time*1.4+i*.37)%1;c.globalAlpha=(1-k)*.35;c.beginPath();c.ellipse(x+9,y+5,2+k*7,1+k*3,0,0,TAU);c.stroke();}
    };
    geo.rivers.forEach((river,ri)=>river.points.forEach(([x,y],i)=>{if(i%4===0)glint(x+Math.sin(i*1.9)*river.width*.3,y+Math.cos(i*2.7)*10,i+ri*50);}));
    geo.lakes.forEach((lake,li)=>{for(let i=0;i<10;i++){const a=i*2.4+li,d=Math.sqrt((i+1)/10)*.8;glint(lake.x+Math.cos(a+lake.rotation)*lake.rx*d,lake.y+Math.sin(a)*lake.ry*d,i+li*20);}});
    c.restore();
  }
  // Weather is an overlay in world space, so it scrolls with the camera. It is skipped when effects are off.
  weather(c,g,t,dt) {
    const env=this.env;if(!this.settings.effects||!env||env.weather.type==='none'||!env.weather.intensity)return;
    const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches,time=reduced?0:t;
    const {type,intensity,wind}=env.weather,cam=g.camera,W=g.world.width,H=g.world.height,zoom=cam.zoom||1;
    const left=cam.x,top=cam.y,vw=W/zoom,vh=H/zoom;
    c.save();
    if(type==='fog'||type==='dust'){
      const colour=type==='fog'?'220,232,226':'196,160,106',count=Math.round(9*intensity+3),cell=260;
      this.hazeSprite??={};
      const key=colour;if(!this.hazeSprite[key]){const h=document.createElement('canvas');h.width=h.height=128;const hc=h.getContext('2d'),gr=hc.createRadialGradient(64,64,0,64,64,64);gr.addColorStop(0,`rgba(${colour},.5)`);gr.addColorStop(1,`rgba(${colour},0)`);hc.fillStyle=gr;hc.fillRect(0,0,128,128);this.hazeSprite[key]=h;}
      for(let i=0;i<count;i++){
        const size=240+(i*97%160),speed=(wind[0]||8)*.6;
        const x=((i*317+time*speed+i*i*13)%(vw+size*2))-size+left,y=top+((i*211%1000)/1000)*vh+Math.sin(time*.15+i)*20;
        c.globalAlpha=(type==='fog'?.27:.22)*intensity;c.drawImage(this.hazeSprite[key],x-size,y-size*.6,size*2,size*1.2);
      }
      if(type==='dust'){
        c.strokeStyle='#d8bd8a';c.lineWidth=1;c.globalAlpha=.26*intensity;c.beginPath();
        for(let i=0;i<Math.round(60*intensity);i++){
          const x=left+((i*173+time*(wind[0]||30)*(1+i%3*.4))%(vw+60)),y=top+(i*89%100)/100*vh,len=14+i%5*7;
          c.moveTo(x,y);c.lineTo(x-len,y-len*(wind[1]||0)/(wind[0]||1));
        }
        c.stroke();
      }
    }else if(type==='rain'){
      c.strokeStyle='#bfd4e0';c.lineWidth=1;c.globalAlpha=.3*intensity;c.beginPath();
      const slant=(wind[0]||0)*.012;
      for(let i=0,n=Math.round(140*intensity);i<n;i++){
        const x=left+((i*131+time*(wind[0]||0)*.5+slant*(time*400+i*37)%vh)%vw+vw)%vw,y=top+((i*97+time*520*(1+i%4*.15))%vh);
        c.moveTo(x,y);c.lineTo(x+slant*14,y+14);
      }
      c.stroke();
    }
    c.restore();
  }
  compound(c,x,y,s) {
    const sh=this.env?TIME_OF_DAY[this.env.time].shadow:[6,8],k=1.7,sx=sh[0]*k,sy=sh[1]*k,rnd=seededRandom(Math.floor(x*31+y*17));
    c.save();c.translate(x,y);c.scale(s,s);c.rotate(.08);
    // Concrete apron and perimeter fence.
    c.fillStyle='#8a8b7430';c.fillRect(-112,-97,244,204);c.fillStyle='#28352233';c.fillRect(-110,-95,240,200);
    c.strokeStyle='#5d604c22';c.lineWidth=1;for(let i=-100;i<130;i+=40){c.beginPath();c.moveTo(i,-95);c.lineTo(i,105);c.stroke();}
    c.strokeStyle='#a6a78b55';c.lineWidth=1;c.strokeRect(-125,-112,263,232);
    for(let i=-120;i<130;i+=17){c.fillStyle='#c3c1a45c';c.fillRect(i,-115,2,6);c.fillRect(i,117,2,6);}
    // Extruded shadow: the roof outline is dragged along the light direction.
    const shadow=(bx,by,w,h,height)=>{
      const dx=sx*height,dy=sy*height;c.fillStyle='#0d160f3c';c.beginPath();
      c.moveTo(bx,by);c.lineTo(bx+dx,by+dy);c.lineTo(bx+w+dx,by+dy);c.lineTo(bx+w+dx,by+h+dy);c.lineTo(bx+dx,by+h+dy);c.lineTo(bx,by+h);c.lineTo(bx+w,by+h);c.lineTo(bx+w,by);c.closePath();c.fill();
    };
    const unit=(ux,uy,w,h,tone)=>{
      c.fillStyle='#0d160f55';c.fillRect(ux+2,uy+3,w,h);c.fillStyle=tone;c.fillRect(ux,uy,w,h);
      c.fillStyle='#ffffff22';c.fillRect(ux,uy,w,1.5);c.fillStyle='#00000033';c.fillRect(ux,uy+h-1.5,w,1.5);
    };
    // Oblique view: the roof is lifted up and to the left, exposing the south and east walls.
    const walls=(bx,by,w,h,H,tone)=>{
      const lx=H*.32;shadow(bx,by,w,h,H/12);
      c.fillStyle=tone[0];c.beginPath();c.moveTo(bx,by+h);c.lineTo(bx+w,by+h);c.lineTo(bx+w-lx,by+h-H);c.lineTo(bx-lx,by+h-H);c.closePath();c.fill();
      c.fillStyle=tone[1];c.beginPath();c.moveTo(bx+w,by);c.lineTo(bx+w,by+h);c.lineTo(bx+w-lx,by+h-H);c.lineTo(bx+w-lx,by-H);c.closePath();c.fill();
      c.fillStyle='#2b3a40';
      for(let xx=bx+8;xx<bx+w-12;xx+=14){c.beginPath();c.moveTo(xx,by+h-H*.25);c.lineTo(xx+7,by+h-H*.25);c.lineTo(xx+7-lx*.55,by+h-H*.7);c.lineTo(xx-lx*.55,by+h-H*.7);c.closePath();c.fill();}
      c.fillStyle='#00000030';c.fillRect(bx,by+h-1.5,w,1.5);
    };
    const flat=(bx,by,w,h,roof,height)=>{
      walls(bx,by,w,h,height,['#7c826c','#5d6452']);c.save();c.translate(-height*.32,-height);
      c.fillStyle='#2f3a2e';c.fillRect(bx-2,by-2,w+4,h+4);                         // wall edge
      c.fillStyle='#9a9c86';c.fillRect(bx,by,w,h);                                    // parapet
      c.fillStyle=roof;c.fillRect(bx+3,by+3,w-6,h-6);                                 // membrane
      c.fillStyle='#ffffff14';c.fillRect(bx+3,by+3,w-6,3);c.fillStyle='#00000026';c.fillRect(bx+3,by+h-6,w-6,3);
      c.strokeStyle='#00000020';c.lineWidth=1;for(let xx=bx+14;xx<bx+w-6;xx+=14){c.beginPath();c.moveTo(xx,by+4);c.lineTo(xx,by+h-4);c.stroke();}
      c.strokeStyle='#ffffff10';c.beginPath();c.moveTo(bx+5,by+h*.5);c.lineTo(bx+w-5,by+h*.5);c.stroke();
      // Rooftop plant: air handlers, a skylight, a vent stack and a stair hatch.
      unit(bx+w*.16,by+h*.18,16,11,'#6d7664');unit(bx+w*.16+20,by+h*.18,11,11,'#727b69');
      c.fillStyle='#38515a';c.fillRect(bx+w*.55,by+h*.55,18,10);c.fillStyle='#7da3ac66';c.fillRect(bx+w*.55+1,by+h*.55+1,16,3);
      ellipse(c,bx+w*.8,by+h*.3,3.2,3.2,'#4a5246');ellipse(c,bx+w*.8,by+h*.3,1.6,1.6,'#161c14');
      if(w>70)unit(bx+w*.38,by+h*.62,12,9,'#5b6552');
      if(rnd()>.5){ellipse(c,bx+w*.72,by+h*.72,5,5,'#5f6a5c');ellipse(c,bx+w*.72-1,by+h*.72-1,3.2,3.2,'#8a9582');}
      // Door canopy on the south side.
      c.fillStyle='#434f42';c.fillRect(bx+w*.5-9,by+h,18,5);c.fillStyle='#ffffff22';c.fillRect(bx+w*.5-9,by+h,18,1);
      c.restore();
    };
    // Gabled warehouse: two roof planes lit differently around a ridge line.
    const gabled=(bx,by,w,h)=>{
      const H=24;walls(bx,by,w,h,H,['#8d927c','#686f5c']);c.save();c.translate(-H*.32,-H);
      c.fillStyle='#2f3a2e';c.fillRect(bx-2,by-2,w+4,h+4);
      c.fillStyle='#8c8f78';c.fillRect(bx,by,w/2,h);c.fillStyle='#6e7560';c.fillRect(bx+w/2,by,w/2,h);
      c.strokeStyle='#00000024';c.lineWidth=1;for(let yy=by+6;yy<by+h;yy+=6){c.beginPath();c.moveTo(bx,yy);c.lineTo(bx+w,yy);c.stroke();}
      c.fillStyle='#b4b79e';c.fillRect(bx+w/2-1,by,2,h);c.fillStyle='#ffffff18';c.fillRect(bx,by,w/2,2);
      c.fillStyle='#4a5547';for(let i=0;i<3;i++)c.fillRect(bx+w*.2+i*w*.25,by+h*.25,9,6);
      c.fillStyle='#3b4a52aa';c.fillRect(bx+6,by+h-16,w-12,4);
      c.restore();
    };
    flat(-98,-80,104,58,'#5c6554',17);
    gabled(27,-78,80,112);
    flat(-98,2,58,78,'#646b58',14);
    // Shipping containers.
    const tones=['#7c7954','#596b4e','#6a5446'];
    for(let i=0;i<3;i++){
      const cx=-19+i*34;walls(cx,62,28,48,8,['#4a4e3a','#3a3d2e']);c.save();c.translate(-2.6,-8);
      c.fillStyle=tones[i];c.fillRect(cx,62,28,48);
      c.strokeStyle='#00000030';c.lineWidth=1;for(let j=0;j<7;j++){c.beginPath();c.moveTo(cx+3+j*3.6,63);c.lineTo(cx+3+j*3.6,109);c.stroke();}
      c.fillStyle='#ffffff20';c.fillRect(cx,62,28,2);c.strokeStyle='#1c2418aa';c.strokeRect(cx+.5,62.5,27,47);c.restore();
    }
    // Parked trucks beside the yard.
    for(const [tx,ty] of [[-70,100],[60,50]]){
      shadow(tx,ty,26,12,.35);c.fillStyle='#55603f';c.fillRect(tx,ty,18,12);c.fillStyle='#434d33';c.fillRect(tx+18,ty+1,8,10);
      c.fillStyle='#8aa2a8';c.fillRect(tx+22,ty+2,3,8);
    }
    // Generator and water tank.
    ellipse(c,100,70,9,9,'#2a3a40');ellipse(c,100,70,7,7,'#5a707a');ellipse(c,98,68,3,3,'#9ab3bb');
    unit(84,90,16,10,'#68705a');
    for(const [lx,ly] of [[-120,-107],[130,113]]){ellipse(c,lx,ly,7,7,'#d6d8951a');ellipse(c,lx,ly,2,2,'#e2da9b');}
    c.restore();
  }
  helicopter(c,p,t,ghost=false) {
    const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bank=reduced?0:(p.bank||0),pitch=reduced?0:(p.pitch||0);
    const speed=clamp(Math.hypot(p.vx||0,p.vy||0)/270,0,1),heat=clamp(p.heat||0,0,1);
    const canCache=typeof (this.canvas.ownerDocument||(typeof document!=='undefined'?document:null))?.createElement==='function';
    c.save();c.translate(p.x,p.y);
    if(!ghost){
      c.save();c.translate(13,19);c.rotate(p.angle);c.scale(1.12,.72);
      path(c,[[-14,-6],[-63,-3],[-72,0],[-62,4],[-14,6]],'#0b170c4d');
      path(c,[[-25,-9],[-17,-15],[12,-14],[30,-7],[35,0],[28,9],[11,14],[-18,13],[-26,6]],'#0b170c4d');
      c.save();c.translate(-5,0);c.rotate(reduced?0:t*49);c.fillStyle='#0b170c24';c.fillRect(-48,-2,96,4);c.restore();
      c.restore();
    }
    // The gun is anchored to the simulated firing axis, not the cosmetic hull pose.
    c.save();c.rotate(p.cannonAngle??p.angle);c.translate(20,0);c.scale(.5,.5);
    if(ghost)c.globalAlpha*=.3;
    c.fillStyle='#4c5940';c.fillRect(-4,-5,26,10);c.fillStyle='#b5ac7b';c.fillRect(17,-2,25,4);c.fillStyle='#303d32';c.fillRect(-7,-3,8,6);c.fillStyle='#e0e5b9';c.fillRect(39,-1,3,2);
    if(heat>0){c.save();c.globalAlpha*=heat*.75;c.fillStyle='#e78955';c.fillRect(27,-2,13,4);c.restore();}
    if(!ghost&&!reduced&&this.settings.effects&&canCache&&heat>.1){
      this.smoke(c,{x:46+heat*5,y:Math.sin(t*2)*2,size:2+heat*2,life:.5,maxLife:1,exhaust:true,smokeVariant:2},heat*.24);
    }
    if(!ghost&&!reduced&&canCache)this.playerMuzzle(c,p);
    c.restore();

    c.save();
    c.rotate(p.angle);
    c.translate(pitch*30,bank*30);
    c.rotate(bank*.45);
    c.scale(1-Math.abs(pitch)*.3,1-Math.abs(bank)*.5);
    if(ghost)c.globalAlpha*=.3;
    if(!ghost&&!reduced&&this.settings.effects&&canCache){
      for(const side of [-1,1]){
        this.smoke(c,{x:-34-speed*8-2*Math.sin(t*2+side),y:side*8,size:3+speed*3,life:.5,maxLife:1,exhaust:true,smokeVariant:side<0?0:1},.08+speed*.16);
        c.strokeStyle='#e2bc8944';c.lineWidth=.8;c.beginPath();c.moveTo(-27,side*9);
        c.bezierCurveTo(-31,side*9+Math.sin(t*3+side),-35,side*8-Math.sin(t*3+side),-40,side*8);c.stroke();
      }
    }
    // Tail boom, stabilizers, armored pylons and engine housings.
    path(c,[[-14,-6],[-63,-3],[-72,0],[-62,4],[-14,6]],'#728471','#c2cba755');
    path(c,[[-22,-4],[-61,-2],[-65,0],[-22,1]],'#9aa98b');
    path(c,[[-36,1],[-61,2],[-65,0],[-36,4]],'#526b59');
    path(c,[[-52,-3],[-61,-18],[-66,-18],[-63,0],[-62,17],[-55,17]],'#81947b');
    // Tail detail: shaded stabilizer halves, leading edges, tip marks, boom seams and gearbox fairing.
    path(c,[[-55,-3],[-61,-17],[-64,-17],[-62,-1]],'#9bab8c');
    path(c,[[-55,3],[-61,16],[-64,16],[-62,1]],'#6a7e66');
    c.strokeStyle='#d3dcb8aa';c.lineWidth=1;
    c.beginPath();c.moveTo(-52,-3);c.lineTo(-61,-18);c.moveTo(-55,17);c.lineTo(-62,17);c.stroke();
    c.fillStyle='#d9a45a';c.fillRect(-66,-18,3,2);c.fillRect(-65,16,3,2);
    c.fillStyle='#3d5143';for(const x of [-30,-40,-50])c.fillRect(x,-4,1,8);
    path(c,[[-60,-3],[-68,-2],[-70,0],[-68,2],[-60,3]],'#4a604f','#b8c79c66');
    c.fillStyle='#dfe8c288';c.fillRect(-46,-3,14,1);
    for(const side of [-1,1]){
      c.save();c.scale(1,side);
      path(c,[[-18,10],[5,11],[17,20],[13,24],[-18,23],[-22,17]],'#334b3c','#bfca9e99');
      path(c,[[-17,13],[4,13],[13,19],[-15,20]],'#9ba985');
      path(c,[[-15,20],[13,20],[11,23],[-17,22]],'#61795e');
      c.fillStyle='#283d33';c.fillRect(-16,15,36,4);
      c.fillStyle='#475f4c';c.fillRect(-10,16,22,7);
      c.fillStyle='#9aa484';c.fillRect(4,19,19,3);
      c.fillStyle='#364b3c';c.fillRect(10,18,3,5);
      c.restore();
    }
    for(const side of [-1,1]){
      c.fillStyle='#303f32';c.fillRect(-27,side<0?-8:5,5,3);
      c.fillStyle='#b1b797';c.fillRect(-26,side<0?-7:6,1,1);c.fillRect(-24,side<0?-7:6,1,1);
    }
    path(c,[[-25,-9],[-17,-15],[12,-14],[30,-7],[35,0],[28,9],[11,14],[-18,13],[-26,6]],'#8b9a78','#c1cba460');
    path(c,[[-24,0],[-19,10],[-13,12],[10,12],[26,7],[31,2]],'#687e62');
    path(c,[[-21,-8],[-11,-11],[4,-10],[4,10],[-13,11],[-21,5]],'#657b61','#b4c39c55');
    path(c,[[-20,-8],[-12,-11],[3,-10],[5,-4],[-16,-3]],'#a4b18b');
    path(c,[[-19,2],[4,3],[2,9],[-14,10],[-20,6]],'#4f6b55');
    // Layered canopy glass gives the cockpit a distinct forward-facing volume.
    path(c,[[-18,-7],[-10,-10],[2,-9],[7,-5],[-9,-4],[-17,-2]],'#b9d6b477');
    path(c,[[-16,-1],[7,-1],[7,4],[1,8],[-11,8],[-17,4]],'#18382fbb');
    path(c,[[-13,0],[4,0],[2,3],[-10,4]],'#7fae9777');
    c.fillStyle='#d5e8bd99';c.fillRect(-9,-7,9,2);c.fillRect(-13,5,7,1);
    for(const side of [-1,1]){
      c.save();c.scale(1,side);
      path(c,[[-26,7],[-22,14],[-8,16],[1,12],[1,9],[-5,7]],'#344c3e','#bcc99f99');
      path(c,[[-23,8],[-20,12],[-9,13],[-4,10],[-6,8]],'#9aa987');
      path(c,[[-21,13],[-9,14],[-5,13],[-8,16],[-20,15]],'#61795e');
      c.fillStyle='#273b31';c.fillRect(-26,8,4,4);
      c.fillStyle='#b78053';c.globalAlpha*=.6;c.fillRect(-27,9,2,2);
      c.restore();
    }
    c.fillStyle='#435a46';for(let x=-18;x<=-12;x+=3)c.fillRect(x,3,1,4);
    path(c,[[7,-12],[24,-9],[32,-4],[35,0],[32,4],[24,9],[7,12],[9,0]],'#435b4c','#b9c9a477');
    // Wraparound windshield: dark tinted panes, bright sky bands, a centre post and glints.
    path(c,[[9,-11],[24,-8],[31,-3],[32,0],[31,3],[24,8],[9,11],[11,0]],'#16302c','#c8e6c466');
    path(c,[[11,-9],[24,-6],[29,-2],[12,-1]],'#2c5e57');
    path(c,[[12,1],[29,2],[24,6],[11,9]],'#1f453f');
    path(c,[[13,-8],[22,-6],[26,-3],[14,-3]],'#8fd0c088');
    path(c,[[14,-6],[19,-5],[17,-4],[14,-4]],'#e6fff0aa');
    path(c,[[13,4],[24,4],[21,6],[13,7]],'#6fb3a855');
    c.strokeStyle='#a9bc92';c.lineWidth=1.2;c.beginPath();c.moveTo(11,0);c.lineTo(32,0);c.stroke();
    c.fillStyle='#e9ffe8';c.fillRect(27,-3,1,1);c.fillRect(22,5,2,1);
    c.fillStyle='#b5c096';c.fillRect(-8,-10,3,20);c.fillStyle='#3c503f';c.fillRect(-14,-7,5,14);
    c.fillStyle='#d2d7ad';c.fillRect(4,-12,1,2);c.fillRect(4,10,1,2);
    // Small landing rails and armored belly accents improve the grounded silhouette.
    c.strokeStyle='#263a2f';c.lineWidth=2;
    for(const side of [-1,1]){
      c.beginPath();c.moveTo(-14,side*11);c.lineTo(-11,side*17);c.lineTo(8,side*17);c.stroke();
      c.fillStyle='#718469';c.fillRect(-9,side<0?-16:15,15,2);
    }
    c.fillStyle='#b8c89f';c.fillRect(-2,-12,4,2);c.fillRect(-2,10,4,2);
    c.save();c.translate(-62,0);const rotorPhase=reduced?0:Math.abs(Math.sin(t*42));ellipse(c,0,0,15+4*rotorPhase,2+rotorPhase,'#d8dfb699');c.save();c.rotate(reduced?0:Math.sin(t*42)*.12);ellipse(c,0,0,13+3*rotorPhase,1,'#aebd9a88');c.restore();// Two foreshortened blades sweep through the edge-on disc; tips are painted for visibility.
    for(let i=0;i<2;i++){const len=reduced?13:15*Math.abs(Math.cos(t*42+i*Math.PI/2));c.fillStyle='#eef3d9b0';c.fillRect(-len,-.6,len*2,1.2);c.fillStyle='#d9a45a';c.fillRect(-len,-.8,1.6,1.6);c.fillRect(len-1.6,-.8,1.6,1.6);}
    c.fillStyle='#455240';c.fillRect(-3,-2,6,4);ellipse(c,0,0,2.6,2.6,'#26382d');ellipse(c,0,0,1.2,1.2,'#aebb94');c.restore();
    c.save();c.translate(-5,0);c.rotate(reduced?0:t*49);
    ellipse(c,0,0,44,44,'#dce8ca0e');ellipse(c,0,0,30,30,'#dce8ca0c');
    c.strokeStyle='#e7eed92c';c.lineWidth=2;c.beginPath();c.arc(0,0,45,0,TAU);c.stroke();
    c.strokeStyle='#dce8ca55';c.lineWidth=3;c.beginPath();
    for(let i=0;i<4;i++){const a=i*Math.PI/2+.1;c.moveTo(42*Math.cos(a),42*Math.sin(a));c.arc(0,0,42,a,a+.55);}
    c.stroke();
    for(let i=0;i<4;i++){c.rotate(Math.PI/2);path(c,[[0,-2],[46,-3],[44,0],[0,2]],'#e2e7cc99');path(c,[[6,-3.5],[16,-3],[16,3],[6,3.5]],'#4f6350');c.fillStyle='#d9a45a';c.fillRect(39,-2.8,6,3);c.fillStyle='#f3f1d8';c.fillRect(33,-2.7,3,2.5);}
    ellipse(c,0,0,7.5,7.5,'#1d3027');for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4;ellipse(c,5.6*Math.cos(a),5.6*Math.sin(a),1,1,'#a9b58f');}ellipse(c,0,0,6,6,'#233a30');ellipse(c,0,0,4,4,'#60765a');ellipse(c,-1,-1,2,2,'#d2dbb2');c.restore();
    if(reduced||Math.sin(t*5)>0)ellipse(c,-51,0,2,2,'#f7a26d');ellipse(c,1,-19,1.5,1.5,'#c1ed95');
    const glow=(x,y,r,color)=>{ellipse(c,x,y,r*4.2,r*4.2,color+'18');ellipse(c,x,y,r*2.8,r*2.8,color+'33');ellipse(c,x,y,r*1.7,r*1.7,color+'66');};
    if(!ghost&&!reduced&&t%2<.12){glow(18,-18,3,'#ffffff');glow(18,18,3,'#ff5d52');ellipse(c,18,-18,3,3,'#ffffff');ellipse(c,18,18,3,3,'#ff5d52');}
    if(!ghost&&!reduced&&t%1.5<.12){
      for(const [x,y,r] of [[-72,0,2.5],[-65,-18,2],[-64,17,2]]){glow(x,y,r,'#ffb35c');ellipse(c,x,y,r,r,'#ffb35c');}
    }
    c.restore();
    c.restore();
  }
  artillerySupports(c,e,char){
    const extension=clamp(e.supportLegs||0,0,1);
    for(const x of [-17,17])for(const side of [-1,1]){
      const footX=x+Math.sign(x)*extension*10,footY=side*(18+extension*16);
      c.strokeStyle=char?'#252d25':'#354532';c.lineWidth=8;
      c.beginPath();c.moveTo(x,side*12);c.lineTo(footX,footY);c.stroke();
      c.strokeStyle=char?'#565b4a':'#b2ad83';c.lineWidth=2;
      c.beginPath();c.moveTo(x,side*14);c.lineTo(footX,footY);c.stroke();
      c.fillStyle=char?'#30392f':'#58684d';c.fillRect(footX-6,footY-4,12,8);
      c.fillStyle=char?'#565b4a':'#a6aa81';c.fillRect(footX-5,footY-4,10,1);
      ellipse(c,x,side*13,3,3,char?'#30392f':'#7c8966');
    }
  }
  artilleryHull(c,char){
    const armor=char?'#354033':'#596b50',dark=char?'#252e24':'#354a35',light=char?'#555e4b':'#96a27b';
    const hull=[[-32,-12],[-26,-16],[23,-16],[31,-10],[31,10],[23,16],[-26,16],[-32,12]];
    path(c,hull,armor,'#1d2a2088');path(c,hull,this.tankShade(c));
    c.fillStyle=dark;c.fillRect(-29,-10,11,20);c.fillRect(13,-11,14,22);
    c.fillStyle=light;for(let y=-8;y<=8;y+=4)c.fillRect(16,y,9,1);
    for(const side of [-1,1]){
      const y=side<0?-15:8;
      c.fillStyle=dark;c.fillRect(-28,y,14,7);
      c.fillStyle=armor;c.fillRect(-27,y+1,12,5);
      c.fillStyle=light;c.fillRect(-25,y+1,2,5);c.fillRect(-18,y+1,2,5);
      c.fillStyle=char?'#545747':'#ce8e59';c.fillRect(3,side<0?-16:13,7,3);
    }
    c.fillStyle=light;c.fillRect(-13,-14,24,2);
    c.strokeStyle=dark;c.lineWidth=1;c.strokeRect(-12,-11,20,22);
  }
  artilleryTurret(c,e,char){
    c.save();c.rotate((e.turret??e.angle)-e.angle);
    const armor=char?'#414a39':'#7f8b65',dark=char?'#252e24':'#394b35',light=char?'#606651':'#b3b48b';
    const housing=[[-14,-12],[7,-12],[15,-7],[15,7],[7,12],[-14,12],[-17,8],[-17,-8]];
    path(c,housing,armor,'#1d2a2088');path(c,housing,this.tankShade(c));
    c.fillStyle=dark;c.fillRect(-15,-8,6,16);c.fillRect(-7,-10,10,3);
    c.fillStyle=light;c.fillRect(-11,-12,16,2);
    ellipse(c,-5,2,4,4,dark);ellipse(c,-5,2,2.5,2.5,light);
    const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    const life=!e.wreck&&!char&&e.health>0?e.weaponMuzzle||0:0,tip=ARTILLERY.barrelTip;
    c.save();c.translate(reduced?0:-5*clamp(life/WEAPON_MUZZLE_TIME,0,1),0);
    c.fillStyle=dark;c.fillRect(8,-4,14,8);
    path(c,[[16,-3],[27,-3],[tip-7,-1.5],[tip,-1.5],[tip,1.5],[tip-7,1.5],[27,3],[16,3]],armor,dark);
    c.fillStyle=light;c.fillRect(21,-2.5,17,1);c.fillRect(tip-7,-3,7,1);
    c.fillStyle=dark;c.fillRect(tip-7,-3,7,6);
    c.fillStyle=light;c.fillRect(tip-6,-3,5,1);
    c.fillStyle='#17231a';c.fillRect(tip-5,-3,2,1);c.fillRect(tip-5,2,2,1);c.fillRect(tip-1,-1.5,1,3);
    if(life&&!reduced)this.muzzleEffect(c,life,tip,18,.075);
    c.restore();c.restore();
  }
  spotlightTexture(){
    if(!this.spotlightBeam){
      const canvas=(this.canvas.ownerDocument||document).createElement('canvas');canvas.width=256;canvas.height=128;
      const pc=canvas.getContext('2d');
      for(let x=0;x<canvas.width;x++){
        const progress=(x+.5)/canvas.width,halfWidth=2+progress*58;
        const gradient=pc.createLinearGradient(0,64-halfWidth,0,64+halfWidth);
        gradient.addColorStop(0,'#fff5c400');gradient.addColorStop(.2,'#fff5c460');
        gradient.addColorStop(.5,'#fffbe0');gradient.addColorStop(.8,'#fff5c460');gradient.addColorStop(1,'#fff5c400');
        pc.globalAlpha=clamp(progress/.08,0,1)*Math.pow(clamp((1-progress)/.3,0,1),2);
        pc.fillStyle=gradient;pc.fillRect(x,64-halfWidth,1,halfWidth*2);
      }
      this.spotlightBeam=canvas;
    }
    return this.spotlightBeam;
  }
  commanderSpotlight(c,e,target){
    if(!e.specialBoss||e.wreck||e.health<=0||target.health<=0)return;
    const turret=e.turret??e.angle,scale=COMMANDER.scale;
    const x=e.x+Math.cos(turret)*14*scale+Math.sin(turret)*20*scale,y=e.y+Math.sin(turret)*14*scale-Math.cos(turret)*20*scale;
    const dx=target.x-x,dy=target.y-y,length=Math.hypot(dx,dy);
    if(length<1)return;
    const night=this.env?.time==='night',reach=length+Math.min(140,Math.max(50,length*.18)),width=Math.min(85,reach*.09),beam=this.spotlightTexture();
    const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    const flicker=!reduced&&e.spotlightFlicker>0?.3+.7*Math.pow(Math.cos((1-e.spotlightFlicker/COMMANDER.spotlightFlickerTime)*Math.PI*2),2):1;
    c.save();c.translate(x,y);c.rotate(Math.atan2(dy,dx));
    if(this.settings.effects){
      c.save();c.globalCompositeOperation='lighter';c.globalAlpha=(night?.07:.025)*flicker;
      c.drawImage(beam,0,-width*1.2,reach,width*2.4);c.restore();
    }
    c.globalAlpha=(night?.25:.1)*flicker;c.drawImage(beam,0,-width,reach,width*2);
    c.globalAlpha=(night?.36:.16)*flicker;
    const pool=c.createRadialGradient(length,0,0,length,0,32);pool.addColorStop(0,'#fff5c4');pool.addColorStop(1,'#fff5c400');
    c.fillStyle=pool;c.fillRect(length-32,-32,64,64);c.restore();
  }
  commanderHull(c,e,char,t){
    const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    const live=!e.wreck&&!char&&e.health>0;
    c.fillStyle='#14231655';c.fillRect(-57,-43,124,96);
    for(const x of [-33,33]){
      c.save();c.translate(x,0);this.tankTracks(c,e,true,char,{left:-30,right:27,outer:47,inner:33});c.restore();
    }
    path(c,[[-61,-28],[-53,-34],[49,-34],[59,-25],[61,25],[49,34],[-53,34],[-61,28]],char?'#30392f':'#59664c','#19261d');
    for(const x of [-30,30])for(const y of [-17,17]){
      c.save();c.translate(x,y);this.goliathHull(c,char);c.restore();
    }
    for(const side of [-1,1]){
      const y=side*COMMANDER.exhaustOffset;
      c.fillStyle=char?'#30392f':'#4c5946';c.fillRect(COMMANDER.exhaustForward,y-3,9,6);
      ellipse(c,COMMANDER.exhaustForward,y,2,3,'#131b14');
    }
    c.fillStyle=char?'#262e26':'#414e3a';c.fillRect(-5,-33,10,66);c.fillRect(-55,-3,108,6);
    c.fillStyle=char?'#565b4a':'#aaa078';
    for(const x of [-48,-12,12,48])for(const y of [-29,29])c.fillRect(x,y,3,2);
    c.strokeStyle=char?'#626451':'#c5b78899';c.lineWidth=1;
    for(const side of [-1,1]){
      c.beginPath();c.moveTo(-48,side*25);c.lineTo(-61,side*52);c.stroke();
      ellipse(c,-61,side*52,1.5,1.5,char?'#565b4a':'#e2c482');
      ellipse(c,-48,side*25,4,4,'#28332a');
      if(live){
        const intensity=reduced?.6:.25+.75*Math.pow((1+Math.sin(t*Math.PI+(side>0?Math.PI:0)))/2,4);
        c.save();c.globalAlpha=intensity;
        if(this.settings.effects)ellipse(c,-48,side*25,7,7,'#ffb34740');
        ellipse(c,-48,side*25,2.5,2.5,'#ffc46b');c.restore();
      }
    }
  }
  commanderTurret(c,e,char){
    const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    const live=!e.wreck&&!char&&e.health>0;
    c.save();c.rotate((e.turret??e.angle)-e.angle);
    path(c,[[-23,-17],[-12,-23],[19,-21],[29,-12],[29,12],[19,21],[-12,23],[-23,17]],char?'#4b503d':'#a49f75','#202b20');
    path(c,[[-23,-17],[-12,-23],[19,-21],[29,-12],[29,12],[19,21],[-12,23],[-23,17]],this.tankShade(c));
    const muzzle=live?e.commanderMuzzle:null;
    const charge=live&&(e.phase==='shells'||e.phase==='advance')?clamp(1-e.cooldown/.45,0,1):0;
    for(let barrel=0;barrel<2;barrel++){
      const life=muzzle&&!muzzle.cannon&&muzzle.barrel===barrel?muzzle.life:0;
      const tip=COMMANDER.shellBarrelTip;
      c.save();c.translate(reduced?0:-5*clamp(life/WEAPON_MUZZLE_TIME,0,1),barrel?9:-9);
      path(c,[[15,-4],[31,-4],[tip-9,-2],[tip,-2],[tip,2],[tip-9,2],[31,4],[15,4]],char?'#363d30':'#b5ac7b','#28362a');
      path(c,[[19,-4],[31,-4],[tip-9,-2],[tip-2,-2],[tip-9,-1],[31,-2]],char?'#666959':'#d0c799');
      path(c,[[31,2],[tip-9,1],[tip,1],[tip,2],[tip-9,2],[31,4]],char?'#283128':'#6a7150');
      c.fillStyle=char?'#30392f':'#647153';c.fillRect(15,-5,12,10);c.fillRect(36,-3.7,2,7.4);
      c.fillStyle=char?'#363d30':'#7e8967';c.fillRect(tip-7,-3,7,6);
      c.fillStyle='#18251c';c.fillRect(tip-1.3,-1.5,1.3,3);c.fillRect(tip-6,-3,3,.8);c.fillRect(tip-6,2.2,3,.8);
      if(charge>0){c.save();c.globalAlpha=charge*.55;ellipse(c,tip,0,5,4,'#ffb46b');c.restore();}
      if(life&&!reduced)this.muzzleEffect(c,life,tip,17,.075,true);
      c.restore();
    }
    ellipse(c,-5,0,10,10,char?'#30392f':'#5e6a4e');
    ellipse(c,-5,0,7,7,char?'#565b4a':'#b2a57d');
    c.fillStyle=char?'#252d25':'#8e4738';c.fillRect(-18,-10,6,20);
    c.fillStyle=char?'#626451':'#d6c48e';c.fillRect(-17,-8,2,16);
    ellipse(c,14,-20,4,4,char?'#30392f':'#394b38');ellipse(c,15,-20,2,2,live?'#fff5c4':'#626451');
    c.restore();
    c.save();c.rotate((e.cannonAngle??e.turret??e.angle)-e.angle);
    ellipse(c,0,0,8,8,char?'#30392f':'#46583f');
    for(let barrel=0;barrel<2;barrel++){
      const cannonLife=muzzle?.cannon&&muzzle.barrel===barrel?muzzle.life:0;
      c.save();c.translate(reduced?0:-2*clamp(cannonLife/WEAPON_MUZZLE_TIME,0,1),(barrel?1:-1)*COMMANDER.cannonOffset);
      c.fillStyle=char?'#363d30':'#69775b';c.fillRect(-1,-2.5,10,5);c.fillRect(8,-1,31,2);
      c.fillStyle=char?'#666959':'#d0c799';c.fillRect(9,-1,25,.65);
      c.fillStyle=char?'#283128':'#43513c';c.fillRect(9,.35,25,.65);c.fillRect(29,-1.4,1.8,2.8);
      c.fillStyle=char?'#3c4537':'#7f8968';c.fillRect(35,-1.75,4,3.5);
      c.fillStyle='#18251c';c.fillRect(38,-.75,1,1.5);
      if(cannonLife&&!reduced)this.muzzleEffect(c,cannonLife,39,7,.075);
      c.restore();
    }
    c.restore();
  }
  tankTracks(c,e,boss,char,dimensions) {
    const {left:trackLeft,right:trackRight,outer:trackOuter,inner:trackInner}=dimensions||{left:boss?-30:-23,right:boss?27:20,outer:boss?27:22,inner:boss?13:11};
    const trackHeight=trackOuter-trackInner;
    c.fillStyle='#27352a';c.fillRect(trackLeft,-trackOuter,trackRight-trackLeft,trackHeight);c.fillRect(trackLeft,trackInner,trackRight-trackLeft,trackHeight);
    c.fillStyle=char?'#4b5041':'#a1a582';
    const drawTrack=(phase,y)=>{
      phase=(phase%6+6)%6;
      for(let x=trackLeft-4+phase;x<trackRight;x+=6){
        const left=Math.max(x,trackLeft),right=Math.min(x+3,trackRight);
        if(right>left)c.fillRect(left,y,right-left,trackHeight-2);
      }
    };
    drawTrack(e.leftTrackPhase??e.trackPhase??0,-trackOuter+1);
    drawTrack(e.rightTrackPhase??e.trackPhase??0,trackInner+1);
  }
  tankHull(c,boss,char) {
    path(c,[[-25,-11],[-15,-16],[17,-16],[25,-8],[25,8],[15,16],[-20,16]],char?'#3d4436':boss?'#727356':'#8c8e69',char?'#141b14':'#b4b38a55');
    path(c,[[-25,-11],[-15,-16],[17,-16],[25,-8],[25,8],[15,16],[-20,16]],this.tankShade(c));
    path(c,[[-21,9],[-15,13],[15,13],[21,8],[14,9]],char?'#292f27':'#687052');
    c.fillStyle=char?'#565b4a':'#a3a078';c.fillRect(-16,-12,29,3);c.fillStyle=char?'#222b22':'#535f45';c.fillRect(-20,-7,8,14);
    c.fillStyle=char?'#30392f':'#69765a';c.fillRect(-18,-5,4,10);c.fillRect(17,-6,4,12);
    c.fillStyle=char?'#202820':'#394b38';for(let y=-4;y<=4;y+=4)c.fillRect(-18,y,4,1);
    c.fillStyle=char?'#30392f':'#5b694d';c.fillRect(-10,9,10,4);c.fillStyle=char?'#626451':'#aab18b';c.fillRect(-10,9,10,1);
    c.strokeStyle=char?'#1f281e':'#546149';c.lineWidth=1;c.beginPath();c.moveTo(11,-12);c.lineTo(17,-8);c.moveTo(10,9);c.lineTo(15,6);c.stroke();
    c.fillStyle=char?'#74745a':'#c0bb91';c.fillRect(12,10,5,1);
  }
  goliathHull(c,char) {
    const armor=char?'#3d4436':'#727356',dark=char?'#292f27':'#4c5d46',light=char?'#565b4a':'#a3a078';
    path(c,[[-30,-12],[-24,-18],[15,-18],[27,-12],[29,0],[27,12],[15,18],[-24,18],[-30,12]],armor,'#18251c88');
    path(c,[[-30,-12],[-24,-18],[15,-18],[27,-12],[29,0],[27,12],[15,18],[-24,18],[-30,12]],this.tankShade(c));
    for(const side of [-1,1]){
      path(c,[[-24,side*13],[16,side*13],[23,side*17],[17,side*20],[-23,side*20],[-28,side*17]],dark);
      c.fillStyle=light;c.fillRect(-22,side<0?-19:18,37,2);
      c.fillStyle=char?'#222b22':'#394b38';c.fillRect(-28,side<0?-12:7,5,5);
    }
    path(c,[[10,-12],[22,-11],[28,-7],[28,7],[22,11],[10,12]],char?'#4b503d':'#899074','#18251c88');
    c.fillStyle=light;c.fillRect(19,-8,6,2);c.fillRect(19,6,6,2);
    path(c,[[-13,-12],[7,-13],[14,-8],[14,8],[7,13],[-13,12],[-17,7],[-17,-7]],armor,'#18251c88');
    c.fillStyle=char?'#222b22':'#394b38';c.fillRect(-27,-9,10,18);
    c.fillStyle=light;for(let y=-7;y<=7;y+=3)c.fillRect(-26,y,8,1);
    c.fillStyle=dark;c.fillRect(-29,-14,7,4);c.fillRect(-29,10,7,4);
    ellipse(c,-18,0,4,4,dark);ellipse(c,-18,0,2.5,2.5,light);
    c.strokeStyle=char?'#626451':'#c5b78899';c.lineWidth=1;c.beginPath();c.moveTo(-20,-4);c.lineTo(-23,-14);c.lineTo(-25,-20);c.moveTo(-16,4);c.lineTo(-18,12);c.stroke();
    ellipse(c,-25,-20,1.5,1.5,char?'#565b4a':'#e2c482');
  }
  tankTurret(c,e,char,recoilAmount=2.5,flashSize=10) {
    c.save();c.rotate((e.turret??e.angle)-e.angle);
    path(c,[[-9,-10],[9,-10],[16,-5],[16,5],[8,10],[-9,10],[-13,4],[-13,-4]],char?'#4b503d':'#a49f75',char?'#171b16':'#c5b68966');
    path(c,[[-9,-10],[9,-10],[16,-5],[16,5],[8,10],[-9,10],[-13,4],[-13,-4]],this.tankShade(c));
    const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    const life=!e.wreck&&!char&&e.health>0?e.weaponMuzzle||0:0;
    const recoil=!reduced?recoilAmount*clamp(life/WEAPON_MUZZLE_TIME,0,1):0;
    c.save();c.translate(-recoil,0);
    c.fillStyle=char?'#363d30':'#b5ac7b';c.fillRect(5,-3,27,6);c.fillStyle='#4c5940';c.fillRect(27,-4,5,8);
    c.fillStyle=char?'#666959':'#d0c799';c.fillRect(8,-3,15,1);c.fillStyle=char?'#242c23':'#6a7457';c.fillRect(22,-3,2,6);
    if(life&&!reduced)this.muzzleEffect(c,life,32,flashSize,.075);
    c.restore();
    ellipse(c,-1,-1,5,5,'#5b674a');ellipse(c,-1,-1,3,3,char?'#383e32':'#87926b');c.fillStyle='#dc9a6c';c.fillRect(-4,-2,6,2);c.restore();
  }
  aaHull(c,char){
    const armor=char?'#354036':'#64765d',dark=char?'#252e27':'#3c5141',light=char?'#596250':'#a5b18b';
    const hull=[[-23,-9],[-16,-14],[14,-14],[23,-7],[23,7],[14,14],[-16,14],[-23,9]];
    path(c,hull,armor,'#1b2a2088');path(c,hull,this.tankShade(c));
    c.fillStyle=dark;c.fillRect(-20,-9,8,18);c.fillRect(13,-8,6,16);
    c.fillStyle=light;for(let y=-7;y<=7;y+=3)c.fillRect(-19,y,6,1);
    c.fillStyle=dark;c.fillRect(-8,-12,18,24);
    c.fillStyle=armor;c.fillRect(-7,-11,16,22);
    c.fillStyle=light;c.fillRect(-14,-14,25,2);c.fillRect(15,-7,4,2);c.fillRect(15,5,4,2);
    c.fillStyle=char?'#596250':'#d8b36e';c.fillRect(3,12,6,2);
  }
  aaGun(c,e,char,t=0){
    c.save();c.rotate((e.turret??e.angle)-e.angle);
    const housing=[[-14,-9],[-9,-12],[8,-12],[14,-7],[14,7],[8,12],[-9,12],[-14,9]];
    path(c,housing,char?'#414c3c':'#859474','#1c2b2088');path(c,housing,this.tankShade(c));
    c.fillStyle=char?'#596250':'#b8c29b';c.fillRect(-8,-12,14,2);
    c.fillStyle=char?'#252e27':'#3c5141';c.fillRect(4,-4,9,8);
    const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    const muzzle=!e.wreck&&!char&&e.health>0?e.aaMuzzle:null;
    for(let i=0;i<2;i++){
      const y=i?8:-8,active=muzzle?.barrel===i&&muzzle.life>0;
      const recoil=active&&!reduced?3*clamp(muzzle.life/AA_MUZZLE_TIME,0,1):0,tip=32-recoil;
      c.fillStyle=char?'#555648':'#b5ac7b';c.fillRect(5-recoil,y-1.5,27,3);
      c.fillStyle=char?'#73755e':'#d5d0a3';c.fillRect(8-recoil,y-1.5,20,.7);
      c.fillStyle=char?'#303b2e':'#52664b';c.fillRect(12-recoil,y-2,3,4);c.fillRect(tip-4,y-2,4,4);
      c.fillStyle='#1c2b20';c.fillRect(tip-1,y-1,1,2);
      if(active&&!reduced){
        if(this.settings.effects)this.smoke(c,{x:tip+4,y,size:5,life:muzzle.life,maxLife:AA_MUZZLE_TIME,exhaust:true,smokeVariant:i},.55);
        if(AA_MUZZLE_TIME-muzzle.life<AA_FLASH_TIME){
          path(c,[[tip,y-3],[tip+7,y-2],[tip+12,y],[tip+7,y+2],[tip,y+3]],'#ffac58');
          path(c,[[tip,y-1.5],[tip+8,y],[tip,y+1.5]],'#fff4bd');
        }
      }
    }
    ellipse(c,-7,0,5,5,char?'#303b2e':'#435b44');
    c.save();c.translate(-7,0);c.rotate(!e.wreck&&!char&&e.health>0&&!reduced?t*1.8:0);
    c.fillStyle=char?'#596250':'#b8c29b';c.fillRect(-1,-6,2,12);
    ellipse(c,0,-3,7,2.5,char?'#414c3c':'#91a28b');
    c.strokeStyle=char?'#73755e':'#d6e0bd';c.lineWidth=1;c.beginPath();c.ellipse(0,-3,6,1.5,0,0,Math.PI);c.stroke();
    ellipse(c,0,5,1,1,char?'#596250':'#d8b36e');c.restore();c.restore();
  }
  droneRotor(c,x,y,phase,detailed=false,reduced=false) {
    ellipse(c,x,y,10.5,10.5,'#b9cbb31c');
    c.save();c.translate(x,y);
    if(detailed){
      ellipse(c,0,0,6,6,'#263a32');
      ellipse(c,-1,-1,4.8,4.8,'#536a5a');
      if(this.settings.effects&&!reduced){
        c.strokeStyle='#dce8c92b';c.lineWidth=3;
        for(let i=0;i<4;i++){c.beginPath();c.arc(0,0,8.5,phase+i*Math.PI/2,phase+i*Math.PI/2+.85);c.stroke();}
      }
      c.save();c.rotate(phase);c.fillStyle='#c5d7b873';c.fillRect(-9,-.65,18,1.3);c.restore();
    }
    c.strokeStyle=detailed?'#d3e2c36a':'#d3e2c34a';c.lineWidth=1.5;
    for(let i=0;i<2;i++){c.beginPath();c.arc(0,0,9,phase+i*Math.PI,phase+i*Math.PI+1.25);c.stroke();}
    ellipse(c,0,0,4.5,4.5,'#384a3c');ellipse(c,0,0,2.4,2.4,'#a9b394');ellipse(c,0,0,1,1,'#39483a');
    c.restore();
  }
  drone(c,e,t,reduced,dart=false) {
    const motors=dart?[[10,-13],[10,13],[-13,-17],[-13,17]]:[[14,-15],[14,15],[-14,-15],[-14,15]];
    c.strokeStyle='#455847';c.lineWidth=dart?3:4;c.lineCap='round';c.beginPath();
    for(const [x,y] of motors){c.moveTo(dart?(x>0?3:-5):x*.35,y*.3);c.lineTo(x,y);}c.stroke();
    for(let i=0;i<motors.length;i++)this.droneRotor(c,motors[i][0],motors[i][1],(reduced?0:t*18)+(e.seed||0)+i*1.3,!dart,reduced);
    c.save();c.scale(dart?1:.8,dart?.75:.8);
    if(dart){
      path(c,[[-14,-5],[-8,-8],[4,-6],[17,0],[4,6],[-8,8],[-14,5]],'#7c876b','#c4c7a466');
      path(c,[[-10,-4],[3,-4],[12,0],[3,4],[-10,4]],'#a8ad89');
      path(c,[[4,-3],[14,0],[4,3]],'#d38a5e');
      c.fillStyle='#4b5a48';c.fillRect(-10,-2,6,4);
    }else{
      const hull=[[-16,-5],[-11,-10],[5,-12],[14,-7],[19,0],[14,7],[5,12],[-11,10],[-16,5]];
      path(c,hull,'#647b64','#bdc9a677');path(c,hull,this.tankShade(c));
      path(c,[[-11,-8],[4,-9],[10,-5],[10,5],[4,9],[-11,8],[-13,3],[-13,-3]],'#829578','#344d3c');
      path(c,[[-11,5],[4,6],[11,2],[13,7],[5,11],[-11,9]],'#3d5947');
      c.fillStyle='#334b3d';c.fillRect(-13,-5,6,10);c.fillRect(-5,-5,10,10);
      c.fillStyle='#a9b698';c.fillRect(-4,-5,8,1);c.fillRect(-4,4,8,1);
      c.fillStyle='#627960';for(let y=-4;y<=4;y+=2)c.fillRect(-12,y,4,1);
      c.strokeStyle='#4d6751';c.lineWidth=1;c.beginPath();c.moveTo(7,-8);c.lineTo(12,-4);c.moveTo(7,8);c.lineTo(12,4);c.stroke();
      for(const [x,y] of [[-9,-7],[-9,7],[5,-7],[5,7]])ellipse(c,x,y,.7,.7,'#c0c9a2');
      ellipse(c,13,6,5,4,'#1b302b66');
      c.fillStyle='#3d5145';c.fillRect(8,3,5,5);
      ellipse(c,14,6,3.8,3.2,'#253b34');ellipse(c,15,6,2.3,2.2,'#578e9b');
      ellipse(c,15.7,5.4,.9,1,'#b6edf0');
    }
    if(dart){ellipse(c,13,0,2.5,3,'#33483e');ellipse(c,14,-.5,1,1.3,'#a6d9cd');}
    c.restore();
    if(!dart&&this.settings.effects){
      ellipse(c,motors[0][0],motors[0][1],3,3,'#ff6b6330');
      ellipse(c,motors[1][0],motors[1][1],3,3,'#99e9bd30');
    }
    ellipse(c,motors[0][0],motors[0][1],1.2,1.2,dart?'#e5bf7c':'#ff857b');
    ellipse(c,motors[1][0],motors[1][1],1.2,1.2,dart?'#d77b68':'#a6edc2');
    if(!dart&&(reduced||Math.sin(t*2+(e.seed||0))>-.4))ellipse(c,-13,0,1.1,1.1,'#e5bf7c');
  }
  droneGun(c,e,char,reduced){
    const life=!e.wreck&&!char&&e.health>0?e.weaponMuzzle||0:0;
    c.fillStyle=char?'#30392f':'#52634b';c.fillRect(-6,-3.5,5,7);
    c.fillStyle=char?'#596250':'#9dad8c';c.fillRect(-5,-3.5,3,1);c.fillRect(-5,2.5,3,1);
    ellipse(c,-3,0,2.4,2.4,char?'#252e27':'#2c4235');
    c.save();c.translate(reduced?0:-clamp(life/WEAPON_MUZZLE_TIME,0,1),0);
    path(c,[[-5,-2],[-1,-2],[1,-1.5],[6,-1.5],[6,1.5],[-1,1.5],[-3,2],[-5,2]],char?'#30392f':'#354a3b','#17251d');
    c.fillStyle=char?'#535b49':'#879779';c.fillRect(0,-2,6,.7);
    c.fillStyle=char?'#252e27':'#293e32';c.fillRect(5,-1,5,2);c.fillRect(9,-.6,4,1.2);
    c.fillRect(11,-1.2,1,2.4);c.fillRect(0,1,2,3);c.fillRect(4,1,2,3);
    c.fillStyle='#15251b';c.fillRect(12,-.8,1,1.6);
    if(life&&!reduced)this.muzzleEffect(c,life,13,3,.045);
    c.restore();
  }
  rocketHull(c,e,char){
    const armor=char?'#353e34':'#627363',dark=char?'#232e27':'#334b43',light=char?'#596250':'#9cae91';
    c.fillStyle='#182a1e77';c.fillRect(-34,-15,70,37);
    for(const x of [-27,-12,23])for(const y of [-19,11]){
      c.save();c.translate(x,y+4);if(x===23)c.rotate(e.steering||0);
      c.fillStyle='#17221d';c.beginPath();c.roundRect(-6,-4,12,8,2);c.fill();
      c.fillStyle=dark;c.fillRect(-5,-3,10,6);
      c.fillStyle=light;c.fillRect(-3,-1,6,2);
      c.fillStyle='#17221d';for(const offset of [-4,0,4])c.fillRect(offset,-4,1,8);
      c.restore();
    }
    path(c,[[-35,-12],[-30,-15],[10,-15],[16,-10],[16,10],[10,15],[-30,15],[-35,12]],armor,'#1a2b2288');
    c.fillStyle=dark;c.fillRect(-31,-11,40,22);
    c.fillStyle=light;c.fillRect(-32,-15,40,2);c.fillRect(-32,13,40,2);
    for(const x of [-29,-16,1]){
      c.fillStyle=armor;c.fillRect(x,-17,10,5);c.fillRect(x,12,10,5);
      c.fillStyle=dark;c.fillRect(x+1,-15,8,1);c.fillRect(x+1,14,8,1);
    }
    const cab=[[12,-14],[27,-14],[35,-8],[35,8],[27,14],[12,14],[9,8],[9,-8]];
    path(c,cab,char?'#485143':'#879784','#1a2b2288');path(c,cab,this.tankShade(c));
    path(c,[[23,-11],[28,-10],[32,-6],[32,6],[28,10],[23,11]],dark);
    path(c,[[24,-9],[28,-8],[30,-5],[30,-1],[24,-1]],char?'#303d34':'#557e7d');
    path(c,[[24,1],[30,1],[30,5],[28,8],[24,9]],char?'#303d34':'#557e7d');
    c.fillStyle=light;c.fillRect(14,-12,7,2);c.fillRect(14,10,7,2);
    c.fillStyle=dark;c.fillRect(13,-7,7,14);
    c.fillStyle=armor;for(let y=-5;y<=5;y+=3)c.fillRect(14,y,5,1);
    c.strokeStyle=dark;c.lineWidth=2;c.beginPath();c.moveTo(23,-12);c.lineTo(25,-18);c.moveTo(23,12);c.lineTo(25,18);c.stroke();
    c.fillStyle=light;c.fillRect(24,-19,4,2);c.fillRect(24,17,4,2);
    c.fillStyle=dark;c.fillRect(34,-10,3,20);
    c.fillStyle=char?'#596250':'#e5c18b';c.fillRect(35,-8,2,3);c.fillRect(35,5,2,3);
    c.fillStyle='#18271f';c.fillRect(35,-3,2,6);
    c.fillStyle=char?'#3e4437':'#b45e4d';c.fillRect(-35,-10,2,3);c.fillRect(-35,7,2,3);
  }
  rocketGun(c,e,char,reduced){
    c.save();c.rotate((e.turret??e.angle)-e.angle);
    const armor=char?'#3c473a':'#70836a',dark=char?'#232e27':'#334b43',light=char?'#66715a':'#b4c29c';
    const live=!e.wreck&&!char&&e.health>0,launching=live&&e.launchIgnition>0;
    ellipse(c,-3,0,10,10,dark);
    path(c,[[-25,-10],[-20,-13],[20,-13],[28,-8],[28,8],[20,13],[-20,13],[-25,10]],armor,'#1a2b2288');
    c.fillStyle=dark;c.fillRect(-22,-10,49,20);
    c.fillStyle=light;c.fillRect(-20,-13,39,2);c.fillRect(-20,11,39,2);
    for(const x of [-21,9]){
      c.fillStyle=armor;c.fillRect(x,-11,4,22);
      c.fillStyle=light;c.fillRect(x,-11,4,1);
    }
    for(const y of [-6,0,6]){
      c.fillStyle=armor;c.fillRect(-20,y-2.5,50,5);
      c.fillStyle=light;c.fillRect(-19,y-2.5,48,1);
      c.fillStyle=dark;c.fillRect(-18,y+1.5,47,1);c.fillRect(-24,y-2,4,4);
      ellipse(c,30,y,2.5,2.8,light);ellipse(c,30,y,1.6,2,'#15251c');
      if(live&&(y!==0||(!launching&&e.cooldown<.7)))ellipse(c,30,y,.8,1.2,'#c9b17c');
    }
    for(const x of [-18,-12,-6]){
      c.fillStyle=char?'#596250':'#d9a164';c.fillRect(x,-13,3,2);
      c.fillStyle=dark;c.fillRect(x+2,-13,1,2);
    }
    c.fillStyle=dark;c.fillRect(1,-15,8,3);
    c.fillStyle=live?(launching?'#ee8162':e.cooldown<.7?'#b3df9a':'#e5ba72'):'#596250';c.fillRect(3,-14,4,1);
    if(launching&&!reduced)this.launcherIgnition(c,e.launchIgnition);
    c.restore();
  }
  enemy(c,e,t) {
    const vehicle=e.movingVehicle||createVehicle(e.type,e.specialBoss),gun='gun' in e?e.gun:createGun(e.type,e.specialBoss),drone=vehicle.airborne;
    const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(drone){c.save();c.translate(e.x+5,e.y+8);c.rotate(e.visualHeading??e.angle);c.scale(vehicle.scale,vehicle.scale);ellipse(c,0,0,23,14,'#10231638');ellipse(c,0,0,16,9,'#10231620');c.restore();}
    c.save();c.translate(e.x,e.y);c.rotate(drone?(e.visualHeading??e.angle):e.angle);
    const char=e.charred;c.scale(vehicle.scale,vehicle.scale);
    let heading=e.angle;
    if(drone){
      const bank=reduced?0:(e.visualBank||0),pitch=reduced?0:(e.visualPitch||0);
      c.translate(pitch*4,bank*4+(reduced?0:Math.sin(t*2+(e.seed||0))*1.2));c.rotate(bank*.4);c.scale(1-Math.abs(pitch)*.2,1-Math.abs(bank)*.3);
      heading=(e.visualHeading??e.angle)+bank*.4;
    }
    vehicle.draw(this,c,e,char,t,reduced);
    if(gun)gun.draw(this,c,e,char,{heading,time:t,reduced});
    if(vehicle.antenna){c.strokeStyle='#c5b78866';c.lineWidth=1;c.beginPath();c.moveTo(-14,-12);c.lineTo(-18,-32);c.stroke();}
    if(e.hit>0){c.globalAlpha=clamp(e.hit*5,0,.65);ellipse(c,0,0,22,17,'#fff6c4');c.globalAlpha=1;}
    if(e.charge>.4){c.strokeStyle=`rgba(243,151,94,${e.charge*.6})`;c.lineWidth=1;c.beginPath();c.arc(0,0,31,0,TAU*e.charge);c.stroke();}
    c.restore();
    if(e.specialBoss&&!e.wreck&&!char&&e.health>0&&e.damageFires?.length)this.vehicleFire(c,e,{level:.6,points:e.damageFires},t);
    if(!e.wreck&&e.health<e.maxHealth&&e.type!=='boss'){c.fillStyle='#0f1b0eaa';c.fillRect(e.x-17,e.y-35,34,3);c.fillStyle='#e7b181';c.fillRect(e.x-17,e.y-35,34*e.health/e.maxHealth,3);}
  }
  wreck(c,d) {
    const progress=d.transition?clamp((d.transitionAge||0)/WRECK_TRANSITION_TIME,0,1):1;
    const vehicle={...d,hit:0,charge:0};
    c.save();
    if(progress<1){c.globalAlpha=1-progress;this.enemy(c,vehicle,0);}
    if(progress>0){c.globalAlpha=progress;this.enemy(c,{...vehicle,charred:true},0);}
    c.restore();
    const fire=wreckFireState(d);
    this.vehicleFire(c,d,fire);
  }
  vehicleFire(c,d,fire,age=d.age||0){
    if(!fire.level)return;
    const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    const seed=d.seed||0,scale=d.movingVehicle?.scale??(d.specialBoss?COMMANDER.scale:ENEMIES[d.type].scale),texture=this.wreckFlameTexture();
    c.save();c.translate(d.x,d.y);c.scale(scale,scale);
    for(let i=0;i<(this.settings.effects?fire.points.length:Math.min(fire.points.length,d.specialBoss?5:2));i++){
      const {x,y,strength}=fire.points[i];if(strength<=0)continue;
      const phase=seed*2+i*2.7,wave=reduced?0:Math.sin(age*2.2+phase),sway=reduced?0:Math.sin(age*1.7+phase)*1.5;
      const fireScale=d.specialBoss?.55:1;
      const width=(5+8*strength)*(1+.12*wave)*fireScale,height=(8+22*strength)*(1+(reduced?0:.14*Math.sin(age*2.6+phase)))*fireScale;
      c.save();c.translate(x*Math.cos(d.angle)-y*Math.sin(d.angle),x*Math.sin(d.angle)+y*Math.cos(d.angle));
      c.globalAlpha*=Math.sqrt(strength)*.9*(reduced?1:.9+.1*Math.sin(age*1.9+phase));
      c.drawImage(texture,-width+sway,-height,width*2,height*1.25);
      if(this.settings.effects)c.drawImage(texture,-width*.55-sway*.25,-height*.7,width*1.1,height*.85);
      if(!reduced&&fire.level<.55){ellipse(c,sway+width*.35,-height*.8,1,1.4,'#ffc66d');}
      c.restore();
    }
    c.restore();
  }
  screenSmoke(c,p,alpha){
    this.smoke(c,p,alpha);
  }
  draw(g,dt) {
    const c=this.ctx,W=g.world.width,H=g.world.height,t=g.visualTime,camera=g.camera,zoom=camera.zoom;
    c.setTransform(this.scale,0,0,this.scale,0,0);c.clearRect(0,0,W,H);
    c.setTransform(this.scale*zoom,0,0,this.scale*zoom,-camera.x*this.scale*zoom,-camera.y*this.scale*zoom);
    c.save();if(g.state!=='over'&&this.settings.shake&&g.shake>0){c.translate((Math.random()-.5)*g.shake,(Math.random()-.5)*g.shake);}
    c.drawImage(this.terrain,0,0,W,H);
    for(const mark of g.treadMarks||[]){
      c.save();c.translate(mark.x,mark.y);c.rotate(mark.angle);c.globalAlpha=clamp(mark.life/mark.maxLife,0,1)*.45;
      const length=mark.trackLength||16,width=mark.trackWidth||6,offset=mark.trackOffset||18;
      c.fillStyle='#111812';c.fillRect(-length/2,-offset-width/2,length,width);c.fillRect(-length/2,offset-width/2,length,width);c.restore();
    }
    for(const prop of g.props||[])this.prop(c,prop,t);
    for(const d of g.decals){
      if(d.wreck)this.wreck(c,d);
      else{c.save();c.translate(d.x,d.y);c.rotate(d.angle);ellipse(c,0,0,d.size,d.size*.66,'#1c211c88');ellipse(c,0,0,d.size*.65,d.size*.42,'#0c150d66');c.fillStyle='#4a4b37';c.fillRect(-11,-6,21,12);c.restore();}
    }
    // A very slow cloud shadow drifts over the map.
    if(this.settings.effects){c.save();c.translate(camera.x*.3,camera.y*.3);const x=(t*12)%(W+600)-300,cloud=c.createRadialGradient(x,H*.35,30,x,H*.35,380);cloud.addColorStop(0,'#14231524');cloud.addColorStop(1,'#14231500');c.fillStyle=cloud;c.fillRect(-W,-H,W*3,H*3);c.restore();}
    this.waterGlints(c,t);
    this.weather(c,g,t,dt);
    for(const p of g.pickups){
      const bob=Math.sin(t*3+p.x)*2;c.strokeStyle='#d7ed9c44';c.lineWidth=1;c.beginPath();c.arc(p.x,p.y,23+Math.sin(t*3)*3,0,TAU);c.stroke();
      c.save();c.translate(p.x,p.y+bob);c.rotate(Math.PI/4);c.fillStyle='#1c321d';c.fillRect(-12,-12,24,24);c.strokeStyle='#d4e89a';c.strokeRect(-12,-12,24,24);c.rotate(-Math.PI/4);
      c.fillStyle='#dbea9b';c.fillRect(-3,-8,6,16);c.fillRect(-8,-3,16,6);c.restore();
    }
    for(const p of g.particles)if(p.screenSmoke)this.screenSmoke(c,p,SCREEN_SMOKE_RENDER.behind);
    for(const e of g.enemies)this.commanderSpotlight(c,e,g.player);
    for(const e of g.enemies)this.enemy(c,e,t);
    for(const p of g.particles)if(p.screenSmoke)this.screenSmoke(c,p,SCREEN_SMOKE_RENDER.front);
    if(g.state==='ready'){this.enemy(c,{x:W*.7,y:H*.73,angle:-2.2,type:'tank',health:3,maxHealth:3},t);this.enemy(c,{x:W*.87,y:H*.57,angle:-2.5,type:'tank',health:3,maxHealth:3},t);}
    for(const b of g.bullets){
      if(b.kind==='rocket'||b.kind==='enemyRocket')this.missile(c,b);
      else if(b.friendly&&b.kind==='gun'&&b.tracer)this.gunProjectile(c,b);
      else this.bullet(c,b);
    }
    for(const warning of g.warnings||[]){
      c.save();c.globalAlpha=.5+.5*Math.abs(Math.sin(t*9));c.strokeStyle='#ffb46f';c.lineWidth=2;c.beginPath();c.arc(warning.x,warning.y,warning.radius,0,TAU);c.stroke();
      c.beginPath();c.moveTo(warning.x-8,warning.y);c.lineTo(warning.x+8,warning.y);c.moveTo(warning.x,warning.y-8);c.lineTo(warning.x,warning.y+8);c.stroke();c.restore();
    }
    if(g.player.health>0){
      if(g.player.dashTime>0){for(let i=1;i<4;i++)this.helicopter(c,{...g.player,x:g.player.x-g.player.vx*.026*i,y:g.player.y-g.player.vy*.026*i},t,true);}
      c.globalAlpha=g.player.invulnerable>0&&Math.floor(t*18)%2===0?.55:1;this.helicopter(c,g.player,t);c.globalAlpha=1;
      if(g.player.invulnerable>0){c.strokeStyle='#dbea9b40';c.lineWidth=1;c.beginPath();c.arc(g.player.x,g.player.y,43,0,TAU);c.stroke();}
    }
    for(const p of g.particles){if(p.screenSmoke)continue;if(p.smoke){this.smoke(c,p,p.fume?.15:p.gunFume?.4:1);}else if(p.flare){this.flare(c,p);}else if(p.flakFlash||p.contactFlash){c.save();c.globalAlpha=clamp(p.life/p.maxLife,0,1);const glow=c.createRadialGradient(p.x,p.y,0,p.x,p.y,p.size);glow.addColorStop(0,'#fff6d0ee');glow.addColorStop(.4,'#ff9c4ca0');glow.addColorStop(1,'#ff792600');c.fillStyle=glow;c.fillRect(p.x-p.size,p.y-p.size,p.size*2,p.size*2);c.restore();}else{c.globalAlpha=clamp(p.life/p.maxLife,0,1);c.strokeStyle=p.color;c.lineWidth=p.size;c.beginPath();c.moveTo(p.x,p.y);c.lineTo(p.x-p.vx*.025,p.y-p.vy*.025);c.stroke();c.globalAlpha=1;}}c.globalAlpha=1;
    for(const e of g.explosions){const progress=1-e.life/e.maxLife;c.globalAlpha=(1-progress)*.75;c.strokeStyle='#ffcf8b';c.lineWidth=3*(1-progress);c.beginPath();c.arc(e.x,e.y,e.size*progress,0,TAU);c.stroke();if(progress<.4){const flash=c.createRadialGradient(e.x,e.y,0,e.x,e.y,e.size*.6);flash.addColorStop(0,'#fff6c9aa');flash.addColorStop(1,'#ffc06b00');c.fillStyle=flash;c.fillRect(e.x-e.size,e.y-e.size,e.size*2,e.size*2);}}c.globalAlpha=1;
    for(const f of g.floaters){c.globalAlpha=clamp(f.life,0,1);c.font=`bold ${f.big?19:12}px monospace`;c.fillStyle=f.color;c.textAlign='center';c.fillText(f.text,f.x,f.y);}c.globalAlpha=1;
    // Enemy arrival indicators give the pilot time to react.
    if(g.state==='playing')for(const e of g.enemies){const left=camera.x,right=left+W/zoom,top=camera.y,bottom=top+H/zoom;if(e.x<left+15||e.x>right-15||e.y<top+15||e.y>bottom-15){const x=clamp(e.x,left+18,right-18),y=clamp(e.y,top+100/zoom,bottom-70/zoom);c.save();c.translate(x,y);c.rotate(Math.atan2(e.y-(top+H/(2*zoom)),e.x-(left+W/(2*zoom))));path(c,[[6,0],[-5,-5],[-5,5]],'#efaa76');c.restore();}}
    c.restore();
    c.setTransform(this.scale,0,0,this.scale,0,0);
    if(g.state==='playing'&&!g.touch){
      const x=(g.pointer.x-camera.x)*zoom,y=(g.pointer.y-camera.y)*zoom;c.save();c.translate(x,y);c.strokeStyle='#f1f6c3bb';c.lineWidth=1;c.beginPath();c.arc(0,0,12,0,TAU);c.moveTo(-21,0);c.lineTo(-7,0);c.moveTo(7,0);c.lineTo(21,0);c.moveTo(0,-21);c.lineTo(0,-7);c.moveTo(0,7);c.lineTo(0,21);c.stroke();ellipse(c,0,0,1.5,1.5,'#f6f7c5');c.restore();
    }
    // Target tracking radar, with a faint scanning line.
    if(g.state==='playing'&&W>1000){const x=95,y=H-100,r=44;c.save();c.translate(x,y);ellipse(c,0,0,r,r,'#111f12aa');c.strokeStyle='#c9df8a38';c.lineWidth=1;for(const rr of [r*.5,r]){c.beginPath();c.arc(0,0,rr,0,TAU);c.stroke();}c.beginPath();c.moveTo(-r,0);c.lineTo(r,0);c.moveTo(0,-r);c.lineTo(0,r);c.stroke();c.strokeStyle='#dbea9b77';c.beginPath();c.moveTo(0,0);c.lineTo(Math.cos(t*1.3)*r,Math.sin(t*1.3)*r);c.stroke();for(const e of g.enemies)ellipse(c,(e.x/W-.5)*r*1.7,(e.y/H-.5)*r*1.7,2,2,'#efae7c');ellipse(c,(g.player.x/W-.5)*r*1.7,(g.player.y/H-.5)*r*1.7,2.5,2.5,'#def2a1');c.restore();}
  }
}
