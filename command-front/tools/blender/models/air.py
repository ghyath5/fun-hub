# Aircraft. Front is +y; z = 0 is the ground (landing gear touches it).
# Rotors (rotorN) spin about z, propellers (propN) about y.
import math

AIR = dict(maxEdge=0.2, ao=0.08)


def jet(k, L=1.0, span=0.8, tail=0.36, twin=False, delta=False, body='team', wing='team', canopy='glassDark', bombs=0, pods=0):
    """A jet fighter: fuselage, swept wings, tailplanes, fins, intakes and nozzles."""
    z = 0.16
    k.fuselage([(0.0, -0.5), (0.07, -0.47), (0.085, -0.3), (0.09, 0.05), (0.075, 0.3), (0.035, 0.45), (0.0, 0.52)], 0.0,
               (0, 0, z), body, 12, sx=1.15 if twin else 1.0, sz=0.85)
    k.sphere(0.06, (0, 0.24, z + 0.06), canopy, 10, 5, scale=(0.8, 2.2, 0.8))
    if delta:
        k.plate([(0.05, 0.28), (span / 2, -0.32), (span / 2 - 0.04, -0.4), (0.05, -0.42)], 0.025, z - 0.02, wing, bevel=0.006, top=0.92)
        k.plate([(-0.05, 0.28), (-0.05, -0.42), (-span / 2 + 0.04, -0.4), (-span / 2, -0.32)], 0.025, z - 0.02, wing, bevel=0.006, top=0.92)
    else:
        for s in (1, -1):
            pts = [(s * 0.06, 0.12), (s * span / 2, -0.12), (s * span / 2, -0.2), (s * 0.06, -0.14)]
            k.plate(pts if s > 0 else pts[::-1], 0.022, z - 0.02, wing, bevel=0.005, top=0.94)
            tp = [(s * 0.05, -0.32), (s * tail / 2, -0.44), (s * tail / 2, -0.49), (s * 0.05, -0.47)]
            k.plate(tp if s > 0 else tp[::-1], 0.016, z, wing, bevel=0.004)
    fins = (-0.06, 0.06) if twin else (0.0,)
    for x in fins:
        k.prism([(-0.48, 0.0), (-0.3, 0.0), (-0.4, 0.16), (-0.47, 0.16)], 0.014, (x, 0, z + 0.04), body, bevel=0.003)
    for s in (1, -1):
        k.box((0.06, 0.16, 0.06), (s * 0.085, 0.02, z - 0.01), 'teamDark', bevel=0.012)  # intakes
        k.box((0.04, 0.012, 0.045), (s * 0.085, 0.1, z - 0.01), 'black')
        k.light((s * span / 2, -0.15, z), 'redLamp' if s < 0 else 'greenLamp', 0.012)
    for x in ((-0.05, 0.05) if twin else (0.0,)):
        k.cyl(0.045, 0.06, (x, -0.52, z), 'steelDark', 'y', 10, r2=0.04)
        k.cyl(0.032, 0.012, (x, -0.555, z), 'fire', 'y', 10)
    for i in range(bombs):
        x = (i - (bombs - 1) / 2) * 0.1
        k.cyl(0.03, 0.18, (x * 1.8, -0.06, z - 0.07), 'olive', 'y', 8, bevel=0.01)
    for s in (1, -1):
        for j in range(pods):
            k.cyl(0.016, 0.14, (s * (0.18 + j * 0.08), -0.02, z - 0.045), 'white', 'y', 6)
            k.cyl(0.008, 0.03, (s * (0.18 + j * 0.08), 0.06, z - 0.045), 'redLamp', 'y', 6)
    # Gear: nose and two mains, touching the ground.
    for x, y in ((0, 0.3), (0.12, -0.12), (-0.12, -0.12)):
        k.cyl(0.006, z - 0.04, (x, y, (z - 0.04) / 2 + 0.02), 'steelDark', 'z', 5)
        k.cyl(0.022, 0.014, (x, y, 0.022), 'rubber', 'x', 8)


@model('migFighter', **AIR)
def mig_fighter(k):
    jet(k, span=0.84, tail=0.38, twin=True, pods=2)


@model('migInterceptor', **AIR)
def mig_interceptor(k):
    jet(k, span=0.64, delta=True, pods=1)


@model('migBomber', **AIR)
def mig_bomber(k):
    jet(k, span=1.06, tail=0.5, bombs=3, canopy='glass')


@model('harrier', **AIR)
def harrier(k):
    jet(k, span=0.78, tail=0.34, pods=1)
    for s in (1, -1):  # vectoring nozzles
        k.cyl(0.03, 0.05, (s * 0.12, -0.04, 0.12), 'steelDark', 'z', 8)


@model('eagleJet', **AIR)
def eagle_jet(k):
    jet(k, span=0.88, delta=True, twin=True, body='team', wing='dark', pods=1)


@model('attackPlane', **AIR)
def attack_plane(k):
    jet(k, span=1.06, tail=0.45, twin=True, pods=2)
    for s in (1, -1):
        k.cyl(0.06, 0.24, (s * 0.1, -0.3, 0.24), 'dark', 'y', 10, bevel=0.01)  # rear engines


@model('strikeJet', **AIR)
def strike_jet(k):
    jet(k, span=0.8, tail=0.38, pods=2)


@model('transportHeli', **AIR)
def transport_heli(k):
    """Coalition Transport Heli: twin tandem rotors over a long cabin."""
    k.fuselage([(0.0, -0.5), (0.12, -0.46), (0.16, -0.3), (0.16, 0.3), (0.14, 0.42), (0.08, 0.5), (0.0, 0.52)], 0.0,
               (0, 0, 0.26), 'team', 12, sx=1.0, sz=1.05)
    k.box((0.2, 0.2, 0.18), (0, -0.42, 0.42), 'teamDark', bevel=0.03)  # rear pylon
    k.box((0.14, 0.14, 0.1), (0, 0.38, 0.4), 'teamDark', bevel=0.02)
    k.sphere(0.09, (0, 0.44, 0.3), 'glassDark', 10, 5, scale=(1.3, 0.9, 0.8))
    for s in (1, -1):
        k.box((0.06, 0.5, 0.08), (s * 0.17, 0.0, 0.18), 'dark', bevel=0.012)  # sponsons
        for y in (-0.3, 0.3):
            k.cyl(0.01, 0.1, (s * 0.12, y, 0.06), 'steelDark', 'z', 5)
            k.cyl(0.03, 0.02, (s * 0.12, y, 0.03), 'rubber', 'x', 8)
        k.box((0.012, 0.3, 0.06), (s * 0.161, 0.05, 0.3), 'glassDark')  # windows
    k.rotor('rotor0', 0.5, 3, (0, 0.36, 0.5))
    k.rotor('rotor1', 0.5, 3, (0, -0.42, 0.54))


@model('attackHeli', **AIR)
def attack_heli(k):
    """Coalition Attack Heli: a slim gunship with stub wings and rocket pods."""
    k.fuselage([(0.0, -0.06), (0.1, -0.02), (0.12, 0.12), (0.09, 0.34), (0.0, 0.42)], 0.0, (0, 0, 0.26), 'team', 12, sx=0.8)
    k.sphere(0.08, (0, 0.22, 0.33), 'glassDark', 10, 5, scale=(0.8, 1.8, 0.8))
    k.fuselage([(0.06, -0.62), (0.04, -0.4), (0.06, -0.06)], 0.0, (0, 0, 0.3), 'team', 8)
    k.plate([(0.0, -0.58), (0.0, -0.64), (0.16, -0.64), (0.16, -0.6)], 0.012, 0.32, 'teamDark')
    k.plate([(0.0, -0.58), (-0.16, -0.6), (-0.16, -0.64), (0.0, -0.64)], 0.012, 0.32, 'teamDark')
    k.prism([(-0.64, 0.3), (-0.56, 0.3), (-0.6, 0.46), (-0.66, 0.46)], 0.012, (0, 0, 0), 'teamDark')
    for s in (1, -1):
        k.plate([(s * 0.06, 0.12), (s * 0.3, 0.1), (s * 0.3, 0.02), (s * 0.06, 0.0)][::(1 if s > 0 else -1)], 0.02, 0.26, 'teamDark', bevel=0.004)
        k.cyl(0.035, 0.18, (s * 0.24, 0.06, 0.22), 'dark', 'y', 8, bevel=0.008)  # rocket pods
        k.cyl(0.028, 0.012, (s * 0.24, 0.15, 0.22), 'black', 'y', 8)
        k.box((0.012, 0.3, 0.012), (s * 0.1, 0.06, 0.06), 'steelDark')  # skids
        for y in (-0.04, 0.16):
            k.cyl(0.006, 0.18, (s * 0.1, y, 0.15), 'steelDark', 'z', 5)
    k.cyl(0.012, 0.12, (0, 0.42, 0.2), 'gun', 'y', 6)  # chin gun
    k.box((0.08, 0.16, 0.08), (0, -0.04, 0.4), 'teamDark', bevel=0.016)
    k.rotor('rotor0', 0.58, 4, (0, 0.0, 0.46))
    tail = k.empty('prop0', (0.025, -0.62, 0.4))
    for a in (0, 90):
        k.box((0.008, 0.012, 0.14), (0.025, -0.62, 0.4), 'dark', parent=tail, rot=(0, a, 0))


@model('siegeChopper', **AIR)
def siege_chopper(k):
    """Union Siege Chopper: a heavy gunship with a big cannon under its nose."""
    k.fuselage([(0.0, -0.1), (0.13, -0.06), (0.15, 0.16), (0.12, 0.36), (0.0, 0.46)], 0.0, (0, 0, 0.28), 'team', 12, sx=0.9)
    k.sphere(0.09, (0, 0.26, 0.36), 'glassDark', 10, 5, scale=(0.9, 1.5, 0.8))
    k.fuselage([(0.07, -0.66), (0.05, -0.4), (0.08, -0.08)], 0.0, (0, 0, 0.32), 'team', 8)
    k.prism([(-0.68, 0.32), (-0.58, 0.32), (-0.62, 0.5), (-0.7, 0.5)], 0.014, (0, 0, 0), 'teamDark')
    for s in (1, -1):
        k.plate([(s * 0.08, 0.14), (s * 0.34, 0.12), (s * 0.34, 0.02), (s * 0.08, 0.0)][::(1 if s > 0 else -1)], 0.024, 0.27, 'teamDark', bevel=0.004)
        k.cyl(0.04, 0.2, (s * 0.28, 0.07, 0.23), 'dark', 'y', 8, bevel=0.008)
        k.cyl(0.05, 0.12, (s * 0.11, -0.04, 0.12), 'rubber', 'x', 10)  # wheels
    k.box((0.08, 0.24, 0.08), (0, 0.32, 0.16), 'steelDark', bevel=0.014)
    k.cyl(0.02, 0.2, (0, 0.5, 0.16), 'gun', 'y', 8)
    k.box((0.1, 0.18, 0.1), (0, -0.04, 0.44), 'teamDark', bevel=0.018)
    k.rotor('rotor0', 0.6, 5, (0, 0.0, 0.5))


@model('siegeAirship', maxEdge=0.25, ao=0.15)
def siege_airship(k):
    """Union Siege Airship: a vast armoured envelope, a bomb gondola, four propellers."""
    env = k.sphere(0.42, (0, 0.0, 0.95), 'team', 20, 10, scale=(1.0, 2.2, 0.85))
    for y in (-0.6, -0.3, 0.0, 0.3, 0.6):
        f = (1 - (y / 0.92) ** 2) ** 0.5
        k.torus(0.42 * f + 0.005, 0.014, (0, y, 0.95), 'teamDark', 'y', 22, 4).scale = (1, 1, 0.85)
    k.box((0.26, 0.66, 0.2), (0, 0.04, 0.5), 'dark', bevel=0.04)  # gondola
    k.box((0.18, 0.12, 0.08), (0, 0.38, 0.5), 'glass', bevel=0.02)
    for i in range(4):
        k.cyl(0.03, 0.04, (0, -0.2 + i * 0.12, 0.39), 'olive', 'z', 8)
    for s in (1, -1):
        k.plate([(s * 0.12, -0.78), (s * 0.48, -0.95), (s * 0.48, -1.03), (s * 0.12, -0.92)][::(1 if s > 0 else -1)], 0.02, 0.95, 'teamDark', bevel=0.006)
        for j, y in enumerate((-0.6, 0.1)):
            k.cyl(0.05, 0.18, (s * 0.36, y, 0.62), 'steel', 'y', 10, bevel=0.01)
            k.box((0.14, 0.04, 0.03), (s * 0.27, y, 0.66), 'steelDark')
            k.propeller(f'prop{j * 2 + (s > 0)}', 0.13, 3, (s * 0.36, y - 0.1, 0.62))
    k.prism([(-1.0, 1.2), (-0.8, 1.2), (-0.9, 1.5), (-1.02, 1.5)], 0.02, (0, 0, 0), 'teamDark')
    k.light((0, 0.92, 0.95), 'redLamp', 0.03)


@model('supportPlane', **AIR)
def support_plane(k):
    """Support plane (spy plane, paradrop): a four-engined high-wing cargo plane."""
    k.fuselage([(0.0, -0.62), (0.07, -0.55), (0.11, -0.3), (0.11, 0.4), (0.07, 0.58), (0.0, 0.64)], 0.0, (0, 0, 0.2), 'white', 12, sz=1.1)
    k.sphere(0.06, (0, 0.52, 0.27), 'glassDark', 8, 4, scale=(1.2, 1, 0.6))
    k.plate([(0.0, 0.14), (0.82, 0.02), (0.82, -0.06), (0.0, -0.04)], 0.03, 0.29, 'team', bevel=0.006, top=0.95)
    k.plate([(0.0, 0.14), (0.0, -0.04), (-0.82, -0.06), (-0.82, 0.02)], 0.03, 0.29, 'team', bevel=0.006, top=0.95)
    k.plate([(0.0, -0.5), (0.3, -0.58), (0.3, -0.64), (0.0, -0.62)], 0.016, 0.26, 'team')
    k.plate([(0.0, -0.5), (0.0, -0.62), (-0.3, -0.64), (-0.3, -0.58)], 0.016, 0.26, 'team')
    k.prism([(-0.62, 0.26), (-0.46, 0.26), (-0.56, 0.52), (-0.64, 0.52)], 0.02, (0, 0, 0), 'team')
    for i, x in enumerate((-0.56, -0.3, 0.3, 0.56)):
        k.cyl(0.05, 0.22, (x, 0.04, 0.27), 'steelDark', 'y', 10, bevel=0.01)
        k.propeller(f'prop{i}', 0.11, 3, (x, 0.16, 0.27))
    for x, y in ((0, 0.4), (0.12, -0.08), (-0.12, -0.08)):
        k.cyl(0.006, 0.1, (x, y, 0.07), 'steelDark', 'z', 5)
        k.cyl(0.025, 0.016, (x, y, 0.025), 'rubber', 'x', 8)
