/* global BABYLON */
const canvas = document.getElementById('renderCanvas');
const engine = new BABYLON.Engine(canvas, true, { stencil: true }); // stencil pro HighlightLayer
let scene, camera, glow, hl;
let config;
let frames = [];              // { mesh, imagePlane, mat, tex, state, plaque }
let activeFrame = null;
let editMode = false;

// ---------- Načtení konfigurace ----------
fetch('data/gallery.json').then(r => r.json()).then(async cfg => {
  config = cfg;
  scene = createScene();
  await buildRoomAndFrames();
  engine.runRenderLoop(() => scene.render());
});

window.addEventListener('resize', () => engine.resize());

// ---------- Scéna / kamera / světla ----------
function createScene(){
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0,0,0,1);

  // Kamera (ArcRotateCamera)
  camera = new BABYLON.ArcRotateCamera('cam',
    Math.PI*1.25, Math.PI/2.7, Math.max(30, config.room.depth*0.8),
    new BABYLON.Vector3(0, config.room.height*0.45, 0), scene);
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = Math.max(10, config.frames.defaultFrame.outerWidth*2);
  camera.upperRadiusLimit = Math.max(60, config.room.depth*1.2);
  camera.wheelDeltaPercentage = 0.01; // příjemné zoomování napříč měřítky [10](https://forum.babylonjs.com/t/arcrotatecamera-pan-and-zoom-sensitivity/33046)
  camera.panningSensibility = 1200;

  // Jemná ambientní scéna + směrové světlo pro rám / reliéf
  new BABYLON.HemisphericLight('h', new BABYLON.Vector3(0,1,0), scene).intensity = 0.6;
  const dir = new BABYLON.DirectionalLight('d', new BABYLON.Vector3(-0.5,-1,0.5), scene);
  dir.intensity = 0.7;

  // LED Glow
  glow = new BABYLON.GlowLayer('glow', scene, {
    mainTextureFixedSize: config.glow.mainTextureFixedSize,
    blurKernelSize: config.glow.blurKernelSize
  });
  glow.intensity = config.glow.intensity; // kolem emisivních částí materiálů [1](https://doc.babylonjs.com/features/featuresDeepDive/mesh/glowLayer)

  // Hover Highlight
  hl = new BABYLON.HighlightLayer('hl', scene);
  hl.blurHorizontalSize = hl.blurVerticalSize = config.highlight.blurSize; // [2](https://doc.babylonjs.com/features/featuresDeepDive/mesh/highlightLayer)

  // Výběr aktivního rámu: ray pick + highlight
  scene.onPointerObservable.add((pointerInfo) => {
    const type = pointerInfo.type;
    if (type === BABYLON.PointerEventTypes.POINTERMOVE) return;
    if (type === BABYLON.PointerEventTypes.POINTERDOWN) {
      const pick = scene.pick(scene.pointerX, scene.pointerY, m => m && m.metadata && m.metadata.isFrame);
      if (pick && pick.pickedMesh) {
        setActiveFrame(pick.pickedMesh.metadata.frameIndex);
      }
    }
  });

  // Editace obsahu rámu – wheel = zoom (uScale/vScale), drag = posun (uOffset/vOffset) [4](https://babylonjsguide.github.io/intermediate/Materials)[5](https://forum.babylonjs.com/t/offsetting-texture-image/18769)
  let drag = null;
  scene.onPointerObservable.add((pi) => {
    if (!editMode || activeFrame == null) return;
    const f = frames[activeFrame];
    switch (pi.type) {
      case BABYLON.PointerEventTypes.POINTERDOWN:
        drag = { x: scene.pointerX, y: scene.pointerY, u: f.state.uOffset, v: f.state.vOffset };
        camera.detachControl(canvas); // během editace „zamkneme“ kameru
        break;
      case BABYLON.PointerEventTypes.POINTERUP:
        drag = null;
        camera.attachControl(canvas, true);
        break;
      case BABYLON.PointerEventTypes.POINTERMOVE:
        if (!drag) break;
        const dx = (scene.pointerX - drag.x) / canvas.width;
        const dy = (scene.pointerY - drag.y) / canvas.height;
        // invert Y kvůli texturovým UV
        f.state.uOffset = drag.u + dx;
        f.state.vOffset = drag.v - dy;
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

  return scene;
}

// ---------- Místnost + rámy ----------
async function buildRoomAndFrames(){
  const {width:w, height:h, depth:d} = config.room;

  // Podlaha, stěny (vnitřní strany)
  const matWall = new BABYLON.StandardMaterial('matWall', scene);
  matWall.diffuseColor = new BABYLON.Color3(0.06, 0.06, 0.08);

  const walls = [];
  // podlaha
  const floor = BABYLON.MeshBuilder.CreateGround('floor', {width:w, height:d}, scene);
  floor.position.y = 0;
  floor.material = matWall;

  // stěny (front/back/left/right)
  const wallFront = BABYLON.MeshBuilder.CreatePlane('wallFront', {width:w, height:h}, scene);
  wallFront.position.z = -d/2; wallFront.position.y = h/2;
  wallFront.material = matWall;

  const wallBack = wallFront.clone('wallBack');
  wallBack.position.z = d/2; wallBack.rotate(BABYLON.Axis.Y, Math.PI, BABYLON.Space.LOCAL);

  const wallLeft = BABYLON.MeshBuilder.CreatePlane('wallLeft', {width:d, height:h}, scene);
  wallLeft.position.x = -w/2; wallLeft.position.y = h/2; wallLeft.rotate(BABYLON.Axis.Y, Math.PI/2, BABYLON.Space.LOCAL);
  wallLeft.material = matWall;

  const wallRight = wallLeft.clone('wallRight');
  wallRight.position.x = w/2; wallRight.rotate(BABYLON.Axis.Y, Math.PI, BABYLON.Space.LOCAL);

  const wallMap = { front: wallFront, back: wallBack, left: wallLeft, right: wallRight };

  // Logo
  if (config.logo?.enabled) {
    const logoPlane = BABYLON.MeshBuilder.CreatePlane('logo', {width:config.logo.width, height:config.logo.height}, scene);
    logoPlane.parent = wallMap[config.logo.wall];
    logoPlane.position = new BABYLON.Vector3(0, config.logo.y, -0.01);
    const matLogo = new BABYLON.StandardMaterial('matLogo', scene);
    matLogo.emissiveColor = new BABYLON.Color3(0.9,0.9,0.9); // trochu svítí => glow
    matLogo.diffuseTexture = new BABYLON.Texture('assets/logo.png', scene);
    logoPlane.material = matLogo;
  }

  // Vytvoření rámů pro každou stěnu
  const df = config.frames.defaultFrame;
  const wallsCfg = config.frames.walls;

  for (const [i, wcfg] of wallsCfg.entries()) {
    const wall = wallMap[wcfg.wall];
    const cols = wcfg.cols, rows = wcfg.rows;
    const gapX = wcfg.gapX, gapY = wcfg.gapY;

    const totalW = cols*df.outerWidth + (cols-1)*gapX;
    const totalH = rows*df.outerHeight + (rows-1)*gapY;
    const startX = -totalW/2 + df.outerWidth/2;
    const startY = (config.room.height/2) - (config.room.height - totalH)/2 + (wcfg.yOffset||0);

    for (let r=0; r<rows; r++){
      for (let c=0; c<cols; c++){
        const x = startX + c*(df.outerWidth + gapX);
        const y = startY - r*(df.outerHeight + gapY);

        frames.push(makeFrameOnWall(wall, x, y, df, frames.length));
      }
    }
  }
}

// ---------- Jednotlivý rám: rámeček + obraz + cedulka ----------
function makeFrameOnWall(wall, x, y, df, frameIndex){
  // 1) Rám – tenká „deska“ za obrazem
  const frameBack = BABYLON.MeshBuilder.CreatePlane(`frameBack_${frameIndex}`, {width: df.outerWidth, height: df.outerHeight}, scene);
  frameBack.parent = wall;
  frameBack.position = new BABYLON.Vector3(x, y, -0.02);

  const matFrame = new BABYLON.PBRMaterial(`matFrame_${frameIndex}`, scene);
  matFrame.albedoColor = new BABYLON.Color3(0.05,0.05,0.06);
  matFrame.metallic = 0.0; matFrame.roughness = 0.25;
  // Emissive „LED hrana“ – tenká světlá linka kolem
  matFrame.emissiveColor = new BABYLON.Color3(0.0, 0.6, 1.2).scale(0.25); // decentní modrý nádech → GlowLayer to rozsvítí [1](https://doc.babylonjs.com/features/featuresDeepDive/mesh/glowLayer)
  frameBack.material = matFrame;

  // 2) Obraz – mírně vystouplý
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

  // 3) Cedulka (DynamicTexture) – text + volitelný URL odkaz [3](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/dynamicTexture)
  const plaque = BABYLON.MeshBuilder.CreatePlane(`plaque_${frameIndex}`, {width: df.outerWidth*0.8, height: df.plaqueHeight}, scene);
  plaque.parent = wall;
  plaque.position = new BABYLON.Vector3(x, y - df.outerHeight/2 - df.plaqueHeight*0.8, -0.009);

  const plaqueDT = new BABYLON.DynamicTexture(`plaqueDT_${frameIndex}`, {width:512, height:128}, scene);
  const pctx = plaqueDT.getContext();
  function drawPlaqueText(title='Untitled', url=''){
    pctx.fillStyle = '#111'; pctx.fillRect(0,0,512,128);
    pctx.fillStyle = '#fff'; pctx.font = 'bold 38px system-ui';
    pctx.fillText(title, 18, 60);
    pctx.font = '24px system-ui'; pctx.fillStyle = '#73c7ff';
    if (url) pctx.fillText(url, 18, 100);
    plaqueDT.update();
  }
  drawPlaqueText('Untitled', '');

  const matPlaque = new BABYLON.StandardMaterial(`matPlaque_${frameIndex}`, scene);
  matPlaque.diffuseTexture = plaqueDT;
  matPlaque.specularColor = new BABYLON.Color3(0,0,0);
  plaque.material = matPlaque;

  // Hover highlight
  frameBack.metadata = imgPlane.metadata; // aby klik fungoval i na rámeček
  hl.addExcludedMesh(plaque); // cedulky nehighlightujeme

  const state = {
    scale: 1.0, uOffset: 0.0, vOffset: 0.0, flipH: false, flipV: false,
    title: 'Untitled', url: ''
  };
  const frameRec = { mesh: frameBack, imagePlane: imgPlane, mat: matImg, tex: matImg.diffuseTexture, state, plaque: { mesh: plaque, draw: drawPlaqueText } };
  applyTextureState(frameRec);

  return frameRec;
}

// Aplikace posunu/zoomu/zrcadlení do textury obrazu (u/v scale & offset) [4](https://babylonjsguide.github.io/intermediate/Materials)
function applyTextureState(f){
  const t = f.mat.diffuseTexture;
  const s = f.state.scale;
  t.uScale = (f.state.flipH ? -1 : 1) * s;
  t.vScale = (f.state.flipV ? -1 : 1) * s;
  t.uOffset = f.state.uOffset;
  t.vOffset = f.state.vOffset;
}

// Aktivace rámu (highlight)
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

// ---------- Toolbar (zdroje) ----------
const sourceSel   = document.getElementById('sourceSelect');
const ghOwner     = document.getElementById('ghOwner');
const ghRepo      = document.getElementById('ghRepo');
const ghBranch    = document.getElementById('ghBranch');
const btnLoadGh   = document.getElementById('btnLoadGithub');
const urlInputs   = document.getElementById('urlInputs');
const githubInputs= document.getElementById('githubInputs');
const uploadInputs= document.getElementById('uploadInputs');
const btnLoadUrls = document.getElementById('btnLoadUrls');
const urlList     = document.getElementById('urlList');
const filePicker  = document.getElementById('filePicker');

sourceSel.addEventListener('change', ()=>{
  githubInputs.classList.toggle('hidden', sourceSel.value!=='github');
  urlInputs.classList.toggle('hidden', sourceSel.value!=='url');
  uploadInputs.classList.toggle('hidden', sourceSel.value!=='upload');
});

// Načtení seznamu /assets z GitHubu (public repo) – vrací pole s download_url [8](https://docs.github.com/en/rest/repos/contents)
btnLoadGh.addEventListener('click', async ()=>{
  const owner  = ghOwner.value.trim();
  const repo   = ghRepo.value.trim();
  const branch = ghBranch.value.trim() || 'main';
  if (!owner || !repo) { alert('Uveď owner a repo.'); return; }
  const api = `https://api.github.com/repos/${owner}/${repo}/contents/assets?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(api);
  if (!res.ok){ alert('Chyba při čtení GitHub API'); return; }
  const data = await res.json();
  const images = data.filter(i => /\\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(i.name)).map(i => i.download_url);
  assignImagesRoundRobin(images);
});

btnLoadUrls.addEventListener('click', ()=>{
  const urls = urlList.value.split(/\\r?\\n/).map(s=>s.trim()).filter(Boolean);
  assignImagesRoundRobin(urls);
});

filePicker.addEventListener('change', ()=>{
  const files = [...filePicker.files];
  const urls = files.map(f => URL.createObjectURL(f));
  assignImagesRoundRobin(urls);
});

// Rozdistribuuj zdroje do rámů (dokola)
function assignImagesRoundRobin(urls){
  if (!urls.length) return;
  frames.forEach((f, i)=>{
    const url = urls[i % urls.length];
    f.mat.diffuseTexture = new BABYLON.Texture(url, scene, true, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE, ()=>{
      f.tex = f.mat.diffuseTexture;
      applyTextureState(f);
    });
    // Automaticky popisek z názvu souboru
    const title = decodeURIComponent((url.split('/').pop()||'').replace(/\\.[^.]+$/, ''));
    f.state.title = title; f.state.url = url;
    f.plaque.draw(title, url);
  });
}

// ---------- Toolbar (edit mode, flip) ----------
document.getElementById('btnToggleEdit').addEventListener('click', (e)=>{
  editMode = !editMode;
  e.target.textContent = `Režim úpravy rámu: ${editMode?'Zap':'Vyp'}`;
});
document.getElementById('btnFlipH').addEventListener('click', ()=>{
  if (activeFrame==null) return;
  const f = frames[activeFrame]; f.state.flipH = !f.state.flipH; applyTextureState(f);
});
document.getElementById('btnFlipV').addEventListener('click', ()=>{
  if (activeFrame==null) return;
  const f = frames[activeFrame]; f.state.flipV = !f.state.flipV; applyTextureState(f);
});
