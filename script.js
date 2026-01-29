/* eslint-disable no-undef */
"use strict";

/* =========================
   MODE: A (admin) / V (view)
========================= */
const MODE = { ADMIN: "admin", VIEW: "view" };
let mode = MODE.VIEW;

const $ = (id)=>document.getElementById(id);
const imgUrlEl=$("imgUrl"), titleEl=$("title"), linkEl=$("link"), hintEl=$("hint");

function isTyping(e){ const t=e.target?.tagName?.toLowerCase(); return t==="input"||t==="textarea"||t==="select"||e.target?.isContentEditable; }
function hint(msg){ if(hintEl) hintEl.textContent=msg; }
function setMode(m){
  mode = m;
  document.body.classList.toggle('view', m === MODE.VIEW);
  document.body.classList.toggle('admin', m === MODE.ADMIN);
  if (m === MODE.VIEW) clearSelection();
  hint(m === MODE.ADMIN ? "ADMIN mód: editace povolena" : "VIEW mód: čistá výstava");
}
window.addEventListener('keydown',(e)=>{ if(isTyping(e)) return; const k=e.key.toLowerCase(); if(k==='a') setMode(MODE.ADMIN); if(k==='v') setMode(MODE.VIEW); });

/* =========================
   ENGINE / SCENE / CAMERA
========================= */
const canvas = $("renderCanvas");
const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true, antialias:true });

// iPhone / mobilní Safari – snížení DPI pro stabilitu paměti
try{
  const dpr = window.devicePixelRatio || 1;
  if (dpr > 2) engine.setHardwareScalingLevel(2 / dpr);
}catch{}

let scene, camera, glow, hl;

// Rozměry místnosti
const ROOM = { W: 16, D: 30, H: 5.6 };
const MIN_RADIUS = 1.6, MAX_RADIUS = 40;

function createScene(){
  scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.06,0.06,0.06,1);

  camera = new BABYLON.ArcRotateCamera("cam", -Math.PI/2, Math.PI/2.25, 11.5, new BABYLON.Vector3(0, ROOM.H*0.48, 0), scene);
  camera.attachControl(canvas, true);
  camera.lowerBetaLimit = 0.1;
  camera.upperBetaLimit = Math.PI - 0.1;
  camera.lowerRadiusLimit = MIN_RADIUS;
  camera.upperRadiusLimit = MAX_RADIUS;
  camera.wheelDeltaPercentage = 0.02;
  camera.pinchDeltaPercentage = 0.02;
  camera.inertia = 0.85;

  new BABYLON.HemisphericLight("h", new BABYLON.Vector3(0,1,0), scene);

  glow = new BABYLON.GlowLayer("gl", scene, { blurKernelSize:64 });
  glow.intensity = 0.9;

  hl = new BABYLON.HighlightLayer("hl", scene);

  buildRoom();
  buildLED();
  buildGalleryLogo();

  setupPicking();
  setupDoubleClickZoom();
  return scene;
}

/* =========================
   ROOM + LED
========================= */
function unlit(hex){ const m=new BABYLON.StandardMaterial("m",scene); m.diffuseColor=BABYLON.Color3.FromHexString(hex); m.disableLighting=true; return m; }
function unlitTex(tex){
  // Unlit, jen přední strana → žádné zrcadlení
  const m=new BABYLON.StandardMaterial("mt",scene);
  m.disableLighting = true;
  m.diffuseTexture  = tex;
  m.backFaceCulling = true;   // kreslit jen přední stranu (FRONTSIDE)
  return m;
}

function buildRoom(){
  const floor   = BABYLON.MeshBuilder.CreateGround("floor",{width:ROOM.W, height:ROOM.D},scene); floor.material = unlit("#151515");
  const back    = BABYLON.MeshBuilder.CreatePlane("back",{width:ROOM.W, height:ROOM.H},scene);   back.position.set(0, ROOM.H/2, -ROOM.D/2 + 0.01); back.material = unlit("#2b2b2b");
  const front   = BABYLON.MeshBuilder.CreatePlane("front",{width:ROOM.W, height:ROOM.H},scene);  front.position.set(0, ROOM.H/2,  ROOM.D/2 - 0.01); front.rotation.y = Math.PI; front.material = unlit("#2b2b2b");
  const ceiling = BABYLON.MeshBuilder.CreateGround("ceiling",{width:ROOM.W, height:ROOM.D},scene); ceiling.position.y = ROOM.H; ceiling.rotation.x = Math.PI; ceiling.material = unlit("#0f0f10");

  const left = BABYLON.MeshBuilder.CreatePlane("leftWall",{width:ROOM.D, height:ROOM.H},scene);
  left.position.set(-ROOM.W/2 + 0.01, ROOM.H/2, 0); left.rotation.y = -Math.PI/2; left.material = unlit("#242424");

  const right = BABYLON.MeshBuilder.CreatePlane("rightWall",{width:ROOM.D, height:ROOM.H},scene);
  right.position.set( ROOM.W/2 - 0.01, ROOM.H/2, 0); right.rotation.y =  Math.PI/2; right.material = unlit("#242424");
}

function buildLED(){
  const n=new BABYLON.TransformNode("led",scene);
  const t=0.02, inw=0.1;
  const xL=-ROOM.W/2+inw, xR=ROOM.W/2-inw;
  const zF=ROOM.D/2-inw,  zB=-ROOM.D/2+inw;
  const y0=0.04, y1=ROOM.H-0.04;
  const mat=new BABYLON.StandardMaterial("ledMat",scene); mat.emissiveColor=BABYLON.Color3.FromHexString("#ffbdf6"); mat.disableLighting=true;

  const seg=(a,b)=>{ const d=BABYLON.Vector3.Distance(a,b); const m=BABYLON.MeshBuilder.CreateBox("ledSeg",{width:t,height:t,depth:d},scene); m.position=BABYLON.Vector3.Center(a,b); m.lookAt(b); m.rotation.x+=Math.PI; m.material=mat; m.isPickable=false; m.parent=n; glow.addIncludedOnlyMesh(m); };

  [[xL,y0,zF,xR,y0,zF],[xR,y0,zF,xR,y0,zB],[xR,y0,zB,xL,y0,zB],[xL,y0,zB,xL,y0,zF],
   [xL,y1,zF,xR,y1,zF],[xR,y1,zF,xR,y1,zB],[xR,y1,zB,xL,y1,zB],[xL,y1,zB,xL,y1,zF]
  ].forEach(([ax,ay,az,bx,by,bz])=>seg(new BABYLON.Vector3(ax,ay,az),new BABYLON.Vector3(bx,by,bz)));
  [[xL,zF],[xR,zF],[xR,zB],[xL,zB]].forEach(([x,z])=>seg(new BABYLON.Vector3(x,y0,z), new BABYLON.Vector3(x,y1,z)));
}

/* =========================
   FRAMES + CEDULKY – jednotka
========================= */
const FRAME_SIZE = { W: 1.2, H: 1.2 };
const FRAME_BOX_BORDER = 0.08;

// vektor směrem do místnosti dle rotace Y (front face plane = +Z)
function inwardForward(rotY){ return new BABYLON.Vector3(Math.sin(rotY), 0, Math.cos(rotY)); }

function lightGrayPlaceholderMat(text){
  const dt=new BABYLON.DynamicTexture("ph2",{width:512,height:512},scene,true);
  const c=dt.getContext();
  c.fillStyle="#bcbcbc"; c.fillRect(0,0,512,512);
  c.fillStyle="#222";    c.font="bold 32px system-ui"; c.textAlign="center"; c.textBaseline="middle";
  c.fillText(text,256,256);
  dt.update(); return unlitTex(dt);
}
function drawPlacard(plac,data){
  const dt=new BABYLON.DynamicTexture("pl",{width:1024,height:256},scene,true);
  const c=dt.getContext();
  c.fillStyle="#222"; c.fillRect(0,0,1024,256);
  c.fillStyle="#e6e6e6"; c.font="bold 56px system-ui"; c.textAlign="center"; c.textBaseline="middle";
  c.fillText(data.title||"(bez názvu)",512,128);
  dt.update(); plac.material=unlitTex(dt);
}

function addFrame(pos, rotY=0, wall='front'){
  // Box – vizuální okraj okolo obrazu
  const box = BABYLON.MeshBuilder.CreateBox("frameBox",{width:FRAME_SIZE.W+FRAME_BOX_BORDER,height:FRAME_SIZE.H+FRAME_BOX_BORDER,depth:0.05},scene);
  box.position = pos.clone(); box.rotation.y = rotY;
  box.material = unlit("#383838"); box.isPickable = true;

  // PŘEDNÍ STRANA DOVNITŘ: FRONTSIDE + backFaceCulling=true
  const f = BABYLON.MeshBuilder.CreatePlane("frame",{width:FRAME_SIZE.W,height:FRAME_SIZE.H, sideOrientation: BABYLON.Mesh.FRONTSIDE},scene);
  const inward = inwardForward(rotY);
  f.position = pos.add(inward.scale(0.03));
  f.rotation.y = rotY; f.isPickable = true;
  f.material  = lightGrayPlaceholderMat("KLIKNOUT → VYBRAT");

  const plac = BABYLON.MeshBuilder.CreatePlane("plac",{width:FRAME_SIZE.W,height:0.22, sideOrientation: BABYLON.Mesh.FRONTSIDE},scene);
  plac.position = pos.add(inward.scale(0.02)).add(new BABYLON.Vector3(0, -FRAME_SIZE.H*0.83, 0));
  plac.rotation.y = rotY; plac.isPickable = true;

  const data = { title: "(bez názvu)", url: "", src: "", srcData: "" };
  drawPlacard(plac, data);

  return { frame:f, box, placard:plac, data, wall, rotY };
}

/* =========================
   VÝBĚR / PICKING
========================= */
let selected = null;
function clearSelection(){ if(!selected) return; selected.box.renderOutline=false; hl.removeAllMeshes(); selected=null; }
function selectFrame(it){
  if(mode!==MODE.ADMIN) return;
  clearSelection();
  selected=it;
  it.box.outlineColor = BABYLON.Color3.FromHexString("#66CCFF");
  it.box.outlineWidth = 0.04;
  it.box.renderOutline = true;
  hl.addMesh(it.box, BABYLON.Color3.FromHexString("#66CCFF"));
  hint("Vybrán rám.");
}
function setupPicking(){
  scene.onPointerObservable.add((pi)=>{
    if (pi.type !== BABYLON.PointerEventTypes.POINTERPICK) return;
    if (!pi.pickInfo?.hit) return;
    const mesh = pi.pickInfo.pickedMesh;

    for(const wall of Object.keys(framesByWall)){
      for(const it of framesByWall[wall]){
        if (mesh === it.placard && it.data.url){ window.open(it.data.url,"_blank","noopener"); return; }
      }
    }
    if (mode === MODE.ADMIN){
      for(const wall of Object.keys(framesByWall)){
        for(const it of framesByWall[wall]){ if(mesh===it.frame||mesh===it.box){ selectFrame(it); return; } }
      }
    }
  }, BABYLON.PointerEventTypes.POINTERPICK);
}

/* =========================
   DOUBLE CLICK ZOOM
========================= */
function setupDoubleClickZoom(){
  const canvasEl = document.getElementById('renderCanvas');
  canvasEl.addEventListener("dblclick", ()=>{
    const pick=scene.pick(scene.pointerX,scene.pointerY);
    if(!pick?.hit) return;
    camera.target=pick.pickedPoint.clone();
    camera.radius=Math.max(MIN_RADIUS, camera.radius*0.65);
  });
}

/* =========================
   LOADING OBRÁZKŮ – snapshot do dataURL (CORS-safe) + QUIET
========================= */
function drawFitted(ctx,bmp,frameW,frameH){
  const targetR=frameW/frameH, r=bmp.width/bmp.height; let dw=1024,dh=1024,dx=0,dy=0;
  if(r>targetR){ dh=1024; dw=Math.round(dh*r); dx=Math.round((1024-dw)/2);}
  else{ dw=1024; dh=Math.round(dw/r); dy=Math.round((1024-dh)/2);}
  ctx.fillStyle="#000"; ctx.fillRect(0,0,1024,1024);
  ctx.drawImage(bmp,0,0,bmp.width,bmp.height,dx,dy,dw,dh);
}
function blobToImg(blob){ return new Promise((res,rej)=>{ const img=new Image(); img.onload=()=>res(img); img.onerror=()=>rej(new Error("IMG decode failed")); img.src=URL.createObjectURL(blob); }); }
function dataUrlToImg(dataUrl){ return new Promise((res,rej)=>{ const img=new Image(); img.onload=()=>res(img); img.onerror=()=>rej(new Error("DataURL decode failed")); img.src=dataUrl; }); }
function dynamicTextureToDataUrl(dt){ try{ const c = dt.getContext().canvas; return c.toDataURL("image/png"); }catch(e){ return ""; } }

async function loadImageUrlIntoTexture(url, item, opts={quiet:false}){
  try{
    const resp=await fetch(url,{mode:"cors",cache:"no-store"});
    if(!resp.ok) throw new Error("HTTP "+resp.status);
    const ct=resp.headers.get("content-type")||""; if(!ct.startsWith("image/")) throw new Error("NOT_IMAGE");
    const blob=await resp.blob();

    // Konzistentní dekódování přes <img> (Safari-friendly)
    const bmp=await blobToImg(blob);

    const dt=new BABYLON.DynamicTexture("imgDT",{width:1024,height:1024},scene,true);
    const ctx=dt.getContext(); drawFitted(ctx,bmp,FRAME_SIZE.W,FRAME_SIZE.H); dt.update();

    item.frame.material = unlitTex(dt);
    item.data.src = url;

    const snap = dynamicTextureToDataUrl(dt);
    if (snap) item.data.srcData = snap;

    autosave();
    if (!opts.quiet) hint("Obrázek načten ✔");
  }catch(e){
    console.warn("Load image failed:", e, "URL:", url);
    if (!opts.quiet) alert("Nelze stáhnout obrázek (CORS / nepřímé URL).");
  }
}
async function loadSVGOrDataIntoTexture(dataUrl, item, opts={quiet:false}){
  try{
    const bmp = await dataUrlToImg(dataUrl);
    const dt=new BABYLON.DynamicTexture("imgDT",{width:1024,height:1024},scene,true);
    const ctx=dt.getContext(); drawFitted(ctx,bmp,FRAME_SIZE.W,FRAME_SIZE.H); dt.update();

    item.frame.material = unlitTex(dt);
    item.data.src = dataUrl;

    const snap = dynamicTextureToDataUrl(dt);
    if (snap) item.data.srcData = snap;

    autosave();
    if (!opts.quiet) hint("Obrázek/SVG načten ✔");
  }catch(e){
    console.warn("Load dataURL/SVG failed:", e);
    if (!opts.quiet) alert("Nelze zpracovat obrazová data.");
  }
}
async function loadIntoFrameSmart(inputText, item){
  if(!inputText){ alert("Zadej URL / data:image/... / <svg>…</svg>"); return; }
  const s=inputText.trim();
  if(s.startsWith("<svg")) return loadSVGOrDataIntoTexture("data:image/svg+xml;utf8,"+encodeURIComponent(s),item,{quiet:false});
  if(s.startsWith("data:image/")) return loadSVGOrDataIntoTexture(s,item,{quiet:false});
  return loadImageUrlIntoTexture(s,item,{quiet:false});
}

/* =========================
   LOGO – inline SVG (ostrý + glow)
========================= */
const GALLERY_LOGO_SVG = `
<svg id="Layer_1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 941.43 272.86" preserveAspectRatio="xMidYMid meet">
  <defs><style>.cls-1{fill:#daff3e;}</style></defs>
  <g>
    <path class="cls-1" d="M317.06,103.94h-76.71c-2.05,0-3.72-1.66-3.72-3.72s1.66-3.72,3.72-3.72h76.71c2.05,0,3.72,1.66,3.72,3.72s-1.66,3.72-3.72,3.72Z"/>
    <path class="cls-1" d="M299.75,179.35c-.28,0-.55-.03-.83-.1-2-.46-3.25-2.45-2.79-4.45l17.31-75.4c.46-2,2.46-3.25,4.45-2.79,2,.46,3.25,2.45,2.79,4.45l-17.31,75.4c-.39,1.72-1.93,2.89-3.62,2.89Z"/>
    <path class="cls-1" d="M222.8,180.12c-.28,0-.56-.03-.84-.1-2-.46-3.25-2.45-2.79-4.45l27.14-117.91c.46-2,2.45-3.25,4.46-2.79 2,.46 3.25,2.46 2.79,4.46l-27.14,117.91c-.4,1.72-1.93,2.88-3.62,2.88Z"/>
    <path class="cls-1" d="M439.3,179.34h-139.39c-2.05,0-3.72-1.66-3.72-3.72s1.66-3.72,3.72-3.72h136.43l15.6-67.97h-70.53c-2.05,0-3.72-1.66-3.72-3.72s1.66-3.72,3.72-3.72h75.2c1.13,0,2.2.52,2.91,1.4.71.89.97,2.04.72,3.15l-17.31,75.4c-.39,1.69-1.89,2.88-3.62,2.88Z"/>
    <path class="cls-1" d="M785.01,179.34c-.28,0-.55-.03-.83-.1-2-.46-3.25-2.45-2.79-4.45l17.31-75.4c.39-1.69,1.89-2.88,3.62-2.88h76.96c2.05,0,3.72,1.66,3.72,3.72s-1.66,3.72-3.72,3.72h-74l-16.65,72.52c-.39,1.72-1.93,2.89-3.62,2.89Z"/>
    <path class="cls-1" d="M211.85,180.13l-170.7-.27c-2.05,0-3.71-1.67-3.71-3.72,0-2.05,1.67-3.71,3.72-3.71l170.7.27c2.05,0,3.71,1.67,3.71,3.72,0,2.05-1.67,3.71-3.72,3.71Z"/>
    <path class="cls-1" d="M72.27,221.31c-.28,0-.55-.03-.83-.1-2-.46-3.25-2.45-2.79-4.45l26.94-117.36c.46-2,2.46-3.25,4.45-2.79,2,.46,3.25,2.45,2.79,4.45l-26.94,117.36c-.39,1.72-1.93,2.89-3.62,2.89Z"/>
    <path class="cls-1" d="M784.97,179.34h-141.2c-1.13,0-2.2-.52-2.91-1.4-.71-.89-.97-2.04-.72-3.15l17.31-75.4c.39-1.69,1.89-2.88,3.62-2.88h76.41c2.05,0,3.72,1.66,3.72,3.72s-1.66,3.72-3.72,3.72h-73.45l-15.6,67.97h136.53c2.05,0,3.72,1.66,3.72,3.72s-1.66,3.72-3.72,3.72Z"/>
    <path class="cls-1" d="M158.76,180.12c-.28,0-.55-.03-.83-.1-2-.46-3.25-2.45-2.79-4.45l16.44-71.63h-72.37c-2.05,0-3.72-1.66-3.72-3.72s1.66-3.72,3.72-3.72h77.03c1.13,0,2.2.52,2.91,1.4.71.89.97,2.04.71,3.15l-17.49,76.18c-.39,1.72-1.93,2.89-3.62,2.89Z"/>
    <path class="cls-1" d="M222.74,180.13l-182.02-.27c-2.05,0-3.71-1.67-3.71-3.72,0-2.05,1.67-3.71,3.72-3.71l182.02.27c2.05,0,3.71,1.67,3.71,3.72,0,2.05-1.67,3.71-3.72,3.71Z"/>
    <path class="cls-1" d="M602.74,212.29c-.55,0-1.09-.12-1.61-.37-.76-.36-1.35-.96-1.71-1.68l-103.95-136.78-129.09,105.46c-1.59,1.3-3.93,1.06-5.23-.53-1.3-1.59-1.06-3.93.53-5.23l131.89-107.74c.39-.36.86-.64,1.38-.81,1.5-.48,3.14.02,4.1,1.28l104.39,137.36 131.99-105.98c1.6-1.29,3.94-1.03,5.22.57 1.28,1.6 1.03,3.94-.57,5.22l-135.02,108.4c-.67.54-1.5.82-2.33.82Z"/>
  </g>
  <g>
    <path class="cls-1" d="M596.11,104.5h-75.2c-2.05,0-3.72-1.66-3.72-3.72s1.66-3.72,3.72-3.72h75.2c2.05,0,3.72,1.66,3.72,3.72s-1.66,3.72-3.72,3.72Z"/>
    <path class="cls-1" d="M577.73,179.9h-74.12c-2.05,0-3.72-1.66-3.72-3.72s1.66-3.72,3.72-3.72h74.12c2.05,0,3.72,1.66,3.72,3.72s-1.66,3.72-3.72,3.72Z"/>
  </g>
</svg>`;
const LOGO_ASPECT = 941.43 / 272.86;
const LOGO_SCALE = 0.40;
const FRONT_BACK_OFFSET = 0.25;
const LOGO_HEIGHT_M = 6.30;
const GLOW_BLUR_PX = 18;

function buildGalleryLogo(){
  const img = new Image();
  img.src = "data:image/svg+xml;utf8," + encodeURIComponent(GALLERY_LOGO_SVG);
  img.onload = () => {
    const SIZE = 1024;
    const dt  = new BABYLON.DynamicTexture("logoDT",{width:SIZE,height:SIZE},scene,true);
    const ctx = dt.getContext();
    const maxW = SIZE * 0.92;
    const w = maxW, h = Math.round(maxW / LOGO_ASPECT);
    const x = Math.round((SIZE - w)/2), y = Math.round((SIZE - h)/2);
    ctx.clearRect(0,0,SIZE,SIZE); ctx.drawImage(img, x, y, w, h); dt.update();

    const glowDT = new BABYLON.DynamicTexture("logoGlowDT",{width:SIZE,height:SIZE},scene,true);
    const gc = glowDT.getContext();
    gc.clearRect(0,0,SIZE,SIZE); gc.filter = `blur(${GLOW_BLUR_PX}px)`; gc.drawImage(img, x, y, w, h); glowDT.update();

    const sharpMat = unlitTex(dt);
    const glowMat = new BABYLON.StandardMaterial("logoGlowMat", scene);
    glowMat.disableLighting  = true; glowMat.emissiveTexture  = glowDT; glowMat.opacityTexture   = glowDT;
    glowMat.emissiveColor    = new BABYLON.Color3(1,1,1); glowMat.backFaceCulling  = true;

    const logoW = ROOM.W * LOGO_SCALE;
    const logoH = LOGO_HEIGHT_M;
    const yPos = ROOM.H*0.55 + FRAME_SIZE.H*0.95 + 0.40;

    function placeLogo(z, rotY, idx){
      const g = BABYLON.MeshBuilder.CreatePlane(`logoGlow_${idx}`, { width:logoW, height:logoH, sideOrientation: BABYLON.Mesh.FRONTSIDE }, scene);
      g.position.set(0, yPos, z - Math.sign(z)*0.005); g.rotation.y = rotY; g.material = glowMat; glow.addIncludedOnlyMesh(g);

      const s = BABYLON.MeshBuilder.CreatePlane(`logoSharp_${idx}`, { width:logoW, height:logoH, sideOrientation: BABYLON.Mesh.FRONTSIDE }, scene);
      s.position.set(0, yPos, z + Math.sign(z)*0.005); s.rotation.y = rotY; s.material = sharpMat;
    }
    placeLogo(-ROOM.D/2 + FRONT_BACK_OFFSET, Math.PI, 0);
    placeLogo( ROOM.D/2 - FRONT_BACK_OFFSET, 0,       1);
    hint("Logo zobrazeno ✔");
  };
  img.onerror = (e) => { console.error("Logo SVG nešlo dekódovat.", e); };
}

/* =========================
   MULTI‑WALL LAYOUT – SAFE + CORNER_SAFE
========================= */
const framesByWall = { back: [], front: [], left: [], right: [] };
const SAFE = 0.8;
const CORNER_SAFE = 0.6;

function distributeCenters(min, max, count, frameW){
  if (count <= 1) return [ (min+max)/2 ];
  const span = max - min;
  const totalFramesWidth = count * frameW;
  let gap = (span - totalFramesWidth) / (count - 1);
  const MIN_GAP = 0.05;
  if (gap < MIN_GAP) gap = Math.max(gap, MIN_GAP);

  const centers = [];
  let x = min + frameW/2;
  for (let i = 0; i < count; i++) {
    centers.push(x);
    x += frameW + gap;
  }
  if (centers[centers.length-1] > max - frameW/2 + 1e-6) {
    const step = (max - min) / (count - 1);
    centers.length = 0;
    for (let i=0;i<count;i++) centers.push(min + i*step);
  }
  return centers;
}

function createFixedFramesForWall(wall, count, centerY, safeWall, cornerSafe){
  const rotY =
    wall==='front' ? Math.PI :
    wall==='back'  ? 0 :
    wall==='left'  ? Math.PI/2 :
    wall==='right' ? -Math.PI/2 : 0;

  const axisX  = (wall==='front'||wall==='back');
  const length = axisX ? ROOM.W : ROOM.D;

  const min = -length/2 + safeWall + cornerSafe;
  const max =  length/2 - safeWall - cornerSafe;

  const centers = distributeCenters(min, max, count, FRAME_SIZE.W);

  // cleanup starých meshů při relayoutu
  (framesByWall[wall]||[]).forEach(it => { it.frame.dispose(); it.box.dispose(); it.placard.dispose(); });
  framesByWall[wall] = [];

  centers.forEach(val=>{
    const pos = axisX
      ? new BABYLON.Vector3(val, centerY, (wall==='front' ? ROOM.D/2 - 0.03 : -ROOM.D/2 + 0.03))
      : new BABYLON.Vector3((wall==='right' ? ROOM.W/2 - 0.03 : -ROOM.W/2 + 0.03), centerY, val);
    const it = addFrame(pos, rotY, wall);
    framesByWall[wall].push(it);
  });
}

/* =========================
   DATA – DEMO + načítání (imgData má prioritu)
========================= */
const DATA = {
  front: [
    { img:"./assets/one.jpg",   label:"Produkt A", href:"https://example.com/a" },
    { img:"./assets/two.jpg",   label:"Produkt B", href:"https://example.com/b" },
    { img:"./assets/three.jpg", label:"Produkt C", href:"https://example.com/c" },
    { img:"./assets/one.jpg",   label:"Produkt D", href:"https://example.com/d" },
    { img:"./assets/two.jpg",   label:"Produkt E", href:"https://example.com/e" },
    { img:"./assets/three.jpg", label:"Produkt F", href:"https://example.com/f" },
    { img:"./assets/one.jpg",   label:"Produkt G", href:"https://example.com/g" }
  ],
  back: [
    { img:"./assets/one.jpg",   label:"Back A", href:"https://example.com/a" },
    { img:"./assets/two.jpg",   label:"Back B", href:"https://example.com/b" },
    { img:"./assets/three.jpg", label:"Back C", href:"https://example.com/c" },
    { img:"./assets/one.jpg",   label:"Back D", href:"https://example.com/d" },
    { img:"./assets/two.jpg",   label:"Back E", href:"https://example.com/e" },
    { img:"./assets/three.jpg", label:"Back F", href:"https://example.com/f" },
    { img:"./assets/one.jpg",   label:"Back G", href:"https://example.com/g" }
  ],
  left:  Array.from({length:13}, (_,i)=>({ img:"./assets/one.jpg",  label:`Levá ${i+1}`,  href:`https://example.com/left-${i+1}`  })),
  right: Array.from({length:13}, (_,i)=>({ img:"./assets/two.jpg",  label:`Pravá ${i+1}`, href:`https://example.com/right-${i+1}` }))
};

function assignDataAllWalls(data, quiet=true){
  const loadLocal = (url, targetItem)=>{
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = ()=>{
      const dt=new BABYLON.DynamicTexture("imgDT"+Math.random(),{width:1024,height:1024},scene,true);
      const ctx=dt.getContext(); drawFitted(ctx,img,FRAME_SIZE.W,FRAME_SIZE.H); dt.update();
      targetItem.frame.material = unlitTex(dt);
      targetItem.data.src = url;
      const snap = dynamicTextureToDataUrl(dt);
      if (snap) targetItem.data.srcData = snap;
      autosave();
    };
    img.onerror = ()=>{ loadImageUrlIntoTexture(url, targetItem, {quiet}); };
    img.src = url;
  };

  ["front","back","left","right"].forEach(side=>{
    const items = data[side] || [];
    const arr   = framesByWall[side] || [];
    const n = Math.min(items.length, arr.length);
    for (let i=0;i<n;i++){
      const it = arr[i], d = items[i];
      if (d.imgData) {
        loadSVGOrDataIntoTexture(d.imgData, it, {quiet});
      } else if (d.img) {
        loadLocal(d.img, it);
      }
      it.data.title = d.label || "(bez názvu)";
      it.data.url   = d.href || "";
      drawPlacard(it.placard, it.data);
    }
  });
}

// Autosave do localStorage (pro Publish)
function autosave(){
  try{
    const out = { front: [], back: [], left: [], right: [] };
    for (const wall of Object.keys(framesByWall)) {
      out[wall] = (framesByWall[wall] || []).map(it => ({
        img:     it.data.src      || '',
        imgData: it.data.srcData  || '',
        label:   it.data.title    || '',
        href:    it.data.url      || ''
      }));
    }
    localStorage.setItem('draftGalleryJson', JSON.stringify(out));
  }catch(e){ /* ignore */ }
}

/* =========================
   UI
========================= */
$("btnLoad").addEventListener("click", ()=>{
  const it = selected || framesByWall.back[0] || framesByWall.front[0] || framesByWall.left[0] || framesByWall.right[0];
  if(!it){ alert("Neexistuje žádný rám."); return; }
  const input = imgUrlEl.value.trim();
  loadIntoFrameSmart(input, it);
});
$("btnPlacard").addEventListener("click", ()=>{
  const it=selected || framesByWall.back[0] || framesByWall.front[0];
  if(!it){ alert("Neexistuje žádný rám."); return; }
  it.data.title = (titleEl?.value || "(bez názvu)").trim() || "(bez názvu)";
  it.data.url   = (linkEl?.value  || "").trim();
  drawPlacard(it.placard, it.data);
  autosave();
  hint("Cedulka aktualizována.");
});
$("btnAdd").addEventListener("click", ()=>{
  alert("Přidávání je vypnuto – rámy jsou definované pevně pro každou stěnu (7/7/13/13).");
});
$("btnApplyLayout").addEventListener("click", ()=>{
  const YCENTER = ROOM.H * 0.55;
  createFixedFramesForWall('front', 7,  YCENTER, SAFE, CORNER_SAFE);
  createFixedFramesForWall('back',  7,  YCENTER, SAFE, CORNER_SAFE);
  createFixedFramesForWall('left',  13, YCENTER, SAFE, CORNER_SAFE);
  createFixedFramesForWall('right', 13, YCENTER, SAFE, CORNER_SAFE);

  const data = (window.galleryData && Object.keys(window.galleryData).length) ? window.galleryData : DATA;
  assignDataAllWalls(data, /*quiet*/true);
  hint("Layout znovu aplikován (SAFE + CORNER_SAFE).");
});
$("btnResetCam").addEventListener("click", ()=>{
  camera.target.set(0, ROOM.H*0.48, 0);
  camera.radius=11.5;
});
$("btnDemo").addEventListener("click", ()=>{
  assignDataAllWalls(DATA, /*quiet*/true);
  autosave();
  hint("DEMO data nahrána.");
});

/* =========================
   Publish to GitHub Issue (jen v ADMIN módu)
========================= */
const publishBtn = $("publishBtn");
if (publishBtn){
  publishBtn.addEventListener('click', () => {
    if (document.body.classList.contains('view')) {
      alert('Publish je dostupný jen v ADMIN módu (klávesa A).');
      return;
    }
    try {
      const out = { front: [], back: [], left: [], right: [] };
      for (const wall of Object.keys(framesByWall)) {
        out[wall] = (framesByWall[wall] || []).map(it => ({
          img:     it.data.src      || '',
          imgData: it.data.srcData  || '',
          label:   it.data.title    || '',
          href:    it.data.url      || ''
        }));
      }
      const minified = JSON.stringify(out);
      localStorage.setItem('draftGalleryJson', minified);
      const title = encodeURIComponent('Update gallery');
      const body  = encodeURIComponent(minified);
      const url   = `https://github.com/PhaserStore/Babylon/issues/new?title=${title}&body=${body}`;
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      console.error(e);
      alert('Export selhal – zkontroluj, že data jsou validní.');
    }
  });
}

/* =========================
   BOOT
========================= */
createScene();
engine.runRenderLoop(()=> scene.render());
window.addEventListener("resize", ()=> engine.resize());
setMode(MODE.VIEW); // start ve VIEW

const YCENTER = ROOM.H * 0.55;
createFixedFramesForWall('front', 7,  YCENTER, SAFE, CORNER_SAFE);
createFixedFramesForWall('back',  7,  YCENTER, SAFE, CORNER_SAFE);
createFixedFramesForWall('left',  13, YCENTER, SAFE, CORNER_SAFE);
createFixedFramesForWall('right', 13, YCENTER, SAFE, CORNER_SAFE);

// Pokud existuje ./data/gallery.json, zkus ho načíst (quiet mód). Jinak DEMO.
(async function loadGallery(){
  try{
    const res = await fetch('./data/gallery.json', { cache:'no-store' });
    if (!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    window.galleryData = data;
    assignDataAllWalls(data, /*quiet*/true);
  }catch(e){
    // fallback: demo
    assignDataAllWalls(DATA, /*quiet*/true);
  }
})();
