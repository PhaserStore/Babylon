/* =========================================================================
   Babylon Gallery – COMPLETE script.js (VIEW default, ADMIN po klávese A)
   ========================================================================= */

const canvas = document.getElementById('renderCanvas');
const engine = new BABYLON.Engine(canvas, true, { stencil: true });

let scene, camera, glow, hl;
let config;
let frames = [];               // { mesh, imagePlane, mat, tex, state, plaque }
let activeFrame = null;

// === Výchozí režim: VIEW (toolbar a SC overlay skryté), ADMIN po 'A' ===
let isAdminMode = false;       

const CONFIG_URL = 'data/gallery.json';

// Toolbar prvky (pokud existují)
const sourceSel     = document.getElementById('sourceSelect');
const ghOwnerInput  = document.getElementById('ghOwner');
const ghRepoInput   = document.getElementById('ghRepo');
const ghBranchInput = document.getElementById('ghBranch');
const btnLoadGh     = document.getElementById('btnLoadGithub');

const urlInputs     = document.getElementById('urlInputs');
const urlList       = document.getElementById('urlList');
const btnLoadUrls   = document.getElementById('btnLoadUrls');

const uploadInputs  = document.getElementById('uploadInputs');
const filePicker    = document.getElementById('filePicker');

const btnToggleEdit = document.getElementById('btnToggleEdit');
const btnFlipH      = document.getElementById('btnFlipH');
const btnFlipV      = document.getElementById('btnFlipV');

const toolbarEl     = document.getElementById('toolbar');

// SoundCloud UI
const scWrap   = document.getElementById('sc-wrap');
const scIframe = document.getElementById('sc-iframe');
let   scHidden = null; // skrytý autoplay player (VIEW)

const SC_STORAGE_KEY = 'gallery.soundcloud.url';
const DEFAULT_SC_URL = 'https://soundcloud.com/vertigo01/sets/detroit-techno';

/* ======================== START ======================== */
fetch(CONFIG_URL)
  .then(r => r.json())
  .then(async cfg => {
    config = cfg;
    scene = createScene();
    await buildRoomAndFrames();

    // Praktické: hned po startu rozdej lokální obrázky (pokud existují)
    assignImagesRoundRobin(['assets/one.jpg','assets/two.jpg']);

    initToolbarHooks();

    // Výchozí viditelnost admin UI (VIEW => skryto)
    applyAdminUiVisibility();

    // SoundCloud – podle módu
    applySoundCloudVisibility();

    engine.runRenderLoop(() => scene.render());
  });

window.addEventListener('resize', () => engine.resize());

/* ======================== SCÉNA ======================== */
function createScene(){
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0,0,0,1);

  camera = new BABYLON.ArcRotateCamera('cam',
    Math.PI*1.25, Math.PI/2.7,
    40,
    new BABYLON.Vector3(0, 5, 0),
    scene);
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 10;
  camera.upperRadiusLimit = 120;
  camera.wheelDeltaPercentage = 0.01; // příjemný zoom
  camera.panningSensibility = 1200;

  new BABYLON.HemisphericLight('h', new BABYLON.Vector3(0,1,0), scene).intensity = 0.6;
  const dir = new BABYLON.DirectionalLight('d', new BABYLON.Vector3(-0.5,-1,0.5), scene);
  dir.intensity = 0.7;

  glow = new BABYLON.GlowLayer('glow', scene, {
    mainTextureFixedSize: (config?.glow?.mainTextureFixedSize ?? 1024),
    blurKernelSize: (config?.glow?.blurKernelSize ?? 64)
  });
  glow.intensity = (config?.glow?.intensity ?? 0.55);

  hl = new BABYLON.HighlightLayer('hl', scene);
  const blur = config?.highlight?.blurSize ?? 2.0;
  hl.blurHorizontalSize = hl.blurVerticalSize = blur;

  // Výběr rámu
  scene.onPointerObservable.add((pointerInfo) => {
    if (pointerInfo.type !== BABYLON.PointerEventTypes.POINTERDOWN) return;
    const pick = scene.pick(scene.pointerX, scene.pointerY, m => m && m.metadata && m.metadata.isFrame);
    if (pick && pick.pickedMesh) setActiveFrame(pick.pickedMesh.metadata.frameIndex);
  });

  // Hook editace textury v rámci (zoom/posun/zrcadlení)
  hookImageEditing(scene);

  // Klávesa 'A' → přepni ADMIN/VIEW
  window.addEventListener('keydown', (e)=>{
    if (e.key && e.key.toLowerCase() === 'a') {
      isAdminMode = !isAdminMode;
      applyAdminUiVisibility();
      applySoundCloudVisibility();
    }
  });

  return scene;
}

/* =========== MÍSTNOST + RÁMY + CEDULKY =========== */
async function buildRoomAndFrames(){
  const room = config?.room ?? { width: 32, height: 12, depth: 48 };

  const matWall = new BABYLON.StandardMaterial('matWall', scene);
  matWall.diffuseColor = new BABYLON.Color3(0.06, 0.06, 0.08);

  const floor = BABYLON.MeshBuilder.CreateGround('floor', {width:room.width, height:room.depth}, scene);
  floor.position.y = 0; floor.material = matWall;

  const wallFront = BABYLON.MeshBuilder.CreatePlane('wallFront', {width:room.width, height:room.height}, scene);
  wallFront.position.z = -room.depth/2; wallFront.position.y = room.height/2; wallFront.material = matWall;

  const wallBack = wallFront.clone('wallBack');
  wallBack.position.z = room.depth/2; wallBack.rotate(BABYLON.Axis.Y, Math.PI, BABYLON.Space.LOCAL);

  const wallLeft = BABYLON.MeshBuilder.CreatePlane('wallLeft', {width:room.depth, height:room.height}, scene);
  wallLeft.position.x = -room.width/2; wallLeft.position.y = room.height/2;
  wallLeft.rotate(BABYLON.Axis.Y, Math.PI/2, BABYLON.Space.LOCAL); wallLeft.material = matWall;

  const wallRight = wallLeft.clone('wallRight');
  wallRight.position.x = room.width/2; wallRight.rotate(BABYLON.Axis.Y, Math.PI, BABYLON.Space.LOCAL);

  const wallMap = { front: wallFront, back: wallBack, left: wallLeft, right: wallRight };

  // Logo (volitelné)
  if (config.logo?.enabled) {
    const logoPlane = BABYLON.MeshBuilder.CreatePlane('logo', {width:config.logo.width, height:config.logo.height}, scene);
    logoPlane.parent = wallMap[config.logo.wall || 'front'];
    logoPlane.position = new BABYLON.Vector3(0, config.logo.y ?? 4, -0.01);
    const matLogo = new BABYLON.StandardMaterial('matLogo', scene);
    matLogo.emissiveColor = new BABYLON.Color3(0.9,0.9,0.9);
    matLogo.diffuseTexture = new BABYLON.Texture('assets/logo.png', scene);
    logoPlane.material = matLogo;
  }

  const df = config.frames?.defaultFrame ?? { outerWidth:6, outerHeight:4, imageInset:0.25, plaqueHeight:0.5 };
  const wallsCfg = config.frames?.walls ?? [
    { wall:'front', rows:2, cols:4, gapX:2.4, gapY:2.0, yOffset:0.5 },
    { wall:'right', rows:2, cols:3, gapX:2.2, gapY:2.0, yOffset:0.5 },
    { wall:'back',  rows:2, cols:4, gapX:2.4, gapY:2.0, yOffset:0.5 },
    { wall:'left',  rows:2, cols:3, gapX:2.2, gapY:2.0, yOffset:0.5 }
  ];

  for (const wcfg of wallsCfg) {
    const wall = wallMap[wcfg.wall];
    const cols = wcfg.cols, rows = wcfg.rows;
    const gapX = wcfg.gapX, gapY = wcfg.gapY;

    const totalW = cols*df.outerWidth + (cols-1)*gapX;
    const totalH = rows*df.outerHeight + (rows-1)*gapY;
    const startX = -totalW/2 + df.outerWidth/2;
    const startY = (room.height/2) - (room.height - totalH)/2 + (wcfg.yOffset||0);

    for (let r=0; r<rows; r++){
      for (let c=0; c<cols; c++){
        const x = startX + c*(df.outerWidth + gapX);
        const y = startY - r*(df.outerHeight + gapY);
        frames.push(makeFrameOnWall(wall, x, y, df, frames.length));
      }
    }
  }
}

function makeFrameOnWall(wall, x, y, df, frameIndex){
  const back = BABYLON.MeshBuilder.CreatePlane(`frameBack_${frameIndex}`, {width: df.outerWidth, height: df.outerHeight}, scene);
  back.parent = wall; back.position = new BABYLON.Vector3(x, y, -0.02);

  const matFrame = new BABYLON.PBRMaterial(`matFrame_${frameIndex}`, scene);
  matFrame.albedoColor = new BABYLON.Color3(0.05,0.05,0.06);
  matFrame.metallic = 0.0; matFrame.roughness = 0.25;
  matFrame.emissiveColor = new BABYLON.Color3(0.0, 0.6, 1.2).scale(0.25); // LED lem (Glow ho rozsvítí)
  back.material = matFrame;

  const inset = df.imageInset;
  const imgPlane = BABYLON.MeshBuilder.CreatePlane(`img_${frameIndex}`, {
    width: df.outerWidth - inset*2,
    height: df.outerHeight - inset*2
  }, scene);
  imgPlane.parent = wall;
  imgPlane.position = new BABYLON.Vector3(x, y, -0.01);
  imgPlane.metadata = { isFrame: true, frameIndex };

  const matImg = new BABYLON.StandardMaterial(`matImg_${frameIndex}`, scene);
  matImg.diffuseTexture = new BABYLON.Texture('assets/one.jpg', scene); // výchozí
  matImg.diffuseTexture.hasAlpha = true;
  matImg.specularColor = new BABYLON.Color3(0,0,0);
  imgPlane.material = matImg;

  const plaque = BABYLON.MeshBuilder.CreatePlane(`plaque_${frameIndex}`, {width: df.outerWidth*0.8, height: df.plaqueHeight}, scene);
  plaque.parent = wall;
  plaque.position = new BABYLON.Vector3(x, y - df.outerHeight/2 - df.plaqueHeight*0.8, -0.009);

  const plaqueDT = new BABYLON.DynamicTexture(`plaqueDT_${frameIndex}`, {width:512, height:128}, scene);
  const pctx = plaqueDT.getContext();
  function drawPlaqueText(title='Untitled', url=''){
    pctx.fillStyle = '#111'; pctx.fillRect(0,0,512,128);
    pctx.fillStyle = '#fff'; pctx.font = 'bold 38px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    pctx.fillText(title, 18, 60);
    pctx.font = '24px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'; pctx.fillStyle = '#73c7ff';
    if (url) pctx.fillText(url, 18, 100);
    plaqueDT.update();
  }
  drawPlaqueText('Untitled', '');

  const matPlaque = new BABYLON.StandardMaterial(`matPlaque_${frameIndex}`, scene);
  matPlaque.diffuseTexture = plaqueDT;
  matPlaque.specularColor = new BABYLON.Color3(0,0,0);
  plaque.material = matPlaque;

  back.metadata = imgPlane.metadata;
  hl.addExcludedMesh(plaque);

  const state = {
    scale: 1.0, uOffset: 0.0, vOffset: 0.0, flipH: false, flipV: false,
    title: 'Untitled', url: '',
    soundcloud: null
  };
  const rec = { mesh: back, imagePlane: imgPlane, mat: matImg, tex: matImg.diffuseTexture, state, plaque: { mesh: plaque, draw: drawPlaqueText } };
  applyTextureState(rec);
  return rec;
}

function applyTextureState(f){
  const t = f.mat.diffuseTexture;
  const s = f.state.scale;
  t.uScale = (f.state.flipH ? -1 : 1) * s;
  t.vScale = (f.state.flipV ? -1 : 1) * s;
  t.uOffset = f.state.uOffset;
  t.vOffset = f.state.vOffset;
}

function setActiveFrame(idx){
  if (activeFrame != null){
    const prev = frames[activeFrame];
    hl.removeMesh(prev.imagePlane); hl.removeMesh(prev.mesh);
  }
  activeFrame = idx;
  if (activeFrame != null){
    const cur = frames[activeFrame];
    hl.addMesh(cur.imagePlane, BABYLON.Color3.White());
    hl.addMesh(cur.mesh, BABYLON.Color3.White());
  }
}

/* =========== EDITACE OBRÁZKU UVNITŘ RÁMU =========== */
function hookImageEditing(scene){
  let editMode = false;
  let drag = null;

  if (btnToggleEdit){
    btnToggleEdit.addEventListener('click', (e)=>{
      editMode = !editMode;
      e.target.textContent = `Režim úpravy rámu: ${editMode?'Zap':'Vyp'}`;
    });
  }
  if (btnFlipH){
    btnFlipH.addEventListener('click', ()=>{
      if (activeFrame==null) return;
      const f = frames[activeFrame]; f.state.flipH = !f.state.flipH; applyTextureState(f);
    });
  }
  if (btnFlipV){
    btnFlipV.addEventListener('click', ()=>{
      if (activeFrame==null) return;
      const f = frames[activeFrame]; f.state.flipV = !f.state.flipV; applyTextureState(f);
    });
  }

  scene.onPointerObservable.add((pi) => {
    if (!editMode || activeFrame == null) return;
    const f = frames[activeFrame];

    switch (pi.type) {
      case BABYLON.PointerEventTypes.POINTERDOWN:
        drag = { x: scene.pointerX, y: scene.pointerY, u: f.state.uOffset, v: f.state.vOffset };
        camera.detachControl(canvas);
        break;
      case BABYLON.PointerEventTypes.POINTERUP:
        drag = null;
        camera.attachControl(canvas, true);
        break;
      case BABYLON.PointerEventTypes.POINTERMOVE:
        if (!drag) break;
        const dx = (scene.pointerX - drag.x) / canvas.width;
        const dy = (scene.pointerY - drag.y) / canvas.height;
        f.state.uOffset = drag.u + dx;
        f.state.vOffset = drag.v - dy; // inverze Y pro UV
        applyTextureState(f);
        break;
      case BABYLON.PointerEventTypes.POINTERWHEEL:
        const ev = pi.event;
        const delta = Math.sign(ev.deltaY) * 0.08;
        const s = Math.max(0.1, Math.min(6, frames[activeFrame].state.scale * (1 + delta)));
        frames[activeFrame].state.scale = s;
        applyTextureState(frames[activeFrame]);
        ev.preventDefault();
        break;
    }
  });
}

/* ===================== TOOLBAR HOOKY ===================== */
function initToolbarHooks(){
  if (sourceSel){
    sourceSel.addEventListener('change', ()=>{
      const v = sourceSel.value;
      const gi = document.getElementById('githubInputs');
      if (gi) gi.classList.toggle('hidden', v!=='github');
      if (urlInputs)     urlInputs.classList.toggle('hidden', v!=='url');
      if (uploadInputs)  uploadInputs.classList.toggle('hidden', v!=='upload');
    });
  }

  if (btnLoadGh && ghOwnerInput && ghRepoInput && ghBranchInput){
    btnLoadGh.addEventListener('click', async ()=>{
      const owner  = ghOwnerInput.value.trim();
      const repo   = ghRepoInput.value.trim();
      const branch = ghBranchInput.value.trim() || 'main';
      if (!owner || !repo) { alert('Uveď owner a repo.'); return; }
      const api = `https://api.github.com/repos/${owner}/${repo}/contents/assets?ref=${encodeURIComponent(branch)}`;
      const res = await fetch(api);
      if (!res.ok){ alert('Chyba při čtení GitHub API'); return; }
      const data = await res.json();
      const images = data.filter(i => /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(i.name)).map(i => i.download_url);
      assignImagesRoundRobin(images);
    });
  }

  if (btnLoadUrls && urlList){
    btnLoadUrls.addEventListener('click', ()=>{
      const urls = urlList.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      assignImagesRoundRobin(urls);
    });
  }

  if (filePicker){
    filePicker.addEventListener('change', ()=>{
      const files = [...filePicker.files];
      const urls = files.map(f => URL.createObjectURL(f));
      assignImagesRoundRobin(urls);
    });
  }

  // SoundCloud input v adminu
  const scInput = document.getElementById('inputSoundCloud');
  const scSave  = document.getElementById('btnSaveSoundCloud');
  if (scInput && scSave){
    scInput.value = getSoundCloudUrl();
    scSave.addEventListener('click', ()=>{
      const val = (scInput.value || '').trim();
      if (!val) return;
      setSoundCloudUrl(val);
      if (isAdminMode) showSoundCloudOverlay(val);
    });
  }
}

// rozdistribuuj obrázky přes rámy
function assignImagesRoundRobin(urls){
  if (!urls.length) return;
  frames.forEach((f, i)=>{
    const url = urls[i % urls.length];
    f.mat.diffuseTexture = new BABYLON.Texture(url, scene, true, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE, ()=>{
      f.tex = f.mat.diffuseTexture;
      applyTextureState(f);
    });
    const title = decodeURIComponent((url.split('/').pop()||'').replace(/\.[^.]+$/, ''));
    f.state.title = title; f.state.url = url;
    f.plaque.draw(title, url);
  });
}

/* ===================== ADMIN/VIEW UI ===================== */
function applyAdminUiVisibility(){
  if (!toolbarEl) return;
  toolbarEl.style.display = isAdminMode ? 'flex' : 'none';
}

/* ===================== SOUNDCloud ===================== */
function getSoundCloudUrl(){
  return localStorage.getItem(SC_STORAGE_KEY) || DEFAULT_SC_URL;
}
function setSoundCloudUrl(url){
  if (!url) return;
  localStorage.setItem(SC_STORAGE_KEY, url);
}
function buildSCEmbed(trackOrSetUrl, opts = { visual:false, autoPlay:false }){
  const base = 'https://w.soundcloud.com/player/?url=';
  const params = [
    'color=%23111111',
    'hide_related=false',
    'show_comments=true',
    'show_user=true',
    'show_reposts=false',
    'show_teaser=true',
    `visual=${opts.visual ? 'true' : 'false'}`,
    `auto_play=${opts.autoPlay ? 'true' : 'false'}`
  ].join('&');
  return `${base}${encodeURIComponent(trackOrSetUrl)}&${params}`;
}
function showSoundCloudOverlay(url){
  const embed = buildSCEmbed(url, { visual:false, autoPlay:false });
  scIframe.src = embed;
  scWrap.style.display = 'block';
}
function hideSoundCloudOverlay(){
  scIframe.src = 'about:blank';
  scWrap.style.display = 'none';
}
// Skrytý autoplay ve VIEW
function ensureHiddenPlayer(url){
  if (!scHidden){
    scHidden = document.createElement('iframe');
    scHidden.id = 'sc-hidden';
    scHidden.setAttribute('allow','autoplay');
    Object.assign(scHidden.style, {
      position:'fixed', width:'1px', height:'1px',
      left:'-9999px', top:'-9999px', border:'0'
    });
    document.body.appendChild(scHidden);
  }
  scHidden.src = buildSCEmbed(url, { visual:false, autoPlay:true });
}
function removeHiddenPlayer(){
  if (scHidden){
    scHidden.src = 'about:blank';
    scHidden.remove();
    scHidden = null;
  }
}
function applySoundCloudVisibility(){
  const url = getSoundCloudUrl();
  if (isAdminMode){
    removeHiddenPlayer();
    showSoundCloudOverlay(url);
  } else {
    hideSoundCloudOverlay();
    ensureHiddenPlayer(url);
  }
}
``
