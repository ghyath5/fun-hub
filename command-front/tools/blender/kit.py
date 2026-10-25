# Command Front Blender kit: the building blocks every model script uses.
#
# Conventions (match tools/glb-bake/prep.js and src/render3d/):
#   * Blender units are free (the exporter scales units to `size`, structures
#     to their footprint); model a unit about 1 long, a structure 1 per cell.
#   * Front is +Y (north in game), up is +Z, the ground is z = 0.
#   * Moving parts hang under empties whose names say what they are
#     (turret, barrel, wheelN, treadN, rotorN, spinN, legL/R, armL/R); the
#     empty sits where the part turns. Everything else is the body.
#   * Colour is per material; the colour attribute carries baked ambient
#     occlusion (rgb) and the team-colour weight (alpha), which the exporter
#     reads per vertex.
import bpy
import bmesh
import math
from mathutils import Vector, Matrix, Euler


def _lin(hexcol):
    """sRGB hex → linear rgb."""
    c = [((hexcol >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# Palette: colour (sRGB hex), metalness, roughness, team (takes the player's
# colour, keeping its brightness) and glow (lights itself, 0–1).
PAL = {
    'team':      (0xd4d4d0, 0.30, 0.42, 1, 0),
    'teamDark':  (0x8a8a86, 0.30, 0.48, 1, 0),
    'steel':     (0x8d939a, 0.85, 0.34, 0, 0),
    'steelDark': (0x55595e, 0.85, 0.40, 0, 0),
    'gun':       (0x3a3d41, 0.90, 0.30, 0, 0),
    'dark':      (0x1d1f22, 0.40, 0.62, 0, 0),
    'black':     (0x0e0f10, 0.20, 0.75, 0, 0),
    'rubber':    (0x181818, 0.00, 0.92, 0, 0),
    'track':     (0x2b2925, 0.65, 0.58, 0, 0),
    'olive':     (0x5d6440, 0.10, 0.70, 0, 0),
    'khaki':     (0x9c8d64, 0.00, 0.85, 0, 0),
    'sand':      (0xb9a67a, 0.00, 0.95, 0, 0),
    'concrete':  (0x9d9a92, 0.00, 0.88, 0, 0),
    'concreteDark': (0x6e6b65, 0.00, 0.90, 0, 0),
    'asphalt':   (0x3b3c3e, 0.00, 0.92, 0, 0),
    'brass':     (0xc59a46, 0.95, 0.30, 0, 0),
    'copper':    (0xb8693e, 0.95, 0.35, 0, 0),
    'hazard':    (0xe2b021, 0.10, 0.55, 0, 0),
    'white':     (0xe8e8e4, 0.05, 0.55, 0, 0),
    'skin':      (0xd9a07f, 0.00, 0.70, 0, 0),
    'cloth':     (0x4d5a3a, 0.00, 0.90, 0, 0),
    'clothDark': (0x2c3127, 0.00, 0.92, 0, 0),
    'leather':   (0x3a2a1e, 0.05, 0.75, 0, 0),
    'glass':     (0x8fd2f0, 0.30, 0.08, 0, 0.35),
    'glassDark': (0x2c4a5a, 0.30, 0.10, 0, 0.10),
    'lamp':      (0xfff0b0, 0.00, 0.40, 0, 1.00),
    'redLamp':   (0xff5a40, 0.00, 0.40, 0, 1.00),
    'greenLamp': (0x6cff7a, 0.00, 0.40, 0, 1.00),
    'tesla':     (0x7ab8ff, 0.20, 0.20, 0, 0.90),
    'prism':     (0xd8f4ff, 0.10, 0.05, 0, 0.75),
    'chrono':    (0x5fd8ff, 0.10, 0.20, 0, 0.85),
    'psi':       (0xb070ff, 0.10, 0.20, 0, 0.85),
    'rad':       (0x8cff3a, 0.10, 0.20, 0, 0.85),
    'fire':      (0xff9a30, 0.00, 0.50, 0, 1.00),
    'ore':       (0xd9a63a, 0.60, 0.40, 0, 0.15),
    'water':     (0x3d6f8a, 0.20, 0.10, 0, 0.00),
    'grass':     (0x55703a, 0.00, 0.95, 0, 0.00),
}


def mat(name):
    """The material for a palette entry (created once per file)."""
    m = bpy.data.materials.get('M-' + name)
    if m:
        return m
    hexcol, metal, rough, team, glow = PAL[name]
    m = bpy.data.materials.new('M-' + name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    c = _lin(hexcol)
    b.inputs['Base Color'].default_value = (*c, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if glow:
        b.inputs['Emission Color'].default_value = (1, 1, 1, 1)
        b.inputs['Emission Strength'].default_value = glow
    m.diffuse_color = (*c, 1)
    m['team'] = team
    return m


# ── Scene ────────────────────────────────────────────────────────

COL = 'MODEL'


def reset():
    """An empty scene with one collection for the model."""
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.collections, bpy.data.lights, bpy.data.cameras):
        for d in list(block):
            block.remove(d)
    c = bpy.data.collections.new(COL)
    bpy.context.scene.collection.children.link(c)
    return c


def _link(o):
    bpy.data.collections[COL].objects.link(o)
    return o


def empty(name, loc=(0, 0, 0), parent=None, **props):
    """A named pivot (turret, wheel0, legL…); custom props go to glTF extras."""
    o = bpy.data.objects.new(name, None)
    o.empty_display_size = 0.08
    o.location = loc
    _link(o)
    if parent:
        o.parent = parent
        o.matrix_parent_inverse = parent.matrix_world.inverted()
    for k, v in props.items():
        o[k] = v
    bpy.context.view_layer.update()
    return o


_count = [0]


def _obj(bm, name, material, parent, loc=(0, 0, 0), rot=(0, 0, 0)):
    _count[0] += 1
    me = bpy.data.meshes.new(f'{name}.{_count[0]}')
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat(material))
    o = _link(bpy.data.objects.new(f'{name}.{_count[0]}', me))
    o.rotation_euler = Euler([math.radians(a) for a in rot])
    o.location = loc
    bpy.context.view_layer.update()
    if parent:
        mw = o.matrix_world.copy()
        o.parent = parent
        o.matrix_world = mw
    return o


def _bevel(bm, amount, segments=1, edges=None):
    if amount <= 0:
        return
    es = edges if edges is not None else bm.edges[:]
    bmesh.ops.bevel(bm, geom=es, offset=amount, segments=segments, affect='EDGES',
                    profile=0.5, clamp_overlap=True, offset_type='OFFSET')


# ── Primitives (all coordinates in world space) ─────────────────

def box(size, loc, material='team', bevel=0.0, parent=None, rot=(0, 0, 0), name='box', taper=None):
    """A box of `size` (x, y, z) centred at `loc`; `bevel` chamfers every
    edge; `taper` = (sx, sy, dy) scales the top face (and shifts it in y)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    sx, sy, sz = size
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
    if taper:
        tx, ty, dy = taper
        for v in bm.verts:
            if v.co.z > 0:
                v.co.x *= tx
                v.co.y = v.co.y * ty + dy
    _bevel(bm, bevel)
    return _obj(bm, name, material, parent, loc, rot)


def prism(profile, width, loc=(0, 0, 0), material='team', bevel=0.0, parent=None, name='prism', axis='x'):
    """Extrude a closed (y, z) profile `width` along x (axis='x'), or an (x, z)
    profile along y (axis='y'): hulls with sloped armour, wedges, roofs."""
    bm = bmesh.new()
    h = width / 2
    if axis == 'x':
        a = [bm.verts.new((-h, y, z)) for y, z in profile]
        b = [bm.verts.new((h, y, z)) for y, z in profile]
    else:
        a = [bm.verts.new((x, -h, z)) for x, z in profile]
        b = [bm.verts.new((x, h, z)) for x, z in profile]
    n = len(profile)
    bm.faces.new(a[::-1])
    bm.faces.new(b)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _bevel(bm, bevel)
    return _obj(bm, name, material, parent, loc)


def cyl(r, depth, loc, material='steel', axis='z', verts=12, r2=None, bevel=0.0, parent=None, name='cyl', rot=None):
    """A cylinder (a cone frustum with r2) along an axis, centred at loc."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts,
                          radius1=r, radius2=r if r2 is None else r2, depth=depth)
    if bevel:
        caps = [e for e in bm.edges if not all(abs(f.normal.z) < 0.5 for f in e.link_faces)]
        _bevel(bm, bevel, edges=caps)
    R = {'z': (0, 0, 0), 'x': (0, 90, 0), 'y': (-90, 0, 0)}[axis]
    if rot:
        R = rot
    return _obj(bm, name, material, parent, loc, R)


def sphere(r, loc, material='steel', segs=12, rings=6, scale=(1, 1, 1), parent=None, name='sphere', half=False):
    """A low-poly UV sphere (or the top half: a dome)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    if half:
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context='VERTS')
        edges = [e for e in bm.edges if e.is_boundary]
        if edges:
            bmesh.ops.edgeloop_fill(bm, edges=edges)
    for v in bm.verts:
        v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
    return _obj(bm, name, material, parent, loc)


def torus(R, r, loc, material='steel', axis='z', segs=16, tube=6, parent=None, name='torus'):
    bm = bmesh.new()
    for i in range(segs):
        a = 2 * math.pi * i / segs
        for j in range(tube):
            b = 2 * math.pi * j / tube
            bm.verts.new(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
    bm.verts.ensure_lookup_table()
    for i in range(segs):
        for j in range(tube):
            a, b = i * tube + j, i * tube + (j + 1) % tube
            c, d = ((i + 1) % segs) * tube + (j + 1) % tube, ((i + 1) % segs) * tube + j
            bm.faces.new((bm.verts[a], bm.verts[b], bm.verts[c], bm.verts[d]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    R_ = {'z': (0, 0, 0), 'x': (0, 90, 0), 'y': (-90, 0, 0)}[axis]
    return _obj(bm, name, material, parent, loc, R_)


def lathe(points, loc, material='steel', segs=16, parent=None, name='lathe'):
    """Revolve an (r, z) outline about z: domes, towers, tanks, coils."""
    bm = bmesh.new()
    rings = []
    for r, z in points:
        if r < 1e-5:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), z)) for i in range(segs)])
    for A, B in zip(rings, rings[1:]):
        if len(A) == 1 and len(B) == 1:
            continue
        for i in range(segs):
            j = (i + 1) % segs
            if len(A) == 1:
                bm.faces.new((A[0], B[i], B[j]))
            elif len(B) == 1:
                bm.faces.new((A[i], B[0], A[j]))
            else:
                bm.faces.new((A[i], A[j], B[j], B[i]))
    for ring in (rings[0], rings[-1]):
        if len(ring) > 2:
            bm.faces.new(ring)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj(bm, name, material, parent, loc)


def mirror_x(fn, *a, **k):
    """Call a builder for x and -x: fn(sign)."""
    return [fn(1), fn(-1)]


# ── Assemblies ──────────────────────────────────────────────────

def barrel(length, r, base, material='gun', parent=None, brake=True, verts=10, sleeve=True):
    """A gun barrel from `base` along +y: mantlet sleeve, tube and muzzle brake."""
    x, y, z = base
    if sleeve:
        cyl(r * 1.9, length * 0.22, (x, y + length * 0.11, z), material, 'y', verts, parent=parent, bevel=r * 0.3, name='sleeve')
    cyl(r, length, (x, y + length / 2, z), material, 'y', verts, parent=parent, name='tube')
    if brake:
        box((r * 3.2, length * 0.12, r * 2.2), (x, y + length - length * 0.05, z), material, bevel=r * 0.35, parent=parent, name='brake')


def track_unit(length, width, height, x, material='track', guard='team', parent=None, tread=None, pitch=None, links=None):
    """One track run along y at x: the belt (rounded ends), sprockets, a mud
    guard over it; `tread` (an empty) gets the grouser links that slide."""
    r = height / 2
    prof = []
    for i in range(7):  # rear half-round
        a = math.pi / 2 + math.pi * i / 6
        prof.append((-length / 2 + r + r * math.cos(a), r + r * math.sin(a)))
    for i in range(7):  # front half-round
        a = -math.pi / 2 + math.pi * i / 6
        prof.append((length / 2 - r + r * math.cos(a), r + r * math.sin(a)))
    prism(prof, width, (x, 0, 0), material, bevel=0.004, parent=parent, name='belt')
    for y in (-length / 2 + r, length / 2 - r):
        cyl(r * 0.78, width * 1.06, (x, y, r), 'steelDark', 'x', 10, parent=parent, name='sprocket')
    if guard:
        box((width * 1.12, length * 0.92, height * 0.16), (x, 0, height + height * 0.06), guard, bevel=0.006, parent=parent, name='guard')
    if tread is not None:
        # The links show on the outer face (the top run is under the guard);
        # in game they slide forward one pitch and loop, so the belt runs.
        p = pitch or tread.get('pitch', length / 16)
        n = links or int((length - 2 * r) / p)
        y0 = -length / 2 + r
        for i in range(n):
            y = y0 + (i + 0.5) * p
            box((width * 0.05, p * 0.38, height * 0.62), (x + math.copysign(width * 0.52, x), y, r), 'steelDark', parent=tread, name='grouser')
            if not guard:
                box((width * 0.94, p * 0.42, height * 0.07), (x, y, height + height * 0.02), 'steelDark', parent=tread, name='link')


def wheel(r, width, loc, material='rubber', hub='steelDark', parent=None, verts=12):
    """A road wheel (tyre + hub) on an x axle."""
    cyl(r, width, loc, material, 'x', verts, bevel=r * 0.18, parent=parent, name='tyre')
    cyl(r * 0.55, width * 1.08, loc, hub, 'x', 8, parent=parent, name='hub')


def light(loc, material='lamp', r=0.018, parent=None):
    sphere(r, loc, material, 8, 4, parent=parent, name='lamp')


def antenna(loc, h, parent=None, r=0.006):
    cyl(r, h, (loc[0], loc[1], loc[2] + h / 2), 'black', 'z', 5, parent=parent, name='antenna')
    sphere(r * 1.8, (loc[0], loc[1], loc[2] + h), 'black', 6, 3, parent=parent, name='antennaTip')


def hatch(loc, r, parent=None, material='teamDark'):
    cyl(r, r * 0.25, loc, material, 'z', 10, bevel=r * 0.12, parent=parent, name='hatch')
    box((r * 0.9, r * 0.18, r * 0.12), (loc[0], loc[1], loc[2] + r * 0.18), 'steelDark', parent=parent, name='handle')


def ground_shadow_catcher(size=4.0):
    """A floor for the occlusion bake (removed before export)."""
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size)
    me = bpy.data.meshes.new('BAKE-floor')
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new('BAKE-floor', me)
    bpy.data.collections[COL].objects.link(o)
    return o


# ── Finish: occlusion + team weight, export ─────────────────────

def meshes():
    return [o for o in bpy.data.collections[COL].all_objects if o.type == 'MESH' and not o.name.startswith('BAKE-')]


def subdivide_large(max_edge):
    """Split long edges so the per-vertex occlusion has somewhere to land."""
    for o in meshes():
        bm = bmesh.new()
        bm.from_mesh(o.data)
        s = max(o.matrix_world.to_scale())
        for _ in range(3):
            long = [e for e in bm.edges if e.calc_length() * s > max_edge]
            if not long:
                break
            bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=True)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
        bm.to_mesh(o.data)
        bm.free()


def bake_ao(distance=0.12, samples=48, floor=True, strength=0.75):
    """Ambient occlusion into each mesh's colour attribute (rgb), team weight
    into its alpha. `strength` 0–1: how dark full occlusion gets."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    try:
        sc.cycles.device = 'GPU'
    except TypeError:
        pass
    sc.world = sc.world or bpy.data.worlds.new('World')
    sc.world.light_settings.distance = distance
    sc.render.bake.target = 'VERTEX_COLORS'
    sc.render.bake.use_selected_to_active = False
    fl = ground_shadow_catcher() if floor else None
    objs = meshes()
    for o in objs:
        me = o.data
        for a in list(me.color_attributes):
            me.color_attributes.remove(a)
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        me.color_attributes.active_color = ca
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.bake(type='AO')
    if fl:
        bpy.data.objects.remove(fl, do_unlink=True)
    for o in objs:
        me = o.data
        ca = me.color_attributes['Col']
        team = [m.get('team', 0) if m else 0 for m in me.materials]
        for poly in me.polygons:
            t = team[poly.material_index] if team else 0
            for li in poly.loop_indices:
                c = ca.data[li].color
                ao = 1 - strength * (1 - c[0])
                ca.data[li].color = (ao, ao, ao, float(t))


def export(path):
    """Write the GLB: every mesh and empty of the model, modifiers applied."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.data.collections[COL].all_objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
        export_materials='EXPORT', export_vertex_color='ACTIVE', export_all_vertex_colors=False,
        export_extras=True, export_animations=False, export_cameras=False, export_lights=False,
    )
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes())
    return tris
