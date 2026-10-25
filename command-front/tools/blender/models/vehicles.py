# Wheeled and other ground vehicles. Front is +y; wheels sit on axle empties
# (wheelN) so they roll in game.
import math


def truck_cab(k, w, l, h, y, z, mat='team', glass=True):
    """A cab block with a sloped windscreen."""
    k.box((w, l, h), (0, y, z + h / 2), mat, bevel=0.018, taper=(0.92, 0.82, -l * 0.06))
    if glass:
        k.box((w * 0.8, 0.012, h * 0.4), (0, y + l * 0.36, z + h * 0.66), 'glassDark', rot=(-28, 0, 0))
        for s in (1, -1):
            k.box((0.012, l * 0.4, h * 0.32), (s * w * 0.455, y + l * 0.05, z + h * 0.66), 'glassDark')


@model('ranger')
def ranger(k):
    """Coalition Ranger: a fast armoured jeep with a pintle machine gun."""
    k.axles([0.27, -0.25], 0.22, 0.1, 0.08)
    k.box((0.42, 0.86, 0.1), (0, 0.0, 0.15), 'teamDark', bevel=0.014)  # chassis
    k.box((0.44, 0.3, 0.08), (0, 0.27, 0.23), 'team', bevel=0.02, taper=(0.94, 0.9, -0.01))  # bonnet
    k.grille(0.43, 1, 0.24, 0.2, step=0.02)
    for s in (1, -1):
        k.box((0.1, 0.24, 0.03), (s * 0.24, 0.27, 0.2), 'team', bevel=0.008)  # wheel arches
        k.box((0.1, 0.24, 0.03), (s * 0.24, -0.25, 0.2), 'team', bevel=0.008)
        k.light((s * 0.15, 0.43, 0.22), 'lamp', 0.018)
        k.box((0.1, 0.08, 0.08), (s * 0.08, 0.0, 0.25), 'dark', bevel=0.012)  # seats
    k.box((0.4, 0.012, 0.1), (0, 0.11, 0.3), 'glassDark', rot=(-25, 0, 0))
    k.box((0.42, 0.34, 0.04), (0, -0.2, 0.22), 'team', bevel=0.01)  # rear bed
    for s in (1, -1):
        k.cyl(0.01, 0.2, (s * 0.19, -0.06, 0.32), 'steel', 'z', 6)  # roll bar
    k.box((0.4, 0.02, 0.02), (0, -0.06, 0.42), 'steel')
    k.cyl(0.06, 0.12, (0, -0.48, 0.24), 'rubber', 'y', 12, bevel=0.01)  # spare wheel
    k.antenna((-0.18, -0.36, 0.24), 0.26)
    tur = k.empty('turret', (0, -0.18, 0.24))
    k.cyl(0.014, 0.14, (0, -0.18, 0.31), 'steel', 'z', 6, parent=tur)
    k.box((0.12, 0.012, 0.07), (0, -0.1, 0.4), 'steelDark', parent=tur)  # gun shield
    gun = k.empty('barrel', (0, -0.16, 0.39), parent=tur)
    k.box((0.04, 0.12, 0.04), (0, -0.18, 0.39), 'gun', bevel=0.006, parent=gun)
    k.cyl(0.008, 0.18, (0, -0.03, 0.39), 'gun', 'y', 6, parent=gun)
    k.box((0.03, 0.04, 0.05), (0.035, -0.2, 0.38), 'olive', parent=gun)  # ammo box


@model('mcv')
def mcv(k):
    """Mobile Construction Vehicle: a heavy six-wheeler with a folded crane and dish."""
    k.axles([0.32, 0.02, -0.28], 0.28, 0.12, 0.1, verts=14)
    k.box((0.56, 1.0, 0.14), (0, 0.0, 0.19), 'teamDark', bevel=0.016)
    for s in (1, -1):
        k.box((0.12, 0.92, 0.035), (s * 0.29, 0.02, 0.27), 'team', bevel=0.008)  # wheel covers
        k.light((s * 0.18, 0.49, 0.27), 'lamp', 0.02)
    truck_cab(k, 0.5, 0.24, 0.22, 0.36, 0.26)
    k.light((0.0, 0.35, 0.49), 'redLamp', 0.016)
    k.box((0.6, 0.62, 0.26), (0, -0.16, 0.39), 'team', bevel=0.024)  # module
    k.box((0.48, 0.5, 0.03), (0, -0.16, 0.53), 'teamDark', bevel=0.008)
    k.box((0.62, 0.05, 0.06), (0, -0.48, 0.3), 'hazard', bevel=0.006)
    for x in (-0.31, 0.31):
        k.box((0.012, 0.5, 0.04), (x, -0.16, 0.45), 'hazard')
    # Folded crane along the roof.
    k.box((0.06, 0.6, 0.06), (0.17, -0.1, 0.58), 'hazard', bevel=0.01)
    k.box((0.1, 0.1, 0.1), (0.17, -0.42, 0.58), 'steelDark', bevel=0.014)
    k.cyl(0.012, 0.1, (0.17, 0.22, 0.55), 'black', 'z', 6)
    # Radar dish and a satellite uplink box.
    k.cyl(0.02, 0.06, (-0.15, -0.3, 0.58), 'steel', 'z', 8)
    k.lathe([(0.0, 0.0), (0.09, 0.025), (0.11, 0.05), (0.0, 0.03)], (-0.15, -0.3, 0.61), 'white', 14)
    k.box((0.14, 0.12, 0.06), (-0.15, -0.04, 0.575), 'steelDark', bevel=0.01)
    k.grille(-0.02, 3, 0.1, 0.61, x=-0.15)


@model('artillery')
def artillery(k):
    """Coalition Artillery: a wheeled self-propelled howitzer with stabiliser legs."""
    k.axles([0.34, 0.06, -0.22], 0.24, 0.1, 0.08)
    k.box((0.46, 0.96, 0.1), (0, 0.04, 0.16), 'teamDark', bevel=0.014)
    for s in (1, -1):
        k.box((0.1, 0.84, 0.03), (s * 0.25, 0.06, 0.225), 'team', bevel=0.008)
        k.light((s * 0.15, 0.51, 0.22), 'lamp', 0.018)
        k.box((0.05, 0.14, 0.03), (s * 0.17, -0.48, 0.1), 'dark', bevel=0.006, rot=(-30, 0, 0))  # stowed spades
    truck_cab(k, 0.42, 0.2, 0.18, 0.4, 0.21)
    k.box((0.36, 0.36, 0.12), (0, -0.16, 0.27), 'team', bevel=0.018)  # gun platform
    tur = k.empty('turret', (0, -0.16, 0.33))
    k.cyl(0.13, 0.04, (0, -0.16, 0.35), 'teamDark', 'z', 14, bevel=0.01, parent=tur)
    for s in (1, -1):
        k.box((0.03, 0.14, 0.14), (s * 0.08, -0.16, 0.43), 'steelDark', bevel=0.008, parent=tur)
    k.box((0.24, 0.1, 0.03), (0, -0.28, 0.38), 'steelDark', bevel=0.006, parent=tur)
    # The howitzer, raised: a barrel empty tilted up; it recoils along its own axis.
    gun = k.empty('barrel', (0, -0.16, 0.47), parent=tur)
    gun.rotation_euler = (math.radians(24), 0, 0)
    k.cyl(0.06, 0.2, (0, -0.12, 0.47), 'steelDark', 'y', 12, bevel=0.01, parent=gun, rot=(24 - 90, 0, 0))
    k.cyl(0.03, 0.72, (0, 0.18, 0.6), 'gun', 'y', 10, parent=gun, rot=(24 - 90, 0, 0))
    k.cyl(0.05, 0.08, (0, 0.5, 0.74), 'gun', 'y', 10, bevel=0.01, parent=gun, rot=(24 - 90, 0, 0))


@model('salvoLauncher')
def salvo_launcher(k):
    """Coalition Salvo Launcher: a truck with a raised box of rocket tubes."""
    k.axles([0.32, 0.02, -0.26], 0.22, 0.1, 0.08)
    k.box((0.42, 0.94, 0.1), (0, 0.02, 0.16), 'teamDark', bevel=0.014)
    for s in (1, -1):
        k.box((0.09, 0.84, 0.03), (s * 0.23, 0.04, 0.225), 'team', bevel=0.008)
        k.light((s * 0.14, 0.49, 0.22), 'lamp', 0.018)
    truck_cab(k, 0.4, 0.22, 0.18, 0.36, 0.21)
    k.box((0.3, 0.3, 0.08), (0, -0.16, 0.26), 'dark', bevel=0.012)
    tur = k.empty('turret', (0, -0.16, 0.3))
    k.cyl(0.1, 0.04, (0, -0.16, 0.32), 'steelDark', 'z', 12, parent=tur)
    gun = k.empty('barrel', (0, -0.16, 0.4), parent=tur)
    # A raised rack of eight tubes between two armoured side plates.
    up = 22
    for s_ in (1, -1):
        k.box((0.02, 0.44, 0.15), (s_ * 0.17, -0.14, 0.44), 'team', bevel=0.006, parent=gun, rot=(up, 0, 0))
    for i in range(4):
        for j in range(2):
            x = -0.105 + i * 0.07
            y, z = -0.14 + j * 0.0, 0.41 + j * 0.065
            k.cyl(0.03, 0.44, (x, y, z), 'teamDark', 'y', 10, parent=gun, rot=(up - 90, 0, 0))
            k.cyl(0.02, 0.01, (x, y + 0.22 * math.cos(math.radians(up)), z + 0.22 * math.sin(math.radians(up))), 'black', 'y', 8, parent=gun, rot=(up - 90, 0, 0))
    k.box((0.3, 0.06, 0.04), (0, -0.34, 0.38), 'steelDark', bevel=0.008, parent=gun)


@model('flakTrack')
def flak_track(k):
    """Union Flak Halftrack: wheels in front, tracks behind, a twin flak gun."""
    k.axles([0.3], 0.24, 0.11, 0.09)
    tread = k.empty('tread0', (0, 0, 0), pitch=0.05)
    for s in (1, -1):
        k.track_unit(0.5, 0.13, 0.16, s * 0.23, guard=None, tread=tread)
    for o in [tread]:
        o.location.y = 0
    k.box((0.46, 0.96, 0.12), (0, 0.0, 0.22), 'team', bevel=0.016)
    k.box((0.36, 0.3, 0.1), (0, 0.3, 0.31), 'team', bevel=0.02, taper=(0.9, 0.86, -0.01))  # bonnet
    k.grille(0.45, 1, 0.24, 0.28, step=0.02)
    k.box((0.38, 0.14, 0.14), (0, 0.1, 0.35), 'teamDark', bevel=0.016)  # armoured cab
    k.box((0.3, 0.012, 0.05), (0, 0.17, 0.38), 'glassDark')
    for s in (1, -1):
        k.box((0.025, 0.46, 0.12), (s * 0.22, -0.2, 0.34), 'team', bevel=0.006)  # troop bay walls
        k.light((s * 0.14, 0.47, 0.29), 'lamp', 0.018)
        k.box((0.1, 0.28, 0.03), (s * 0.24, 0.3, 0.24), 'teamDark', bevel=0.008)
    k.box((0.42, 0.02, 0.12), (0, -0.44, 0.34), 'team', bevel=0.006)
    tur = k.empty('turret', (0, -0.18, 0.3))
    k.cyl(0.1, 0.05, (0, -0.18, 0.32), 'dark', 'z', 12, parent=tur)
    k.box((0.16, 0.12, 0.1), (0, -0.18, 0.39), 'steelDark', bevel=0.014, parent=tur)
    gun = k.empty('barrel', (0, -0.14, 0.42), parent=tur)
    gun.rotation_euler = (math.radians(30), 0, 0)
    for x in (-0.045, 0.045):
        k.cyl(0.014, 0.3, (x, 0.0, 0.5), 'gun', 'y', 6, parent=gun, rot=(30 - 90, 0, 0))
        k.cyl(0.022, 0.05, (x, 0.12, 0.57), 'gun', 'y', 8, parent=gun, rot=(30 - 90, 0, 0))


@model('demoTruck')
def demo_truck(k):
    """Union Demolition Truck: an old flatbed carrying a hazard-striped bomb."""
    k.axles([0.32, -0.26], 0.22, 0.1, 0.08)
    k.box((0.4, 0.96, 0.1), (0, 0.0, 0.17), 'dark', bevel=0.012)
    k.box((0.38, 0.22, 0.12), (0, 0.38, 0.28), 'team', bevel=0.03, taper=(0.86, 0.8, 0))  # rounded bonnet
    truck_cab(k, 0.4, 0.2, 0.2, 0.17, 0.22)
    for s in (1, -1):
        k.sphere(0.1, (s * 0.21, 0.32, 0.22), 'team', 10, 4, scale=(0.6, 1.2, 0.7), half=True)  # mudguards
        k.sphere(0.1, (s * 0.21, -0.26, 0.22), 'team', 10, 4, scale=(0.6, 1.2, 0.7), half=True)
        k.light((s * 0.12, 0.49, 0.3), 'lamp', 0.02)
    k.box((0.44, 0.5, 0.03), (0, -0.2, 0.235), 'leather')  # flatbed
    # The bomb: a fat drum with fins and hazard bands.
    k.cyl(0.13, 0.36, (0, -0.2, 0.37), 'olive', 'y', 14, bevel=0.03)
    for y in (-0.08, -0.32):
        k.cyl(0.133, 0.04, (0, y, 0.37), 'hazard', 'y', 14)
    k.lathe([(0.13, 0.0), (0.08, 0.06), (0.0, 0.08)], (0, -0.38, 0.37), 'olive', 14).rotation_euler = (math.radians(90), 0, 0)
    k.light((0, -0.02, 0.5), 'redLamp', 0.02)
    for s in (1, -1):
        k.box((0.02, 0.5, 0.04), (s * 0.2, -0.2, 0.27), 'leather')  # straps
        k.box((0.46, 0.02, 0.02), (0, -0.2 + s * 0.12, 0.5), 'black')


@model('terrorDrone')
def terror_drone(k):
    """Union Terror Drone: a spider robot; its legs step as it scuttles."""
    k.sphere(0.2, (0, 0.0, 0.26), 'team', 14, 7, scale=(1.0, 1.15, 0.6))
    k.sphere(0.12, (0, 0.18, 0.28), 'dark', 12, 6, scale=(1, 1, 0.7))
    for s in (1, -1):
        k.sphere(0.03, (s * 0.05, 0.28, 0.3), 'redLamp', 8, 4)
    k.cyl(0.06, 0.04, (0, -0.06, 0.38), 'steelDark', 'z', 10, bevel=0.01)
    k.cyl(0.03, 0.02, (0, -0.06, 0.405), 'redLamp', 'z', 8)
    for x, y in [(0.08, 0.3), (-0.08, 0.3)]:
        k.cyl(0.012, 0.1, (x, y + 0.04, 0.24), 'steel', 'y', 6)  # claws
    # Four legs on two pivots: front-left and back-right step together.
    for name, legs in (('legL', [(1, 1), (-1, -1)]), ('legR', [(-1, 1), (1, -1)])):
        e = k.empty(name, (0, 0, 0.26))
        for sx, sy in legs:
            ang = math.atan2(sy * 0.6, sx)
            hx, hy = sx * 0.16, sy * 0.12
            kx, ky = sx * 0.34, sy * 0.3
            k.box((0.26, 0.04, 0.04), ((hx + kx) / 2, (hy + ky) / 2, 0.33), 'steelDark', bevel=0.008, parent=e,
                  rot=(0, sx * -15, math.degrees(math.atan2(ky - hy, kx - hx))))
            k.cyl(0.02, 0.36, (kx, ky, 0.18), 'steel', 'z', 6, r2=0.008, parent=e, rot=(sy * 8, -sx * 12, 0))
            k.sphere(0.03, (kx, ky, 0.34), 'dark', 8, 4, parent=e)
