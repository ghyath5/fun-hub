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
    'team':      (0xc4c4c0, 0.30, 0.42, 1, 0),
    'teamDark':  (0x76767a, 0.30, 0.48, 1, 0),
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
    # People: a darker team-coloured uniform, field kit and weapons.
    'uniform':   (0x9a9a94, 0.00, 0.88, 1, 0),
    'trousers':  (0x4f5639, 0.00, 0.92, 0, 0),
    'trousersDark': (0x2f3328, 0.00, 0.92, 0, 0),
    'boots':     (0x231e19, 0.10, 0.70, 0, 0),
    'gloves':    (0x2b261f, 0.00, 0.80, 0, 0),
    'webbing':   (0x434a32, 0.00, 0.90, 0, 0),
    'canvas':    (0x7a7052, 0.00, 0.95, 0, 0),
    'helmetOd':  (0x4b5234, 0.10, 0.65, 0, 0),
    'gunmetal':  (0x26282b, 0.70, 0.42, 0, 0),
    'wood':      (0x6a4327, 0.00, 0.70, 0, 0),
    'skinDark':  (0xb07a5c, 0.00, 0.70, 0, 0),
    'hair':      (0x2a1f17, 0.00, 0.85, 0, 0),
    'fur':       (0x5a4430, 0.00, 0.95, 0, 0),
    # Army: camouflage (patches baked into the vertex colour; on the team
    # uniform they come out as shades of the player's colour), armour, kit.
    'camo':      (0xa4a49c, 0.00, 0.90, 1, 0),
    'camoOlive': (0x6a6f4c, 0.00, 0.92, 0, 0),
    'camoDark':  (0x3a3d34, 0.00, 0.92, 0, 0),
    'plate':     (0x575c45, 0.05, 0.75, 0, 0),
    'plateBlack': (0x1f2123, 0.05, 0.70, 0, 0),
    'coyote':    (0x8a7656, 0.00, 0.90, 0, 0),
    'tactical':  (0x26292c, 0.05, 0.80, 0, 0),
    'hiVis':     (0xd8e030, 0.00, 0.60, 0, 0.15),
}

#: Materials whose faces get camouflage patches baked into their colour.
CAMO = {'camo', 'camoOlive', 'camoDark'}


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
    m['camo'] = 1 if name in CAMO else 0
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
        camo = [m.get('camo', 0) if m else 0 for m in me.materials]
        mw = o.matrix_world
        for poly in me.polygons:
            t = team[poly.material_index] if team else 0
            # Camouflage: each face takes one of three tones from a noise field
            # over the model, so patches have crisp edges along the faces.
            tone = camo_tone(mw @ poly.center) if camo and camo[poly.material_index] else 1.0
            for li in poly.loop_indices:
                c = ca.data[li].color
                ao = (1 - strength * (1 - c[0])) * tone
                ca.data[li].color = (ao, ao, ao, float(t))


def camo_tone(p, scale=34.0):
    """Woodland camouflage: dark, mid or light patch at a point (by noise)."""
    from mathutils import noise
    n = noise.noise(Vector((p.x * scale + 3.1, p.y * scale + 7.7, p.z * scale * 1.4)))
    n2 = noise.noise(Vector((p.x * scale * 2.3 + 11.0, p.y * scale * 2.3, p.z * scale * 2.3)))
    v = n * 0.75 + n2 * 0.35
    return 0.5 if v < -0.12 else (0.74 if v < 0.16 else 1.0)


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


# ── Vehicle helpers ─────────────────────────────────────────────

def hull(L, W, z0, z1, mat='team', nose=0.08, glacis=0.16, rear=0.05, y=0.0, bevel=0.012, parent=None):
    """A hull block along y: sloped nose and glacis at the front, a cut at the back."""
    h = z1 - z0
    prof = [(-L / 2, z0), (L / 2 - nose, z0), (L / 2, z0 + h * 0.45), (L / 2 - glacis, z1),
            (-L / 2 + rear, z1), (-L / 2, z1 - h * 0.35)]
    return prism([(py + y, pz) for py, pz in prof], W, (0, 0, 0), mat, bevel=bevel, parent=parent, name='hull')


def grille(y0, n, w, z, step=0.032, x=0.0, parent=None):
    """Engine grille slats across the deck from y0 backwards."""
    for i in range(n):
        box((w, step * 0.6, 0.012), (x, y0 - i * step, z), 'dark', bevel=0.003, parent=parent, name='slat')


def axles(ys, x, r, w, z=None, start=0, tyre='rubber', hub='steelDark', verts=12):
    """Wheel pairs on axles across x (±x): one empty wheelN per axle at its centre."""
    out = []
    for i, y in enumerate(ys):
        e = empty(f'wheel{start + i}', (0, y, z if z is not None else r))
        for s in (1, -1):
            wheel(r, w, (s * x, y, z if z is not None else r), tyre, hub, parent=e, verts=verts)
        out.append(e)
    return out


def cast_turret(r, h, loc, mat='team', parent=None, sy=1.15, segs=14):
    """A rounded cast turret (Soviet style): a squashed dome on a short skirt."""
    x, y, z = loc
    cyl(r * 0.98, h * 0.3, (x, y, z + h * 0.15), mat, 'z', segs, parent=parent, name='turretSkirt').scale = (1, sy, 1)
    return sphere(r, (x, y, z + h * 0.28), mat, segs, 6, scale=(1, sy, h / r * 0.75), parent=parent, name='turretDome', half=True)


def rivets(points, z, r=0.009, parent=None, mat='steelDark'):
    for x, y in points:
        sphere(r, (x, y, z), mat, 6, 3, parent=parent, name='rivet', half=True)


# ── Aircraft and ships ──────────────────────────────────────────

def plate(points, thick, z, mat='team', parent=None, bevel=0.0, name='plate', top=None):
    """A flat outline in (x, y) extruded up `thick` from z: wings, fins, decks.
    `top` scales the top face toward its centre (a bevelled, thinning edge)."""
    bm = bmesh.new()
    a = [bm.verts.new((x, y, z)) for x, y in points]
    if top:
        cx = sum(p[0] for p in points) / len(points)
        cy = sum(p[1] for p in points) / len(points)
        b = [bm.verts.new((cx + (x - cx) * top, cy + (y - cy) * top, z + thick)) for x, y in points]
    else:
        b = [bm.verts.new((x, y, z + thick)) for x, y in points]
    n = len(points)
    bm.faces.new(a[::-1])
    bm.faces.new(b)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _bevel(bm, bevel)
    return _obj(bm, name, mat, parent)


def fuselage(outline, y0, loc=(0, 0, 0), mat='team', segs=12, sx=1.0, sz=1.0, parent=None):
    """A body of revolution along +y: `outline` is (r, y) from tail to nose."""
    o = lathe([(r, y) for r, y in outline], (0, 0, 0), mat, segs, parent=None, name='fuselage')
    o.rotation_euler = (math.radians(-90), 0, 0)
    o.scale = (sx, sz, 1)
    o.location = (loc[0], loc[1] + y0, loc[2])
    bpy.context.view_layer.update()
    if parent:
        mw = o.matrix_world.copy()
        o.parent = parent
        o.matrix_world = mw
    return o


def rotor(name, r, blades, loc, hub='steelDark', blade='dark', chord=None):
    """A rotor (spins about z) on its own empty."""
    e = empty(name, loc)
    c = chord or r * 0.12
    for i in range(blades):
        a = 360 * i / blades
        box((r, c, 0.008), (loc[0] + math.cos(math.radians(a)) * r / 2, loc[1] + math.sin(math.radians(a)) * r / 2, loc[2]),
            blade, parent=e, rot=(0, 0, a), name='blade')
    cyl(r * 0.1, r * 0.08, loc, hub, 'z', 8, parent=e, name='hub')
    return e


def propeller(name, r, blades, loc, hub='steelDark', blade='dark'):
    """A propeller facing forward (spins about y) on its own empty."""
    e = empty(name, loc)
    for i in range(blades):
        a = 360 * i / blades
        box((r, 0.008, r * 0.18), (loc[0] + math.cos(math.radians(a)) * r / 2, loc[1], loc[2] + math.sin(math.radians(a)) * r / 2),
            blade, parent=e, rot=(0, -a, 0), name='blade')
    sphere(r * 0.22, (loc[0], loc[1] + 0.01, loc[2]), hub, 8, 4, scale=(1, 1.6, 1), parent=e, name='spinner')
    return e


# ── Buildings ───────────────────────────────────────────────────
# Structures are modelled on their footprint in game cells: cell (x, y)
# (y growing south) is Blender (x, -y), so x ∈ [0, w], y ∈ [-h, 0], and the
# front (doors, exits) faces south (-y). Keep everything inside the
# footprint: the exporter fits the model's bounds to it.

def at(x, y, z=0.0):
    """Game cell coordinates (x east, y south) to Blender."""
    return (x, -y, z)


def slab(x0, y0, x1, y1, z0, z1, mat='concrete', bevel=0.02, parent=None, taper=None, name='slab'):
    """A block from cell (x0, y0) to (x1, y1), z0 to z1."""
    return box((x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, -(y0 + y1) / 2, (z0 + z1) / 2), mat, bevel=bevel, parent=parent, taper=taper, name=name)


def foundation(w, h, mat='concrete', t=0.06, inset=0.03):
    slab(inset, inset, w - inset, h - inset, 0, t, mat, bevel=0.02, name='foundation')
    slab(0, 0, w, h, 0, 0.02, 'concreteDark', bevel=0.0, name='foundationEdge')
    return t


def gable(x0, y0, x1, y1, z, rise, mat='team', along='x', overhang=0.04):
    """A pitched roof over a block; the ridge runs along x or y."""
    if along == 'x':
        hy = (y1 - y0) / 2 + overhang
        return prism([(-hy, 0), (hy, 0), (0, rise)], x1 - x0 + overhang * 2, ((x0 + x1) / 2, -(y0 + y1) / 2, z), mat, bevel=0.01, name='roof')
    hx = (x1 - x0) / 2 + overhang
    return prism([(-hx, 0), (hx, 0), (0, rise)], y1 - y0 + overhang * 2, ((x0 + x1) / 2, -(y0 + y1) / 2, z), mat, bevel=0.01, name='roof', axis='y')


def window_row(x0, x1, y, z, n, h=0.08, w=None, mat='lamp', facing='south'):
    """A row of lit windows on a south (or north) face at cell row y."""
    step = (x1 - x0) / n
    for i in range(n):
        cx = x0 + step * (i + 0.5)
        box((w or step * 0.55, 0.02, h), (cx, -y + (-0.005 if facing == 'south' else 0.005), z), mat, name='window')


def window_col(y0, y1, x, z, n, h=0.08, w=None, mat='lamp'):
    """A row of lit windows on an east/west face at cell column x."""
    step = (y1 - y0) / n
    for i in range(n):
        cy = y0 + step * (i + 0.5)
        box((0.02, w or step * 0.55, h), (x, -cy, z), mat, name='window')


def bay_door(x, y, w, h, z=0.0, mat='steelDark'):
    """A big roller door on a south face at cell row y, with hazard posts."""
    box((w, 0.04, h), (x, -y, z + h / 2), mat, bevel=0.006, name='door')
    for i in range(int(h / 0.06)):
        box((w * 0.96, 0.045, 0.008), (x, -y, z + 0.03 + i * 0.06), 'dark', name='doorSlat')
    for s in (1, -1):
        box((0.05, 0.06, h + 0.04), (x + s * (w / 2 + 0.03), -y, z + h / 2 + 0.02), 'hazard', bevel=0.006, name='doorPost')
    box((w + 0.12, 0.06, 0.05), (x, -y, z + h + 0.03), 'hazard', bevel=0.006, name='doorLintel')


def stripes(x0, x1, y, z=0.065, n=6, mat='hazard'):
    """Hazard stripes painted across the apron at row y."""
    step = (x1 - x0) / n
    for i in range(n):
        box((step * 0.5, 0.08, 0.006), (x0 + step * (i + 0.5), -y, z), mat, rot=(0, 0, 35), name='stripe')


def star(x, y, z, r, mat='team', t=0.012):
    """A five-pointed star lying flat (roofs, emblems)."""
    pts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.42
        pts.append((x + rr * math.cos(a), -y + rr * math.sin(a)))
    return plate(pts, t, z, mat, name='star')


def chimney(x, y, z, r, h, mat='concreteDark'):
    cyl(r, h, (x, -y, z + h / 2), mat, 'z', 12, r2=r * 0.85, name='chimney')
    cyl(r * 0.9, h * 0.08, (x, -y, z + h * 0.96), 'dark', 'z', 12, name='chimneyCap')
    torus(r * 0.88, 0.012, (x, -y, z + h * 0.8), 'redLamp', 'z', 12, 4, name='chimneyBand')


def storage_tank(x, y, z, r, h, mat='steel'):
    cyl(r, h, (x, -y, z + h / 2), mat, 'z', 16, name='tank')
    sphere(r, (x, -y, z + h), mat, 16, 6, scale=(1, 1, 0.4), half=True, name='tankTop')
    torus(r * 1.01, 0.012, (x, -y, z + h * 0.66), 'dark', 'z', 16, 4, name='tankBand')
    cyl(0.008, h, (x + r * 0.95, -y - r * 0.3, z + h / 2), 'steelDark', 'z', 4, name='ladder')


def pipe_run(points, r=0.025, mat='steel'):
    """A pipe through game-cell points (x, y, z)."""
    for (ax, ay, az), (bx, by, bz) in zip(points, points[1:]):
        a = Vector((ax, -ay, az))
        b = Vector((bx, -by, bz))
        d = b - a
        L = d.length
        if L < 1e-4:
            continue
        o = cyl(r, L, (a + b) / 2, mat, 'z', 8, name='pipe')
        o.rotation_mode = 'QUATERNION'
        o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
        sphere(r * 1.15, b, mat, 8, 4, name='pipeJoint')


def radar_dish(name, x, y, z, r, mat='white'):
    """A dish on a mast that turns (spinN)."""
    e = empty(name, (x, -y, z))
    cyl(0.03, 0.12, (x, -y, z + 0.06), 'steelDark', 'z', 8, parent=e, name='dishMast')
    d = lathe([(0.0, 0.0), (r * 0.6, r * 0.12), (r, r * 0.38), (r * 0.96, r * 0.42), (0.0, r * 0.06)], (0, 0, 0), mat, 16, parent=None, name='dish')
    d.rotation_euler = (math.radians(-60), 0, 0)
    d.location = (x, -y - r * 0.15, z + 0.14 + r * 0.4)
    bpy.context.view_layer.update()
    mw = d.matrix_world.copy()
    d.parent = e
    d.matrix_world = mw
    cyl(0.01, r * 0.8, (x, -y - r * 0.5, z + 0.2 + r * 0.6), 'dark', 'y', 5, parent=e, name='feed')
    return e


def lattice_tower(x, y, z, w, h, mat='steelDark', levels=5):
    """An open steel tower of four legs and cross braces."""
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl(0.014, h, (x + sx * w / 2, -y + sy * w / 2, z + h / 2), mat, 'z', 5, name='towerLeg')
    for k in range(1, levels + 1):
        zz = z + k * h / (levels + 0.3)
        for sy in (-1, 1):
            box((w, 0.012, 0.012), (x, -y + sy * w / 2, zz), mat, name='brace')
        for sx in (-1, 1):
            box((0.012, w, 0.012), (x + sx * w / 2, -y, zz), mat, name='brace')


def fence(points, z=0.06, h=0.1, mat='steelDark', step=0.18):
    """A wire fence along game-cell points (x, y)."""
    for (ax, ay), (bx, by) in zip(points, points[1:]):
        L = math.hypot(bx - ax, by - ay)
        n = max(1, int(L / step))
        for i in range(n + 1):
            t = i / n
            cyl(0.008, h, (ax + (bx - ax) * t, -(ay + (by - ay) * t), z + h / 2), mat, 'z', 4, name='post')
        ang = math.degrees(math.atan2(-(by - ay), bx - ax))
        box((L, 0.006, h * 0.6), ((ax + bx) / 2, -(ay + by) / 2, z + h * 0.6), 'steelDark', rot=(0, 0, ang), name='wire')


def floodlight(x, y, z, h=0.3):
    cyl(0.01, h, (x, -y, z + h / 2), 'steelDark', 'z', 5, name='lightPole')
    box((0.06, 0.04, 0.03), (x, -y - 0.01, z + h), 'dark', bevel=0.006, name='lightHead')
    box((0.05, 0.01, 0.02), (x, -y - 0.032, z + h), 'lamp', name='lightLens')


# ── Organic shapes (people, animals) ────────────────────────────

def skin(name, verts, edges, radii, paint, parent=None, levels=1, root=0):
    """An organic mesh grown from a joint graph with the Skin modifier and
    smoothed (Subdivision Surface): `verts` are joints, `radii` (x, y) the
    body's half-widths there. `paint(centre)` names the palette material of
    each face (uniform, skin, boots…). Smooth shaded."""
    me = bpy.data.meshes.new(name + '-src')
    me.from_pydata([tuple(v) for v in verts], edges, [])
    me.update()
    tmp = bpy.data.objects.new(name + '-src', me)
    bpy.context.scene.collection.objects.link(tmp)
    tmp.modifiers.new('skin', 'SKIN')
    for i, r in enumerate(radii):
        sv = me.skin_vertices[0].data[i]
        sv.radius = r if isinstance(r, (tuple, list)) else (r, r)
        sv.use_root = i == root
    if levels:
        tmp.modifiers.new('sub', 'SUBSURF').levels = levels
    dg = bpy.context.evaluated_depsgraph_get()
    out = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.meshes.remove(me)
    names = []
    for p in out.polygons:
        n = paint(Vector(p.center))
        if n not in names:
            names.append(n)
            out.materials.append(mat(n))
        p.material_index = names.index(n)
        p.use_smooth = True
    _count[0] += 1
    out.name = f'{name}.{_count[0]}'
    o = _link(bpy.data.objects.new(out.name, out))
    bpy.context.view_layer.update()
    if parent:
        mw = o.matrix_world.copy()
        o.parent = parent
        o.matrix_world = mw
    return o


def smooth(o):
    """Shade an object smooth (rounded gear: helmets, packs, tanks)."""
    for p in o.data.polygons:
        p.use_smooth = True
    return o
