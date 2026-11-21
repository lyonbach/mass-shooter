import { TAU, seededRandom, clamp, ENEMIES } from './core.js';
import { WRECK_TRANSITION_TIME, WRECK_COAST_TIME, WRECK_FIRE_TIME, ROCKET_NOZZLE_OFFSET, AA_MUZZLE_TIME, AA_FLASH_TIME, LAUNCHER_IGNITION_TIME, WEAPON_MUZZLE_TIME } from './game/constants.js';

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
  exhaust:[[0,'#e4d9bccc'],[.45,'#b5aa91aa'],[1,'#938c7900']]
};
const SMOKE_SHAPES=[[1,1],[1,.78],[.78,1]],SMOKE_PUFF_SIZE=64;
const WRECK_FIRE_PEAK_TRANSITION=4;
const WRECK_FIRE_POINTS={
  rocketSemi:[[-20,0],[12,-3],[-8,-5],[2,5],[20,3]],
  boss:[[-23,0],[-5,-4],[17,3],[-15,8],[9,-8]],
  default:[[-14,0],[0,-3],[12,3],[-7,7],[8,-7]]
};

export function wreckFireState(d){
  if(!(d.burnTime>0))return {level:0,points:[]};
  const age=Math.max(0,d.age||0),transition=d.transition?Math.max(0,d.transitionAge||0):age;
  const growth=.2+.3*clamp(age/WRECK_COAST_TIME,0,1)+.5*clamp(transition/WRECK_FIRE_PEAK_TRANSITION,0,1);
  const sincePeak=Math.max(0,transition-WRECK_FIRE_PEAK_TRANSITION);
  const peakAge=age-sincePeak;
  const decline=clamp(1-sincePeak/Math.max(.001,WRECK_FIRE_TIME-peakAge),0,1);
  const level=growth*decline,locations=WRECK_FIRE_POINTS[d.type]||WRECK_FIRE_POINTS.default;
  const points=locations.map(([x,y],i)=>({x,y,strength:i===0?level:clamp((level-[0,.28,.46,.62,.75][i])/.2,0,1)*level}));
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
    const kind=p.screenSmoke?'screen':p.exhaust?'exhaust':p.persistent?'wreck':p.flakSmoke?'flak':'explosion';
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
  streakTexture(){
    if(!this.streak){
      const canvas=(this.canvas.ownerDocument||document).createElement('canvas');
      canvas.width=64;canvas.height=16;
      const pc=canvas.getContext('2d'),gradient=pc.createLinearGradient(0,0,64,0);
      gradient.addColorStop(0,'#a32a1a00');gradient.addColorStop(.55,'#e75b2b66');
      gradient.addColorStop(.85,'#ffb255c0');gradient.addColorStop(1,'#fff2c0e0');
      path(pc,[[0,8],[60,3],[64,8],[60,13]],gradient);
      this.streak=canvas;
    }
    return this.streak;
  }
  gunProjectile(c,b){
    c.save();c.translate(b.x,b.y);c.rotate(Math.atan2(b.vy,b.vx));
    if(b.tracer){
      c.drawImage(this.streakTexture(),-20,-3,23,6);
      c.fillStyle='#fff3c4';c.fillRect(-3,-.6,4,1.2);
    }else{
      c.fillStyle='#aaa98a';c.fillRect(-3,-.6,4,1.2);
    }
    c.restore();
  }
  flare(c,p,reduced=false){
    if(!(p.life>0&&p.maxLife>0))return;
    const age=clamp(p.maxLife-p.life,0,p.maxLife);
    const burn=Math.min(1,age/.04)*Math.min(1,p.life/.18);
    const angle=Math.atan2(p.vy,p.vx),phase=p.flarePhase||0;
    const variation=.9+.1*Math.sin(phase),travel=clamp(age/.16,0,1);
    c.save();c.translate(p.x,p.y);c.rotate(angle);
    if(this.settings.effects&&!reduced){
      for(let i=1;i<=3;i++){
        const distance=i*5*travel,curl=Math.sin(phase+age*5-i*.8)*i*1.3;
        this.smoke(c,{x:-distance,y:curl,size:2+i*.45,life:p.life,maxLife:p.maxLife,exhaust:true,smokeVariant:i%3},.18*burn);
      }
    }
    c.globalAlpha*=burn;
    c.drawImage(this.streakTexture(),-17*travel,-2*variation,19*travel,4*variation);
    c.drawImage(this.weaponFlameTexture(),-5*variation,-5*variation,10*variation,10*variation);
    ellipse(c,0,0,1.5,1.5,'#fff5cc');
    c.restore();
  }
  muzzleEffect(c,life,tip,size,flashTime){
    if(!(life>0))return;
    const progress=clamp(1-life/WEAPON_MUZZLE_TIME,0,1);
    if(this.settings.effects)this.smoke(c,{x:tip+size*.35,y:0,size:size*.35,life,maxLife:WEAPON_MUZZLE_TIME,exhaust:true,smokeVariant:0},.55);
    if(progress*WEAPON_MUZZLE_TIME<flashTime){
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
  playerMuzzle(c,p){
    const life=p.muzzleSmoke||0;
    if(this.settings.effects&&life>0)this.smoke(c,{x:48,y:0,size:5,life,maxLife:WEAPON_MUZZLE_TIME,exhaust:true,smokeVariant:0},.4);
    if(!(p.muzzle>0))return;
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
    if(this.map.layout==='valley'){
      c.beginPath();c.moveTo(W*.1,-60);c.bezierCurveTo(W*.3,H*.2,W*.06,H*.54,W*.32,H+60);
      c.strokeStyle='#356b7b';c.lineWidth=105;c.stroke();c.strokeStyle='#75b5b566';c.lineWidth=70;c.stroke();
      c.strokeStyle='#c2dfc655';c.lineWidth=2;c.setLineDash([25,35]);c.stroke();c.setLineDash([]);
    }else if(this.map.layout==='canyon'){
      for(let i=0;i<7;i++){
        const x=W*(.06+i*.15);c.beginPath();c.moveTo(x,-30);c.bezierCurveTo(x+100,H*.25,x-100,H*.6,x+50,H+30);
        c.strokeStyle=i%2?'#563d4b44':'#e5a07844';c.lineWidth=25+i*5;c.stroke();
      }
    }
    // Old supply road, tyre tracks, and dusty shoulders.
    c.beginPath();
    if(this.map.layout==='valley'){c.moveTo(-80,H*.25);c.bezierCurveTo(W*.3,H*.15,W*.45,H*.65,W*.72,H*.5);c.bezierCurveTo(W*.9,H*.4,W*.85,H*.75,W+100,H*.8);}
    else if(this.map.layout==='canyon'){c.moveTo(W*.2,-80);c.bezierCurveTo(W*.6,H*.15,W*.28,H*.42,W*.52,H*.65);c.bezierCurveTo(W*.7,H*.85,W*.83,H*.65,W*.91,H+100);}
    else{c.moveTo(-80,H*.68);c.bezierCurveTo(W*.24,H*.43,W*.43,H*.9,W*.65,H*.61);c.bezierCurveTo(W*.84,H*.36,W*.91,H*.56,W+100,H*.24);}
    c.strokeStyle='#9a96754a';c.lineWidth=105;c.stroke();c.strokeStyle='#343f3288';c.lineWidth=76;c.stroke();
    c.strokeStyle='#b4ac7733';c.lineWidth=2;c.setLineDash([18,24]);c.stroke();c.setLineDash([]);
    // Secondary access road.
    c.beginPath();c.moveTo(W*.72,-30);c.lineTo(W*.72,H*.4);c.lineTo(W*.84,H*.48);c.lineWidth=39;c.strokeStyle='#424c3855';c.stroke();
    // Sparse scrub and rocks, kept low contrast so projectiles read clearly.
    for(let i=0;i<210;i++){
      const x=r()*W,y=r()*H,size=2+r()*11;
      if(r()>.44){ellipse(c,x+3,y+4,size*1.2,size*.65,'#24322630');ellipse(c,x,y,size,size*.63,'#46523a');ellipse(c,x-2,y-2,size*.62,size*.4,'#7e8461');}
      else {for(let j=0;j<3;j++)ellipse(c,x+r()*9,y+r()*9,size*.5,size*.35,'#35463250');}
    }
    // Concrete landing area.
    const landing=this.map.layout==='valley'?[.68,.22]:this.map.layout==='canyon'?[.24,.68]:[.35,.37];
    c.save();c.translate(W*landing[0],H*landing[1]);c.rotate(-.13);c.fillStyle='#1b281c22';c.fillRect(-92,-83,200,186);c.fillStyle='#85867244';c.fillRect(-99,-94,188,176);
    c.strokeStyle='#d2d1a44d';c.lineWidth=2;c.strokeRect(-87,-82,164,152);c.beginPath();c.arc(-5,-6,57,0,TAU);c.stroke();
    c.fillStyle='#d1d0a45c';c.font='bold 63px Arial';c.textAlign='center';c.fillText('H',-5,16);
    c.font='8px monospace';c.fillStyle='#c4c69a77';c.fillText('NIGHTHAWK / 07',-5,63);c.restore();
    if(this.map.layout==='valley'){
      this.compound(c,W*.78,H*.76,.84);this.compound(c,W*.38,H*.24,.72);
      this.compound(c,W*.17,H*.7,.5);this.compound(c,W*.57,H*.52,.48);
    }else if(this.map.layout==='canyon'){
      this.compound(c,W*.72,H*.25,.84);this.compound(c,W*.53,H*.82,.72);
      this.compound(c,W*.17,H*.32,.5);this.compound(c,W*.84,H*.65,.48);
    }else{
      this.compound(c,W*.8,H*.2,.84);this.compound(c,W*.14,H*.8,.72);
      this.compound(c,W*.52,H*.3,.5);this.compound(c,W*.68,H*.68,.48);
    }
    // Sector grid and survey marks.
    c.strokeStyle='#e4edb009';c.lineWidth=1;
    for(let x=0;x<W;x+=100){c.beginPath();c.moveTo(x,0);c.lineTo(x,H);c.stroke();}
    for(let y=0;y<H;y+=100){c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke();}
    c.font='8px monospace';c.fillStyle='#d3d6b533';c.textAlign='left';
    for(let x=90;x<W;x+=260)for(let y=150;y<H-100;y+=250){c.fillText('+',x,y);c.fillText(`${Math.round(x/10)}.${Math.round(y/10)}`,x+10,y+2);}
    c.save();c.translate(W*.69,H*.85);c.rotate(-.2);c.font='bold 45px Arial';c.fillStyle='#d7d8b620';c.fillText(this.mapLabel||this.map.name,0,0);c.restore();
  }
  compound(c,x,y,s) {
    c.save();c.translate(x,y);c.scale(s,s);c.rotate(.08);
    c.fillStyle='#28352233';c.fillRect(-110,-95,240,200);
    c.strokeStyle='#a6a78b55';c.lineWidth=1;c.strokeRect(-125,-112,263,232);
    for(let i=-120;i<130;i+=17){c.fillStyle='#c3c1a45c';c.fillRect(i,-115,2,6);c.fillRect(i,117,2,6);}
    const building=(bx,by,w,h)=>{
      c.fillStyle='#18241e55';c.fillRect(bx+9,by+12,w,h);
      c.fillStyle='#3d493c';c.fillRect(bx,by,w,h);c.fillStyle='#78816b';c.fillRect(bx+3,by+3,w-6,h-8);
      c.fillStyle='#858e76';c.fillRect(bx+3,by+3,w-6,4);c.fillStyle='#434f42';c.fillRect(bx+8,by+h-8,w-16,5);
      c.strokeStyle='#46533f';c.lineWidth=2;for(let xx=bx+12;xx<bx+w-8;xx+=12){c.beginPath();c.moveTo(xx,by+8);c.lineTo(xx,by+h-13);c.stroke();}
      c.fillStyle='#4b5747';c.fillRect(bx+w*.4,by+8,15,13);c.fillStyle='#a1aa83';c.fillRect(bx+w*.4,by+8,15,3);
    };
    building(-98,-80,104,58);building(27,-78,80,112);building(-98,2,58,78);
    for(let i=0;i<3;i++){c.fillStyle=i===1?'#7c7954':'#596b4e';c.fillRect(-19+i*34,62,28,48);c.strokeStyle='#25382266';for(let j=0;j<5;j++)c.strokeRect(-16+i*34,65+j*8,22,4);}
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
    path(c,[[10,-10],[24,-7],[30,-2],[11,-2]],'#263e35','#bbd9b144');
    path(c,[[11,2],[30,2],[24,7],[10,10]],'#2e4c3d','#bbd9b144');
    path(c,[[12,-9],[21,-7],[25,-4],[13,-4]],'#7aa18a66');
    path(c,[[12,4],[24,4],[20,6],[12,8]],'#7aa18a44');
    c.fillStyle='#b5c096';c.fillRect(-8,-10,3,20);c.fillStyle='#3c503f';c.fillRect(-14,-7,5,14);
    c.fillStyle='#d2d7ad';c.fillRect(4,-12,1,2);c.fillRect(4,10,1,2);
    c.save();c.translate(-62,0);const rotorPhase=reduced?0:Math.abs(Math.sin(t*42));ellipse(c,0,0,15+4*rotorPhase,2+rotorPhase,'#d8dfb699');c.save();c.rotate(reduced?0:Math.sin(t*42)*.12);ellipse(c,0,0,13+3*rotorPhase,1,'#aebd9a88');c.restore();c.fillStyle='#455240';c.fillRect(-3,-2,6,4);c.restore();
    c.save();c.translate(-5,0);c.rotate(reduced?0:t*49);
    c.strokeStyle='#e7eed92c';c.lineWidth=2;c.beginPath();c.arc(0,0,45,0,TAU);c.stroke();
    c.strokeStyle='#dce8ca55';c.lineWidth=3;c.beginPath();
    for(let i=0;i<4;i++){const a=i*Math.PI/2+.1;c.moveTo(42*Math.cos(a),42*Math.sin(a));c.arc(0,0,42,a,a+.55);}
    c.stroke();
    for(let i=0;i<4;i++){c.rotate(Math.PI/2);path(c,[[0,-2],[46,-3],[44,0],[0,2]],'#e2e7cc99');}
    ellipse(c,0,0,5,5,'#374e3e');ellipse(c,-1,-1,2,2,'#c3caa9');c.restore();
    if(reduced||Math.sin(t*5)>0)ellipse(c,-51,0,2,2,'#f7a26d');ellipse(c,1,-19,1.5,1.5,'#c1ed95');
    if(!ghost&&!reduced&&t%2<.12){ellipse(c,18,-18,3,3,'#ffffff');ellipse(c,18,18,3,3,'#ff5d52');}
    if(!ghost&&!reduced&&t%1.5<.12)ellipse(c,-72,0,2.5,2.5,'#ffb35c');
    c.restore();
    c.restore();
  }
  tank(c,e,boss,char) {
    c.fillStyle='#14231655';c.fillRect(-22+6,-21+7,47,46);
    this.tankTracks(c,e,boss,char);
    if(boss)this.goliathHull(c,char);
    else this.tankHull(c,boss,char);
    this.tankTurret(c,e,char);
    if(!boss){c.strokeStyle='#c5b78866';c.lineWidth=1;c.beginPath();c.moveTo(-14,-12);c.lineTo(-18,-32);c.stroke();}
  }
  tankTracks(c,e,boss,char) {
    const trackLeft=boss?-30:-23,trackRight=boss?27:20,trackOuter=boss?27:22,trackInner=boss?13:11,trackHeight=trackOuter-trackInner;
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
  tankTurret(c,e,char) {
    c.save();c.rotate((e.turret??e.angle)-e.angle);
    path(c,[[-9,-10],[9,-10],[16,-5],[16,5],[8,10],[-9,10],[-13,4],[-13,-4]],char?'#4b503d':'#a49f75',char?'#171b16':'#c5b68966');
    path(c,[[-9,-10],[9,-10],[16,-5],[16,5],[8,10],[-9,10],[-13,4],[-13,-4]],this.tankShade(c));
    const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    const life=!e.wreck&&!char&&e.health>0?e.weaponMuzzle||0:0;
    const recoil=!reduced?({tank:2.5,artillery:5,boss:4}[e.type]||0)*clamp(life/WEAPON_MUZZLE_TIME,0,1):0;
    c.save();c.translate(-recoil,0);
    c.fillStyle=char?'#363d30':'#b5ac7b';c.fillRect(5,-3,e.type==='artillery'?37:27,6);c.fillStyle='#4c5940';c.fillRect(e.type==='artillery'?35:27,-4,5,8);
    c.fillStyle=char?'#666959':'#d0c799';c.fillRect(8,-3,e.type==='artillery'?25:15,1);c.fillStyle=char?'#242c23':'#6a7457';c.fillRect(22,-3,2,6);
    if(life&&!reduced)this.muzzleEffect(c,life,e.type==='artillery'?42:32,({tank:10,artillery:18,boss:17}[e.type]||10),.075);
    c.restore();
    if(e.type==='aa'){
      const muzzle=!e.wreck&&!char&&e.health>0?e.aaMuzzle:null;
      for(let i=0;i<2;i++){
        const y=i?8:-8,active=muzzle?.barrel===i&&muzzle.life>0;
        const recoil=active&&!reduced?3*clamp(muzzle.life/AA_MUZZLE_TIME,0,1):0,tip=32-recoil;
        c.fillStyle=char?'#555648':'#b5ac7b';c.fillRect(5-recoil,y-2,27,4);
        if(active&&!reduced){
          if(this.settings.effects)this.smoke(c,{x:tip+4,y,size:5,life:muzzle.life,maxLife:AA_MUZZLE_TIME,exhaust:true,smokeVariant:i},.55);
          if(AA_MUZZLE_TIME-muzzle.life<AA_FLASH_TIME){
            path(c,[[tip,y-3],[tip+7,y-2],[tip+12,y],[tip+7,y+2],[tip,y+3]],'#ffac58');
            path(c,[[tip,y-1.5],[tip+8,y],[tip,y+1.5]],'#fff4bd');
          }
        }
      }
    }
    ellipse(c,-1,-1,5,5,'#5b674a');ellipse(c,-1,-1,3,3,char?'#383e32':'#87926b');c.fillStyle='#dc9a6c';c.fillRect(-4,-2,6,2);c.restore();
  }
  droneRotor(c,x,y,phase) {
    ellipse(c,x,y,10.5,10.5,'#b9cbb31c');
    c.save();c.translate(x,y);
    c.strokeStyle='#d3e2c34a';c.lineWidth=1.5;
    for(let i=0;i<2;i++){c.beginPath();c.arc(0,0,9,phase+i*Math.PI,phase+i*Math.PI+1.25);c.stroke();}
    ellipse(c,0,0,4.5,4.5,'#384a3c');ellipse(c,0,0,2.4,2.4,'#a9b394');ellipse(c,0,0,1,1,'#39483a');
    c.restore();
  }
  drone(c,e,t,reduced) {
    const dart=e.type==='kamikaze';
    const motors=dart?[[10,-13],[10,13],[-13,-17],[-13,17]]:[[14,-15],[14,15],[-14,-15],[-14,15]];
    c.strokeStyle='#455847';c.lineWidth=dart?3:4;c.lineCap='round';c.beginPath();
    for(const [x,y] of motors){c.moveTo(dart?(x>0?3:-5):x*.35,y*.3);c.lineTo(x,y);}c.stroke();
    for(let i=0;i<motors.length;i++)this.droneRotor(c,motors[i][0],motors[i][1],(reduced?0:t*18)+(e.seed||0)+i*1.3);
    c.save();c.scale(dart?1:.8,dart?.75:.8);
    if(dart){
      path(c,[[-14,-5],[-8,-8],[4,-6],[17,0],[4,6],[-8,8],[-14,5]],'#7c876b','#c4c7a466');
      path(c,[[-10,-4],[3,-4],[12,0],[3,4],[-10,4]],'#a8ad89');
      path(c,[[4,-3],[14,0],[4,3]],'#d38a5e');
      c.fillStyle='#4b5a48';c.fillRect(-10,-2,6,4);
    }else{
      path(c,[[-12,-10],[5,-11],[13,-7],[16,0],[13,7],[5,11],[-12,10],[-15,5],[-15,-5]],'#7f8b70','#c5ccaa77');
      path(c,[[-10,-8],[4,-9],[10,-5],[10,5],[4,9],[-10,8],[-12,4],[-12,-4]],'#a5ad8b');
      path(c,[[-10,3],[5,4],[10,1],[9,6],[4,9],[-10,8]],'#687c62');
      c.fillStyle='#4c5d4b';for(let y=-4;y<=4;y+=4)c.fillRect(-10,y,5,1);
      c.strokeStyle='#5e7059';c.lineWidth=1;c.beginPath();c.moveTo(-2,-8);c.lineTo(-2,8);c.stroke();
    }
    ellipse(c,13,0,2.5,3,'#33483e');ellipse(c,14,-.5,1,1.3,'#a6d9cd');c.restore();
    ellipse(c,motors[0][0],motors[0][1],1.2,1.2,'#e5bf7c');ellipse(c,motors[1][0],motors[1][1],1.2,1.2,'#d77b68');
  }
  enemy(c,e,t) {
    const drone=e.type==='drone'||e.type==='kamikaze';
    const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(drone){c.save();c.translate(e.x+5,e.y+8);c.rotate(e.visualHeading??e.angle);c.scale(ENEMIES[e.type].scale,ENEMIES[e.type].scale);ellipse(c,0,0,23,14,'#10231638');ellipse(c,0,0,16,9,'#10231620');c.restore();}
    c.save();c.translate(e.x,e.y);c.rotate(drone?(e.visualHeading??e.angle):e.angle);
    const boss=e.type==='boss',char=e.charred;c.scale(ENEMIES[e.type].scale,ENEMIES[e.type].scale);
    if(drone){
      const bank=reduced?0:(e.visualBank||0),pitch=reduced?0:(e.visualPitch||0);
      c.translate(pitch*4,bank*4+(reduced?0:Math.sin(t*2+(e.seed||0))*1.2));c.rotate(bank*.4);c.scale(1-Math.abs(pitch)*.2,1-Math.abs(bank)*.3);
      this.drone(c,e,t,reduced);
      if(e.type==='drone'&&!reduced&&e.health>0&&e.weaponMuzzle>0){
        c.save();c.translate(10.4,0);c.rotate((e.turret??e.angle)-(e.visualHeading??e.angle)-bank*.4);
        this.muzzleEffect(c,e.weaponMuzzle,0,5,.075);c.restore();
      }
    }else if(e.type==='rocketSemi'){
      c.fillStyle='#182a1e77';c.fillRect(-34,-15,70,37);
      for(const x of [-27,-15,21])for(const y of [-16,13]){
        c.fillStyle='#242e26';c.beginPath();c.roundRect(x-5,y,10,5,2);c.fill();
        c.fillStyle=char?'#394039':'#4c5a48';c.fillRect(x-3,y+1,6,1);
      }
      c.fillStyle=char?'#353b31':'#6c7857';c.fillRect(-34,-13,46,26);c.fillStyle=char?'#484c3e':'#a1a582';c.fillRect(12,-14,22,28);
      c.fillStyle=char?'#252d25':'#4f6049';c.fillRect(-33,9,44,4);c.fillRect(-33,-13,44,3);
      c.fillStyle=char?'#30382d':'#899276';c.fillRect(-30,-9,36,2);
      c.fillStyle=char?'#272f27':'#53624c';for(const x of [-32,-20,16]){c.fillRect(x,-14,10,2);c.fillRect(x,12,10,2);}
      c.fillStyle=char?'#202820':'#485849';c.fillRect(23,-10,7,20);
      c.fillStyle=char?'#303a32':'#698a83';c.fillRect(24,-8,4,7);c.fillRect(24,1,4,7);
      c.fillStyle=char?'#565a49':'#c3c39c';c.fillRect(13,-12,18,2);c.fillRect(32,-12,2,24);
      c.fillStyle=char?'#242c24':'#43533f';c.fillRect(34,-11,2,22);
      c.fillStyle=char?'#252d25':'#4a5942';c.fillRect(-16,-11,6,22);c.fillRect(3,-11,6,22);
      c.save();c.rotate((e.turret??e.angle)-e.angle);
      c.fillStyle=char?'#30392f':'#4b5c45';c.fillRect(-23,-11,52,22);
      c.fillStyle=char?'#252d25':'#354936';c.fillRect(-21,-9,50,18);
      c.fillStyle=char?'#484c3e':'#7a8665';c.fillRect(-21,-10,49,2);
      for(const y of [-6,0,6]){
        c.fillStyle=char?'#44493d':'#7f886b';c.fillRect(-19,y-2,48,4);
        c.fillStyle=char?'#363d30':'#a3aa86';c.fillRect(-18,y-2,45,1);
        ellipse(c,30,y,2,2.4,char?'#747462':'#c4c49e');
        ellipse(c,30,y,1,1.4,'#1c2820');
      }
      if(!e.wreck&&!char&&!reduced&&e.health>0&&e.launchIgnition>0)this.launcherIgnition(c,e.launchIgnition);
      c.restore();
    }else{
      this.tank(c,e,boss,char);
    }
    if(e.hit>0){c.globalAlpha=clamp(e.hit*5,0,.65);ellipse(c,0,0,22,17,'#fff6c4');c.globalAlpha=1;}
    if(e.charge>.4){c.strokeStyle=`rgba(243,151,94,${e.charge*.6})`;c.lineWidth=1;c.beginPath();c.arc(0,0,31,0,TAU*e.charge);c.stroke();}
    c.restore();
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
    if(!fire.level)return;
    const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    const age=d.age||0,seed=d.seed||0,scale=ENEMIES[d.type].scale,texture=this.wreckFlameTexture();
    c.save();c.translate(d.x,d.y);c.scale(scale,scale);
    for(let i=0;i<(this.settings.effects?fire.points.length:2);i++){
      const {x,y,strength}=fire.points[i];if(strength<=0)continue;
      const phase=seed*2+i*2.7,wave=reduced?0:Math.sin(age*2.2+phase),sway=reduced?0:Math.sin(age*1.7+phase)*1.5;
      const width=(5+8*strength)*(1+.12*wave),height=(8+22*strength)*(1+(reduced?0:.14*Math.sin(age*2.6+phase)));
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
    c.save();if(this.settings.shake&&g.shake>0){c.translate((Math.random()-.5)*g.shake,(Math.random()-.5)*g.shake);}
    c.drawImage(this.terrain,0,0,W,H);
    for(const mark of g.treadMarks||[]){
      c.save();c.translate(mark.x,mark.y);c.rotate(mark.angle);c.globalAlpha=clamp(mark.life/mark.maxLife,0,1)*.45;
      const length=mark.trackLength||16,width=mark.trackWidth||6,offset=mark.trackOffset||18;
      c.fillStyle='#111812';c.fillRect(-length/2,-offset-width/2,length,width);c.fillRect(-length/2,offset-width/2,length,width);c.restore();
    }
    for(const d of g.decals){
      if(d.wreck)this.wreck(c,d);
      else{c.save();c.translate(d.x,d.y);c.rotate(d.angle);ellipse(c,0,0,d.size,d.size*.66,'#1c211c88');ellipse(c,0,0,d.size*.65,d.size*.42,'#0c150d66');c.fillStyle='#4a4b37';c.fillRect(-11,-6,21,12);c.restore();}
    }
    // A very slow cloud shadow drifts over the map.
    if(this.settings.effects){c.save();c.translate(camera.x*.3,camera.y*.3);const x=(t*12)%(W+600)-300,cloud=c.createRadialGradient(x,H*.35,30,x,H*.35,380);cloud.addColorStop(0,'#14231524');cloud.addColorStop(1,'#14231500');c.fillStyle=cloud;c.fillRect(-W,-H,W*3,H*3);c.restore();}
    for(const p of g.pickups){
      const bob=Math.sin(t*3+p.x)*2;c.strokeStyle='#d7ed9c44';c.lineWidth=1;c.beginPath();c.arc(p.x,p.y,23+Math.sin(t*3)*3,0,TAU);c.stroke();
      c.save();c.translate(p.x,p.y+bob);c.rotate(Math.PI/4);c.fillStyle='#1c321d';c.fillRect(-12,-12,24,24);c.strokeStyle='#d4e89a';c.strokeRect(-12,-12,24,24);c.rotate(-Math.PI/4);
      c.fillStyle='#dbea9b';c.fillRect(-3,-8,6,16);c.fillRect(-8,-3,16,6);c.restore();
    }
    for(const p of g.particles)if(p.screenSmoke)this.screenSmoke(c,p,SCREEN_SMOKE_RENDER.behind);
    for(const e of g.enemies)this.enemy(c,e,t);
    for(const p of g.particles)if(p.screenSmoke)this.screenSmoke(c,p,SCREEN_SMOKE_RENDER.front);
    if(g.state==='ready'){this.enemy(c,{x:W*.7,y:H*.73,angle:-2.2,type:'tank',health:3,maxHealth:3},t);this.enemy(c,{x:W*.87,y:H*.57,angle:-2.5,type:'tank',health:3,maxHealth:3},t);}
    for(const b of g.bullets){
      if(b.kind==='rocket'||b.kind==='enemyRocket')this.missile(c,b);
      else if(b.friendly&&b.kind==='gun')this.gunProjectile(c,b);
      else {c.strokeStyle=b.friendly?'#f4f1ab':'#ffac77';c.lineWidth=b.friendly?2:3;c.lineCap='round';c.beginPath();const len=b.friendly?20:13,sp=Math.hypot(b.vx,b.vy)||1;c.moveTo(b.x-b.vx/sp*len,b.y-b.vy/sp*len);c.lineTo(b.x,b.y);c.stroke();if(!b.friendly)ellipse(c,b.x,b.y,3,3,'#ffd2a5');}
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
    for(const p of g.particles){if(p.screenSmoke)continue;if(p.smoke){this.smoke(c,p);}else if(p.flare){this.flare(c,p,typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches);}else if(p.flakFlash||p.contactFlash){c.save();c.globalAlpha=clamp(p.life/p.maxLife,0,1);const glow=c.createRadialGradient(p.x,p.y,0,p.x,p.y,p.size);glow.addColorStop(0,'#fff6d0ee');glow.addColorStop(.4,'#ff9c4ca0');glow.addColorStop(1,'#ff792600');c.fillStyle=glow;c.fillRect(p.x-p.size,p.y-p.size,p.size*2,p.size*2);c.restore();}else{c.globalAlpha=clamp(p.life/p.maxLife,0,1);c.strokeStyle=p.color;c.lineWidth=p.size;c.beginPath();c.moveTo(p.x,p.y);c.lineTo(p.x-p.vx*.025,p.y-p.vy*.025);c.stroke();c.globalAlpha=1;}}c.globalAlpha=1;
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
