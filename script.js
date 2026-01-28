/* =========================================================================
   Virtual Gallery – COMPLETE script.js
   =========================================================================
   - VIEW default, ADMIN po 'A' (zpět 'V')
   - Multi-wall frames (back/front/left/right) + per-wall layout
   - Placard (title + hidden URL) persisted v localStorage
   - Image load z URL / data:image / inline <svg>…</svg>
   - LED hrany místnosti (GlowLayer), highlight vybraného rámu
   - Neon SVG logo "phaser" (assets/phaser.svg) na zadní i přední stěně
   - Bezpečný start: až po DOM i Babylonu (řeší pád getUniqueId)
   ========================================================================= */

"use strict";

/* -----------------------------
   0) MODE a UI helpers
------------------------------*/
const MODE = { ADMIN: "admin", VIEW: "view" };
let mode = MODE.VIEW;

const $ = (id) => document.getElementById(id);
const canvas       = $("renderCanvas");
const imgUrlEl     = $("imgUrl");
const btnLoadEl    = $("btnLoad");
const btnDemoEl    = $("btnDemo");
const titleEl      = $("title");
const linkEl       = $("link");
const btnPlacardEl = $("btnPlacard");
const wallSelect   = $("wallSelect");
const lxStartEl    = $("lxStart");
const lxEndEl      = $("lxEnd");
const lxSpaceEl    = $("lxSpace");
const btnApplyLay  = $("btnApplyLayout");
const btnAddEl     = $("btnAdd");
const btnResetCam  = $("btnResetCam");
const hintEl       = $("hint");

function isTyping(e){
  const t = e.target?.tagName?.toLowerCase();
  return t==="input"||t==="textarea"||t==="select"||e.target?.isContentEditable;
}
function setMode(m){
  mode = m;
  document.body.classList.toggle('view',  m===MODE.VIEW);
  document.body.classList.toggle('admin', m===MODE.ADMIN);
  if (m===MODE.VIEW) clearSelection();
  hint(m===MODE.ADMIN ? "ADMIN mód: editace povolena" : "VIEW mód: čistá výstava");
}
window.addEventListener('keydown', (e)=>{
  if (isTyping(e)) return;
  const k = (e.key||'').toLowerCase();
  if (k==='a') setMode(MODE.ADMIN);
  if (k==='v') setMode(MODE.VIEW);
});
function hint(msg){ if (hintEl) hintEl.textContent = msg; }

/* -----------------------------
   1) Babylon – engine/scene/camera
------------------------------*/
let engine, scene, camera, glow, hl;

// engine až v bootu (když už je canvas v DOM)
function createEngine(){
  return new BABYLON.Engine(canvas, true, { preserveDrawingBuffer:true, stencil:true, antialias:true });
}

const ROOM = { W: 16, D: 30, H: 5.6 };
const MIN_RADIUS = 1.6, MAX_RADIUS = 40;

// parent uzly pro stěny – jen deklarace; instance vzniknou až v createScene()
const wallNodes = { back:null, front:null, left:null, right:null };

// per‑wall layout
const WALL_LAYOUT = {
  back:  { centerY: 0, spacing: parseFloat(lxSpaceEl?.value||'2.2'), startX: parseFloat(lxStartEl?.value||'-6.5'), endX: parseFloat(lxEndEl?.value||'6.5') },
  front: { centerY: 0, spacing: parseFloat(lxSpaceEl?.value||'2.2'), startX: parseFloat(lxStartEl?.value||'-6.5'), endX: parseFloat(lxEndEl?.value||'6.5') },
  left:  { centerY: 0, spacing: 2.2, startX: -ROOM.D/2 + 1.6, endX: ROOM.D/2 - 1.6 },
  right: { centerY: 0, spacing: 2.2, startX: -ROOM.D/2 + 1.6, endX: ROOM.D/2 - 1.6 }
};
// výchozí centerY
WALL_LAYOUT.back.centerY  = ROOM.H * 0.55;
WALL_LAYOUT.front.centerY = ROOM.H * 0.55;
WALL_LAYOUT.left.centerY  = ROOM.H * 0.55;
WALL_LAYOUT.right.centerY = ROOM.H * 0.55;

// kolekce rámů per stěna
const wallData = { back: [], front: [], left: [], right: [] };
const framesOf   = (w) => wallData[w];
const allFrames  = () => [...wallData.back, ...wallData.front, ...wallData.left, ...wallData.right];

// výběr stěny v UI
let currentWall = 'back';
if (wallSelect){
  wallSelect.addEventListener('change', ()=>{
    currentWall = wallSelect.value;
    const L = WALL_LAYOUT[currentWall];
    lxStartEl.value = String(L.startX);
    lxEndEl.value   = String(L.endX);
    lxSpaceEl.value = String(L.spacing);
    hint(`Aktivní stěna: ${currentWall}`);
  });
}

const FRAME_SIZE = { W: 1.2, H: 1.2 };

function createScene(){
  scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.06,0.06,0.06,1);

  camera = new BABYLON.ArcRotateCamera(
    "cam", -Math.PI/2, Math.PI/2.25, 11.5,
    new BABYLON.Vector3(0, ROOM.H*0.48, 0), scene
  );
  camera.attachControl(canvas, true);
  camera.lowerBetaLimit = 0.1;
  camera.upperBetaLimit = Math.PI - 0.1;
  camera.lowerRadiusLimit = MIN_RADIUS;
  camera.upperRadiusLimit = MAX_RADIUS;
  camera.wheelDeltaPercentage  = 0.02;
  camera.pinchDeltaPercentage  = 0.02;
  camera.inertia = 0.85;

  new BABYLON.HemisphericLight("h", new BABYLON.Vector3(0,1,0), scene).intensity = 0.9;

  glow = new BABYLON.GlowLayer("gl", scene, { blurKernelSize:64 });
  glow.intensity = 0.9;

  hl = new BABYLON.HighlightLayer("hl", scene);

  buildRoom();

  // TransformNode rodiče pro stěny – až teď (scéna existuje)
  wallNodes.back  = new BABYLON.TransformNode('wall_back',  scene);
  wallNodes.front = new BABYLON.TransformNode('wall_front', scene);
  wallNodes.left  = new BABYLON.TransformNode('wall_left',  scene);
  wallNodes.right = new BABYLON.TransformNode('wall_right', scene);

  positionWallParents();
  buildLED();

  buildInitialFrames();   // ← rámy až po vytvoření wallNodes
  buildGalleryLogo();     // logo až po wallNodes

  setupPicking();
  setupDoubleClickZoom();
  return scene;
}

/* -----------------------------
   2) Místnost a LED
------------------------------*/
function unlit(hex){ const m=new BABYLON.StandardMaterial("m",scene); m.diffuseColor=BABYLON.Color3.FromHexString(hex); m.disableLighting=true; return m; }
function unlitTex(tex){ const m=new BABYLON.StandardMaterial("mt",scene); m.diffuseTexture=tex; m.emissiveColor=new BABYLON.Color3(1,1,1); m.disableLighting=true; return m; }

function buildRoom(){
  const floor = BABYLON.MeshBuilder.CreateGround("floor",{width:ROOM.W, height:ROOM.D},scene); floor.material = unlit("#151515");
  const back  = BABYLON.MeshBuilder.CreatePlane("back",{width:ROOM.W, height:ROOM.H},scene); back.position.set(0, ROOM.H/2, -ROOM.D/2 + 0.01); back.material = unlit("#2b2b2b");
  const front = BABYLON.MeshBuilder.CreatePlane("front",{width:ROOM.W, height:ROOM.H},scene); front.position.set(0, ROOM.H/2,  ROOM.D/2 - 0.01); front.rotation.y = Math.PI; front.material = unlit("#2b2b2b");
  const ceiling = BABYLON.MeshBuilder.CreateGround("ceiling",{width:ROOM.W, height:ROOM.D},scene); ceiling.position.y = ROOM.H; ceiling.rotation.x = Math.PI; ceiling.material = unlit("#0f0f10");
}
function positionWallParents(){
  wallNodes.back.position.set(0, WALL_LAYOUT.back.centerY, -ROOM.D/2 + 0.03);
  wallNodes.back.rotation.y = 0;

  wallNodes.front.position.set(0, WALL_LAYOUT.front.centerY, ROOM.D/2 - 0.03);
  wallNodes.front.rotation.y = Math.PI;

  wallNodes.left.position.set(-ROOM.W/2 + 0.03, WALL_LAYOUT.left.centerY, 0);
  wallNodes.left.rotation.y =  Math.PI / 2;

  wallNodes.right.position.set( ROOM.W/2 - 0.03, WALL_LAYOUT.right.centerY, 0);
  wallNodes.right.rotation.y = -Math.PI / 2;
}
function buildLED(){
  const n=new BABYLON.TransformNode("led",scene);
  const t=0.02, inw=0.1;
  const xL=-ROOM.W/2+inw, xR=ROOM.W/2-inw;
  const zF=ROOM.D/2-inw,  zB=-ROOM.D/2+inw;
  const y0=0.04, y1=ROOM.H-0.04;
  const mat=new BABYLON.StandardMaterial("ledMat",scene); mat.emissiveColor=BABYLON.Color3.FromHexString("#ffbdf6"); mat.disableLighting=true;

  const seg=(a,b)=>{ const d=BABYLON.Vector3.Distance(a,b);
    const m=BABYLON.MeshBuilder.CreateBox("ledSeg",{width:t,height:t,depth:d},scene);
    m.position=BABYLON.Vector3.Center(a,b); m.lookAt(b); m.rotation.x+=Math.PI;
    m.material=mat; m.isPickable=false; m.parent=n; glow.addIncludedOnlyMesh(m);
  };

  [[xL,y0,zF,xR,y0,zF],[xR,y0,zF,xR,y0,zB],[xR,y0,zB,xL,y0,zB],[xL,y0,zB,xL,y0,zF],
   [xL,y1,zF,xR,y1,zF],[xR,y1,zF,xR,y1,zB],[xR,y1,zB,xL,y1,zB],[xL,y1,zB,xL,y1,zF]
  ].forEach(([ax,ay,az,bx,by,bz])=>seg(new BABYLON.Vector3(ax,ay,az),new BABYLON.Vector3(bx,by,bz)));
  [[xL,zF],[xR,zF],[xR,zB],[xL,zB]].forEach(([x,z])=>seg(new BABYLON.Vector3(x,y0,z), new BABYLON.Vector3(x,y1,z)));
}

/* -----------------------------
   3) Layout a přidávání rámů
------------------------------*/
function wallLocalXFor(w, i){
  const L = WALL_LAYOUT[w];
  const x = L.startX + L.spacing * i;
  return (x > L.endX) ? null : x;
}
function rebuildWallPositions(w){
  const L   = WALL_LAYOUT[w];
  const arr = framesOf(w);
  for (let i=0;i<arr.length;i++){
    const it = arr[i];
    const lx = wallLocalXFor(w, i);
    if (lx === null) { it.frame.setEnabled(false); it.box.setEnabled(false); it.placard.setEnabled(false); continue; }
    it.idx = i;
    [it.frame, it.box, it.placard].forEach(m=>m.setEnabled(true));
    it.box.position.set(lx, 0, 0);
    it.frame.position.set(lx, 0, 0.03);
    it.placard.position.set(lx, -FRAME_SIZE.H*0.83, 0.02);
  }
}
function applyLayoutFromUI(){
  const w = currentWall;
  const L = WALL_LAYOUT[w];
  L.startX  = parseFloat(lxStartEl.value);
  L.endX    = parseFloat(lxEndEl.value);
  L.spacing = parseFloat(lxSpaceEl.value);
  rebuildWallPositions(w);
  hint(`Layout aplikován pro stěnu: ${w}.`);
}
function lightGrayPlaceholderMat(text){
  const dt=new BABYLON.DynamicTexture("ph2",{width:512,height:512},scene,true);
  const c=dt.getContext(); c.clearRect(0,0,512,512);
  c.fillStyle="#bcbcbc"; c.fillRect(0,0,512,512);
  c.fillStyle="#222"; c.font="bold 32px system-ui"; c.textAlign="center"; c.textBaseline="middle";
  c.fillText(text,256,256);
  dt.update(); return unlitTex(dt);
}
function drawPlacard(plac,data){
  const dt=new BABYLON.DynamicTexture("pl",{width:1024,height:256},scene,true);
  const c=dt.getContext(); c.clearRect(0,0,1024,256);
  c.fillStyle="#222"; c.fillRect(0,0,1024,256);
  c.fillStyle="#e6e6e6"; c.font="bold 56px system-ui"; c.textAlign="center"; c.textBaseline="middle";
  c.fillText(data.title||"(bez názvu)",512,128);
  dt.update(); plac.material=unlitTex(dt);
}
// localStorage – per wall+index
function placardKey(w, idx){ return `placard.${w}.${idx}`; }
function savePlacardData(w, idx, data){
  try { localStorage.setItem(placardKey(w, idx), JSON.stringify({title:data.title||'', url:data.url||''})); }
  catch(e){ /* ignore quota */ }
}
function loadPlacardData(w, idx){
  try { const s = localStorage.getItem(placardKey(w, idx)); return s ? JSON.parse(s) : null; }
  catch(e){ return null; }
}
function addFrameOnWall(w, localX){
  const parent = wallNodes[w];
  const pX = (localX != null) ? localX : wallLocalXFor(w, framesOf(w).length);
  if (pX === null) { alert("Už není místo v nastaveném úseku stěny."); return null; }
  const idx = framesOf(w).length;

  const box = BABYLON.MeshBuilder.CreateBox(`frameBox_${w}_${idx}`, { width:FRAME_SIZE.W+0.08, height:FRAME_SIZE.H+0.08, depth:0.05 }, scene);
  box.parent = parent; box.position.set(pX, 0, 0); box.material = unlit("#383838"); box.isPickable = true;

  const f = BABYLON.MeshBuilder.CreatePlane(`frame_${w}_${idx}`, { width:FRAME_SIZE.W, height:FRAME_SIZE.H }, scene);
  f.parent = parent; f.position.set(pX, 0, 0.03); f.isPickable = true; f.material = lightGrayPlaceholderMat("KLIKNOUT → VYBRAT");

  const plac = BABYLON.MeshBuilder.CreatePlane(`plac_${w}_${idx}`, { width:FRAME_SIZE.W, height:0.22 }, scene);
  plac.parent = parent; plac.position.set(pX, -FRAME_SIZE.H*0.83, 0.02); plac.isPickable = true;

  const data = loadPlacardData(w, idx) || { title:"(bez názvu)", url:"" };
  drawPlacard(plac, data);

  const it = { frame:f, box, placard:plac, data, wall:w, idx };
  framesOf(w).push(it);
  return it;
}
function buildInitialFrames(){
  const INIT = 6;
  for (let i=0;i<INIT;i++){
    const it = addFrameOnWall('back', wallLocalXFor('back', i));
    if (!it) break;
  }
  autoAssignLocalAssets();
}

/* -----------------------------
   4) Picking a výběr rámu
------------------------------*/
let selected = null;
function clearSelection(){
  if (!selected) return;
  selected.box.renderOutline = false;
  hl.removeAllMeshes();
  selected = null;
}
function selectFrame(it){
  if (mode !== MODE.ADMIN) return;
  clearSelection();
  selected = it;
  it.box.outlineColor = BABYLON.Color3.FromHexString("#66CCFF");
  it.box.outlineWidth = 0.04;
  it.box.renderOutline = true;
  hl.addMesh(it.box, BABYLON.Color3.FromHexString("#66CCFF"));
  hint(`Vybrán rám (${it.wall} #${it.idx+1}).`);
}
function setupPicking(){
  scene.onPointerObservable.add((pi)=>{
    if (pi.type !== BABYLON.PointerEventTypes.POINTERPICK) return;
    if (!pi.pickInfo?.hit) return;
    const mesh = pi.pickInfo.pickedMesh;

    for (const it of allFrames()){
      if (mesh === it.placard && it.data.url){
        window.open(it.data.url, "_blank", "noopener");
        return;
      }
    }
    if (mode === MODE.ADMIN){
      for (const it of allFrames()){
        if (mesh===it.frame || mesh===it.box){ selectFrame(it); return; }
      }
    }
  }, BABYLON.PointerEventTypes.POINTERPICK);
}

/* -----------------------------
   5) Double click zoom
------------------------------*/
function setupDoubleClickZoom(){
  canvas.addEventListener("dblclick", ()=>{
    const pick = scene.pick(scene.pointerX, scene.pointerY);
    if (!pick?.hit) return;
    camera.target = pick.pickedPoint.clone();
    camera.radius = Math.max(MIN_RADIUS, camera.radius*0.65);
  });
}

/* -----------------------------
   6) Image loading
------------------------------*/
function drawFitted(ctx, bmp, frameW, frameH){
  const targetR = frameW/frameH, r = bmp.width / bmp.height; let dw=1024,dh=1024,dx=0,dy=0;
  if (r>targetR){ dh=1024; dw=Math.round(dh*r); dx=Math.round((1024-dw)/2); }
  else          { dw=1024; dh=Math.round(dw/r);  dy=Math.round((1024-dh)/2); }
  ctx.fillStyle="#000"; ctx.fillRect(0,0,1024,1024);
  ctx.drawImage(bmp,0,0,bmp.width,bmp.height,dx,dy,dw,dh);
}
function blobToImg(blob){ return new Promise((res,rej)=>{ const img=new Image(); img.onload=()=>res(img); img.onerror=()=>rej(new Error("IMG decode failed")); img.src=URL.createObjectURL(blob); }); }
function dataUrlToImg(dataUrl){ return new Promise((res,rej)=>{ const img=new Image(); img.onload=()=>res(img); img.onerror=()=>rej(new Error("DataURL decode failed")); img.src=dataUrl; }); }

async function loadImageUrlIntoTexture(url, target) {
  try {
    const resp = await fetch(url, { mode:"cors", cache:"no-store" });

    // === Pokud obrázek neexistuje / 404 / CORS problém → tiše přeskočit ===
    if (!resp.ok) {
      console.warn("Obrázek nelze načíst:", url);
      return; // ← žádný alert!
    }

    const ct = resp.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) {
      console.warn("URL nevrací obrázek:", url);
      return;
    }

    const blob = await resp.blob();
    let bmp;
    try { bmp = await createImageBitmap(blob, { premultiplyAlpha:"premultiply" }); }
    catch { bmp = await blobToImg(blob); }

    const dt = new BABYLON.DynamicTexture("imgDT", { width:1024, height:1024 }, scene, true);
    const ctx = dt.getContext();
    drawFitted(ctx, bmp, FRAME_SIZE.W, FRAME_SIZE.H);
    dt.update();

    // Podpora: front + back
    if (target.frameFront && target.frameBack) {
      target.frameFront.material = unlitTexWithLevel(dt, 1.0);
      target.frameBack.material  = unlitTexWithLevel(dt, 0.65); // zadní strana
    } else {
      target.material = unlitTexWithLevel(dt, 1.0);
    }

  } catch(e) {
    // NIC nehlásit, jen tichý fallback.
    console.warn("Chyba při načítání obrázku:", url, e);
  }
}
``
/* -----------------------------
   7) SVG logo "phaser" – zadní i přední stěna
------------------------------*/
function buildGalleryLogo(){
  const LOGO = {
    url: 'assets/phaser.svg',
    scale: 0.44,
    blur: 3,
    yOffset:
