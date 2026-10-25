# Defences on their footprint (kit.at); turrets hang under a `turret` empty
# at their ring. They are modelled aiming south and turned to aim north, the
# game's turret angle 0.
import math

DEF = dict(maxEdge=0.3, ao=0.15, aoStrength=0.8)


def bunker_base(k, w, h, r=None, mat='concrete'):
    t = k.foundation(w, h, 'concreteDark')
    return t


@model('gunTurret', **DEF)
def gun_turret(k):
    """Coalition Gun Turret: an armoured cannon turret on a concrete drum."""
    t = bunker_base(k, 1, 1)
    k.cyl(0.4, 0.2, (0.5, -0.5, t + 0.1), 'concrete', 'z', 16, bevel=0.02)
    k.torus(0.4, 0.02, (0.5, -0.5, t + 0.19), 'hazard', 'z', 24, 4)
    tur = k.empty('turret', (0.5, -0.5, t + 0.2))
    k.cyl(0.24, 0.05, (0.5, -0.5, t + 0.225), 'steelDark', 'z', 14, parent=tur)
    k.box((0.36, 0.38, 0.16), (0.5, -0.47, t + 0.33), 'team', bevel=0.03, parent=tur, taper=(0.82, 0.8, 0.0))
    k.box((0.14, 0.08, 0.12), (0.5, -0.69, t + 0.32), 'steelDark', bevel=0.02, parent=tur)
    k.cyl(0.028, 0.36, (0.5, -0.88, t + 0.32), 'gun', 'y', 10, parent=tur)
    k.box((0.07, 0.05, 0.05), (0.5, -1.04, t + 0.32), 'gun', bevel=0.01, parent=tur)
    k.hatch((0.42, -0.38, t + 0.41), 0.05, parent=tur)
    tur.rotation_euler.z = math.pi


@model('longGun', **DEF)
def long_gun(k):
    """Coalition Long Gun (2 × 2): a great cannon in a turning casemate."""
    t = bunker_base(k, 2, 2)
    k.lathe([(0.82, t), (0.82, t + 0.12), (0.72, t + 0.24), (0.0, t + 0.24)], (1.0, -1.0, 0), 'concrete', 20)
    for a in range(8):
        x, y = 1.0 + 0.78 * math.cos(a * math.pi / 4), 1.0 + 0.78 * math.sin(a * math.pi / 4)
        k.light((x, -y, t + 0.14), 'lamp', 0.02)
    tur = k.empty('turret', (1.0, -1.0, t + 0.24))
    k.cyl(0.5, 0.06, (1.0, -1.0, t + 0.27), 'steelDark', 'z', 18, parent=tur)
    k.box((0.7, 0.78, 0.3), (1.0, -0.9, t + 0.45), 'team', bevel=0.05, parent=tur, taper=(0.82, 0.8, 0.02))
    k.box((0.3, 0.14, 0.24), (1.0, -1.34, t + 0.45), 'steelDark', bevel=0.03, parent=tur)
    k.cyl(0.07, 0.62, (1.0, -1.7, t + 0.46), 'gun', 'y', 12, parent=tur)
    k.cyl(0.055, 0.04, (1.0, -1.94, t + 0.46), 'gun', 'y', 12, r2=0.06, parent=tur)
    k.box((0.5, 0.18, 0.06), (1.0, -0.5, t + 0.62), 'teamDark', bevel=0.012, parent=tur)
    k.hatch((0.78, -0.68, t + 0.62), 0.06, parent=tur)
    k.antenna((1.25, -0.52, t + 0.6), 0.3, parent=tur)
    tur.rotation_euler.z = math.pi


@model('camoPillbox', **DEF)
def camo_pillbox(k):
    """Coalition Camo Pillbox: a low bunker under netting and foliage."""
    t = bunker_base(k, 1, 1)
    k.cyl(0.38, 0.2, (0.5, -0.5, t + 0.1), 'concreteDark', 'z', 10, r2=0.32, bevel=0.02)
    k.box((0.3, 0.04, 0.05), (0.5, -0.84, t + 0.12), 'black')
    k.sphere(0.4, (0.5, -0.48, t + 0.16), 'grass', 10, 5, scale=(1, 1, 0.5), half=True)
    for x, y, r in ((0.25, 0.3, 0.14), (0.72, 0.35, 0.12), (0.5, 0.25, 0.1), (0.3, 0.68, 0.11), (0.74, 0.66, 0.12)):
        k.sphere(r, (x, -y, t + 0.24), 'olive', 8, 4, scale=(1, 1, 0.7))
    k.cyl(0.012, 0.14, (0.5, -0.88, t + 0.12), 'gun', 'y', 6)


@model('shroudGenerator', **DEF)
def shroud_generator(k):
    """Coalition Shroud Generator: a tower under a slowly turning dark ring."""
    t = bunker_base(k, 1, 1)
    k.cyl(0.3, 0.12, (0.5, -0.5, t + 0.06), 'concrete', 'z', 12, bevel=0.02)
    k.cyl(0.08, 0.8, (0.5, -0.5, t + 0.5), 'steelDark', 'z', 10, r2=0.06)
    for a in range(3):
        ang = a * 2 * math.pi / 3
        k.box((0.03, 0.12, 0.5), (0.5 + 0.1 * math.cos(ang), -0.5 - 0.1 * math.sin(ang), t + 0.37), 'team', bevel=0.008,
              rot=(0, 0, -math.degrees(ang) + 90))  # fins up the mast
    e = k.empty('spin0', (0.5, -0.5, t + 0.72))
    k.torus(0.3, 0.035, (0.5, -0.5, t + 0.72), 'dark', 'z', 24, 5, parent=e)
    for a in range(4):
        ang = a * math.pi / 2
        k.box((0.26, 0.02, 0.02), (0.5 + 0.15 * math.cos(ang), -0.5 - 0.15 * math.sin(ang), t + 0.72), 'steelDark', parent=e, rot=(0, 0, math.degrees(ang)))
        k.sphere(0.03, (0.5 + 0.3 * math.cos(ang), -0.5 - 0.3 * math.sin(ang), t + 0.72), 'psi', 8, 4, parent=e)
    k.sphere(0.07, (0.5, -0.5, t + 0.92), 'psi', 10, 5)


@model('flameTower', **DEF)
def flame_tower(k):
    """Union Flame Tower: a squat tower with fuel tanks and a nozzle."""
    t = bunker_base(k, 1, 1)
    k.cyl(0.34, 0.36, (0.5, -0.5, t + 0.18), 'concrete', 'z', 10, r2=0.28, bevel=0.02)
    k.cyl(0.3, 0.05, (0.5, -0.5, t + 0.385), 'team', 'z', 10)
    for x in (0.28, 0.72):
        k.cyl(0.08, 0.3, (x, -0.24, t + 0.55), 'hazard', 'z', 10, bevel=0.02)
        k.torus(0.08, 0.01, (x, -0.24, t + 0.6), 'dark', 'z', 10, 4)
    k.box((0.16, 0.2, 0.12), (0.5, -0.6, t + 0.46), 'steelDark', bevel=0.02)
    k.cyl(0.04, 0.24, (0.5, -0.8, t + 0.46), 'gun', 'y', 10)
    k.sphere(0.022, (0.5, -0.93, t + 0.46), 'fire', 8, 4)
    k.pipe_run([(0.28, 0.24, 0.5), (0.4, 0.5, 0.5)], 0.02)
    k.pipe_run([(0.72, 0.24, 0.5), (0.6, 0.5, 0.5)], 0.02)


@model('samSite', **DEF)
def sam_site(k):
    """Union SAM Site (2 × 1): a missile rack raised beside a radar."""
    t = bunker_base(k, 2, 1)
    k.slab(0.15, 0.15, 1.85, 0.85, t, 0.14, 'concrete', bevel=0.02)
    k.box((0.6, 0.36, 0.08), (0.75, -0.5, 0.18), 'steelDark', bevel=0.02)
    for s in (-1, 1):
        k.box((0.04, 0.2, 0.2), (0.75 + s * 0.24, -0.5, 0.28), 'steelDark')
    for i in range(3):
        for j in range(2):
            x = 0.6 + i * 0.15
            k.cyl(0.05, 0.56, (x, -0.5, 0.36 + j * 0.11), 'olive', 'y', 10, rot=(60, 0, 0))
            k.cyl(0.03, 0.06, (x, -0.5 - 0.28 * math.cos(math.radians(30)), 0.36 + j * 0.11 + 0.28 * math.sin(math.radians(30))), 'redLamp', 'y', 8, rot=(60, 0, 0))
    k.slab(1.35, 0.2, 1.8, 0.8, 0.14, 0.4, 'team', bevel=0.02)
    k.radar_dish('spin0', 1.57, 0.5, 0.4, 0.14)
    for x in (0.2, 1.8):
        k.light((x, -0.9, t + 0.02), 'redLamp', 0.02)
