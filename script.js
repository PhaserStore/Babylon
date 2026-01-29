function blobToImg(blob){ return new Promise((res,rej)=>{ const img=new Image(); img.onload=()=>res(img); img.onerror=()=>rej(new Error("IMG decode failed")); img.src=URL.createObjectURL(blob); }); }
function dataUrlToImg(dataUrl){ return new Promise((res,rej)=>{ const img=new Image(); img.onload=()=>res(img); img.onerror=()=>rej(new Error("DataURL decode failed")); img.src=dataUrl; }); }

async function loadImageUrlIntoTexture(url, frame){
  try{
async function loadImageUrlIntoTexture(url, target) {
  try {
const resp = await fetch(url, { mode:"cors", cache:"no-store" });
    if(!resp.ok) throw new Error("HTTP");
    const ct = resp.headers.get("content-type")||"";
    if(!ct.startsWith("image/")) throw new Error("NOT_IMAGE");

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

    const dt = new BABYLON.DynamicTexture("imgDT",{width:1024,height:1024},scene,true);
    const ctx=dt.getContext(); drawFitted(ctx,bmp,FRAME_SIZE.W,FRAME_SIZE.H); dt.update();
    frame.material = unlitTex(dt); hint("Obrázek načten ✔");
  }catch(e){
    console.error(e); alert("Nelze stáhnout obrázek (CORS / nepřímé URL).");
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
async function loadSVGOrDataIntoTexture(dataUrl, frame){
  const bmp = await dataUrlToImg(dataUrl);
  const dt=new BABYLON.DynamicTexture("imgDT",{width:1024,height:1024},scene,true);
  const ctx=dt.getContext(); drawFitted(ctx,bmp,FRAME_SIZE.W,FRAME_SIZE.H); dt.update();
  frame.material = unlitTex(dt); hint("Obrázek/SVG načten ✔");
}
async function loadIntoFrameSmart(inputText, item){
  if(!inputText){ alert("Zadej URL / data:image/... / <svg>…</svg>"); return; }
  if(!item){ item = framesOf(currentWall)[0] || allFrames()[0]; }
  if(!item){ alert("Neexistuje žádný rám."); return; }
  const s = inputText.trim();
  if (s.startsWith("<svg"))        return loadSVGOrDataIntoTexture("data:image/svg+xml;utf8,"+encodeURIComponent(s), item.frame);
  if (s.startsWith("data:image/")) return loadSVGOrDataIntoTexture(s, item.frame);
  return loadImageUrlIntoTexture(s, item.frame);
}
function autoAssignLocalAssets(){
  const arr = framesOf('back');
  const local = ["assets/one.jpg","assets/two.jpg"];
  local.forEach((url, i)=>{
    const it = arr[i]; if (!it) return;
    const img = new Image();
    img.onload = ()=>{
      const dt=new BABYLON.DynamicTexture("imgDT"+i,{width:1024,height:1024},scene,true);
      const ctx=dt.getContext(); drawFitted(ctx,img,FRAME_SIZE.W,FRAME_SIZE.H); dt.update();
      it.frame.material = unlitTex(dt);
      it.data.title = url.split("/").pop();
      drawPlacard(it.placard, it.data);
      savePlacardData(it.wall, it.idx, it.data);
    };
    img.onerror = ()=>{};
    img.src = url + "?v=" + Date.now();
  });
}
``
/* -----------------------------
  7) SVG logo "phaser" – zadní i přední stěna
------------------------------*/
