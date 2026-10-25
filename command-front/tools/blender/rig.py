# Rig a finished model from its own .blend for the game, instead of building
# one from the kit: split its meshes into the parts the game moves, re-pack
# its texture for a phone-sized atlas and write the GLB the exporter reads.
#
#   blender -b --factory-startup -P tools/blender/rig.py -- harvester@union ~/Downloads/harvester/harvester.blend
#   blender -b --factory-startup -P tools/blender/rig.py -- harvester@coalition ~/Downloads/chrono_miner/chrono_miner.blend
#
# Then, from tools/glb-bake: node export.mjs harvester@union harvester@coalition
#
# * Wheels: every round loose part of a track mesh, grouped by axle (the left
#   and right wheels on one axle are one part, `wheelN`).
# * Tracks: the links (box islands) are sorted onto the belt's loop round the
#   wheels: each straight run is a `treadN` that slides along itself (`slide`,
#   one `pitch` and back, so the links seem to run on), each bend round an
#   idler a `treadN` that turns about it (`arc`: signed radius). Forward,
#   the belt goes clockwise seen from the right: back along the ground.
# * Drum (`drum0`): the harvesting rotor; it spins while the unit harvests.
# * Turret: turns about the middle of its base.
# * Texture: the source's (a lightmap-style atlas of tiny islands) is baked
#   onto its own UVs re-packed by area, with ambient occlusion multiplied in,
#   so the big panels keep their detail at 1024 px. Metalness and roughness
#   are baked too; faces whose colour matches `glow` light themselves.
#   RIG_DEBUG=<dir> also saves the baked images there.
import bpy
import bmesh
import sys
import os
import math
from collections import defaultdict
from mathutils import Vector, Matrix
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import kit

GLB_DIR = os.path.normpath(os.path.join(HERE, '..', 'glb-bake', 'glb'))
OUT_DIR = os.path.join(HERE, 'out')

# Coordinates below are the model's after it is turned to face +y (`turn`).
SOURCES = {
    # Union: tracked ore truck with a shredder drum in a scoop, a mesh hopper and an MG turret.
    'harvester@union': dict(
        root='HARVESTER', turn=180,
        tracks=('HV-track_L', 'HV-track_R'),
        turret='HV-turret',
        # The shredder: 15 spiral discs on a shaft.
        drum=lambda o, i: o == 'HV-collector' and i['n'] == 192,
    ),
    # Coalition: the Chrono Miner, a cutter drum of discs round a chrono field.
    'harvester@coalition': dict(
        root='CHRONO_MINER', turn=180,
        tracks=('CM-track_L', 'CM-track_R'),
        # Discs, core and axle, and the teeth on the discs' rims (not the hood's studs or the scraper bar).
        drum=lambda o, i: o == 'CM-cutter' and abs(i['c'].x) < 1.1 and (
            i['n'] in (96, 48) or (i['n'] == 8 and 0.7 < axis_dist(i['c'], 2.5, 0.8) < 0.86)),
        # The chrono field's violet glows.
        glow=dict(hue=(236, 290), sat=0.3, strength=0.7),
    ),
}

AO_STRENGTH = 0.6
BAKE = 2048    # baked at twice the size, then halved (anti-aliased)
TEX = 1024


def axis_dist(c, y, z):
    return math.hypot(c.y - y, c.z - z)


# ── Load ─────────────────────────────────────────────────────────

def load(path, spec):
    """The source's model meshes, world transforms applied, turned to face +y."""
    bpy.ops.wm.open_mainfile(filepath=path)
    root = bpy.data.objects[spec['root']]
    turn = Matrix.Rotation(math.radians(spec.get('turn', 0)), 4, 'Z')
    objs = [o for o in root.children_recursive if o.type == 'MESH']
    for o in objs:
        mw = o.matrix_world.copy()
        o.parent = None
        o.data = o.data.copy()
        o.data.transform(turn @ mw)
        o.matrix_world = Matrix.Identity(4)
    for o in list(bpy.data.objects):
        if o not in objs:
            bpy.data.objects.remove(o, do_unlink=True)
    return objs


def islands(o):
    """Loose parts of a mesh: vertex count, bounds, centre and faces."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.verts.ensure_lookup_table()
    seen = set()
    out = []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, comp = [v], []
        seen.add(v.index)
        while stack:
            x = stack.pop()
            comp.append(x)
            for e in x.link_edges:
                y = e.other_vert(x)
                if y.index not in seen:
                    seen.add(y.index)
                    stack.append(y)
        lo = Vector([min(x.co[a] for x in comp) for a in range(3)])
        hi = Vector([max(x.co[a] for x in comp) for a in range(3)])
        faces = sorted({f.index for x in comp for f in x.link_faces})
        out.append(dict(n=len(comp), lo=lo, hi=hi, c=(lo + hi) / 2, size=hi - lo, faces=faces))
    bm.free()
    return out


# ── Track loop ───────────────────────────────────────────────────

def convex_hull(pts):
    """Monotone chain, counter-clockwise in (y, z); points are (y, z, tag)."""
    pts = sorted(set(pts))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 1e-12:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 1e-12:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def loop_pieces(wheels):
    """The belt's path round the wheels (y, z, r): its straight runs and the
    bends round wheels it wraps by more than a few degrees, in loop order."""
    pts = []
    for k, (wy, wz, r) in enumerate(wheels):
        for i in range(180):
            a = 2 * math.pi * i / 180
            pts.append((round(wy + r * math.cos(a), 6), round(wz + r * math.sin(a), 6), k))
    hull = convex_hull(pts)
    start = next(i for i in range(len(hull)) if hull[i][2] != hull[i - 1][2])
    seq = hull[start:] + hull[:start]
    runs = []
    for p in seq:
        if runs and runs[-1][0] == p[2]:
            runs[-1][1].append(p)
        else:
            runs.append((p[2], [p]))
    pieces = []
    for i, (k, ps) in enumerate(runs):
        wy, wz, r = wheels[k]
        a0 = math.atan2(ps[0][1] - wz, ps[0][0] - wy)
        a1 = math.atan2(ps[-1][1] - wz, ps[-1][0] - wy)
        span = (a1 - a0) % (2 * math.pi)
        if span > math.radians(25):
            pieces.append(dict(kind='arc', k=k, centre=(wy, wz), r=r, a0=a0, span=span))
        nxt = runs[(i + 1) % len(runs)][1][0]
        pieces.append(dict(kind='run', a=Vector((ps[-1][0], ps[-1][1])), b=Vector((nxt[0], nxt[1]))))
    # Runs either side of a wheel the belt only touches are one run.
    merged = []
    for p in pieces:
        q = merged[-1] if merged else None
        if q and q['kind'] == 'run' and p['kind'] == 'run':
            d0 = (q['b'] - q['a']).normalized()
            d1 = (p['b'] - p['a']).normalized()
            if d0.dot(d1) > math.cos(math.radians(6)):
                q['b'] = p['b']
                continue
        merged.append(p)
    if len(merged) > 1 and merged[0]['kind'] == merged[-1]['kind'] == 'run':
        d0 = (merged[-1]['b'] - merged[-1]['a']).normalized()
        d1 = (merged[0]['b'] - merged[0]['a']).normalized()
        if d0.dot(d1) > math.cos(math.radians(6)):
            merged[0]['a'] = merged[-1]['a']
            merged.pop()
    return merged


def piece_distance(p, c):
    if p['kind'] == 'run':
        ab = p['b'] - p['a']
        t = max(-0.05, min(1.05, (c - p['a']).dot(ab) / ab.length_squared))
        return (p['a'] + ab * t - c).length
    cy, cz = p['centre']
    a = math.atan2(c.y - cz, c.x - cy)
    off = (a - p['a0']) % (2 * math.pi)
    tol = math.radians(4)
    if off > p['span'] + tol and off < 2 * math.pi - tol:
        return math.inf
    return abs(math.hypot(c.x - cy, c.y - cz) - p['r'])


def median_step(values, min_step):
    vals = sorted(values)
    steps = [b - a for a, b in zip(vals, vals[1:]) if b - a > min_step]
    return float(np.median(steps)) if steps else None


def rig_track(isl, wheel_parts, tread_parts):
    """Wheels and belt pieces of one track mesh: assigns each island's faces a part name."""
    links = [i for i in isl if i['n'] == 8]
    rest = [i for i in isl if i['n'] != 8]
    # Wheels: the round islands, grouped by axle.
    axles = defaultdict(list)
    for i in rest:
        axles[(round(i['c'].y / 0.03), round(i['c'].z / 0.03))].append(i)
    wheels = []
    for group in axles.values():
        r = max(max(i['size'].y, i['size'].z) for i in group) / 2
        cy = sum(i['c'].y for i in group) / len(group)
        cz = sum(i['c'].z for i in group) / len(group)
        wheels.append((cy, cz, r))
        key = ('wheel', round(cy, 2), round(cz, 2))
        name = wheel_parts.setdefault(key, dict(name=f'wheel{len(wheel_parts)}', pivot=Vector((0, cy, cz)), faces=[]))['name']
        for i in group:
            i['part'] = name
    pieces = loop_pieces(wheels)
    for p in pieces:
        p['members'] = []
    for i in links:
        c = Vector((i['c'].y, i['c'].z))
        best = min(pieces, key=lambda p: piece_distance(p, c))
        best['members'].append(i)
    every = []
    for p in pieces:
        if not p['members']:
            continue
        # Spacing of the links: the commonest kind of link in the piece (by width and side).
        kinds = defaultdict(list)
        for i in p['members']:
            kinds[(round(i['size'].x, 2), round(i['c'].x, 1))].append(i)
        common = max(kinds.values(), key=len)
        if p['kind'] == 'run':
            d = (p['b'] - p['a']).normalized()
            step = median_step([(Vector((i['c'].y, i['c'].z)) - p['a']).dot(d) for i in common], 0.02)
            p['pitch'] = step
            # Clockwise seen from +x (from the right): opposite to the hull's order.
            p['slide'] = (0.0, -d.x, -d.y)
            key = ('run', round(-d.x, 2), round(-d.y, 2), round(step or 0, 3))
        else:
            cy, cz = p['centre']
            ang = [math.atan2(i['c'].z - cz, i['c'].y - cy) for i in common]
            a0 = p['a0']
            ang = [(a - a0) % (2 * math.pi) for a in ang]
            ang = [a - 2 * math.pi if a > math.pi + p['span'] / 2 else a for a in ang]
            R = sum(math.hypot(i['c'].y - cy, i['c'].z - cz) for i in p['members']) / len(p['members'])
            step = median_step(ang, math.radians(2))
            p['pitch'] = step * R if step else None
            p['arc'] = -R
            key = ('arc', round(cy, 2), round(cz, 2), round(R, 2))
        if p['pitch']:
            every.append(p['pitch'])
        p['key'] = key
    fallback = float(np.median(every))
    for p in pieces:
        if not p['members']:
            continue
        pitch = p['pitch'] or fallback
        if p['kind'] == 'run':
            props = dict(pitch=pitch, slide=list(p['slide']))
            pivot = Vector((0, 0, 0))
        else:
            props = dict(pitch=pitch, arc=p['arc'])
            pivot = Vector((0, *p['centre']))
        name = tread_parts.setdefault(p['key'], dict(name=f'tread{len(tread_parts)}', pivot=pivot, props=props))['name']
        for i in p['members']:
            i['part'] = name
    return pieces


# ── Texture ──────────────────────────────────────────────────────

def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.maximum(c, 0), 1 / 2.4) - 0.055)


def pixels(img):
    a = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def glow_faces(o, mat, glow):
    """Faces whose source colour (sampled at their uv centre) is the glow hue."""
    tex = next(n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.outputs['Color'].links
               and n.outputs['Color'].links[0].to_socket.name == 'Base Color').image
    px = pixels(tex)
    h, w = px.shape[:2]
    me = o.data
    uv = me.uv_layers[0].data
    out = []
    for f in me.polygons:
        u = sum(uv[li].uv.x for li in f.loop_indices) / f.loop_total
        v = sum(uv[li].uv.y for li in f.loop_indices) / f.loop_total
        r, g, b = px[min(h - 1, int(v * h)) % h, min(w - 1, int(u * w)) % w, :3]
        mx, mn = max(r, g, b), min(r, g, b)
        if mx < 0.08 or (mx - mn) / mx < glow['sat']:
            continue
        d = mx - mn
        hue = (((g - b) / d) % 6 if mx == r else (b - r) / d + 2 if mx == g else (r - g) / d + 4) * 60
        if glow['hue'][0] <= hue <= glow['hue'][1]:
            out.append(f.index)
    return out


def emit_bake(o, mat, socket, img):
    """Bake whatever feeds `socket` (a source map) into `img`, through an emission shader."""
    nt = mat.node_tree
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(socket, em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    tgt = nt.nodes.new('ShaderNodeTexImage')
    tgt.image = img
    nt.nodes.active = tgt
    bpy.ops.object.bake(type='EMIT', margin=6, use_clear=True)
    nt.nodes.remove(tgt)
    nt.nodes.remove(em)


def rebake(o, detail):
    """New uv layout by area (`detail`: per face, the linear texel density, 1 = full),
    then colour × occlusion, metalness and roughness baked onto it."""
    me = o.data
    me.uv_layers[0].name = 'SRC'
    game = me.uv_layers.new(name='game', do_init=True)
    me.uv_layers.active = game
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    sc = bpy.context.scene
    sc.tool_settings.use_uv_select_sync = True
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    bm = bmesh.from_edit_mesh(me)
    uvl = bm.loops.layers.uv['game']
    bm.faces.ensure_lookup_table()
    for f in bm.faces:
        k = detail[f.index]
        if k != 1:
            for loop in f.loops:
                loop[uvl].uv *= k
    bmesh.update_edit_mesh(me)
    bpy.ops.uv.pack_islands(rotate=True, margin=0.003, shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')
    # The bake writes through the new layout; the source maps read the old one by name.
    # (Edit mode reallocates the layers: look them up again.)
    me.uv_layers['game'].active_render = True
    me.uv_layers.active = me.uv_layers['game']

    sc.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        sc.cycles.device = 'GPU'
    except (TypeError, KeyError, AttributeError):
        pass
    sc.cycles.samples = 64
    sc.render.bake.target = 'IMAGE_TEXTURES'
    sc.render.bake.use_selected_to_active = False

    mat = me.materials[0]
    nt = mat.node_tree
    uvn = nt.nodes.new('ShaderNodeUVMap')
    uvn.uv_map = 'SRC'
    for n in nt.nodes:
        if n.type == 'TEX_IMAGE':
            nt.links.new(uvn.outputs['UV'], n.inputs['Vector'])
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    src = {name: bsdf.inputs[name].links[0].from_socket for name in ('Base Color', 'Metallic', 'Roughness')}

    def image(name, size, data):
        img = bpy.data.images.new(name, size, size, alpha=False)
        if data:
            img.colorspace_settings.name = 'Non-Color'
        return img
    col = image('bake_color', BAKE, False)
    metal = image('bake_metal', BAKE // 2, True)
    rough = image('bake_rough', BAKE // 2, True)
    emit_bake(o, mat, src['Base Color'], col)
    emit_bake(o, mat, src['Metallic'], metal)
    emit_bake(o, mat, src['Roughness'], rough)

    # Occlusion, with a floor under the model.
    ext = max(o.dimensions)
    sc.world = sc.world or bpy.data.worlds.new('World')
    sc.world.light_settings.distance = ext * 0.06
    bpy.ops.mesh.primitive_plane_add(size=ext * 4, location=(0, 0, min((o.matrix_world @ Vector(c)).z for c in o.bound_box)))
    floor = bpy.context.active_object
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    ao = image('bake_ao', BAKE, True)
    tgt = nt.nodes.new('ShaderNodeTexImage')
    tgt.image = ao
    nt.nodes.active = tgt
    bpy.ops.object.bake(type='AO', margin=6, use_clear=True)
    nt.nodes.remove(tgt)
    bpy.data.objects.remove(floor, do_unlink=True)

    # colour × occlusion (in linear light), halved to TEX.
    c = srgb_to_linear(pixels(col)[..., :3])
    a = pixels(ao)[..., :1]
    c = c * (1 - AO_STRENGTH * (1 - a))
    c = c.reshape(TEX, 2, TEX, 2, 3).mean(axis=(1, 3))
    final = bpy.data.images.new('game_color', TEX, TEX, alpha=False)
    rgba = np.concatenate([linear_to_srgb(c), np.ones((TEX, TEX, 1))], axis=2).astype(np.float32)
    final.pixels.foreach_set(rgba.ravel())
    final.pack()
    if os.environ.get('RIG_DEBUG'):
        for img in (col, ao, metal, rough, final):
            img.filepath_raw = os.path.join(os.environ['RIG_DEBUG'], f'{img.name}.png')
            img.file_format = 'PNG'
            img.save()
    for img in (metal, rough):
        img.pack()
    return dict(color=final, metal=metal, rough=rough)


def game_material(name, maps, glow=0.0):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')

    def tex(img, socket, x):
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = img
        n.location = (-400, x)
        nt.links.new(n.outputs['Color'], socket)
        return n
    c = tex(maps['color'], bsdf.inputs['Base Color'], 300)
    tex(maps['metal'], bsdf.inputs['Metallic'], 0)
    tex(maps['rough'], bsdf.inputs['Roughness'], -300)
    if glow:
        nt.links.new(c.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = glow
    return m


# ── Rig ──────────────────────────────────────────────────────────

def rig(id, path):
    spec = SOURCES[id]
    objs = load(path, spec)
    parts = {'body': dict(name='body', pivot=None)}
    wheel_parts, tread_parts = {}, {}
    labels = {}
    for o in objs:
        isl = islands(o)
        for i in isl:
            i['part'] = 'body'
        if o.name in spec.get('tracks', ()):
            rig_track(isl, wheel_parts, tread_parts)
        if spec.get('drum'):
            for i in isl:
                if spec['drum'](o.name, i):
                    i['part'] = 'drum0'
        if o.name == spec.get('turret'):
            for i in isl:
                i['part'] = 'turret'
        labels[o.name] = isl
    # Pivots: the drum's axle, the turret's base.
    drum = [i for isl in labels.values() for i in isl if i['part'] == 'drum0']
    if drum:
        lo = Vector([min(i['lo'][a] for i in drum) for a in range(3)])
        hi = Vector([max(i['hi'][a] for i in drum) for a in range(3)])
        parts['drum0'] = dict(name='drum0', pivot=Vector((0, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2)))
    tur = [i for isl in labels.values() for i in isl if i['part'] == 'turret']
    if tur:
        lo = Vector([min(i['lo'][a] for i in tur) for a in range(3)])
        hi = Vector([max(i['hi'][a] for i in tur) for a in range(3)])
        parts['turret'] = dict(name='turret', pivot=Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z)))
    for d in list(wheel_parts.values()) + list(tread_parts.values()):
        parts[d['name']] = d
    names = list(parts)
    # Part per face, as an attribute that survives the join.
    for o in objs:
        attr = o.data.attributes.new('part', 'INT', 'FACE')
        vals = [0] * len(o.data.polygons)
        for i in labels[o.name]:
            for f in i['faces']:
                vals[f] = names.index(i['part'])
        attr.data.foreach_set('value', vals)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    whole = bpy.context.active_object
    whole.name = 'SRC'

    glow = spec.get('glow')
    lit = set(glow_faces(whole, whole.data.materials[0], glow)) if glow else set()
    # Texels go to what the camera sees: the running gear is dark steel and small on screen.
    part_of = np.empty(len(whole.data.polygons), dtype=np.int32)
    whole.data.attributes['part'].data.foreach_get('value', part_of)
    # (The drum is what the eye follows when it turns.)
    small = np.array([0.25 if n.startswith(('wheel', 'tread')) else 0.7 if n.startswith('drum') else 1.0 for n in names])
    maps = rebake(whole, small[part_of].tolist())
    me = whole.data
    me.uv_layers.remove(me.uv_layers['SRC'])
    me.materials.clear()
    me.materials.append(game_material(f'{id}-paint', maps))
    if lit:
        me.materials.append(game_material(f'{id}-glow', maps, glow['strength']))
        for f in me.polygons:
            f.material_index = 1 if f.index in lit else 0

    # One object per part, under its named empty.
    col = bpy.data.collections.get(kit.COL) or bpy.data.collections.new(kit.COL)
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    counts = {}
    for k, name in enumerate(names):
        faces = set(np.nonzero(part_of == k)[0].tolist())
        if not faces:
            continue
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in faces], context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        pm = bpy.data.meshes.new(f'{name}-mesh')
        bm.to_mesh(pm)
        bm.free()
        pm.attributes.remove(pm.attributes['part'])
        for m in me.materials:
            pm.materials.append(m)
        po = bpy.data.objects.new(f'{name}-geo', pm)
        col.objects.link(po)
        d = parts[name]
        if d['pivot'] is not None:
            e = kit.empty(name, tuple(d['pivot']), **d.get('props', {}))
            po.parent = e
            po.matrix_parent_inverse = e.matrix_world.inverted()
        counts[name] = len(pm.polygons)
    bpy.data.objects.remove(whole, do_unlink=True)
    bpy.context.view_layer.update()

    os.makedirs(GLB_DIR, exist_ok=True)
    out = os.path.join(GLB_DIR, f'bl-{id}.glb')
    tris = kit.export(out)
    for name in names:
        d = parts[name]
        print(f'  {name:8s} {counts.get(name, 0):6d} faces  pivot={tuple(round(v, 3) for v in d["pivot"]) if d["pivot"] else "-"}  {d.get("props", "")}')
    png = preview(id)
    print(f'RIGGED {id}: {tris} tris, {os.path.getsize(out) // 1024} KB -> {out} {png}')


def preview(id, size=720):
    """The game's camera view (south, high), and a sheet with each moving part in its own colour."""
    sc = bpy.context.scene
    objs = kit.meshes()
    lo = [min((o.matrix_world @ v.co)[a] for o in objs for v in o.data.vertices) for a in range(3)]
    hi = [max((o.matrix_world @ v.co)[a] for o in objs for v in o.data.vertices) for a in range(3)]
    c = [(l + h) / 2 for l, h in zip(lo, hi)]
    ext = max(h - l for l, h in zip(lo, hi))
    cam = bpy.data.objects.new('BAKE-cam', bpy.data.cameras.new('BAKE-cam'))
    sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = ext * 1.25
    tilt = math.radians(50)
    cam.location = (c[0] + ext * 0.35, c[1] - ext * 3 * math.cos(tilt), c[2] + ext * 3 * math.sin(tilt))
    cam.rotation_euler = (math.pi / 2 - tilt, 0, math.radians(7))
    sc.camera = cam
    sun = bpy.data.objects.new('BAKE-sun', bpy.data.lights.new('BAKE-sun', 'SUN'))
    sc.collection.objects.link(sun)
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
    sc.view_settings.view_transform = 'Standard'
    os.makedirs(OUT_DIR, exist_ok=True)
    sc.render.filepath = os.path.join(OUT_DIR, f'{id}.png')
    bpy.ops.render.render(write_still=True)
    # Parts sheet.
    import random
    rnd = random.Random(3)
    keep = {o: list(o.data.materials) for o in objs}
    for o in objs:
        part = o.parent.name if o.parent else 'body'
        m = bpy.data.materials.new(f'dbg-{part}')
        b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        b.inputs['Base Color'].default_value = (0.5, 0.5, 0.5, 1) if part == 'body' else (rnd.random(), rnd.random(), rnd.random(), 1)
        o.data.materials.clear()
        o.data.materials.append(m)
    cam.data.ortho_scale = ext * 1.05
    cam.location = (c[0] + ext * 3, c[1], c[2] + ext * 0.4)
    cam.rotation_euler = (math.radians(82), 0, math.radians(90))
    sc.render.filepath = os.path.join(OUT_DIR, f'{id}-parts.png')
    bpy.ops.render.render(write_still=True)
    for o, ms in keep.items():
        o.data.materials.clear()
        for m in ms:
            o.data.materials.append(m)
    return sc.render.filepath


if __name__ == '__main__' and '--' in sys.argv:
    args = sys.argv[sys.argv.index('--') + 1:]
    rig(args[0], os.path.expanduser(args[1]))
