// Procedural models for the sprite studio: the game's own 3D models
// (src/render3d/models/, built from src/render3d/kit.js), so the sprites and
// the 3D view always show the same thing. The kit's materials are colour
// tokens; the studio lights them physically, so each becomes a standard
// material of that colour (team surfaces keep the pure red pack.py looks for).
import * as THREE from 'three';
import { UNIT_MODELS } from '../../src/render3d/models/units.js';
import { STRUCTURE_MODELS } from '../../src/render3d/models/structures.js';

/** @type {Map<THREE.Material, THREE.MeshStandardMaterial>} */
const lit = new Map();
function litMaterial(token) {
  let m = lit.get(token);
  if (!m) {
    const glow = token.userData?.glow ?? 0;
    m = new THREE.MeshStandardMaterial({ color: token.color, roughness: 0.6, metalness: 0.2, emissive: token.color.clone().multiplyScalar(glow * 0.4) });
    lit.set(token, m);
  }
  return m;
}

export function buildProcedural(name) {
  const spec = UNIT_MODELS[name] ?? STRUCTURE_MODELS[name];
  if (!spec) throw new Error(`no procedural model ${name}`);
  const g = new THREE.Group();
  g.name = name;
  spec.build(g);
  g.traverse((o) => { if (o.isMesh) o.material = litMaterial(o.material); });
  return g;
}
