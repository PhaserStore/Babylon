// === Konfigurace ===
const DEBUG_IMG = false;   // true = log do konzole, false = absolutní ticho
const USE_PLACEHOLDER_ON_FAIL = true; // zda vykreslit neutrální zástupný obrázek

// === Pomocné funkce ===
function blobToImg(blob) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("IMG decode failed"));
    img.src = URL.createObjectURL(blob);
  });
}

function dataUrlToImg(dataUrl) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("DataURL decode failed"));
    img.src = dataUrl;
  });
}

// Volitelný tichý placeholder (šachovnice) – ať rám nezůstane „prázdný“.
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

// Bezpečný unlit materiál (předpokládám dostupné pomocné funkce z tvého projektu)
function applyTextureToTarget(dt, target) {
  // Podpora: front + back
  if (target && target.frameFront && target.frameBack) {
    target.frameFront.material = unlitTexWithLevel(dt, 1.0);
    target.frameBack.material  = unlitTexWithLevel(dt, 0.65);
  } else if (target && target.material !== undefined) {
    target.material = unlitTexWithLevel ? unlitTexWithLevel(dt, 1.0) : unlitTex(dt);
  }
}

// Vykreslení do DynamicTexture podle tvé utility drawFitted(...)
function textureFromBitmapLike(bmp) {
  const dt = new BABYLON.DynamicTexture("imgDT", { width: 1024, height: 1024 }, scene, true);
  const ctx = dt.getContext();
  drawFitted(ctx, bmp, FRAME_SIZE.W, FRAME_SIZE.H);
  dt.update();
  return dt;
}

// === Sjednocená funkce pro načtení URL obrázku do materiálu ===
// Vrací: Promise<DynamicTexture|null> (null při tichém selhání)
async function loadImageUrlIntoTexture(url, target) {
  try {
    const resp = await fetch(url, { mode: "cors", cache: "no-store" });

    if (!resp.ok) {
      if (DEBUG_IMG) console.warn("HTTP není OK:", resp.status, url);
      if (USE_PLACEHOLDER_ON_FAIL) {
        const dt = new BABYLON.DynamicTexture("imgDT_fail", { width: 1024, height: 1024 }, scene, true);
        const ctx = dt.getContext();
        drawPlaceholder(ctx, FRAME_SIZE.W, FRAME_SIZE.H);
        dt.update();
        applyTextureToTarget(dt, target);
        return dt;
      }
      return null; // tichý pád
    }

    const ct = resp.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) {
      if (DEBUG_IMG) console.warn("URL nevrací image/*:", ct, url);
      if (USE_PLACEHOLDER_ON_FAIL) {
        const dt = new BABYLON.DynamicTexture("imgDT_notimg", { width: 1024, height: 1024 }, scene, true);
        const ctx = dt.getContext();
        drawPlaceholder(ctx, FRAME_SIZE.W, FRAME_SIZE.H);
        dt.update();
        applyTextureToTarget(dt, target);
        return dt;
      }
      return null;
    }

    const blob = await resp.blob();

    let bmp;
    try {
      // Rychlejší cesta
      bmp = await createImageBitmap(blob, { premultiplyAlpha: "premultiply" });
    } catch {
      // Fallback přes <img>
      bmp = await blobToImg(blob);
    }

    const dt = textureFromBitmapLike(bmp);
    applyTextureToTarget(dt, target);

    // Tichý „úspěch“ – žádné hinty/toasty
    if (DEBUG_IMG) console.info("Obrázek načten:", url);
    return dt;

  } catch (e) {
    if (DEBUG_IMG) console.warn("Chyba při načítání obrázku:", url, e);
    if (USE_PLACEHOLDER_ON_FAIL) {
      const dt = new BABYLON.DynamicTexture("imgDT_err", { width: 1024, height: 1024 }, scene, true);
      const ctx = dt.getContext();
      drawPlaceholder(ctx, FRAME_SIZE.W, FRAME_SIZE.H);
      dt.update();
      applyTextureToTarget(dt, target);
      return dt;
    }
    return null;
  }
}

// === SVG nebo data:image/* → textura ===
async function loadSVGOrDataIntoTexture(dataUrl, target) {
  try {
    const bmp = await dataUrlToImg(dataUrl);
    const dt = textureFromBitmapLike(bmp);
    applyTextureToTarget(dt, target);
    if (DEBUG_IMG) console.info("DataURL/SVG načteno.");
    return dt;
  } catch (e) {
    if (DEBUG_IMG) console.warn("Chyba při dekódování DataURL/SVG:", e);
    if (USE_PLACEHOLDER_ON_FAIL) {
      const dt = new BABYLON.DynamicTexture("imgDT_data_fail", { width: 1024, height: 1024 }, scene, true);
      const ctx = dt.getContext();
      drawPlaceholder(ctx, FRAME_SIZE.W, FRAME_SIZE.H);
      dt.update();
      applyTextureToTarget(dt, target);
      return dt;
    }
    return null;
  }
}

// === Smart loader (URL / data:image / <svg ...>) ===
// Žádné alerty; vrací null při prázdém vstupu nebo chybě.
async function loadIntoFrameSmart(inputText, item) {
  if (!item) {
    item = (framesOf && currentWall ? (framesOf(currentWall)[0] || allFrames()[0]) : null);
  }
  if (!item) return null;

  const s = (inputText || "").trim();
  if (!s) return null;

  if (s.startsWith("<svg")) {
    return loadSVGOrDataIntoTexture("data:image/svg+xml;utf8," + encodeURIComponent(s), item.frame || item);
  }
  if (s.startsWith("data:image/")) {
    return loadSVGOrDataIntoTexture(s, item.frame || item);
  }
  return loadImageUrlIntoTexture(s, item.frame || item);
}

// === Lokální aktiva – tichý mód ===
function autoAssignLocalAssets() {
  const arr = framesOf ? framesOf('back') : [];
  const local = ["assets/one.jpg", "assets/two.jpg"];

  local.forEach((url, i) => {
    const it = arr[i]; if (!it) return;

    const img = new Image();
    img.onload = () => {
      const dt = new BABYLON.DynamicTexture("imgDT" + i, { width: 1024, height: 1024 }, scene, true);
      const ctx = dt.getContext();
      drawFitted(ctx, img, FRAME_SIZE.W, FRAME_SIZE.H);
      dt.update();

      it.frame.material = unlitTex ? unlitTex(dt) : unlitTexWithLevel(dt, 1.0);

      if (it.data) {
        it.data.title = url.split("/").pop();
        if (typeof drawPlacard === "function") drawPlacard(it.placard, it.data);
        if (typeof savePlacardData === "function") savePlacardData(it.wall, it.idx, it.data);
      }
    };
    img.onerror = () => {
      if (DEBUG_IMG) console.warn("Lokální asset nelze načíst:", url);
      if (USE_PLACEHOLDER_ON_FAIL) {
        const dt = new BABYLON.DynamicTexture("imgDT_local_fail_" + i, { width: 1024, height: 1024 }, scene, true);
        const ctx = dt.getContext();
        drawPlaceholder(ctx, FRAME_SIZE.W, FRAME_SIZE.H);
        dt.update();
        it.frame.material = unlitTex ? unlitTex(dt) : unlitTexWithLevel(dt, 1.0);
      }
    };
    img.src = url + "?v=" + Date.now();
  });
}
