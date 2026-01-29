// === Konfigurace ===
const DEBUG_IMG = false;            // true = logy do konzole (bez alertů)
const USE_PLACEHOLDER_ON_FAIL = true;

// === Pomocné funkce ===
function blobToImg(blob) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload  = () => res(img);
    img.onerror = () => rej(new Error("IMG decode failed"));
    img.src     = URL.createObjectURL(blob);
  });
}

function dataUrlToImg(dataUrl) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload  = () => res(img);
    img.onerror = () => rej(new Error("DataURL decode failed"));
    img.src     = dataUrl;
  });
}

// Šachovnicový placeholder – „tichý“ fallback
function drawPlaceholder(ctx, w, h) {
  const tile = 32;
  for (let y = 0; y < h; y += tile) {
    for (let x = 0; x < w; x += tile) {
      const even = ((x / tile) + (y / tile)) % 2 === 0;
      ctx.fillStyle = even ? "#dcdcdc" : "#f4f4f4";
      ctx.fillRect(x, y, tile, tile);
    }
  }
}

// Udržení poměru stran do 1024x1024
function drawFitted(ctx, bmp, frameW, frameH) {
  const targetR=frameW/frameH, r=(bmp.width||1024)/(bmp.height||1024);
  let dw=1024,dh=1024,dx=0,dy=0;
  if (r>targetR){ dh=1024; dw=Math.round(dh*r); dx=Math.round((1024-dw)/2); }
  else { dw=1024; dh=Math.round(dw/r); dy=Math.round((1024-dh)/2); }
  ctx.fillStyle="#000"; ctx.fillRect(0,0,1024,1024);
  ctx.drawImage(bmp,0,0,bmp.width||1024,bmp.height||1024,dx,dy,dw,dh);
}

// Normalizace targetu: vezme {frame: Mesh} nebo přímo Mesh
function getTargetMesh(target) {
  if (!target) return null;
  if (target.frame) return target.frame;
  return target;
}

// Bezpečný unlit materiál (využije tvoje util funkce, pokud existují)
function applyTextureToTarget(dt, target) {
  const mesh = getTargetMesh(target);
  if (!mesh) return null;

  let mat = null;
  if (typeof unlitTexWithLevel === "function")      mat = unlitTexWithLevel(dt, 1.0);
  else if (typeof unlitTex === "function")          mat = unlitTex(dt);
  else { // minimalistický unlit materiál
    mat = new BABYLON.StandardMaterial("imgMat", mesh.getScene());
    mat.disableLighting = true;
    mat.diffuseTexture  = dt;
    mat.emissiveTexture = dt;
    mat.backFaceCulling = false;
  }
  mesh.material = mat;
  return mat;
}

// Vytvoří DynamicTexture z bitmapy
function textureFromBitmapLike(bmp, scene) {
  const dt = new BABYLON.DynamicTexture("imgDT", { width: 1024, height: 1024 }, scene, true);
  const ctx = dt.getContext();
  drawFitted(ctx, bmp, 1, 1); // poměr řídíme uvnitř drawFitted
  dt.update();
  return dt;
}

// === URL → textura (tichý) ===
async function loadImageUrlIntoTexture(url, target) {
  const mesh  = getTargetMesh(target);
  const scene = mesh ? mesh.getScene() : (window.scene || null);
  if (!scene) { if (DEBUG_IMG) console.warn("Scene není dostupná."); return null; }

  try {
    const resp = await fetch(url, { mode: "cors", cache: "no-store" });

    if (!resp.ok) {
      if (DEBUG_IMG) console.warn("HTTP není OK:", resp.status, url);
      if (USE_PLACEHOLDER_ON_FAIL) {
        const dt = new BABYLON.DynamicTexture("imgDT_fail", { width: 1024, height: 1024 }, scene, true);
        const ctx = dt.getContext(); drawPlaceholder(ctx, 1024, 1024); dt.update();
        applyTextureToTarget(dt, target);
        if (typeof hint === "function") hint("Obrázek nelze načíst → placeholder.");
        return dt;
      }
      return null;
    }

    const ct = resp.headers.get("content-type") || "";
    if (!ct.startsWith("image/") && !ct.includes("svg")) {
      if (DEBUG_IMG) console.warn("URL nevrací image/*:", ct, url);
      if (USE_PLACEHOLDER_ON_FAIL) {
        const dt = new BABYLON.DynamicTexture("imgDT_notimg", { width: 1024, height: 1024 }, scene, true);
        const ctx = dt.getContext(); drawPlaceholder(ctx, 1024, 1024); dt.update();
        applyTextureToTarget(dt, target);
        if (typeof hint === "function") hint("URL nevrací obrázek → placeholder.");
        return dt;
      }
      return null;
    }

    const blob = await resp.blob();

    let bmp;
    try {
      bmp = await createImageBitmap(blob, { premultiplyAlpha: "premultiply" });
    } catch {
      bmp = await blobToImg(blob);
    }

    const dt = textureFromBitmapLike(bmp, scene);
    applyTextureToTarget(dt, target);

    if (DEBUG_IMG) console.info("Obrázek načten:", url);
    if (target && target.data) target.data.src = url;
    if (typeof autosave === "function") autosave();
    if (typeof hint === "function") hint("Obrázek načten ✔");
    return dt;

  } catch (e) {
    if (DEBUG_IMG) console.warn("Chyba při načítání obrázku:", url, e);
    if (USE_PLACEHOLDER_ON_FAIL) {
      const dt = new BABYLON.DynamicTexture("imgDT_err", { width: 1024, height: 1024 }, scene, true);
      const ctx = dt.getContext(); drawPlaceholder(ctx, 1024, 1024); dt.update();
      applyTextureToTarget(dt, target);
      if (typeof hint === "function") hint("Chyba načítání → placeholder.");
      return dt;
    }
    return null;
  }
}

// === DataURL/SVG → textura (tichý) ===
async function loadSVGOrDataIntoTexture(dataUrl, target) {
  const mesh  = getTargetMesh(target);
  const scene = mesh ? mesh.getScene() : (window.scene || null);
  if (!scene) { if (DEBUG_IMG) console.warn("Scene není dostupná."); return null; }

  try {
    const bmp = await dataUrlToImg(dataUrl);
    const dt  = textureFromBitmapLike(bmp, scene);
    applyTextureToTarget(dt, target);
    if (DEBUG_IMG) console.info("DataURL/SVG načteno.");
    if (target && target.data) target.data.src = dataUrl;
    if (typeof autosave === "function") autosave();
    if (typeof hint === "function") hint("DataURL/SVG načteno ✔");
    return dt;
  } catch (e) {
    if (DEBUG_IMG) console.warn("Chyba při dekódování DataURL/SVG:", e);
    if (USE_PLACEHOLDER_ON_FAIL) {
      const dt = new BABYLON.DynamicTexture("imgDT_data_fail", { width: 1024, height: 1024 }, scene, true);
      const ctx = dt.getContext(); drawPlaceholder(ctx, 1024, 1024); dt.update();
      applyTextureToTarget(dt, target);
      if (typeof hint === "function") hint("DataURL/SVG chyba → placeholder.");
      return dt;
    }
    return null;
  }
}

// === Smart loader (URL / data:image / <svg ...>) — tichý ===
async function loadIntoFrameSmart(inputText, item) {
  const s = (inputText || "").trim();
  if (!s) { if (typeof hint === "function") hint("Zadej URL / data:image/... / <svg>…</svg>"); return null; }

  if (s.startsWith("<svg")) {
    return loadSVGOrDataIntoTexture("data:image/svg+xml;utf8," + encodeURIComponent(s), item);
  }
  if (s.startsWith("data:image/")) {
    return loadSVGOrDataIntoTexture(s, item);
  }
  return loadImageUrlIntoTexture(s, item);
}

// === Lokální aktiva — tichý mód (volitelné) ===
function autoAssignLocalAssets(framesArr, urls) {
  if (!Array.isArray(framesArr) || !Array.isArray(urls)) return;
  urls.forEach((url, i) => {
    const it = framesArr[i]; if (!it) return;
    const img = new Image();
    img.onload = () => {
      const dt = new BABYLON.DynamicTexture("imgDT" + i, { width: 1024, height: 1024 }, it.frame.getScene(), true);
      const ctx = dt.getContext();
      drawFitted(ctx, img, 1, 1);
      dt.update();
      applyTextureToTarget(dt, it);
      if (it.data) {
        it.data.title = url.split("/").pop();
        if (typeof drawPlacard === "function") drawPlacard(it.placard, it.data);
        if (typeof autosave === "function") autosave();
      }
    };
    img.onerror = () => {
      if (DEBUG_IMG) console.warn("Lokální asset nelze načíst:", url);
      if (USE_PLACEHOLDER_ON_FAIL) {
        const dt = new BABYLON.DynamicTexture("imgDT_local_fail_" + i, { width: 1024, height: 1024 }, it.frame.getScene(), true);
        const ctx = dt.getContext(); drawPlaceholder(ctx, 1024, 1024); dt.update();
        applyTextureToTarget(dt, it);
      }
    };
    img.src = url + "?v=" + Date.now();
  });
}
