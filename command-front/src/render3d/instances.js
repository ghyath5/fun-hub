// @ts-check
/**
 * Instanced drawing: one InstancedMesh per model part (and per opaque /
 * see-through look), refilled every frame. A hundred tanks of one type are
 * one draw call for their hulls and one for their turrets, whatever the
 * number of pieces they were modelled from.
 *
 * Per frame: begin(), then add() each visible part with its world matrix,
 * player colour and brightness, then end(). Pools grow as needed and never
 * shrink during a match; unused ones are simply hidden.
 */
import * as THREE from 'three';
import { modelMaterial } from './material.js';

/** @typedef {import('./library.js').Part} Part */

/**
 * @param {THREE.Object3D} parent
 * @param {{ shadows: boolean, receive: boolean }} o
 */
export function createInstancer(parent, o) {
  /**
   * @typedef {{ mesh: THREE.InstancedMesh, team: THREE.InstancedBufferAttribute, count: number, cap: number, part: Part, translucent: boolean }} Pool
   */
  /** @type {Map<Part, Pool>} */
  const opaque = new Map();
  /** @type {Map<Part, Pool>} */
  const clear = new Map();
  /** @type {Pool[]} */
  const all = [];

  /** @param {Part} part @param {boolean} translucent @param {number} cap */
  function makePool(part, translucent, cap) {
    // Own geometry object sharing the part's buffers, plus this pool's per-instance colours.
    const geo = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(part.geometry.attributes)) geo.setAttribute(k, a);
    geo.setIndex(part.geometry.index);
    geo.boundingSphere = part.geometry.boundingSphere;
    const team = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    team.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iTeam', team);
    const mesh = new THREE.InstancedMesh(geo, modelMaterial({ map: part.map, translucent, pbr: !!part.pbr }), cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; // the renderer only adds what is on screen
    mesh.castShadow = o.shadows && !translucent;
    mesh.receiveShadow = o.receive && !translucent;
    mesh.count = 0;
    if (translucent) mesh.renderOrder = 1;
    parent.add(mesh);
    return { mesh, team, count: 0, cap, part, translucent };
  }

  /** @param {Pool} p */
  function grow(p) {
    const next = makePool(p.part, p.translucent, p.cap * 2);
    next.mesh.instanceMatrix.array.set(p.mesh.instanceMatrix.array);
    next.team.array.set(p.team.array);
    next.count = p.count;
    parent.remove(p.mesh);
    p.mesh.dispose();
    // Frees the old per-instance colours; the shared part buffers are simply re-uploaded once.
    p.mesh.geometry.dispose();
    Object.assign(p, next);
  }

  return {
    begin() { for (const p of all) p.count = 0; },
    /**
     * @param {Part} part @param {THREE.Matrix4} matrix
     * @param {THREE.Color} color  player colour (linear)
     * @param {number} [bright] @param {boolean} [translucent]
     */
    add(part, matrix, color, bright = 1, translucent = false) {
      const map = translucent ? clear : opaque;
      let p = map.get(part);
      if (!p) { p = makePool(part, translucent, 16); map.set(part, p); all.push(p); }
      if (p.count >= p.cap) grow(p);
      matrix.toArray(p.mesh.instanceMatrix.array, p.count * 16);
      const a = p.team.array;
      const k = p.count * 4;
      a[k] = color.r; a[k + 1] = color.g; a[k + 2] = color.b; a[k + 3] = bright;
      p.count++;
    },
    end() {
      for (const p of all) {
        p.mesh.count = p.count;
        p.mesh.visible = p.count > 0;
        if (!p.count) continue;
        p.mesh.instanceMatrix.clearUpdateRanges();
        p.mesh.instanceMatrix.addUpdateRange(0, p.count * 16);
        p.mesh.instanceMatrix.needsUpdate = true;
        p.team.clearUpdateRanges();
        p.team.addUpdateRange(0, p.count * 4);
        p.team.needsUpdate = true;
      }
    },
    /** Draw calls in use (perf overlay). */
    get active() { return all.reduce((n, p) => n + (p.count ? 1 : 0), 0); },
    dispose() {
      for (const p of all) {
        parent.remove(p.mesh);
        p.mesh.dispose();
      }
      all.length = 0;
      opaque.clear();
      clear.clear();
    },
  };
}

/** @typedef {ReturnType<typeof createInstancer>} Instancer */
