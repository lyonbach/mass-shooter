import { TAU, seededRandom, clamp, ENEMIES } from './core.js';
import { WRECK_TRANSITION_TIME, WRECK_FIRE_TIME, ROCKET_NOZZLE_OFFSET } from './game/constants.js';

const path = (c, points, fill, stroke) => {
  c.beginPath(); points.forEach(([x,y], i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.stroke(); }
};
function ellipse(c,x,y,rx,ry,color) { c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill(); }
const SMOKE_STOPS={
  screen:[[0,'#f5f6efcc'],[.45,'#e1e4df99'],[1,'#d7dedb00']],
  wreck:[[0,'#202820cc'],[.45,'#171e18aa'],[1,'#11181200']],
  explosion:[[0,'#606858cc'],[.45,'#394539aa'],[1,'#28342a00']],
  exhaust:[[0,'#e4d9bccc'],[.45,'#b5aa91aa'],[1,'#938c7900']]
};
const SMOKE_SHAPES=[[1,1],[1,.78],[.78,1]],SMOKE_PUFF_SIZE=64;

export class Renderer {
  constructor(canvas, settings) { this.canvas=canvas; this.ctx=canvas.getContext('2d',{alpha:false}); this.settings=settings; this.smokePuffs=new Map(); this.tankShades=new WeakMap(); }
  tankShade(c){
    let shade=this.tankShades.get(c);
    if(!shade){shade=c.createLinearGradient(0,-16,0,16);shade.addColorStop(0,'#ffffff25');shade.addColorStop(.5,'#ffffff00');shade.addColorStop(1,'#10181055');this.tankShades.set(c,shade);}
    return shade;
  }
  smoke(c,p,alpha=1){
    const progress=clamp(1-p.life/p.maxLife,0,1),radius=p.size*(.8+progress*1.5);
    if(!(radius>0))return;
    const kind=p.screenSmoke?'screen':p.exhaust?'exhaust':p.persistent?'wreck':'explosion';
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
    c.save();c.globalAlpha*=alpha*Math.sin(Math.PI*progress);
    c.drawImage(puff,p.x-radius,p.y-radius,radius*2,radius*2);c.restore();
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
    c.save();c.translate(p.x,p.y);
    if(!ghost){
      c.save();c.translate(13,19);c.rotate(p.angle);c.scale(1.12,.72);
      path(c,[[-14,-6],[-63,-3],[-72,0],[-62,4],[-14,6]],'#0b170c4d');
      path(c,[[-25,-9],[-17,-15],[12,-14],[30,-7],[35,0],[28,9],[11,14],[-18,13],[-26,6]],'#0b170c4d');
      c.save();c.translate(-5,0);c.rotate(t*49);c.fillStyle='#0b170c24';c.fillRect(-48,-2,96,4);c.restore();
      c.restore();
    }
    const bank=p.bank||0,pitch=p.pitch||0;
    c.rotate(p.angle);
    c.translate(pitch*30,bank*30);
    c.rotate(bank*.45);
    c.scale(1-Math.abs(pitch)*.3,1-Math.abs(bank)*.5);
    if(ghost)c.globalAlpha=.3;
    // Tail boom, horizontal stabilizers, pods and skids.
    path(c,[[-14,-6],[-63,-3],[-72,0],[-62,4],[-14,6]],'#728471','#c2cba755');
    path(c,[[-52,-3],[-61,-18],[-66,-18],[-63,0],[-62,17],[-55,17]],'#81947b');
    c.save();c.translate(20,0);c.rotate((p.cannonAngle??p.angle)-p.angle);c.scale(.5,.5);c.fillStyle='#4c5940';c.fillRect(-4,-5,26,10);c.fillStyle='#b5ac7b';c.fillRect(17,-2,25,4);c.fillStyle='#303d32';c.fillRect(-7,-3,8,6);c.fillStyle='#e0e5b9';c.fillRect(39,-1,3,2);if(p.muzzle>0&&!ghost)path(c,[[42,-10],[88,0],[42,10],[56,0]],'#fff2a8');c.restore();
    c.fillStyle='#283d33';c.fillRect(-16,-19,36,4);c.fillRect(-16,15,36,4);c.fillStyle='#475f4c';c.fillRect(-10,-23,22,7);c.fillRect(-10,16,22,7);
    c.fillStyle='#9aa484';c.fillRect(4,-22,19,3);c.fillRect(4,19,19,3);
    path(c,[[-25,-9],[-17,-15],[12,-14],[30,-7],[35,0],[28,9],[11,14],[-18,13],[-26,6]],'#8b9a78','#c1cba460');
    path(c,[[-21,-8],[-11,-11],[4,-10],[4,10],[-13,11],[-21,5]],'#657b61');
    path(c,[[9,-11],[26,-6],[30,-1],[11,-1]],'#263e35','#bbd9b144');
    path(c,[[11,2],[29,2],[25,7],[9,11]],'#2e4c3d','#bbd9b144');
    c.fillStyle='#b5c096';c.fillRect(-8,-10,3,20);c.fillStyle='#3c503f';c.fillRect(-14,-7,5,14);
    c.save();c.translate(-62,0);const rotorPhase=Math.abs(Math.sin(t*42));ellipse(c,0,0,15+4*rotorPhase,2+rotorPhase,'#d8dfb699');c.save();c.rotate(Math.sin(t*42)*.12);ellipse(c,0,0,13+3*rotorPhase,1,'#aebd9a88');c.restore();c.fillStyle='#455240';c.fillRect(-3,-2,6,4);c.restore();
    c.save();c.translate(-5,0);c.rotate(t*49);
    c.strokeStyle='#e7eed92c';c.lineWidth=2;c.beginPath();c.arc(0,0,45,0,TAU);c.stroke();
    for(let i=0;i<4;i++){c.rotate(Math.PI/2);path(c,[[0,-2],[46,-3],[44,0],[0,2]],'#e2e7cc99');}
    ellipse(c,0,0,5,5,'#374e3e');ellipse(c,-1,-1,2,2,'#c3caa9');c.restore();
    if(Math.sin(t*5)>0)ellipse(c,-51,0,2,2,'#f7a26d');ellipse(c,1,-19,1.5,1.5,'#c1ed95');
    if(!ghost&&t%2<.12){ellipse(c,18,-18,3,3,'#ffffff');ellipse(c,18,18,3,3,'#ff5d52');}
    if(!ghost&&t%1.5<.12)ellipse(c,-72,0,2.5,2.5,'#ffb35c');
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
    c.fillStyle=char?'#363d30':'#b5ac7b';c.fillRect(5,-3,e.type==='artillery'?37:27,6);c.fillStyle='#4c5940';c.fillRect(e.type==='artillery'?35:27,-4,5,8);
    c.fillStyle=char?'#666959':'#d0c799';c.fillRect(8,-3,e.type==='artillery'?25:15,1);c.fillStyle=char?'#242c23':'#6a7457';c.fillRect(22,-3,2,6);
    if(e.type==='aa'){c.fillStyle='#b5ac7b';c.fillRect(5,-10,27,4);c.fillRect(5,6,27,4);}
    ellipse(c,-1,-1,5,5,'#5b674a');ellipse(c,-1,-1,3,3,char?'#383e32':'#87926b');c.fillStyle='#dc9a6c';c.fillRect(-4,-2,6,2);c.restore();
  }
  droneRotor(c,x,y,phase) {
    ellipse(c,x,y,9,9,'#b9cbb31c');
    c.save();c.translate(x,y);
    c.strokeStyle='#d3e2c34a';c.lineWidth=1.5;
    for(let i=0;i<2;i++){c.beginPath();c.arc(0,0,7.5,phase+i*Math.PI,phase+i*Math.PI+1.25);c.stroke();}
    ellipse(c,0,0,4.5,4.5,'#384a3c');ellipse(c,0,0,2.4,2.4,'#a9b394');ellipse(c,0,0,1,1,'#39483a');
    c.restore();
  }
  drone(c,e,t,reduced) {
    const dart=e.type==='kamikaze';
    const motors=dart?[[9,-12],[9,12],[-12,-16],[-12,16]]:[[13,-14],[13,14],[-13,-14],[-13,14]];
    c.strokeStyle='#455847';c.lineWidth=dart?4:6;c.lineCap='round';c.beginPath();
    for(const [x,y] of motors){c.moveTo(dart?(x>0?3:-5):x*.35,y*.3);c.lineTo(x,y);}c.stroke();
    for(let i=0;i<motors.length;i++)this.droneRotor(c,motors[i][0],motors[i][1],(reduced?0:t*18)+(e.seed||0)+i*1.3);
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
    ellipse(c,dart?13:13,0,2.5,3,'#33483e');ellipse(c,dart?14:14,-.5,1,1.3,'#a6d9cd');
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
    }else if(e.type==='rocketSemi'){
      c.fillStyle='#182a1e77';c.fillRect(-34,-15,70,37);
      c.fillStyle='#29392d';for(const x of [-25,-7,21]){ellipse(c,x,-16,6,5,'#29392d');ellipse(c,x,16,6,5,'#29392d');}
      c.fillStyle=char?'#353b31':'#6c7857';c.fillRect(-34,-13,46,26);c.fillStyle=char?'#484c3e':'#a1a582';c.fillRect(12,-14,22,28);
      c.fillStyle=char?'#202820':'#485849';c.fillRect(23,-10,7,20);
      c.save();c.rotate((e.turret??e.angle)-e.angle);c.fillStyle=char?'#30392f':'#4b5c45';c.fillRect(-21,-10,38,20);c.fillStyle=char?'#555648':'#c0b98b';for(const y of [-6,0,6])c.fillRect(-14,y-2,30,4);c.restore();
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
    const intensity=clamp((d.burnTime||0)/WRECK_FIRE_TIME,0,1);
    if(!intensity)return;
    const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    const age=reduced?0:(d.age||0),seed=d.seed||0,scale=ENEMIES[d.type].scale;
    c.save();c.translate(d.x,d.y);c.scale(scale,scale);c.globalAlpha=intensity;
    const points=d.type==='rocketSemi'?[[-20,0],[12,-3]]:d.type==='boss'?[[-23,0],[-5,-4],[17,3]]:[[-14,0],[0,-3],[12,3]];
    const glow=c.createRadialGradient(0,0,0,0,0,32);glow.addColorStop(0,'#ff9b3138');glow.addColorStop(1,'#ff5b1700');c.fillStyle=glow;c.fillRect(-32,-32,64,64);
    for(let i=0;i<(this.settings.effects?points.length:1);i++){
      const [x,y]=points[i],phase=seed*2+i*2.7,flicker=reduced?1:.9+.12*Math.sin(age*5+phase)+.07*Math.sin(age*9+phase*1.7);
      const sway=reduced?0:3*Math.sin(age*3+phase);
      c.save();c.translate(x*Math.cos(d.angle)-y*Math.sin(d.angle),x*Math.sin(d.angle)+y*Math.cos(d.angle));c.scale(1,flicker);
      path(c,[[-6,3],[-7,-3],[-4,-9],[sway-3,-17],[sway,-11],[sway+4,-23],[5,-9],[7,-3],[5,3]],'#b83f20');
      path(c,[[-4,3],[-5,-3],[-2,-9],[sway+1,-16],[sway+2,-9],[4,-5],[4,2]],'#f48931');
      path(c,[[-2,3],[-2,-3],[sway*.5,-9],[2,-5],[3,2]],'#ffe09a');
      if(!reduced){ellipse(c,5+Math.sin(age*3+phase)*4,-16-(age*10+i*7)%12,1,1.5,'#ffc66d');}
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
    for(const p of g.particles)if(p.screenSmoke)this.screenSmoke(c,p,.45);
    for(const e of g.enemies)this.enemy(c,e,t);
    for(const p of g.particles)if(p.screenSmoke)this.screenSmoke(c,p,.25);
    if(g.state==='ready'){this.enemy(c,{x:W*.7,y:H*.73,angle:-2.2,type:'tank',health:3,maxHealth:3},t);this.enemy(c,{x:W*.87,y:H*.57,angle:-2.5,type:'tank',health:3,maxHealth:3},t);}
    for(const b of g.bullets){
      if(b.kind==='rocket'||b.kind==='enemyRocket')this.missile(c,b);
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
    for(const p of g.particles){if(p.screenSmoke)continue;if(p.smoke){this.smoke(c,p);}else{c.globalAlpha=clamp(p.life/p.maxLife,0,1);c.strokeStyle=p.color;c.lineWidth=p.size;c.beginPath();c.moveTo(p.x,p.y);c.lineTo(p.x-p.vx*.025,p.y-p.vy*.025);c.stroke();if(p.flare){ellipse(c,p.x,p.y,p.size*3.4,p.size*3.4,'#ff9b59aa');ellipse(c,p.x,p.y,p.size*1.8,p.size*1.8,'#fff6c4');}c.globalAlpha=1;}}c.globalAlpha=1;
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
