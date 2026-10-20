// @ts-check
/**
 * The materials every model is drawn with, plus the game's team colouring.
 *
 *   - Procedural models: Lambert lighting — cheap on phones, and matches the
 *     painted ground.
 *   - Baked models (the GLB files): physically lit, with per-vertex
 *     metalness and roughness (`pbr`) and the scene's soft environment, so
 *     their metal reads as metal as it did in the source files.
 *
 * Per vertex, `tint` is the surface colour (linear) and in `.a` how much of
 * it takes the player's colour; `glow` makes lamps and energy light
 * themselves. A textured model multiplies the atlas in, and the atlas alpha
 * is its own team weight. Per instance, `iTeam` carries the player's colour
 * (rgb) and a brightness (a: dimmed when the power is low).
 *
 * Team surfaces keep their shading but take the hue: brightness × colour,
 * the same rule the sprite art used (paint = grey × tint).
 */
import * as THREE from 'three';

/** @type {Map<string, THREE.Material>} */
const cache = new Map();

const VERTEX_HEAD = `#include <common>
attribute vec4 tint;
attribute float glow;
attribute vec4 iTeam;
varying vec4 vTint;
varying vec4 vTeam;
varying float vGlow;
#ifdef CF_PBR
attribute vec2 pbr;
varying vec2 vPbr;
#endif`;

const VERTEX_BODY = `#include <begin_vertex>
vTint = tint;
vTeam = iTeam;
vGlow = glow;
#ifdef CF_PBR
vPbr = pbr;
#endif`;

const FRAGMENT_HEAD = `#include <common>
varying vec4 vTint;
varying vec4 vTeam;
varying float vGlow;
#ifdef CF_PBR
varying vec2 vPbr;
#endif`;

const SURFACE = `
#ifdef USE_MAP
  vec4 texel = texture2D( map, vMapUv );
  vec3 surface = texel.rgb * vTint.rgb;
  float teamW = texel.a * vTint.a;
#else
  vec3 surface = vTint.rgb;
  float teamW = vTint.a;
#endif
  float bright = max( surface.r, max( surface.g, surface.b ) ) * 1.08;
  surface = mix( surface, bright * vTeam.rgb, teamW );
  diffuseColor.rgb *= surface * vTeam.a;`;

/**
 * @param {{ map?: THREE.Texture | null, translucent?: boolean, pbr?: boolean }} o
 */
export function modelMaterial(o) {
  const key = `${o.map?.uuid ?? '-'}|${o.translucent ? 1 : 0}|${o.pbr ? 1 : 0}`;
  let m = cache.get(key);
  if (m) return m;
  const common = { map: o.map ?? null, transparent: !!o.translucent, opacity: o.translucent ? 0.5 : 1, depthWrite: !o.translucent };
  m = o.pbr ? new THREE.MeshStandardMaterial({ ...common, metalness: 1, roughness: 1 }) : new THREE.MeshLambertMaterial(common);
  if (o.pbr) m.defines = { CF_PBR: '' };
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VERTEX_HEAD)
      .replace('#include <begin_vertex>', VERTEX_BODY);
    let f = shader.fragmentShader
      .replace('#include <common>', FRAGMENT_HEAD)
      .replace('#include <map_fragment>', SURFACE)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += surface * vGlow;`);
    if (o.pbr) {
      f = f
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vPbr.x;')
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vPbr.y;');
    }
    shader.fragmentShader = f;
  };
  m.customProgramCacheKey = () => `cf-model-${o.map ? 1 : 0}-${o.pbr ? 1 : 0}`;
  cache.set(key, m);
  return m;
}

export function disposeMaterials() {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}
