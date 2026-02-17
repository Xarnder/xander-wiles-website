// ======== Gaussian Splatting Trainer — V6 Final Robust Placement ========
// This version uses a new, robust method to guarantee splats are always visible.
// It includes an on-screen debug panel to verify coordinates and canvas size.
// The key fix is a robust, simplified canvas sizing function and a delayed initialization
// to ensure the browser has computed the final layout before we read canvas dimensions.

/* ----------------- DOM refs ----------------- */
const canvas = document.getElementById('canvas');
const lossVal = document.getElementById('lossVal');
const paramErrVal = document.getElementById('paramErrVal');
const scoreVal = document.getElementById('scoreVal');

const newLevelBtn = document.getElementById('newLevelBtn');
const trainOneBtn = document.getElementById('trainOneBtn');
const trainTenBtn = document.getElementById('trainTenBtn');
const autoTrainChk = document.getElementById('autoTrainChk');
const heatmapChk = document.getElementById('heatmapChk');
const viewModeSel = document.getElementById('viewMode');

const posX = document.getElementById('posX');
const posY = document.getElementById('posY');
const scale = document.getElementById('scale');
const opacity = document.getElementById('opacity');
const color = document.getElementById('color');
const posXVal = document.getElementById('posXVal');
const posYVal = document.getElementById('posYVal');
const scaleVal = document.getElementById('scaleVal');
const opacityVal = document.getElementById('opacityVal');
const colorVal = document.getElementById('colorVal');

const anisotropyChk = document.getElementById('anisotropyChk');
const scaleX = document.getElementById('scaleX');
const scaleY = document.getElementById('scaleY');
const scaleXVal = document.getElementById('scaleXVal');
const scaleYVal = document.getElementById('scaleYVal');

const rotation = document.getElementById('rotation');
const rotationVal = document.getElementById('rotationVal');

// DEBUG PANEL REFS
const debugCanvasSizeVal = document.getElementById('debugCanvasSizeVal');
const debugTargetCoordsVal = document.getElementById('debugTargetCoordsVal');
const debugGuessCoordsVal = document.getElementById('debugGuessCoordsVal');


/* ----------------- Canvas setup ----------------- */
const ctx = canvas.getContext('2d', { willReadFrequently: true });

function fitCanvas() {
  // Robust method: Read the final size of the parent element.
  const parent = canvas.parentElement;
  if (!parent) return;

  const rect = parent.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  
  // Set the logical size (CSS pixels)
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  
  // Set the physical size (actual pixels for drawing)
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  
  // Scale the context to match the DPR
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener('resize', () => {
  fitCanvas();
  if (target) keepInBounds(target);
  if (guess) keepInBounds(guess);
  if (target && guess) render();
});

/* ----------------- Utilities ----------------- */
function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
function clampAngleRad(v){ const PI=Math.PI; while(v<0)v+=PI; while(v>PI)v-=PI; return v; }
function deg2rad(d){ return d * Math.PI / 180; }
function rad2deg(r){ return r * 180 / Math.PI; }
function hexToRgb(hex){ const v=hex.replace('#',''); const i=parseInt(v,16); return { r:(i>>16)&255, g:(i>>8)&255, b:i&255 }; }
function rgbToHex(r,g,b){ return '#' + [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join(''); }
function lerp(a,b,t){ return a + (b-a)*t; }
function easeInOutCubic(t){ return t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }
function lerpAnglePi(a,b,t){
  let d = b - a;
  if (d >  Math.PI/2) b -= Math.PI;
  if (d < -Math.PI/2) b += Math.PI;
  return clampAngleRad(a + (b-a)*t);
}

function normalizedMargins(sx, sy, theta){
  // Note: We now read dimensions from the style, not the attributes, for logical pixels
  const w = parseFloat(canvas.style.width) || canvas.width;
  const h = parseFloat(canvas.style.height) || canvas.height;
  if (w === 0 || h === 0) return { mx: 0.5, my: 0.5 };
  const c = Math.cos(theta), s = Math.sin(theta);
  const halfX_px = 3 * Math.sqrt(Math.pow(sx*w*c,2) + Math.pow(sy*h*s,2));
  const halfY_px = 3 * Math.sqrt(Math.pow(sx*w*s,2) + Math.pow(sy*h*c,2));
  const mx = halfX_px / w;
  const my = halfY_px / h;
  return { mx, my };
}

function keepInBounds(s){
  const { mx, my } = normalizedMargins(s.sx, s.sy, s.theta);
  const padX = Math.min(mx, 0.499);
  const padY = Math.min(my, 0.499);
  s.x = clamp(s.x, padX, 1 - padX);
  s.y = clamp(s.y, padY, 1 - padY);
}

/* ----------------- Model ----------------- */
class Splat {
  constructor(opts={}){
    this.x = opts.x ?? 0.5; this.y = opts.y ?? 0.5;
    this.sx = opts.sx ?? 0.15; this.sy = opts.sy ?? 0.15;
    this.theta = opts.theta ?? 0;
    this.opacity = opts.opacity ?? 0.8;
    this.color = opts.color ?? { r:220, g:150, b:255 };
  }
  clone(){ return new Splat(JSON.parse(JSON.stringify(this))); }
  setFromUI(){
    this.x = parseFloat(posX.value);
    this.y = parseFloat(posY.value);
    if (anisotropyChk.checked){ this.sx = parseFloat(scaleX.value); this.sy = parseFloat(scaleY.value); }
    else { const s=parseFloat(scale.value); this.sx=s; this.sy=s; }
    this.theta = clampAngleRad(deg2rad(parseFloat(rotation.value)));
    this.opacity = parseFloat(opacity.value);
    this.color = hexToRgb(color.value);
    keepInBounds(this);
  }
}
let target = null;
let guess  = null;
let useHeatmap = false;

/* ----------------- Rendering & Logic (Condensed for brevity) ----------------- */
function clear(){
  const w = parseFloat(canvas.style.width), h = parseFloat(canvas.style.height);
  ctx.clearRect(0,0,w,h);
  ctx.save();
  ctx.globalAlpha=0.20; ctx.strokeStyle='#1c2a44';
  for(let gx=0.1;gx<1;gx+=0.1){const X=gx*w; ctx.beginPath();ctx.moveTo(X,0);ctx.lineTo(X,h);ctx.stroke();}
  for(let gy=0.1;gy<1;gy+=0.1){const Y=gy*h; ctx.beginPath();ctx.moveTo(0,Y);ctx.lineTo(w,Y);ctx.stroke();}
  ctx.restore();
}
function renderGaussianToImageData(splat, imgData){
  const{width:w,height:h}=imgData;const data=imgData.data;const muX=splat.x*w,muY=splat.y*h;
  const sx=Math.max(1e-3,splat.sx*w),sy=Math.max(1e-3,splat.sy*h);const c=Math.cos(splat.theta),s=Math.sin(splat.theta);
  const inv2sx2=1.0/(2*sx*sx),inv2sy2=1.0/(2*sy*sy);const halfX=3*Math.sqrt((sx*c)*(sx*c)+(sy*s)*(sy*s));
  const halfY=3*Math.sqrt((sx*s)*(sx*s)+(sy*c)*(sy*c));const minX=Math.max(0,Math.floor(muX-halfX)),maxX=Math.min(w-1,Math.ceil(muX+halfX));
  const minY=Math.max(0,Math.floor(muY-halfY)),maxY=Math.min(h-1,Math.ceil(muY+halfY));
  const{r,g,b}=splat.color;const baseA=clamp(splat.opacity,0,1);
  for(let y=minY;y<=maxY;y++){const dy=y-muY;for(let x=minX;x<=maxX;x++){const dx=x-muX;const xL=dx*c+dy*s,yL=-dx*s+dy*c;
  const gval=Math.exp(-(xL*xL*inv2sx2+yL*yL*inv2sy2));const a=baseA*gval;const idx=(y*w+x)*4;
  const dstR=data[idx],dstG=data[idx+1],dstB=data[idx+2],dstA=data[idx+3]/255;const srcA=a,outA=srcA+dstA*(1-srcA);
  const srcR=r*srcA,srcG=g*srcA,srcB=b*srcA;data[idx]=Math.max(0,Math.min(255,srcR+dstR*(1-srcA)));
  data[idx+1]=Math.max(0,Math.min(255,srcG+dstG*(1-srcA)));data[idx+2]=Math.max(0,Math.min(255,srcB+dstB*(1-srcA)));
  data[idx+3]=Math.max(0,Math.min(255,outA*255));}}
}
function drawImageDataBlended(imgData){const off=document.createElement('canvas');off.width=imgData.width;off.height=imgData.height;
off.getContext('2d').putImageData(imgData,0,0);ctx.drawImage(off,0,0,parseFloat(canvas.style.width),parseFloat(canvas.style.height));}
function computeImagesAndLoss(){const dpr=window.devicePixelRatio||1;const w=Math.round(parseFloat(canvas.style.width)*dpr);
const h=Math.round(parseFloat(canvas.style.height)*dpr);const targetImg=ctx.createImageData(w,h);const guessImg=ctx.createImageData(w,h);
renderGaussianToImageData(target,targetImg);renderGaussianToImageData(guess,guessImg);let mse=0,count=0,td=targetImg.data,gd=guessImg.data;
for(let i=0;i<td.length;i+=4){const dr=td[i]-gd[i],dg=td[i+1]-gd[i+1],db=td[i+2]-gd[i+2];mse+=(dr*dr+dg*dg+db*db)/3;count++;}
return{targetImg,guessImg,mse:mse/count};}
function drawTargetContour(){const w=parseFloat(canvas.style.width),h=parseFloat(canvas.style.height);
const x=target.x*w,y=target.y*h;const rx=Math.max(6,target.sx*w*2),ry=Math.max(6,target.sy*h*2);const rot=target.theta;
ctx.save();ctx.globalAlpha=.9;ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.shadowColor='rgba(255,255,255,.25)';ctx.shadowBlur=4;
ctx.setLineDash([6,6]);ctx.beginPath();ctx.ellipse(x,y,rx,ry,rot,0,Math.PI*2);ctx.stroke();ctx.restore();ctx.save();
ctx.globalAlpha=.9;ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,Math.max(8,Math.min(w,h)*0.01),0,Math.PI*2);ctx.stroke();ctx.restore();}
function drawComposite(targetImg,guessImg){if(useHeatmap){const w=targetImg.width,h=targetImg.height;const out=ctx.createImageData(w,h);
const td=targetImg.data,gd=guessImg.data,od=out.data;for(let i=0;i<td.length;i+=4){const dr=td[i]-gd[i],dg=td[i+1]-gd[i+1],db=td[i+2]-gd[i+2];
const e=Math.sqrt((dr*dr+dg*dg+db*db)/3);const t=Math.max(0,Math.min(1,e/128));od[i]=255*t;od[i+1]=100*(1-Math.abs(t-0.5)*2);od[i+2]=255*(1-t);od[i+3]=255;}
drawImageDataBlended(out);drawTargetContour();return;}
const mode=viewModeSel.value;clear();if(mode==='guess'){drawImageDataBlended(guessImg);}else if(mode==='target'){drawImageDataBlended(targetImg);}
else{drawImageDataBlended(guessImg);ctx.save();ctx.globalAlpha=0.6;const off=document.createElement('canvas');off.width=targetImg.width;off.height=targetImg.height;
off.getContext('2d').putImageData(targetImg,0,0);ctx.drawImage(off,0,0,parseFloat(canvas.style.width),parseFloat(canvas.style.height));ctx.restore();}
drawTargetContour();}
function paramError(guess,target){const dx=Math.abs(guess.x-target.x),dy=Math.abs(guess.y-target.y);const dsx=Math.abs(guess.sx-target.sx)/0.7,dsy=Math.abs(guess.sy-target.sy)/0.7;
const dth=Math.min(Math.abs(guess.theta-target.theta),Math.PI-Math.abs(guess.theta-target.theta))/Math.PI;const dop=Math.abs(guess.opacity-target.opacity);
const dcR=Math.abs(guess.color.r-target.color.r)/255,dcG=Math.abs(guess.color.g-target.color.g)/255,dcB=Math.abs(guess.color.b-target.color.b)/255;
return(dx+dy+dsx+dsy+dth+dop+dcR+dcG+dcB)/9;}
function scoreFromLossAndParam(mse,pErr){const mseNorm=Math.max(0,Math.min(1,mse/(255*255*0.25)));const score=100*(1-0.6*mseNorm-0.4*Math.max(0,Math.min(1,pErr)));
return Math.max(0,Math.min(100,score)).toFixed(1);}
function updateDebugInfo() {
  const w = parseFloat(canvas.style.width).toFixed(0);
  const h = parseFloat(canvas.style.height).toFixed(0);
  debugCanvasSizeVal.textContent = `${w} x ${h}`;
  if (target) {
    debugTargetCoordsVal.textContent = `[${target.x.toFixed(3)}, ${target.y.toFixed(3)}]`;
  }
  if (guess) {
    debugGuessCoordsVal.textContent = `[${guess.x.toFixed(3)}, ${guess.y.toFixed(3)}]`;
  }
}
function render(){if(!target||!guess)return;const{targetImg,guessImg,mse}=computeImagesAndLoss();drawComposite(targetImg,guessImg);
const pErr=paramError(guess,target);lossVal.textContent=mse.toFixed(2);paramErrVal.textContent=pErr.toFixed(3);
scoreVal.textContent=scoreFromLossAndParam(mse,pErr);posXVal.textContent=`x = ${(+posX.value).toFixed(3)}`;
posYVal.textContent=`y = ${(+posY.value).toFixed(3)}`;if(anisotropyChk.checked){scaleXVal.textContent=`σx = ${(+scaleX.value).toFixed(3)}`;
scaleYVal.textContent=`σy = ${(+scaleY.value).toFixed(3)}`;}else{scaleVal.textContent=`σ = ${(+scale.value).toFixed(3)}`;}
rotationVal.textContent=`θ = ${(+rotation.value).toFixed(1)}°`;const c=hexToRgb(color.value);opacityVal.textContent=`opacity = ${(+opacity.value).toFixed(3)}`;
colorVal.textContent=`rgb(${c.r}, ${c.g}, ${c.b})`;updateDebugInfo();}
const AUTO_DURATION_MS=10000;let autoState=null;
function startAutoTrain(){if(autoState?.running)return;autoState={running:true,start:performance.now(),from:guess.clone(),to:target.clone()};requestAnimationFrame(loopAutoTrain);}
function stopAutoTrain(){if(autoState?.running)autoState.running=false;}
function loopAutoTrain(t){if(!autoState?.running)return;const elapsed=t-autoState.start;const rawT=Math.max(0,Math.min(1,elapsed/AUTO_DURATION_MS));
const e=easeInOutCubic(rawT);const f=autoState.from,to=autoState.to;guess.x=lerp(f.x,to.x,e);guess.y=lerp(f.y,to.y,e);
guess.sx=lerp(f.sx,to.sx,e);guess.sy=lerp(f.sy,to.sy,e);guess.theta=lerpAnglePi(f.theta,to.theta,e);guess.opacity=lerp(f.opacity,to.opacity,e);
guess.color.r=Math.round(lerp(f.color.r,to.color.r,e));guess.color.g=Math.round(lerp(f.color.g,to.color.g,e));
guess.color.b=Math.round(lerp(f.color.b,to.color.b,e));keepInBounds(guess);pushGuessToUI();render();
if(rawT<1){requestAnimationFrame(loopAutoTrain);}else{autoState.running=false;autoTrainChk.checked=false;}}
function nudgeTowardTarget(amount){const f=guess.clone(),to=target;guess.x=lerp(f.x,to.x,amount);guess.y=lerp(f.y,to.y,amount);
guess.sx=lerp(f.sx,to.sx,amount);guess.sy=lerp(f.sy,to.sy,amount);guess.theta=lerpAnglePi(f.theta,to.theta,amount);
guess.opacity=lerp(f.opacity,to.opacity,amount);guess.color.r=Math.round(lerp(f.color.r,to.color.r,amount));
guess.color.g=Math.round(lerp(f.color.g,to.color.g,amount));guess.color.b=Math.round(lerp(f.color.b,to.color.b,amount));
keepInBounds(guess);pushGuessToUI();render();}
function pushGuessToUI(){posX.value=guess.x;posY.value=guess.y;if(anisotropyChk.checked){scaleX.value=guess.sx;scaleY.value=guess.sy;}
else{const s=(guess.sx+guess.sy)/2;scale.value=s;}rotation.value=rad2deg(guess.theta).toFixed(1);opacity.value=guess.opacity;
color.value=rgbToHex(guess.color.r,guess.color.g,guess.color.b);}
function onAnyInput(){if(autoState?.running){stopAutoTrain();autoTrainChk.checked=false;}guess.setFromUI();render();}
[posX,posY,scale,opacity,color,scaleX,scaleY,rotation].forEach(el=>el.addEventListener('input',onAnyInput));
anisotropyChk.addEventListener('change',()=>{const enabled=anisotropyChk.checked;document.querySelectorAll('.aniso-group').forEach(g=>{
g.classList.toggle('enabled',enabled);g.querySelector('input').disabled=!enabled;});if(!enabled){const s=(guess.sx+guess.sy)/2;scale.value=s;}
onAnyInput();});viewModeSel.addEventListener('change',render);newLevelBtn.addEventListener('click',()=>{stopAutoTrain();autoTrainChk.checked=false;newLevel();});
trainOneBtn.addEventListener('click',()=>nudgeTowardTarget(0.10));trainTenBtn.addEventListener('click',()=>nudgeTowardTarget(0.60));
autoTrainChk.addEventListener('change',(e)=>{e.target.checked?startAutoTrain():stopAutoTrain();});
heatmapChk.addEventListener('change',(e)=>{useHeatmap=e.target.checked;render();});
window.addEventListener('keydown',(e)=>{const k=e.key.toLowerCase();if(k==='r'){stopAutoTrain();autoTrainChk.checked=false;newLevel();}
if(k==='t'){nudgeTowardTarget(0.10);}if(k==='h'){heatmapChk.checked=!heatmapChk.checked;useHeatmap=heatmapChk.checked;render();}
if(k==='1'){viewModeSel.value='guess';render();}if(k==='2'){viewModeSel.value='target';render();}if(k==='3'){viewModeSel.value='overlay';render();}});

/* ----------------- Level generation (ROBUST METHOD) ----------------- */
const BRIGHT_COLORS=[{r:255,g:240,b:0},{r:180,g:210,b:255},{r:100,g:255,b:140},{r:255,g:160,b:0},{r:255,g:120,b:160},{r:200,g:255,b:255},{r:255,g:255,b:255},];
const pickBright=()=>BRIGHT_COLORS[(Math.random()*BRIGHT_COLORS.length)|0];
function generateAndPlaceSplat(isTarget,targetToAvoid=null){const MIN_SCALE=0.05,MAX_SCALE=0.20;let splat;let tries=0;const minPosDist=0.4;
do{splat=new Splat({sx:MIN_SCALE+Math.random()*(MAX_SCALE-MIN_SCALE),sy:MIN_SCALE+Math.random()*(MAX_SCALE-MIN_SCALE),
theta:clampAngleRad(deg2rad(Math.random()*180)),opacity:isTarget?(0.85+Math.random()*0.15):(0.9+Math.random()*0.1),color:pickBright()});
if(Math.random()<0.7){const f=0.4+Math.random()*0.4;Math.random()<0.5?splat.sx*=f:splat.sy*=f;}
const{mx,my}=normalizedMargins(splat.sx,splat.sy,splat.theta);const safeW=1-2*mx,safeH=1-2*my;
if(isTarget){const centralZone=0.3;const centralW=safeW*centralZone,centralH=safeH*centralZone;
const centralX=mx+(safeW-centralW)/2;const centralY=my+(safeH-centralH)/2;splat.x=centralX+Math.random()*centralW;
splat.y=centralY+Math.random()*centralH;}else{splat.x=mx+Math.random()*safeW;splat.y=my+Math.random()*safeH;}
tries++;if(!targetToAvoid)break;}while(tries<100&&Math.hypot(splat.x-targetToAvoid.x,splat.y-targetToAvoid.y)<minPosDist)
keepInBounds(splat);return splat;}
function newLevel(){target=generateAndPlaceSplat(true);guess=generateAndPlaceSplat(false,target);
const unlock=Math.random()<0.65;anisotropyChk.checked=unlock;document.querySelectorAll('.aniso-group').forEach(grp=>{
grp.classList.toggle('enabled',unlock);grp.querySelector('input').disabled=!unlock;});pushGuessToUI();render();}

/* ----------------- Init ----------------- */
function init(){
  fitCanvas();
  newLevel();
}

// ** THE FINAL FIX **
// Wait for the 'load' event, THEN wait an additional 100ms. This ensures all CSS
// and layout operations are complete before we try to measure the canvas parent element.
window.addEventListener('load', () => {
    setTimeout(init, 100);
});