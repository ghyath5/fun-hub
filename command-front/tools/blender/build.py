# Build Command Front models in Blender and write them as GLB files for the
# game's exporter (tools/glb-bake/glb/), plus a preview render of each.
#
#   blender -b --factory-startup -P tools/blender/build.py -- lightTank heavyTank
#   blender -b --factory-startup -P tools/blender/build.py -- --all
#
# Model scripts live in models/*.py; each registers its builders with
# @model('id', ...). Then, from tools/glb-bake: node export.mjs <id> ...
import bpy
import sys
import os
import math
import glob
import time

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import importlib
import kit
importlib.reload(kit)

GLB_DIR = os.path.normpath(os.path.join(HERE, '..', 'glb-bake', 'glb'))
OUT_DIR = os.path.join(HERE, 'out')

REGISTRY = {}


def model(id, maxEdge=0.12, ao=0.12, aoStrength=0.85, view='game'):
    """Register a builder: fn(k) models it with the kit `k`."""
    def wrap(fn):
        REGISTRY[id] = dict(fn=fn, maxEdge=maxEdge, ao=ao, aoStrength=aoStrength, view=view)
        return fn
    return wrap


kit.model = model
for path in sorted(glob.glob(os.path.join(HERE, 'models', '*.py'))):
    with open(path) as f:
        exec(compile(f.read(), path, 'exec'), {'model': model, 'kit': kit, '__name__': 'models'})


def preview(id, size=640, view='game'):
    """A render from the game's camera (south, high), or `front` (a close
    three-quarter view of the face side), team paint in red."""
    sc = bpy.context.scene
    for m in bpy.data.materials:
        if m.get('team'):
            b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            v = max(b.inputs['Base Color'].default_value[:3])
            b.inputs['Base Color'].default_value = (0.75 * v, 0.07 * v, 0.05 * v, 1)
    objs = kit.meshes()
    lo = [min((o.matrix_world @ v.co)[a] for o in objs for v in o.data.vertices) for a in range(3)]
    hi = [max((o.matrix_world @ v.co)[a] for o in objs for v in o.data.vertices) for a in range(3)]
    c = [(l + h) / 2 for l, h in zip(lo, hi)]
    ext = max(h - l for l, h in zip(lo, hi))
    cam = bpy.data.objects.new('BAKE-cam', bpy.data.cameras.new('BAKE-cam'))
    bpy.data.collections[kit.COL].objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = ext * 1.35
    if view == 'front':
        cam.data.ortho_scale = ext * 1.15
        tilt = math.radians(18)
        yaw = math.radians(150)
        R = ext * 3
        cam.location = (c[0] + R * math.sin(math.radians(30)) * math.cos(tilt), c[1] + R * math.cos(math.radians(30)) * math.cos(tilt), c[2] + R * math.sin(tilt))
        cam.rotation_euler = (math.pi / 2 - tilt, 0, yaw)
    else:
        tilt = math.radians(50)
        cam.location = (c[0] + ext * 0.35, c[1] - ext * 3 * math.cos(tilt), c[2] + ext * 3 * math.sin(tilt))
        cam.rotation_euler = (math.pi / 2 - tilt, 0, math.radians(7))
    sc.camera = cam
    sun = bpy.data.objects.new('BAKE-sun', bpy.data.lights.new('BAKE-sun', 'SUN'))
    bpy.data.collections[kit.COL].objects.link(sun)
    sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(40), math.radians(-25), math.radians(-30))
    sc.world.use_nodes = True
    bg = next(n for n in sc.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs[0].default_value = (0.32, 0.36, 0.28, 1)
    bg.inputs[1].default_value = 0.9
    try:
        sc.render.engine = 'BLENDER_EEVEE'
    except TypeError:
        sc.render.engine = 'BLENDER_EEVEE_NEXT'
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    os.makedirs(OUT_DIR, exist_ok=True)
    sc.render.filepath = os.path.join(OUT_DIR, f'{id}.png')
    bpy.ops.render.render(write_still=True)
    return sc.render.filepath


def build(id, render=True):
    spec = REGISTRY[id]
    t = time.time()
    kit.reset()
    spec['fn'](kit)
    kit.subdivide_large(spec['maxEdge'])
    kit.bake_ao(distance=spec['ao'], strength=spec['aoStrength'])
    os.makedirs(GLB_DIR, exist_ok=True)
    path = os.path.join(GLB_DIR, f'bl-{id}.glb')
    tris = kit.export(path)
    png = preview(id, view=spec['view']) if render else None
    print(f'BUILT {id}: {tris} tris, {os.path.getsize(path) // 1024} KB, {time.time() - t:.1f}s -> {path} {png or ""}')
    return tris


if __name__ == '__main__' and '--' in sys.argv:
    args = sys.argv[sys.argv.index('--') + 1:]
    ids = sorted(REGISTRY) if args == ['--all'] else args
    for i in ids:
        build(i)
