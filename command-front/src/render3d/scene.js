// @ts-check
/**
 * The three.js side of the 3D battlefield: renderer, lights, the sun's
 * shadow and the camera that follows the game's 2D camera.
 *
 * The renderer shares its WebGL context with PixiJS (app3d.js): Pixi paints
 * the ground first, this scene draws the models over it with real depth,
 * lighting and shadows, then Pixi draws the overlays. The ground itself is
 * only an invisible shadow catcher here, so shadows fall on Pixi's terrain.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RENDER } from '../data/rules.js';
import { PITCH_DEG, SQUASH, RISE } from './view.js';

const C = RENDER.cellPx;

/** Sun from the north-west, high: shadows fall to the south-east like the 2D art's. */
const SUN_DIR = new THREE.Vector3(-0.55, 1.25, -0.45).normalize();

/**
 * @typedef {{ shadows: boolean, shadowSize: number, receive: boolean, soft: boolean, antialias: boolean }} Quality
 */

/**
 * @param {{ width: number, height: number }} map  cells
 * @param {Quality} quality
 */
export function createScene(map, quality) {
  const renderer = new THREE.WebGLRenderer({
    // Smooth model edges where the screen's own density does not already hide them.
    antialias: quality.antialias, stencil: true, depth: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false,
  });
  renderer.autoClear = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = quality.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = true;
  renderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  // A soft studio environment for the physically lit (baked) models: metal needs something to reflect.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.7;
  const models = new THREE.Group();
  models.name = 'models';
  scene.add(models);

  // Three tones, as on Red Alert 2's art: tops lit by the sun, faces toward
  // the viewer by a soft fill from the south-west, the east sides darker.
  const hemi = new THREE.HemisphereLight(0xe8eeff, 0x4a4436, 1.25);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 1.0);
  fill.position.set(-0.45, 0.55, 1).normalize();
  scene.add(fill);
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.3);
  sun.castShadow = quality.shadows;
  sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  // Shadow catcher over the whole map: draws nothing but the shadows.
  const W = map.width * C;
  const H = map.height * C;
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.ShadowMaterial({ opacity: 0.36, depthWrite: false }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.set(W / 2, 0, H / 2);
  catcher.receiveShadow = true;
  catcher.renderOrder = -1;
  catcher.visible = quality.shadows;
  scene.add(catcher);

  // The camera: orthographic, looking north and down at PITCH.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 10);
  const D = H + 4000;
  camera.position.set(0, D * SQUASH, D * RISE);
  camera.up.set(0, RISE, -SQUASH);
  camera.lookAt(0, 0, 0);
  camera.near = 1;
  camera.far = D * 2 + 2000;
  camera.updateMatrixWorld(true);

  const tmp = new THREE.Vector3();
  let texel = 1;

  return {
    renderer,
    scene,
    /** Where instanced models go. */
    models,
    camera,
    /**
     * Follow the 2D camera: `ox`, `oy` is the screen position of the world
     * origin and `scale` screen px per world px, exactly as in 2D.
     * @param {{ x: number, y: number }} origin @param {number} scale @param {number} w @param {number} h  CSS px
     * @param {{ x0: number, y0: number, x1: number, y1: number }} ground  visible ground, world px
     */
    follow(origin, scale, w, h, ground) {
      camera.left = -origin.x / scale;
      camera.right = (w - origin.x) / scale;
      camera.top = origin.y / scale;
      camera.bottom = (origin.y - h) / scale;
      camera.updateProjectionMatrix();
      if (!quality.shadows) return;
      // Fit the sun's shadow to what is on screen, snapped to whole shadow
      // texels so edges do not shimmer while the view moves.
      const cx = (ground.x0 + ground.x1) / 2;
      const cz = (ground.y0 + ground.y1) / 2;
      const R = Math.hypot(ground.x1 - ground.x0, ground.y1 - ground.y0) / 2 + C * 2;
      texel = (2 * R) / quality.shadowSize;
      const s = sun.shadow.camera;
      s.left = -R; s.right = R; s.top = R; s.bottom = -R;
      s.near = 1; s.far = R * 2 + 3000;
      s.updateProjectionMatrix();
      tmp.set(Math.round(cx / texel) * texel, 0, Math.round(cz / texel) * texel);
      sun.target.position.copy(tmp);
      sun.position.copy(tmp).addScaledVector(SUN_DIR, R + 1500);
      sun.target.updateMatrixWorld();
      sun.updateMatrixWorld();
    },
    /** Draw the models over whatever is in the framebuffer. */
    render() {
      renderer.clearDepth();
      renderer.render(scene, camera);
    },
    /** Match the drawing buffer Pixi sized (device px). @param {number} w @param {number} h */
    setBufferSize(w, h) { renderer.setSize(w, h, false); },
    get pitch() { return PITCH_DEG; },
    dispose() {
      env.dispose();
      catcher.geometry.dispose();
      /** @type {THREE.Material} */ (catcher.material).dispose();
      sun.shadow.map?.dispose();
      renderer.renderLists.dispose();
    },
  };
}

/** @typedef {ReturnType<typeof createScene>} Scene3D */
