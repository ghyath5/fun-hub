# Infantry: one soldier figure dressed per unit. Front is +y, about 0.62
# tall; legs (legL/legR) hang from hip empties and swing as they walk, and
# unarmed soldiers swing their arms (armL/armR) too. The coat takes the
# player's colour.
import math

HIP = 0.25
SHOULDER = 0.44


def leg(k, s, cloth, boots, parent):
    x = s * 0.055
    k.cyl(0.042, 0.13, (x, 0.0, HIP - 0.06), cloth, 'z', 8, r2=0.038, parent=parent, name='thigh')
    k.cyl(0.036, 0.12, (x, 0.0, HIP - 0.17), cloth, 'z', 8, r2=0.032, parent=parent, name='shin')
    k.box((0.06, 0.1, 0.045), (x, 0.015, 0.025), boots, bevel=0.012, parent=parent, name='boot')


def head(k, hat, skin='skin', face=None):
    k.cyl(0.03, 0.03, (0, 0.0, 0.5), skin, 'z', 8, name='neck')
    k.sphere(0.068, (0, 0.005, 0.56), skin, 12, 6, scale=(0.95, 1.0, 1.08), name='head')
    if face:
        face()
    if hat == 'helmet' or hat == 'helmetBlack' or hat == 'helmetWhite':
        mat = {'helmet': 'olive', 'helmetBlack': 'black', 'helmetWhite': 'white'}[hat]
        k.sphere(0.082, (0, -0.005, 0.585), mat, 12, 6, scale=(1, 1.05, 0.8), half=True, name='helmet')
        k.cyl(0.088, 0.012, (0, -0.005, 0.585), mat, 'z', 12, name='brim')
    elif hat == 'cap':
        k.sphere(0.072, (0, 0.0, 0.6), 'clothDark', 10, 5, scale=(1, 1, 0.6), half=True)
        k.box((0.08, 0.06, 0.012), (0, 0.075, 0.6), 'clothDark', bevel=0.004)
    elif hat == 'hardhat':
        k.sphere(0.08, (0, 0.0, 0.59), 'hazard', 12, 6, scale=(1, 1.05, 0.75), half=True)
        k.cyl(0.092, 0.01, (0, 0.01, 0.59), 'hazard', 'z', 12)
    elif hat == 'beret':
        k.sphere(0.075, (0.015, 0.0, 0.615), 'redLamp' if False else 'clothDark', 10, 4, scale=(1.05, 1, 0.45), half=True)
    elif hat == 'redBeret':
        k.sphere(0.075, (0.015, 0.0, 0.615), 'team', 10, 4, scale=(1.05, 1, 0.45), half=True)
    elif hat == 'fedora':
        k.cyl(0.1, 0.012, (0, 0, 0.61), 'black', 'z', 14)
        k.cyl(0.06, 0.06, (0, 0, 0.64), 'black', 'z', 12, r2=0.052)
    elif hat == 'ushanka':
        k.sphere(0.085, (0, 0.0, 0.6), 'leather', 12, 6, scale=(1.05, 1.05, 0.75), half=True)
        for s in (1, -1):
            k.box((0.03, 0.07, 0.07), (s * 0.075, 0.0, 0.555), 'leather', bevel=0.01)
    elif hat == 'gasmask':
        k.sphere(0.082, (0, -0.005, 0.585), 'clothDark', 12, 6, scale=(1, 1.05, 0.85), half=True)
        k.cyl(0.03, 0.05, (0, 0.08, 0.53), 'black', 'y', 8)
        for s in (1, -1):
            k.cyl(0.018, 0.012, (s * 0.03, 0.065, 0.575), 'glassDark', 'y', 8)
    elif hat == 'hood':
        k.sphere(0.08, (0, -0.01, 0.575), 'black', 12, 6, scale=(1, 1.05, 1.05))
        k.box((0.09, 0.02, 0.025), (0, 0.065, 0.57), 'glassDark')
    elif hat == 'psi':
        k.sphere(0.08, (0, -0.005, 0.585), 'steel', 12, 6, scale=(1, 1.05, 0.8), half=True)
        k.torus(0.07, 0.012, (0, -0.005, 0.62), 'psi', 'z', 14, 5)
        k.sphere(0.022, (0, 0.06, 0.62), 'psi', 8, 4)
    elif hat == 'chrono':
        k.sphere(0.084, (0, -0.005, 0.58), 'white', 12, 6, scale=(1, 1.05, 0.95))
        k.box((0.1, 0.03, 0.035), (0, 0.065, 0.575), 'chrono')
    elif hat == 'rad':
        k.sphere(0.085, (0, -0.005, 0.58), 'olive', 12, 6, scale=(1, 1.05, 0.95))
        k.box((0.09, 0.03, 0.04), (0, 0.07, 0.575), 'rad')
    elif hat == 'shock':
        k.sphere(0.086, (0, -0.005, 0.58), 'steelDark', 12, 6, scale=(1, 1.05, 0.95))
        k.box((0.09, 0.03, 0.03), (0, 0.07, 0.575), 'tesla')
        k.cyl(0.008, 0.08, (0.05, -0.04, 0.66), 'copper', 'z', 5)


def torso(k, coat, belt='leather', bulk=1.0):
    k.box((0.2 * bulk, 0.12 * bulk, 0.2), (0, 0.0, 0.37), coat, bevel=0.03, taper=(1.12, 1.05, 0.0), name='chest')
    k.box((0.18 * bulk, 0.11 * bulk, 0.04), (0, 0.0, 0.27), belt, bevel=0.012, name='belt')
    for s in (1, -1):
        k.sphere(0.045 * bulk, (s * 0.12 * bulk, 0.0, SHOULDER), coat, 8, 4, name='shoulder')


def arms_holding(k, coat, hand_y=0.15, hand_z=0.36, skin='skin'):
    """Both arms forward to a weapon held at the chest."""
    for s in (1, -1):
        sx, sy, sz = s * 0.12, 0.0, SHOULDER - 0.01
        hx, hy, hz = s * 0.05, hand_y, hand_z
        mx, my, mz = (sx + hx) / 2 + s * 0.03, (sy + hy) / 2 - 0.02, (sz + hz) / 2 - 0.03
        for (ax, ay, az), (bx, by, bz) in (((sx, sy, sz), (mx, my, mz)), ((mx, my, mz), (hx, hy, hz))):
            d = math.dist((ax, ay, az), (bx, by, bz))
            pitch = math.degrees(math.atan2(math.hypot(bx - ax, by - ay), az - bz))
            yaw = math.degrees(math.atan2(bx - ax, by - ay))
            k.cyl(0.032, d, ((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), coat, 'z', 6,
                  rot=(pitch, 0, -yaw), name='arm')
        k.sphere(0.026, (hx, hy, hz), skin, 6, 4, name='hand')


def arms_down(k, coat, skin='skin', carry=None):
    """Arms at the sides on shoulder pivots (armL/armR): they swing as he walks."""
    for name, s in (('armL', -1), ('armR', 1)):
        e = k.empty(name, (s * 0.13, 0.0, SHOULDER))
        k.cyl(0.032, 0.2, (s * 0.135, 0.0, SHOULDER - 0.1), coat, 'z', 6, parent=e, name='arm')
        k.sphere(0.028, (s * 0.135, 0.0, SHOULDER - 0.21), skin, 6, 4, parent=e, name='hand')
        if carry and s == 1:
            carry(e)


def weapon(k, kind):
    """Held weapons, pointing forward (+y) at the hands."""
    z = 0.36
    if kind == 'rifle':
        k.box((0.03, 0.34, 0.035), (0.05, 0.16, z), 'black', bevel=0.006)
        k.box((0.025, 0.05, 0.05), (0.05, 0.06, z - 0.03), 'leather', bevel=0.006)
        k.box((0.02, 0.04, 0.05), (0.05, 0.13, z - 0.04), 'black')
    elif kind == 'smg':
        k.box((0.035, 0.2, 0.04), (0.05, 0.12, z), 'black', bevel=0.008)
        k.box((0.022, 0.03, 0.06), (0.05, 0.12, z - 0.045), 'black')
    elif kind == 'pistol':
        k.box((0.025, 0.08, 0.03), (0.08, 0.12, z), 'black', bevel=0.006)
    elif kind == 'sniper':
        k.box((0.025, 0.46, 0.03), (0.05, 0.2, z), 'black', bevel=0.005)
        k.cyl(0.016, 0.1, (0.05, 0.12, z + 0.035), 'gun', 'y', 8)
        k.box((0.025, 0.08, 0.05), (0.05, 0.0, z - 0.02), 'leather', bevel=0.006)
    elif kind == 'tube':
        k.cyl(0.042, 0.46, (0.11, 0.0, 0.47), 'olive', 'y', 10)
        k.cyl(0.048, 0.04, (0.11, 0.22, 0.47), 'black', 'y', 10)
        k.box((0.03, 0.06, 0.04), (0.11, 0.06, 0.44), 'black')
    elif kind == 'big':
        k.box((0.06, 0.38, 0.06), (0.06, 0.18, z), 'steel', bevel=0.01)
        k.cyl(0.035, 0.08, (0.06, 0.4, z), 'dark', 'y', 10)
    elif kind == 'flak':
        k.box((0.06, 0.3, 0.07), (0.06, 0.14, z), 'steelDark', bevel=0.012)
        k.cyl(0.03, 0.18, (0.06, 0.36, z + 0.02), 'gun', 'y', 8)
        k.box((0.05, 0.08, 0.06), (0.06, 0.08, z - 0.06), 'olive', bevel=0.008)
    elif kind == 'flame':
        k.cyl(0.022, 0.3, (0.06, 0.18, z), 'steelDark', 'y', 8)
        k.cyl(0.03, 0.04, (0.06, 0.33, z), 'gun', 'y', 8)
        k.sphere(0.014, (0.06, 0.36, z), 'fire', 6, 3)
    elif kind == 'tesla':
        k.box((0.06, 0.26, 0.07), (0.06, 0.14, z), 'steelDark', bevel=0.012)
        for y in (0.2, 0.25, 0.3):
            k.torus(0.035, 0.009, (0.06, y, z), 'copper', 'y', 10, 4)
        k.sphere(0.024, (0.06, 0.34, z), 'tesla', 8, 4)
    elif kind == 'rad':
        k.box((0.06, 0.32, 0.07), (0.06, 0.16, z), 'olive', bevel=0.012)
        k.cyl(0.02, 0.06, (0.06, 0.34, z), 'rad', 'y', 8)
    elif kind == 'chrono':
        k.box((0.06, 0.34, 0.06), (0.06, 0.16, z), 'white', bevel=0.012)
        k.cyl(0.03, 0.03, (0.06, 0.34, z), 'chrono', 'y', 10)
    elif kind == 'guard':
        k.cyl(0.04, 0.4, (0.1, 0.06, 0.46), 'steelDark', 'y', 10)
        k.cyl(0.045, 0.04, (0.1, 0.26, 0.46), 'redLamp', 'y', 10)


def back(k, kind):
    if kind == 'pack':
        k.box((0.16, 0.08, 0.17), (0, -0.1, 0.38), 'khaki', bevel=0.02)
        k.cyl(0.03, 0.14, (0, -0.1, 0.48), 'olive', 'x', 8)  # bedroll
    elif kind == 'radio':
        k.box((0.15, 0.08, 0.18), (0, -0.1, 0.38), 'olive', bevel=0.016)
        k.antenna((0.05, -0.12, 0.47), 0.2)
    elif kind == 'tanks':
        for s in (1, -1):
            k.cyl(0.045, 0.22, (s * 0.05, -0.1, 0.38), 'redLamp' if False else 'hazard', 'z', 10, bevel=0.012)
        k.cyl(0.012, 0.18, (0.08, 0.02, 0.32), 'black', 'y', 6)
    elif kind == 'jet':
        k.box((0.18, 0.08, 0.2), (0, -0.1, 0.4), 'steel', bevel=0.02)
        for s in (1, -1):
            k.cyl(0.04, 0.16, (s * 0.07, -0.14, 0.33), 'steelDark', 'z', 10, r2=0.032)
            k.cyl(0.026, 0.02, (s * 0.07, -0.14, 0.245), 'fire', 'z', 8)
        k.box((0.36, 0.05, 0.02), (0, -0.12, 0.47), 'team', bevel=0.006)  # little wings
    elif kind == 'medkit':
        k.box((0.16, 0.08, 0.15), (0, -0.1, 0.38), 'white', bevel=0.016)
        k.box((0.1, 0.012, 0.03), (0, -0.142, 0.39), 'redLamp')
        k.box((0.03, 0.012, 0.1), (0, -0.142, 0.39), 'redLamp')
    elif kind == 'chrono':
        k.box((0.16, 0.08, 0.2), (0, -0.1, 0.39), 'white', bevel=0.02)
        k.sphere(0.05, (0, -0.15, 0.4), 'chrono', 10, 5)
    elif kind == 'rad':
        k.cyl(0.06, 0.2, (0, -0.11, 0.39), 'olive', 'z', 10, bevel=0.016)
        k.cyl(0.035, 0.03, (0, -0.11, 0.5), 'rad', 'z', 10)
    elif kind == 'tesla':
        k.box((0.18, 0.09, 0.2), (0, -0.1, 0.39), 'steelDark', bevel=0.02)
        for s in (1, -1):
            k.cyl(0.02, 0.1, (s * 0.05, -0.1, 0.52), 'copper', 'z', 8)
            k.sphere(0.02, (s * 0.05, -0.1, 0.58), 'tesla', 6, 3)
    elif kind == 'bombs':
        k.box((0.18, 0.06, 0.04), (0, 0.065, 0.36), 'leather', bevel=0.006)
        for x in (-0.06, 0.0, 0.06):
            k.cyl(0.022, 0.08, (x, 0.08, 0.36), 'redLamp' if False else 'dark', 'z', 8)
            k.sphere(0.008, (x, 0.1, 0.4), 'redLamp', 6, 3)
        k.box((0.14, 0.08, 0.15), (0, -0.1, 0.37), 'leather', bevel=0.014)
    elif kind == 'bag':
        k.sphere(0.09, (0, -0.11, 0.36), 'leather', 10, 5, scale=(0.9, 0.7, 1))


def soldier(k, hat='helmet', gun='rifle', pack='pack', coat='team', cloth='cloth', boots='black', extra=None, bulk=1.0):
    for name, s in (('legL', -1), ('legR', 1)):
        e = k.empty(name, (s * 0.055, 0.0, HIP))
        leg(k, s, cloth, boots, e)
    torso(k, coat, bulk=bulk)
    head(k, hat)
    if gun in (None, 'none'):
        arms_down(k, coat)
    elif gun == 'pistol':
        arms_down(k, coat, carry=lambda e: k.box((0.025, 0.08, 0.03), (0.135, 0.04, SHOULDER - 0.21), 'black', parent=e))
    else:
        arms_holding(k, coat, hand_z=0.36 if gun not in ('tube', 'guard') else 0.42)
        weapon(k, gun)
    if pack:
        back(k, pack)
    if extra:
        extra()


INF = dict(maxEdge=1.0, ao=0.06, aoStrength=0.7)


@model('rifleman', **INF)
def rifleman(k):
    soldier(k, 'helmet', 'rifle', 'pack')


@model('rocketTrooper', **INF)
def rocket_trooper(k):
    soldier(k, 'helmet', 'tube', 'pack')


@model('engineer', **INF)
def engineer(k):
    soldier(k, 'hardhat', None, None, extra=lambda: (
        k.box((0.16, 0.08, 0.14), (0, -0.1, 0.38), 'hazard', bevel=0.016),
        k.box((0.06, 0.02, 0.1), (0.0, 0.07, 0.37), 'hazard', bevel=0.004),  # vest stripe
    ))
    # A toolbox in the right hand.
    k.box((0.06, 0.1, 0.06), (0.135, 0.0, SHOULDER - 0.25), 'redLamp' if False else 'hazard', bevel=0.008)


@model('grenadier', **INF)
def grenadier(k):
    soldier(k, 'ushanka', 'smg', 'bag', extra=lambda: [
        k.sphere(0.022, (x, 0.07, 0.29), 'olive', 8, 4) for x in (-0.06, -0.02, 0.02)])


@model('flameTrooper', **INF)
def flame_trooper(k):
    soldier(k, 'gasmask', 'flame', 'tanks')


@model('medic', **INF)
def medic(k):
    soldier(k, 'helmetWhite', None, 'medkit', extra=lambda: (
        k.box((0.06, 0.012, 0.02), (0, 0.072, 0.4), 'redLamp'),
        k.box((0.02, 0.012, 0.06), (0, 0.072, 0.4), 'redLamp')))


@model('spy', **INF)
def spy(k):
    soldier(k, 'fedora', 'pistol', None, coat='team', cloth='black', extra=lambda: (
        k.box((0.04, 0.012, 0.1), (0, 0.068, 0.39), 'white'),
        k.box((0.016, 0.014, 0.08), (0, 0.072, 0.38), 'redLamp' if False else 'black')))


@model('thief', **INF)
def thief(k):
    soldier(k, 'hood', None, 'bag', coat='team', cloth='black')


@model('guardTrooper', **INF)
def guard_trooper(k):
    soldier(k, 'helmet', 'guard', 'radio')


@model('marksman', **INF)
def marksman(k):
    soldier(k, 'beret', 'sniper', 'pack', cloth='olive')


@model('shockTrooper', **INF)
def shock_trooper(k):
    soldier(k, 'shock', 'tesla', 'tesla', coat='team', cloth='steelDark', boots='dark', bulk=1.25)


@model('flakTrooper', **INF)
def flak_trooper(k):
    soldier(k, 'helmet', 'flak', 'pack')


@model('seal', **INF)
def seal(k):
    soldier(k, 'helmetBlack', 'smg', 'radio', cloth='black', extra=lambda: k.box((0.06, 0.04, 0.1), (-0.1, -0.1, 0.38), 'hazard', bevel=0.008))


@model('chronoTrooper', **INF)
def chrono_trooper(k):
    soldier(k, 'chrono', 'chrono', 'chrono', cloth='white', boots='steelDark', bulk=1.1)


@model('rocketeer', **INF)
def rocketeer(k):
    soldier(k, 'helmet', 'smg', 'jet')


@model('desolator', **INF)
def desolator(k):
    soldier(k, 'rad', 'rad', 'rad', cloth='olive', bulk=1.15)


@model('ivan', **INF)
def ivan(k):
    soldier(k, 'ushanka', None, 'bombs', cloth='clothDark')
    k.box((0.07, 0.02, 0.05), (0, 0.06, 0.515), 'leather', bevel=0.01)  # beard


@model('psiCommander', **INF)
def psi_commander(k):
    soldier(k, 'psi', 'pistol', None, cloth='clothDark', extra=lambda: k.box((0.22, 0.04, 0.3), (0, -0.07, 0.34), 'team', bevel=0.01, taper=(1.3, 1, 0)))


@model('hero', **INF)
def hero(k):
    soldier(k, 'redBeret', 'rifle', 'pack', extra=lambda: k.box((0.03, 0.13, 0.26), (0.0, 0.0, 0.37), 'brass', rot=(0, 35, 0)))


@model('commando', **INF)
def commando(k):
    soldier(k, 'cap', 'sniper', 'radio', cloth='black', extra=lambda: k.box((0.03, 0.13, 0.26), (0.0, 0.0, 0.37), 'leather', rot=(0, -35, 0)))


@model('hound', **INF)
def hound(k):
    """Attack dog: four legs on two pivots step in pairs."""
    k.cyl(0.075, 0.36, (0, 0.0, 0.25), 'leather', 'y', 10, bevel=0.02).scale = (0.9, 1, 1.05)
    k.sphere(0.075, (0, 0.21, 0.31), 'leather', 10, 5)
    k.box((0.06, 0.1, 0.05), (0, 0.29, 0.29), 'leather', bevel=0.016)
    k.sphere(0.016, (0, 0.34, 0.3), 'black', 6, 3)
    for s in (1, -1):
        k.cone = None
        k.cyl(0.022, 0.06, (s * 0.04, 0.2, 0.38), 'leather', 'z', 5, r2=0.004)
    k.torus(0.06, 0.014, (0, 0.17, 0.3), 'team', 'y', 12, 5)
    k.cyl(0.012, 0.16, (0, -0.24, 0.32), 'leather', 'y', 5, r2=0.005, rot=(-60, 0, 0))
    for name, legs in (('legL', [(-1, 1), (1, -1)]), ('legR', [(1, 1), (-1, -1)])):
        e = k.empty(name, (0, 0, 0.22))
        for sx, sy in legs:
            k.cyl(0.022, 0.2, (sx * 0.045, sy * 0.13, 0.11), 'leather', 'z', 6, r2=0.016, parent=e)
            k.box((0.035, 0.05, 0.02), (sx * 0.045, sy * 0.13 + 0.015, 0.01), 'leather', parent=e)
