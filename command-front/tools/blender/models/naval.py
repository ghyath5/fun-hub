# Ships. Front is +y; the hull sits on z = 0 (the waterline is the water's
# surface in game).
import math

SEA = dict(maxEdge=0.2, ao=0.1)


def ship_hull(k, L, W, h, mat='team'):
    """A pointed bow, straight sides and a transom stern; returns the deck height."""
    half = W / 2
    pts = [(-half, -L / 2), (half, -L / 2), (half, L * 0.22), (half * 0.55, L * 0.42), (0, L / 2), (-half * 0.55, L * 0.42), (-half, L * 0.22)]
    k.plate([(x * 0.86, y * 0.98) for x, y in pts], h * 0.45, 0, 'dark', top=None)
    k.plate(pts, h * 0.55, h * 0.45, mat, bevel=0.01, top=None)
    k.plate([(x * 0.92, y * 0.95) for x, y in pts], 0.012, h, 'concreteDark')  # deck
    k.plate([(x * 1.01, y * 1.0) for x, y in pts], 0.014, h * 0.42, 'white')  # boot stripe
    return h + 0.012


def superstructure(k, w, l, h, y, z, mat='white'):
    k.box((w, l, h), (0, y, z + h / 2), mat, bevel=0.014)
    k.box((w * 0.86, 0.012, h * 0.3), (0, y + l / 2, z + h * 0.7), 'glassDark')


def mast(k, y, z, h):
    k.cyl(0.012, h, (0, y, z + h / 2), 'steelDark', 'z', 6)
    k.box((0.16, 0.012, 0.012), (0, y, z + h * 0.75), 'steelDark')
    k.light((0, y, z + h), 'redLamp', 0.014)


def gun_turret(k, y, z, r, barrels=1, length=0.24, name='turret'):
    tur = k.empty(name, (0, y, z))
    k.cyl(r, 0.03, (0, y, z + 0.015), 'steelDark', 'z', 12, parent=tur)
    k.box((r * 1.6, r * 1.9, r * 0.9), (0, y - r * 0.1, z + 0.03 + r * 0.45), 'steel', bevel=r * 0.25, parent=tur, taper=(0.86, 0.8, -r * 0.1))
    gun = k.empty('barrel', (0, y + r * 0.8, z + 0.03 + r * 0.45), parent=tur)
    for i in range(barrels):
        x = (i - (barrels - 1) / 2) * r * 0.55
        k.cyl(r * 0.16, length, (x, y + r * 0.8 + length / 2, z + 0.03 + r * 0.45), 'gun', 'y', 8, parent=gun)
    return tur


@model('gunboat', **SEA)
def gunboat(k):
    d = ship_hull(k, 1.0, 0.34, 0.14)
    superstructure(k, 0.2, 0.26, 0.12, -0.06, d)
    mast(k, -0.08, d + 0.12, 0.18)
    k.box((0.24, 0.12, 0.04), (0, -0.36, d + 0.02), 'steelDark', bevel=0.008)  # depth charge rack
    for x in (-0.06, 0.06):
        k.cyl(0.03, 0.08, (x, -0.38, d + 0.06), 'dark', 'y', 8)
    gun_turret(k, 0.22, d, 0.07, 1, 0.2)


@model('destroyer', **SEA)
def destroyer(k):
    d = ship_hull(k, 1.0, 0.3, 0.14)
    superstructure(k, 0.18, 0.3, 0.1, -0.02, d)
    superstructure(k, 0.13, 0.12, 0.08, 0.02, d + 0.1)
    k.cyl(0.04, 0.12, (0, -0.2, d + 0.06), 'dark', 'z', 10, bevel=0.008)  # funnel
    mast(k, -0.02, d + 0.18, 0.16)
    k.lathe([(0.0, 0.0), (0.05, 0.015), (0.06, 0.03), (0.0, 0.02)], (0, 0.04, d + 0.2), 'white', 12)  # sonar dome
    k.box((0.1, 0.1, 0.05), (0, -0.36, d + 0.025), 'steelDark', bevel=0.008)  # AA mount
    k.cyl(0.01, 0.1, (0.0, -0.32, d + 0.06), 'gun', 'y', 6)
    gun_turret(k, 0.26, d, 0.065, 2, 0.2)


@model('cruiser', **SEA)
def cruiser(k):
    d = ship_hull(k, 1.0, 0.27, 0.13)
    superstructure(k, 0.16, 0.26, 0.1, 0.0, d)
    superstructure(k, 0.12, 0.12, 0.08, 0.02, d + 0.1)
    for y in (-0.14, -0.22):
        k.cyl(0.03, 0.1, (0, y, d + 0.05), 'dark', 'z', 10)
    mast(k, 0.0, d + 0.18, 0.18)
    sp = k.empty('spin0', (0.0, -0.06, d + 0.24))
    k.box((0.14, 0.012, 0.05), (0.0, -0.06, d + 0.24), 'steel', parent=sp)
    for i in range(3):
        for j in range(2):
            k.box((0.04, 0.04, 0.012), (-0.04 + j * 0.08, -0.32 - i * 0.05, d + 0.006), 'dark')  # missile cells
    gun_turret(k, 0.2, d, 0.06, 3, 0.18)


@model('submarine', **SEA)
def submarine(k):
    k.fuselage([(0.0, -0.5), (0.05, -0.44), (0.12, -0.25), (0.13, 0.2), (0.1, 0.38), (0.0, 0.48)], 0.0, (0, 0, 0.1), 'dark', 14, sx=1.25, sz=0.8)
    k.box((0.08, 0.22, 0.14), (0, 0.04, 0.24), 'team', bevel=0.02, taper=(0.8, 0.7, -0.02))  # sail
    k.plate([(0.0, 0.08), (0.14, 0.06), (0.14, 0.02), (0.0, 0.02)], 0.01, 0.26, 'team')
    k.plate([(0.0, 0.08), (0.0, 0.02), (-0.14, 0.02), (-0.14, 0.06)], 0.01, 0.26, 'team')
    k.cyl(0.006, 0.1, (0.02, 0.06, 0.36), 'steel', 'z', 5)
    for s in (1, -1):
        k.plate([(s * 0.04, -0.4), (s * 0.18, -0.46), (s * 0.18, -0.49), (s * 0.04, -0.47)][::(1 if s > 0 else -1)], 0.01, 0.1, 'dark')
    k.prism([(-0.48, 0.1), (-0.4, 0.1), (-0.45, 0.24), (-0.49, 0.24)], 0.01, (0, 0, 0), 'dark')
    k.propeller('prop0', 0.06, 5, (0, -0.52, 0.1))
    for y in (-0.2, 0.0, 0.2):
        k.box((0.05, 0.03, 0.006), (0, y + 0.0, 0.198), 'team')  # missile hatches (centreline)


@model('navalTransport', **SEA)
def naval_transport(k):
    """Hovercraft: rubber skirt, cargo deck, bow ramp, cab and two ducted fans."""
    k.box((0.56, 1.0, 0.1), (0, 0, 0.05), 'rubber', bevel=0.04)
    k.box((0.5, 0.92, 0.1), (0, 0, 0.15), 'team', bevel=0.02)
    k.box((0.4, 0.6, 0.012), (0, 0.06, 0.205), 'dark')
    for s in (1, -1):
        k.box((0.04, 0.6, 0.06), (s * 0.22, 0.06, 0.23), 'teamDark', bevel=0.008)
    k.box((0.42, 0.14, 0.03), (0, 0.48, 0.18), 'teamDark', bevel=0.006, rot=(20, 0, 0))  # bow ramp
    k.box((0.16, 0.16, 0.14), (0.16, -0.32, 0.27), 'white', bevel=0.02)
    k.box((0.12, 0.012, 0.04), (0.16, -0.24, 0.3), 'glassDark')
    for i, s in enumerate((-1, 1)):
        k.torus(0.1, 0.02, (s * 0.14, -0.46, 0.32), 'dark', 'y', 16, 5)
        k.box((0.012, 0.02, 0.22), (s * 0.14, -0.46, 0.32), 'steelDark')
        k.propeller(f'prop{i}', 0.09, 4, (s * 0.14, -0.44, 0.32))
