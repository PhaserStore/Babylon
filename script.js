const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);
const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.05, 0.05, 0.05, 1);

const cam = new BABYLON.ArcRotateCamera("cam", -Math.PI/2, Math.PI/2.3, 12, new BABYLON.Vector3(0,3,0), scene);
cam.attachControl(canvas, true);
cam.lowerRadiusLimit = 2;

new BABYLON.HemisphericLight("l", new BABYLON.Vector3(0,1,0), scene);

const ROOM = {W:16, D:28, H:5};
BABYLON.MeshBuilder.CreateGround("f", {width:ROOM.W, height:ROOM.D}, scene);

let frames = [];

function loadImage(url, mesh) {
  const tex = new BABYLON.Texture(url, scene);
  const mat = new BABYLON.StandardMaterial("m", scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.disableLighting = true;
  mesh.material = mat;
}

function addFrame(x, y, z, url) {
  const p = BABYLON.MeshBuilder.CreatePlane("p", {size:1.5}, scene);
  p.position.set(x, y, z);
  loadImage(url, p);
  frames.push(p);
}

// Načtení obrázků z assets
addFrame(-4, 2.5, -ROOM.D/2 + 0.1, "assets/one.jpg");

// Tlačítko pro načtení vlastního obrázku
document.getElementById("load").onclick = () => {
  const url = document.getElementById("url").value;
  if (!url) return;
  addFrame(0, 2.5, -ROOM.D/2 + 0.1, url);
};

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());

