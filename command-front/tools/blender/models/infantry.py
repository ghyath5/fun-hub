# Infantry: real-proportioned soldiers grown from a joint skeleton (the Skin
# modifier, smoothed), in uniform and field kit, holding their weapons in
# proper poses. Front is +y, about 0.62 tall (7.5 heads); legs (legL/legR)
# hang from hip empties and swing as they walk, and unarmed soldiers swing
# their arms (armL/armR). The jacket takes the player's colour.
import math

HIP = 0.30           # hip joints
SHOULDER = 0.476     # shoulder joints
NECK = 0.498
HEAD = 0.556         # centre of the head


# ── Small maths ─────────────────────────────────────────────────

def aim(origin, direction):
    """A frame at `origin` whose +y points along `direction`: (yaw, pitch, to_world)."""
    dx, dy, dz = direction
    h = math.hypot(dx, dy) or 1e-6
    yaw = math.atan2(-dx, dy)
    pitch = math.atan2(dz, h)
    cy, sy, cp, sp = math.cos(yaw), math.sin(yaw), math.cos(pitch), math.sin(pitch)

    def to_world(p):
        x, y, z = p
        y2, z2 = y * cp - z * sp, y * sp + z * cp          # pitch about x
        x3, y3 = x * cy - y2 * sy, x * sy + y2 * cy         # yaw about z
        return (origin[0] + x3, origin[1] + y3, origin[2] + z2)
    return yaw, pitch, to_world


def held(k, origin, direction, build):
    """Build a weapon along +y in its own frame, then aim it: returns its to_world."""
    yaw, pitch, to_world = aim(origin, direction)
    holder = k.empty('weapon', (0, 0, 0))
    build(holder)
    holder.rotation_euler = (pitch, 0, yaw)
    holder.location = origin
    k.bpy.context.view_layer.update()
    return to_world


# ── The figure ──────────────────────────────────────────────────

def legs(k, trousers='trousers', boots='boots', kneepads=None):
    """Two legs on hip pivots: thigh, knee, shin, a laced boot."""
    for name, s in (('legL', -1), ('legR', 1)):
        x = s * 0.042
        e = k.empty(name, (x, 0.0, HIP))
        verts = [(x, 0.0, HIP + 0.012), (x * 1.06, 0.014, 0.168), (x * 0.98, -0.004, 0.05), (x, 0.012, 0.022), (x, 0.054, 0.016)]
        radii = [(0.036, 0.038), (0.025, 0.027), (0.019, 0.021), (0.021, 0.026), (0.018, 0.014)]
        k.skin('leg', verts, [(0, 1), (1, 2), (2, 3), (3, 4)], radii,
               lambda c: boots if c.z < 0.078 else trousers, parent=e)
        if kneepads:
            k.smooth(k.sphere(0.017, (x * 1.08, 0.03, 0.168), kneepads, 10, 5, scale=(1.1, 0.6, 1.1), parent=e, name='kneepad'))


def body(k, hands, elbows, uniform='uniform', trousers='trousers', gloves='gloves', bulk=1.0, arms=True):
    """Pelvis, torso, neck and head; with `arms`, both arms reaching to `hands`
    (right, left) through `elbows`. Hands are gloved, the face is skin."""
    b = bulk
    v = [(0, 0.0, 0.318), (0, 0.004, 0.372), (0, 0.008, 0.438), (0, 0.0, NECK), (0, 0.008, HEAD), (0, 0.004, HEAD + 0.024)]
    r = [(0.058 * b, 0.04 * b), (0.052 * b, 0.036 * b), (0.066 * b, 0.044 * b), (0.02, 0.021), (0.032, 0.036), (0.026, 0.029)]
    e = [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5)]
    sh = [(0.072 * b, 0.0, SHOULDER), (-0.072 * b, 0.0, SHOULDER)]
    v += sh
    r += [(0.028 * b, 0.028 * b)] * 2
    e += [(2, 6), (2, 7)]
    hand_ids = []
    if arms:
        for side in (0, 1):
            base = len(v)
            ex, ey, ez = elbows[side]
            hx, hy, hz = hands[side]
            wx, wy, wz = (ex + (hx - ex) * 0.82, ey + (hy - ey) * 0.82, ez + (hz - ez) * 0.82)
            v += [elbows[side], (wx, wy, wz), hands[side]]
            r += [(0.019 * b, 0.019 * b), (0.014, 0.014), (0.015, 0.014)]
            e += [(6 + side, base), (base, base + 1), (base + 1, base + 2)]
            hand_ids.append(base + 2)
    hand_pts = [k.Vector(v[i]) for i in hand_ids]

    def paint(c):
        if any((c - h).length < 0.022 for h in hand_pts):
            return gloves
        if c.z > NECK + 0.006:
            return 'skin'
        if c.z < 0.345:
            return trousers
        return uniform
    k.skin('body', v, e, r, paint)


def arms_down(k, uniform='uniform', gloves='gloves', carry=None, bulk=1.0):
    """Arms hanging on shoulder pivots (armL/armR); they swing as he walks."""
    for name, s in (('armL', -1), ('armR', 1)):
        x = s * 0.072 * bulk
        e = k.empty(name, (x, 0.0, SHOULDER))
        verts = [(x, 0.0, SHOULDER), (x * 1.12, 0.004, 0.375), (x * 1.1, 0.016, 0.3), (x * 1.08, 0.02, 0.272)]
        radii = [(0.026 * bulk, 0.026 * bulk), (0.019, 0.019), (0.014, 0.014), (0.015, 0.014)]
        k.skin('arm', verts, [(0, 1), (1, 2), (2, 3)], radii, lambda c: gloves if c.z < 0.29 else uniform, parent=e)
        if carry and s == 1:
            carry(e, (x * 1.08, 0.02, 0.26))


def face(k, beard=False, moustache=False):
    k.smooth(k.sphere(0.008, (0, 0.044, HEAD - 0.004), 'skin', 8, 4, scale=(0.8, 1.0, 1.1), name='nose'))
    for s in (1, -1):
        k.sphere(0.0045, (s * 0.013, 0.036, HEAD + 0.008), 'black', 6, 3, name='eye')
        k.smooth(k.sphere(0.009, (s * 0.032, 0.0, HEAD), 'skin', 8, 4, scale=(0.5, 0.8, 1.1), name='ear'))
    if beard:
        k.smooth(k.sphere(0.03, (0, 0.016, HEAD - 0.024), 'hair', 10, 5, scale=(1.0, 0.9, 0.8), name='beard'))
    if moustache:
        k.box((0.024, 0.006, 0.006), (0, 0.041, HEAD - 0.014), 'hair', bevel=0.002, name='moustache')


# ── Headgear ────────────────────────────────────────────────────

def headgear(k, hat):
    z = HEAD + 0.012
    if hat in ('cap', 'beret', 'redBeret', 'fedora'):
        # Hair under an open hat (cropped at the sides).
        k.smooth(k.sphere(0.034, (0, -0.004, HEAD + 0.006), 'hair', 14, 7, scale=(1.0, 1.08, 0.95), half=True, name='hair'))
    if hat in ('helmet', 'helmetBlack', 'helmetWhite', 'helmetTeam'):
        m = {'helmet': 'helmetOd', 'helmetBlack': 'black', 'helmetWhite': 'white', 'helmetTeam': 'uniform'}[hat]
        k.smooth(k.sphere(0.043, (0, -0.002, z), m, 16, 8, scale=(1.0, 1.08, 0.86), half=True, name='helmet'))
        k.smooth(k.torus(0.043, 0.005, (0, -0.002, z + 0.002), m, 'z', 20, 5, name='helmetRim')).scale = (1.0, 1.08, 1)
        k.box((0.004, 0.006, 0.042), (0.03, 0.012, HEAD - 0.012), 'webbing', name='strap')
        k.box((0.004, 0.006, 0.042), (-0.03, 0.012, HEAD - 0.012), 'webbing', name='strap')
        if hat == 'helmet':
            k.torus(0.04, 0.004, (0, -0.002, z + 0.016), 'webbing', 'z', 16, 4, name='helmetBand').scale = (1.0, 1.08, 1)
    elif hat == 'cap':
        k.smooth(k.sphere(0.039, (0, -0.002, HEAD + 0.004), 'trousersDark', 16, 7, scale=(1.0, 1.08, 0.82), half=True, name='cap'))
        k.smooth(k.box((0.056, 0.036, 0.006), (0, 0.046, HEAD + 0.006), 'trousersDark', bevel=0.003, rot=(-8, 0, 0), name='peak'))
    elif hat in ('beret', 'redBeret'):
        m = 'uniform' if hat == 'redBeret' else 'trousersDark'
        k.smooth(k.sphere(0.044, (0.012, -0.006, z + 0.012), m, 16, 7, scale=(1.05, 1.0, 0.4), name='beret'))
        k.smooth(k.torus(0.036, 0.005, (0.004, -0.004, z + 0.004), 'leather', 'z', 18, 4, name='beretBand'))
        k.box((0.01, 0.004, 0.012), (-0.022, 0.03, z + 0.012), 'brass', name='beretBadge')
    elif hat == 'hardhat':
        k.smooth(k.sphere(0.041, (0, 0.0, z), 'hazard', 16, 8, scale=(1.0, 1.06, 0.82), half=True, name='hardhat'))
        k.cyl(0.05, 0.005, (0, 0.006, z), 'hazard', 'z', 18, name='hardhatBrim').scale = (1.0, 1.1, 1)
        k.box((0.008, 0.07, 0.008), (0, -0.002, z + 0.034), 'hazard', bevel=0.003, name='ridge')
    elif hat == 'fedora':
        k.cyl(0.055, 0.005, (0, 0, z + 0.004), 'black', 'z', 18, name='brim')
        k.smooth(k.cyl(0.033, 0.034, (0, 0, z + 0.022), 'black', 'z', 14, r2=0.028, name='crown'))
        k.cyl(0.0335, 0.007, (0, 0, z + 0.01), 'leather', 'z', 14, name='band')
    elif hat == 'ushanka':
        k.smooth(k.sphere(0.044, (0, 0.0, z + 0.002), 'fur', 14, 7, scale=(1.05, 1.06, 0.8), half=True, name='ushanka'))
        for s in (1, -1):
            k.smooth(k.box((0.014, 0.04, 0.04), (s * 0.036, 0.0, HEAD - 0.006), 'fur', bevel=0.01, name='earflap'))
        k.box((0.012, 0.004, 0.012), (0, 0.044, z + 0.012), 'brass', name='badge')
    elif hat == 'gasmask':
        k.smooth(k.sphere(0.042, (0, -0.004, z - 0.004), 'trousersDark', 14, 7, scale=(1.0, 1.06, 1.0), name='hood'))
        k.smooth(k.cyl(0.014, 0.024, (0, 0.044, HEAD - 0.012), 'black', 'y', 10, name='filter'))
        for s in (1, -1):
            k.cyl(0.01, 0.006, (s * 0.014, 0.04, HEAD + 0.008), 'glassDark', 'y', 10, name='lens')
    elif hat == 'hood':
        k.smooth(k.sphere(0.041, (0, -0.006, z - 0.006), 'black', 14, 7, scale=(1.0, 1.08, 1.06), name='hood'))
        k.box((0.05, 0.006, 0.012), (0, 0.035, HEAD + 0.004), 'glassDark', name='goggles')
    elif hat == 'psi':
        k.smooth(k.sphere(0.041, (0, -0.002, z), 'steel', 14, 7, scale=(1.0, 1.06, 0.85), half=True, name='psiHelmet'))
        k.torus(0.04, 0.006, (0, -0.002, z + 0.014), 'psi', 'z', 18, 5, name='psiRing')
        k.sphere(0.01, (0, 0.04, z + 0.012), 'psi', 8, 4, name='psiGem')
    elif hat in ('chrono', 'rad', 'shock'):
        m = {'chrono': 'white', 'rad': 'olive', 'shock': 'steelDark'}[hat]
        glow = {'chrono': 'chrono', 'rad': 'rad', 'shock': 'tesla'}[hat]
        k.smooth(k.sphere(0.044, (0, -0.002, HEAD + 0.004), m, 16, 8, scale=(1.0, 1.06, 1.08), name='suitHelmet'))
        k.smooth(k.box((0.05, 0.012, 0.02), (0, 0.04, HEAD + 0.006), glow, bevel=0.004, name='visor'))
        if hat == 'shock':
            k.cyl(0.004, 0.05, (0.024, -0.02, HEAD + 0.06), 'copper', 'z', 5, name='aerial')


# ── Kit ─────────────────────────────────────────────────────────

def webbing(k, bulk=1.0):
    """Belt with pouches round the waist, braces over the shoulders."""
    k.smooth(k.torus(0.046 * bulk, 0.008, (0, 0.002, 0.345), 'webbing', 'z', 20, 5, name='belt')).scale = (1.0, 0.74, 1.0)
    k.box((0.016, 0.006, 0.012), (0, 0.037 * bulk, 0.345), 'brass', name='buckle')
    for x, y in ((0.032, 0.026), (-0.032, 0.026), (0.048, -0.004), (-0.048, -0.004)):
        k.smooth(k.box((0.022, 0.014, 0.022), (x * bulk, y * bulk, 0.348), 'webbing', bevel=0.005, name='pouch'))
    for s in (1, -1):
        k.box((0.008, 0.07 * bulk, 0.006), (s * 0.03 * bulk, 0.0, 0.47), 'webbing', name='brace')


def back(k, kind, bulk=1.0):
    y = -0.04 * bulk
    if kind == 'pack':
        k.smooth(k.box((0.08, 0.04, 0.1), (0, y - 0.004, 0.43), 'canvas', bevel=0.016, name='pack'))
        k.smooth(k.cyl(0.016, 0.09, (0, y - 0.006, 0.49), 'webbing', 'x', 10, name='bedroll'))
        k.smooth(k.box((0.05, 0.012, 0.04), (0, y - 0.028, 0.41), 'canvas', bevel=0.006, name='packPocket'))
    elif kind == 'radio':
        k.smooth(k.box((0.075, 0.042, 0.105), (0, y - 0.004, 0.43), 'webbing', bevel=0.01, name='radio'))
        k.box((0.04, 0.006, 0.02), (0.0, y - 0.027, 0.46), 'black', name='dial')
        k.antenna((0.026, y - 0.01, 0.48), 0.2, r=0.003)
    elif kind == 'tanks':
        for s in (1, -1):
            k.smooth(k.cyl(0.022, 0.13, (s * 0.024, y - 0.012, 0.43), 'hazard', 'z', 12, bevel=0.008, name='fuel'))
        k.smooth(k.cyl(0.006, 0.12, (0.05, 0.0, 0.37), 'black', 'z', 6, rot=(40, 0, 0), name='hose'))
    elif kind == 'jet':
        k.smooth(k.box((0.085, 0.04, 0.11), (0, y - 0.006, 0.43), 'steel', bevel=0.016, name='jetpack'))
        for s in (1, -1):
            k.smooth(k.cyl(0.02, 0.08, (s * 0.032, y - 0.02, 0.36), 'steelDark', 'z', 12, r2=0.016, name='thruster'))
            k.cyl(0.014, 0.008, (s * 0.032, y - 0.02, 0.318), 'fire', 'z', 10, name='flame')
        for s in (1, -1):
            k.plate([(s * 0.04, y + 0.0), (s * 0.12, y - 0.02), (s * 0.12, y - 0.035), (s * 0.04, y - 0.03)][::(1 if s > 0 else -1)], 0.006, 0.47, 'uniform', name='wing')
    elif kind == 'medkit':
        k.smooth(k.box((0.075, 0.04, 0.09), (0, y - 0.004, 0.43), 'white', bevel=0.012, name='medkit'))
        k.box((0.04, 0.004, 0.012), (0, y - 0.025, 0.435), 'redLamp', name='cross')
        k.box((0.012, 0.004, 0.04), (0, y - 0.025, 0.435), 'redLamp', name='cross')
    elif kind == 'chrono':
        k.smooth(k.box((0.08, 0.04, 0.11), (0, y - 0.006, 0.43), 'white', bevel=0.018, name='chronoPack'))
        k.smooth(k.sphere(0.024, (0, y - 0.03, 0.44), 'chrono', 12, 6, name='chronoCore'))
    elif kind == 'rad':
        k.smooth(k.cyl(0.03, 0.12, (0, y - 0.012, 0.43), 'olive', 'z', 12, bevel=0.01, name='radTank'))
        k.cyl(0.018, 0.02, (0, y - 0.012, 0.5), 'rad', 'z', 10, name='radCore')
    elif kind == 'tesla':
        k.smooth(k.box((0.09, 0.045, 0.11), (0, y - 0.008, 0.43), 'steelDark', bevel=0.016, name='teslaPack'))
        for s in (1, -1):
            k.cyl(0.008, 0.06, (s * 0.024, y - 0.01, 0.51), 'copper', 'z', 8, name='coil')
            k.sphere(0.01, (s * 0.024, y - 0.01, 0.545), 'tesla', 8, 4, name='spark')
    elif kind == 'bombs':
        k.smooth(k.box((0.07, 0.038, 0.09), (0, y - 0.004, 0.43), 'leather', bevel=0.012, name='satchel'))
        for x in (-0.03, 0.0, 0.03):
            k.smooth(k.cyl(0.011, 0.045, (x, 0.04 * bulk, 0.41), 'dark', 'z', 8, name='charge'))
            k.sphere(0.004, (x, 0.05 * bulk, 0.43), 'redLamp', 6, 3, name='fuse')
    elif kind == 'bag':
        k.smooth(k.sphere(0.045, (0.0, y - 0.016, 0.4), 'leather', 12, 6, scale=(1.0, 0.62, 1.1), name='loot'))
    elif kind == 'cape':
        k.smooth(k.box((0.12, 0.012, 0.2), (0, y - 0.004, 0.39), 'uniform', bevel=0.004, taper=(0.75, 1, 0), name='cape'))


# ── Weapons (built along +y, stock at the origin) ───────────────

def rifle(k, h, long=False, wood='wood'):
    L = 0.42 if long else 0.33
    k.smooth(k.box((0.016, 0.075, 0.03), (0, 0.03, -0.004), wood, bevel=0.006, parent=h, taper=(1, 1, 0), name='stock'))
    k.box((0.018, 0.11, 0.026), (0, 0.12, 0.004), 'gunmetal', bevel=0.004, parent=h, name='receiver')
    k.box((0.014, 0.018, 0.04), (0, 0.105, -0.022), 'gunmetal', bevel=0.003, parent=h, rot=(-15, 0, 0), name='grip')
    k.box((0.013, 0.022, 0.05), (0, 0.15, -0.028), 'gunmetal', bevel=0.003, parent=h, rot=(12, 0, 0), name='magazine')
    k.smooth(k.box((0.02, 0.08, 0.022), (0, 0.215, 0.004), wood, bevel=0.006, parent=h, name='handguard'))
    k.cyl(0.0045, L - 0.24, (0, 0.255 + (L - 0.24) / 2, 0.006), 'gunmetal', 'y', 8, parent=h, name='barrel')
    k.box((0.006, 0.008, 0.012), (0, L - 0.01, 0.014), 'gunmetal', parent=h, name='foresight')
    if long:
        k.smooth(k.cyl(0.009, 0.09, (0, 0.13, 0.03), 'gunmetal', 'y', 10, parent=h, name='scope'))
        for y in (0.1, 0.16):
            k.box((0.006, 0.008, 0.012), (0, y, 0.02), 'gunmetal', parent=h, name='scopeMount')


def smg(k, h):
    k.box((0.016, 0.14, 0.026), (0, 0.1, 0.0), 'gunmetal', bevel=0.004, parent=h, name='smgBody')
    k.box((0.012, 0.018, 0.038), (0, 0.07, -0.024), 'gunmetal', parent=h, rot=(-12, 0, 0), name='grip')
    k.box((0.011, 0.02, 0.05), (0, 0.12, -0.03), 'gunmetal', parent=h, name='magazine')
    k.cyl(0.006, 0.07, (0, 0.205, 0.004), 'gunmetal', 'y', 8, parent=h, name='suppressor')
    k.box((0.01, 0.05, 0.008), (0, 0.025, -0.002), 'gunmetal', parent=h, name='wireStock')


def heavy(k, h, kind):
    """Two-handed heavy weapons carried at the hip."""
    body_m = {'flak': 'steelDark', 'tesla': 'steelDark', 'rad': 'olive', 'chrono': 'white', 'flame': 'steelDark', 'big': 'steel'}[kind]
    k.smooth(k.box((0.034, 0.22, 0.04), (0, 0.11, 0.0), body_m, bevel=0.01, parent=h, name='heavyBody'))
    k.box((0.014, 0.02, 0.04), (0, 0.06, -0.03), 'gunmetal', parent=h, rot=(-12, 0, 0), name='grip')
    if kind == 'flak':
        for x in (-0.009, 0.009):
            k.cyl(0.007, 0.16, (x, 0.3, 0.01), 'gunmetal', 'y', 8, parent=h, name='flakBarrel')
        k.smooth(k.box((0.03, 0.05, 0.04), (0, 0.08, -0.04), 'olive', bevel=0.008, parent=h, name='drum'))
    elif kind == 'tesla':
        for y in (0.2, 0.24, 0.28):
            k.torus(0.02, 0.005, (0, y, 0.004), 'copper', 'y', 12, 4, parent=h, name='coil')
        k.sphere(0.014, (0, 0.31, 0.004), 'tesla', 10, 5, parent=h, name='emitter')
    elif kind == 'rad':
        k.cyl(0.012, 0.08, (0, 0.25, 0.004), 'steelDark', 'y', 10, parent=h, name='radNozzle')
        k.cyl(0.01, 0.01, (0, 0.29, 0.004), 'rad', 'y', 10, parent=h, name='radGlow')
    elif kind == 'chrono':
        k.cyl(0.016, 0.06, (0, 0.24, 0.004), 'steel', 'y', 12, parent=h, name='chronoBarrel')
        k.cyl(0.012, 0.01, (0, 0.27, 0.004), 'chrono', 'y', 10, parent=h, name='chronoGlow')
    elif kind == 'flame':
        k.cyl(0.008, 0.1, (0, 0.27, 0.004), 'gunmetal', 'y', 8, parent=h, name='flameNozzle')
        k.sphere(0.008, (0, 0.325, 0.004), 'fire', 6, 3, parent=h, name='pilot')
    else:
        k.cyl(0.012, 0.12, (0, 0.27, 0.004), 'dark', 'y', 10, parent=h, name='muzzle')


def launcher(k, h, guard=False):
    m = 'steelDark' if guard else 'olive'
    k.smooth(k.cyl(0.024, 0.4, (0, 0.12, 0.0), m, 'y', 12, parent=h, name='tube'))
    k.cyl(0.028, 0.03, (0, 0.32, 0.0), 'black', 'y', 12, parent=h, name='muzzle')
    k.cyl(0.026, 0.02, (0, -0.08, 0.0), 'black', 'y', 12, parent=h, name='venturi')
    k.box((0.012, 0.02, 0.035), (0, 0.06, -0.03), 'gunmetal', parent=h, name='grip')
    k.box((0.02, 0.03, 0.02), (-0.03, 0.12, 0.01), 'gunmetal', parent=h, name='sight')
    if guard:
        k.cyl(0.02, 0.01, (0, 0.335, 0.0), 'redLamp', 'y', 10, parent=h, name='seeker')


# ── Poses ───────────────────────────────────────────────────────

def two_handed(k, build, stock=(0.045, 0.0, 0.445), muzzle=(0.004, 0.34, 0.37), grip=0.28, fore=0.62, uniform='uniform', bulk=1.0):
    """A long gun at the ready: butt in the right shoulder, hands on grip and handguard."""
    d = [m - s for m, s in zip(muzzle, stock)]
    to = held(k, stock, d, build)
    L = math.sqrt(sum(c * c for c in d))
    rh = to((0, L * grip, -0.03))
    lh = to((0, L * fore, -0.012))
    body(k, (rh, lh), ((0.088 * bulk, -0.012, 0.37), (-0.058 * bulk, 0.095, 0.375)), uniform=uniform, bulk=bulk)


def at_hip(k, build, uniform='uniform', bulk=1.0):
    """A heavy weapon held level at the hip."""
    stock = (0.05 * bulk, -0.02, 0.37)
    d = (-0.012, 1.0, 0.02)
    to = held(k, stock, d, build)
    rh = to((0, 0.06, -0.035))
    lh = to((0, 0.17, -0.02))
    body(k, (rh, lh), ((0.082 * bulk, 0.0, 0.355), (-0.05 * bulk, 0.09, 0.38)), uniform=uniform, bulk=bulk)


def on_shoulder(k, guard=False, uniform='uniform'):
    """A rocket launcher on the right shoulder, aimed forward."""
    origin = (0.058, 0.0, 0.505)
    to = held(k, origin, (0, 1.0, -0.03), lambda h: launcher(k, h, guard))
    rh = to((0, 0.06, -0.06))
    lh = to((0, 0.16, -0.03))
    body(k, (rh, lh), ((0.09, 0.02, 0.4), (-0.04, 0.1, 0.42)), uniform=uniform)


def pistol_out(k, uniform='uniform', trousers='trousers'):
    """Right arm forward with a pistol, left arm at the side."""
    rh = (0.045, 0.19, 0.435)
    lh = (-0.076, 0.02, 0.272)
    body(k, (rh, lh), ((0.07, 0.09, 0.44), (-0.077, 0.004, 0.375)), uniform=uniform, trousers=trousers)
    k.box((0.012, 0.045, 0.02), (0.045, 0.22, 0.442), 'gunmetal', bevel=0.003, name='pistol')
    k.box((0.01, 0.014, 0.024), (0.045, 0.2, 0.425), 'gunmetal', name='pistolGrip')


def soldier(k, hat='helmet', gun='rifle', pack='pack', uniform='uniform', trousers='trousers', boots='boots',
            kneepads=None, bulk=1.0, gear=True, face_kw=None, extra=None):
    legs(k, trousers, boots, kneepads)
    if gun in (None, 'none'):
        body(k, None, None, uniform=uniform, trousers=trousers, bulk=bulk, arms=False)
        arms_down(k, uniform, bulk=bulk)
    elif gun == 'pistol':
        pistol_out(k, uniform, trousers)
    elif gun in ('tube', 'guard'):
        on_shoulder(k, guard=gun == 'guard', uniform=uniform)
    elif gun == 'rifle':
        two_handed(k, lambda h: rifle(k, h), uniform=uniform, bulk=bulk)
    elif gun == 'sniper':
        two_handed(k, lambda h: rifle(k, h, long=True), muzzle=(0.002, 0.4, 0.38), uniform=uniform, bulk=bulk)
    elif gun == 'smg':
        two_handed(k, lambda h: smg(k, h), stock=(0.045, 0.02, 0.43), muzzle=(0.01, 0.3, 0.385), grip=0.3, fore=0.5, uniform=uniform, bulk=bulk)
    else:
        at_hip(k, lambda h: heavy(k, h, gun), uniform=uniform, bulk=bulk)
    face(k, **(face_kw or {}))
    headgear(k, hat)
    if gear:
        webbing(k, bulk)
    if pack:
        back(k, pack, bulk)
    if extra:
        extra()


INF = dict(maxEdge=1.0, ao=0.05, aoStrength=0.7, view='front')


@model('rifleman', **INF)
def rifleman(k):
    soldier(k, 'helmet', 'rifle', 'pack')


@model('rocketTrooper', **INF)
def rocket_trooper(k):
    soldier(k, 'helmet', 'tube', 'pack')


@model('engineer', **INF)
def engineer(k):
    def kit_():
        for s in (1, -1):
            k.box((0.012, 0.006, 0.12), (s * 0.03, 0.04, 0.42), 'hazard', name='vestStripe')
    soldier(k, 'hardhat', None, None, uniform='uniform', extra=kit_)
    # A toolbox in the right hand (it swings with the arm).
    arm = k.bpy.data.objects['armR']
    k.smooth(k.box((0.05, 0.022, 0.04), (0.078, 0.02, 0.235), 'hazard', bevel=0.006, parent=arm, name='toolbox'))
    k.box((0.03, 0.006, 0.006), (0.078, 0.02, 0.26), 'black', parent=arm, name='handle')


@model('grenadier', **INF)
def grenadier(k):
    soldier(k, 'ushanka', 'smg', 'bag', extra=lambda: [
        k.smooth(k.sphere(0.012, (x, 0.04, 0.37), 'olive', 8, 4, name='grenade')) for x in (-0.03, -0.01, 0.01)])


@model('flameTrooper', **INF)
def flame_trooper(k):
    soldier(k, 'gasmask', 'flame', 'tanks', trousers='trousersDark')


@model('medic', **INF)
def medic(k):
    def armband():
        k.box((0.06, 0.006, 0.02), (0, 0.042, 0.44), 'white', name='redCrossPatch')
        k.box((0.03, 0.008, 0.01), (0, 0.043, 0.44), 'redLamp', name='cross')
        k.box((0.01, 0.008, 0.03), (0, 0.043, 0.44), 'redLamp', name='cross')
    soldier(k, 'helmetWhite', None, 'medkit', extra=armband)


@model('spy', **INF)
def spy(k):
    def tie():
        k.box((0.02, 0.006, 0.06), (0, 0.042, 0.45), 'white', name='shirt')
        k.box((0.008, 0.008, 0.05), (0, 0.044, 0.445), 'black', name='tie')
    soldier(k, 'fedora', 'pistol', None, uniform='uniform', trousers='black', boots='black', gear=False, extra=tie)


@model('thief', **INF)
def thief(k):
    soldier(k, 'hood', None, 'bag', trousers='black', boots='black', gear=False)


@model('guardTrooper', **INF)
def guard_trooper(k):
    soldier(k, 'helmet', 'guard', 'radio', kneepads='webbing')


@model('marksman', **INF)
def marksman(k):
    soldier(k, 'beret', 'sniper', 'pack', trousers='olive', kneepads='webbing')


@model('shockTrooper', **INF)
def shock_trooper(k):
    soldier(k, 'shock', 'tesla', 'tesla', trousers='steelDark', boots='dark', bulk=1.25)


@model('flakTrooper', **INF)
def flak_trooper(k):
    soldier(k, 'helmet', 'flak', 'pack')


@model('seal', **INF)
def seal(k):
    soldier(k, 'helmetBlack', 'smg', 'radio', trousers='black', boots='black', kneepads='black',
            extra=lambda: k.smooth(k.box((0.03, 0.02, 0.05), (-0.05, -0.05, 0.4), 'hazard', bevel=0.006, name='c4')))


@model('chronoTrooper', **INF)
def chrono_trooper(k):
    soldier(k, 'chrono', 'chrono', 'chrono', trousers='white', boots='steelDark', bulk=1.1, gear=False)


@model('rocketeer', **INF)
def rocketeer(k):
    soldier(k, 'helmet', 'smg', 'jet')


@model('desolator', **INF)
def desolator(k):
    soldier(k, 'rad', 'rad', 'rad', trousers='olive', bulk=1.15, gear=False)


@model('ivan', **INF)
def ivan(k):
    soldier(k, 'ushanka', None, 'bombs', trousers='trousersDark', face_kw={'beard': True})


@model('psiCommander', **INF)
def psi_commander(k):
    soldier(k, 'psi', 'pistol', 'cape', trousers='trousersDark', gear=False)


@model('hero', **INF)
def hero(k):
    soldier(k, 'redBeret', 'rifle', 'pack', face_kw={'moustache': True},
            extra=lambda: k.box((0.016, 0.06, 0.13), (0.0, 0.0, 0.43), 'brass', rot=(0, 38, 0), name='bandolier'))


@model('commando', **INF)
def commando(k):
    soldier(k, 'cap', 'sniper', 'radio', trousers='black',
            extra=lambda: k.box((0.016, 0.06, 0.13), (0.0, 0.0, 0.43), 'leather', rot=(0, -38, 0), name='bandolier'))


@model('hound', **INF)
def hound(k):
    """Attack dog (a shepherd): deep chest, tucked waist, neck, wedge head and
    snout, upright ears and a tail; the four legs step in pairs."""
    v = [(0, -0.13, 0.205), (0, -0.04, 0.205), (0, 0.07, 0.215), (0, 0.13, 0.25), (0, 0.18, 0.29), (0, 0.235, 0.285), (0, 0.29, 0.268),
         (0, -0.18, 0.225), (0, -0.24, 0.18)]
    r = [(0.038, 0.044), (0.04, 0.042), (0.052, 0.062), (0.032, 0.036), (0.036, 0.04), (0.026, 0.028), (0.016, 0.017), (0.014, 0.014), (0.01, 0.01)]
    k.skin('dog', v, [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (5, 6), (0, 7), (7, 8)], r,
           lambda c: 'black' if c.y > 0.295 else ('fur' if c.z > 0.21 or c.y < -0.15 else 'leather'))
    for s_ in (1, -1):
        k.smooth(k.cyl(0.013, 0.05, (s_ * 0.022, 0.17, 0.335), 'fur', 'z', 6, r2=0.003, rot=(-12, s_ * 12, 0), name='earDog'))
        k.sphere(0.006, (s_ * 0.018, 0.225, 0.3), 'black', 6, 3, name='eyeDog')
    k.torus(0.034, 0.007, (0, 0.135, 0.255), 'uniform', 'y', 14, 5, name='collar').rotation_euler = (math.radians(-55), 0, 0)
    for name, legs_ in (('legL', [(-1, 1), (1, -1)]), ('legR', [(1, 1), (-1, -1)])):
        e = k.empty(name, (0, 0, 0.19))
        for sx, sy in legs_:
            x = sx * 0.032
            y = 0.07 if sy > 0 else -0.13
            pts = [(x, y, 0.2), (x, y - 0.01 * sy + (0.0 if sy > 0 else -0.03), 0.12), (x, y + (0.0 if sy > 0 else -0.01), 0.04), (x, y + 0.016, 0.012)]
            k.skin('dogLeg', pts, [(0, 1), (1, 2), (2, 3)], [(0.026, 0.034), (0.016, 0.018), (0.011, 0.012), (0.013, 0.016)], lambda c: 'fur', parent=e)
