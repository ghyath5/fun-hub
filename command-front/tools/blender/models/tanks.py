# Tracked tanks. Front is +y, about 1 long; the turret ring is at x = y = 0
# so the turret turns in place (prep.js centres a unit on its turret empty).


def tracked_base(k, L=1.0, W=0.62, track_w=0.15, track_h=0.17, guard=None, pitch=None):
    """Two track runs whose links move, `W` apart outside to outside."""
    tx = W / 2 - track_w / 2
    tread = k.empty('tread0', (0, 0, 0), pitch=pitch or L / 17)
    for s in (1, -1):
        k.track_unit(L, track_w, track_h, s * tx, guard=guard, tread=tread)
    return tx


@model('lightTank')
def light_tank(k):
    """Coalition Light Tank: low and fast, a sloped glacis and a 75 mm gun."""
    L, W = 1.0, 0.64
    tracked_base(k, L, W, track_w=0.17, track_h=0.16)
    # Lower hull between the tracks, the upper hull overlapping their inner edge.
    k.prism([(-0.47, 0.05), (0.42, 0.05), (0.5, 0.13), (0.45, 0.17), (-0.47, 0.17)], 0.3, material='teamDark', bevel=0.008)
    k.prism([(-0.47, 0.15), (0.32, 0.15), (0.5, 0.17), (0.37, 0.255), (-0.42, 0.255), (-0.48, 0.22)], 0.42, material='team', bevel=0.014)
    # Fender shelves over the tracks' front and rear.
    for s in (1, -1):
        for y in (0.42, -0.42):
            k.box((0.18, 0.13, 0.014), (s * 0.235, y, 0.175), 'teamDark', bevel=0.004)
        k.box((0.024, 0.66, 0.04), (s * 0.205, 0, 0.2), 'teamDark', bevel=0.006)  # side skirt rail
        k.light((s * 0.15, 0.46, 0.2), 'lamp', 0.018)
        k.box((0.05, 0.03, 0.03), (s * 0.15, 0.45, 0.19), 'steelDark', bevel=0.004)
        k.cyl(0.02, 0.06, (s * 0.12, -0.49, 0.2), 'steelDark', 'y', 8, bevel=0.004)  # exhausts
        k.box((0.07, 0.16, 0.035), (s * 0.15, -0.16, 0.27), 'steelDark', bevel=0.006)  # stowage
        k.cyl(0.012, 0.03, (s * 0.07, 0.5, 0.1), 'steelDark', 'y', 6)  # tow hooks
    for i in range(5):
        k.box((0.24, 0.02, 0.012), (0, -0.27 - i * 0.033, 0.258), 'dark', bevel=0.003)  # engine grille
    k.box((0.12, 0.05, 0.016), (0.08, 0.33, 0.262), 'steelDark', bevel=0.004)  # driver hatch
    k.box((0.05, 0.02, 0.02), (0.08, 0.36, 0.27), 'glassDark')
    # Turret: a tapered cast shell, bustle, mantlet, cupola, sight and coaxial MG.
    tur = k.empty('turret', (0, -0.03, 0.255))
    k.box((0.34, 0.4, 0.12), (0, -0.05, 0.315), 'team', bevel=0.024, parent=tur, taper=(0.8, 0.84, -0.01))
    k.box((0.3, 0.1, 0.075), (0, -0.28, 0.31), 'teamDark', bevel=0.014, parent=tur)
    k.box((0.15, 0.06, 0.1), (0, 0.16, 0.315), 'steelDark', bevel=0.016, parent=tur)
    k.hatch((-0.07, -0.1, 0.38), 0.05, parent=tur)
    k.cyl(0.045, 0.028, (0.08, -0.04, 0.385), 'steelDark', 'z', 10, bevel=0.006, parent=tur)
    k.box((0.03, 0.05, 0.03), (0.08, -0.0, 0.405), 'glassDark', parent=tur)
    for s in (1, -1):
        for j in range(3):
            k.cyl(0.011, 0.04, (s * 0.165, 0.06 - j * 0.03, 0.31), 'dark', 'x', 6, parent=tur)  # smoke dischargers
    k.antenna((-0.12, -0.27, 0.35), 0.2, parent=tur)
    gun = k.empty('barrel', (0, 0.18, 0.315), parent=tur)
    k.barrel(0.46, 0.02, (0, 0.17, 0.315), parent=gun)
    k.cyl(0.007, 0.07, (0.055, 0.2, 0.3), 'gun', 'y', 6, parent=gun)


@model('mediumTank')
def medium_tank(k):
    """Coalition Medium Tank: angular welded turret, 90 mm gun with a fume extractor."""
    tracked_base(k, 1.0, 0.68, track_w=0.17, track_h=0.17)
    k.prism([(-0.47, 0.05), (0.42, 0.05), (0.5, 0.14), (0.45, 0.18), (-0.47, 0.18)], 0.34, material='teamDark', bevel=0.008)
    k.hull(0.98, 0.46, 0.16, 0.27, 'team', nose=0.06, glacis=0.2, rear=0.05, y=0.0, bevel=0.014)
    for s in (1, -1):
        # Side skirts: three armour plates over the track's upper run.
        for j, y in enumerate((0.26, 0.0, -0.26)):
            k.box((0.02, 0.24, 0.07), (s * 0.345, y, 0.15), 'team', bevel=0.005)
        k.light((s * 0.17, 0.48, 0.21), 'lamp', 0.018)
        k.box((0.08, 0.18, 0.04), (s * 0.17, -0.22, 0.29), 'steelDark', bevel=0.006)
        k.cyl(0.022, 0.06, (s * 0.13, -0.5, 0.21), 'steelDark', 'y', 8, bevel=0.004)
    k.grille(-0.3, 5, 0.24, 0.272)
    k.box((0.12, 0.05, 0.016), (-0.1, 0.34, 0.278), 'steelDark', bevel=0.004)
    tur = k.empty('turret', (0, -0.02, 0.27))
    # Welded turret: wedge front, flat sides, a long bustle with a stowage rack.
    k.prism([(-0.26, 0.0), (0.14, 0.0), (0.24, 0.05), (0.14, 0.13), (-0.22, 0.13), (-0.27, 0.07)], 0.4, (0, -0.03, 0.27), 'team', bevel=0.016, parent=tur)
    for s in (1, -1):
        k.box((0.05, 0.2, 0.08), (s * 0.215, -0.04, 0.32), 'teamDark', bevel=0.012, parent=tur, taper=(0.7, 0.9, 0))
        for j in range(3):
            k.cyl(0.011, 0.04, (s * 0.2, 0.12 - j * 0.028, 0.37), 'dark', 'x', 6, parent=tur)
    k.box((0.36, 0.08, 0.05), (0, -0.33, 0.33), 'steelDark', bevel=0.008, parent=tur)  # bustle rack
    k.hatch((-0.08, -0.08, 0.41), 0.055, parent=tur)
    k.cyl(0.05, 0.03, (0.09, -0.02, 0.415), 'steelDark', 'z', 10, bevel=0.006, parent=tur)
    k.cyl(0.007, 0.12, (0.09, 0.04, 0.45), 'gun', 'y', 6, parent=tur)  # commander's MG
    k.antenna((-0.15, -0.3, 0.36), 0.24, parent=tur)
    gun = k.empty('barrel', (0, 0.2, 0.335), parent=tur)
    k.box((0.14, 0.06, 0.1), (0, 0.2, 0.335), 'steelDark', bevel=0.016, parent=gun)
    k.barrel(0.52, 0.024, (0, 0.2, 0.335), parent=gun)
    k.cyl(0.034, 0.08, (0, 0.46, 0.335), 'gun', 'y', 10, bevel=0.008, parent=gun)  # fume extractor


@model('heavyTank')
def heavy_tank(k):
    """Union Heavy Tank: wide hull, rounded cast turret, twin 105 mm guns."""
    tracked_base(k, 1.0, 0.76, track_w=0.2, track_h=0.19)
    k.prism([(-0.47, 0.05), (0.42, 0.05), (0.5, 0.15), (0.45, 0.2), (-0.47, 0.2)], 0.36, material='teamDark', bevel=0.008)
    k.hull(1.0, 0.56, 0.18, 0.3, 'team', nose=0.05, glacis=0.18, rear=0.06, bevel=0.016)
    for s in (1, -1):
        k.box((0.05, 0.86, 0.03), (s * 0.3, 0.0, 0.2), 'teamDark', bevel=0.006)  # fender rails
        k.rivets([(s * 0.25, y) for y in (-0.36, -0.18, 0.0, 0.18, 0.36)], 0.302)
        k.light((s * 0.2, 0.49, 0.24), 'lamp', 0.02)
        k.cyl(0.05, 0.22, (s * 0.15, -0.53, 0.25), 'olive', 'x', 10, bevel=0.008)  # fuel drums
    k.grille(-0.3, 4, 0.3, 0.305)
    k.box((0.14, 0.05, 0.02), (0.12, 0.36, 0.31), 'steelDark', bevel=0.004)
    tur = k.empty('turret', (0, -0.04, 0.3))
    k.cast_turret(0.22, 0.17, (0, -0.06, 0.3), parent=tur)
    k.box((0.3, 0.12, 0.08), (0, -0.3, 0.35), 'teamDark', bevel=0.016, parent=tur)
    k.hatch((-0.08, -0.12, 0.45), 0.055, parent=tur)
    k.hatch((0.09, -0.06, 0.45), 0.045, parent=tur)
    k.cyl(0.009, 0.1, (0.09, 0.0, 0.48), 'gun', 'y', 6, parent=tur)
    k.antenna((-0.17, -0.3, 0.38), 0.26, parent=tur)
    gun = k.empty('barrel', (0, 0.2, 0.38), parent=tur)
    k.box((0.24, 0.07, 0.11), (0, 0.19, 0.38), 'steelDark', bevel=0.02, parent=gun)
    for x in (-0.055, 0.055):
        k.barrel(0.5, 0.024, (x, 0.2, 0.38), parent=gun, sleeve=False)


@model('apc')
def apc(k):
    """Coalition APC: tall armoured box with a sloped nose, rear ramp and an MG cupola."""
    tracked_base(k, 0.96, 0.66, track_w=0.15, track_h=0.16)
    k.prism([(-0.48, 0.12), (0.26, 0.12), (0.49, 0.18), (0.32, 0.36), (-0.46, 0.36), (-0.48, 0.32)], 0.5, material='team', bevel=0.016)
    for s in (1, -1):
        for y in (0.15, -0.05, -0.25):
            k.box((0.012, 0.05, 0.03), (s * 0.252, y, 0.29), 'glassDark')  # firing ports
        k.light((s * 0.18, 0.44, 0.27), 'lamp', 0.018)
        k.box((0.06, 0.3, 0.03), (s * 0.19, -0.14, 0.375), 'steelDark', bevel=0.005)  # roof rails
    k.box((0.34, 0.03, 0.2), (0, -0.485, 0.24), 'teamDark', bevel=0.008)  # rear ramp
    k.box((0.3, 0.06, 0.012), (0, 0.33, 0.33), 'glassDark', rot=(-50, 0, 0))  # driver vision block
    k.grille(0.18, 3, 0.2, 0.25, x=0.12)
    tur = k.empty('turret', (0, -0.04, 0.36))
    k.cyl(0.11, 0.06, (0, -0.04, 0.39), 'teamDark', 'z', 12, bevel=0.012, parent=tur)
    k.box((0.1, 0.12, 0.06), (0, 0.0, 0.43), 'steelDark', bevel=0.01, parent=tur)
    gun = k.empty('barrel', (0, 0.06, 0.43), parent=tur)
    k.barrel(0.24, 0.012, (0, 0.04, 0.43), parent=gun, brake=False, sleeve=False, verts=8)
    k.cyl(0.02, 0.05, (0.0, 0.25, 0.43), 'gun', 'y', 8, parent=gun)


@model('mineLayer')
def mine_layer(k):
    """Mine Layer: armoured cab at the front, a mine rack and chute behind."""
    tracked_base(k, 0.96, 0.64, track_w=0.16, track_h=0.16)
    k.prism([(-0.48, 0.1), (0.44, 0.1), (0.49, 0.18), (-0.48, 0.18)], 0.44, material='teamDark', bevel=0.01)
    k.prism([(0.0, 0.17), (0.34, 0.17), (0.48, 0.22), (0.36, 0.34), (0.02, 0.34)], 0.46, material='team', bevel=0.016)
    k.box((0.38, 0.012, 0.06), (0, 0.4, 0.3), 'glassDark', rot=(-35, 0, 0))
    k.light((0.17, 0.47, 0.23), 'lamp', 0.018)
    k.light((-0.17, 0.47, 0.23), 'lamp', 0.018)
    k.light((0.0, 0.16, 0.36), 'redLamp', 0.016)
    k.box((0.48, 0.44, 0.06), (0, -0.24, 0.21), 'dark', bevel=0.01)  # rack bed
    for i in range(3):
        for j in range(3):
            k.cyl(0.05, 0.03, (-0.15 + i * 0.15, -0.1 - j * 0.14, 0.255), 'olive', 'z', 10, bevel=0.008)
            k.cyl(0.012, 0.02, (-0.15 + i * 0.15, -0.1 - j * 0.14, 0.275), 'brass', 'z', 6)
    k.box((0.14, 0.1, 0.12), (0, -0.5, 0.14), 'steelDark', bevel=0.012, rot=(25, 0, 0))  # chute
    for s in (1, -1):
        k.box((0.02, 0.44, 0.08), (s * 0.24, -0.24, 0.24), 'hazard', bevel=0.004)


@model('laserTank')
def laser_tank(k):
    """Coalition Laser Tank: sleek light hull, a glowing prism on the turret."""
    tracked_base(k, 0.98, 0.66, track_w=0.16, track_h=0.15)
    k.prism([(-0.47, 0.05), (0.42, 0.05), (0.5, 0.13), (0.45, 0.17), (-0.47, 0.17)], 0.34, material='steelDark', bevel=0.008)
    k.hull(0.98, 0.46, 0.15, 0.25, 'white', nose=0.06, glacis=0.24, rear=0.08, bevel=0.014)
    for s in (1, -1):
        k.box((0.04, 0.7, 0.03), (s * 0.24, -0.02, 0.24), 'team', bevel=0.006)
        k.light((s * 0.17, 0.47, 0.19), 'prism', 0.016)
    k.grille(-0.28, 4, 0.22, 0.252)
    tur = k.empty('turret', (0, -0.04, 0.25))
    k.lathe([(0.0, 0.25), (0.2, 0.25), (0.22, 0.28), (0.18, 0.33), (0.0, 0.335)], (0, -0.06, 0), 'team', 16, parent=tur)
    k.cyl(0.04, 0.1, (0, -0.08, 0.38), 'steel', 'z', 8, r2=0.025, parent=tur)
    k.lathe([(0.0, 0.0), (0.06, 0.06), (0.0, 0.16)], (0, -0.08, 0.41), 'prism', 6, parent=tur)
    for a in (0, 120, 240):
        import math
        x, y = 0.07 * math.cos(math.radians(a)), -0.08 + 0.07 * math.sin(math.radians(a))
        k.cyl(0.006, 0.12, (x, y, 0.4), 'steel', 'z', 5, parent=tur)
    gun = k.empty('barrel', (0, 0.14, 0.3), parent=tur)
    k.box((0.07, 0.3, 0.05), (0, 0.27, 0.3), 'steel', bevel=0.012, parent=gun, taper=(0.8, 1.0, 0))
    k.cyl(0.026, 0.04, (0, 0.43, 0.3), 'prism', 'y', 8, parent=gun)


@model('arcTank')
def arc_tank(k):
    """Union Arc Tank: heavy hull, a turret carrying a copper Tesla coil."""
    tracked_base(k, 1.0, 0.72, track_w=0.19, track_h=0.18)
    k.prism([(-0.47, 0.05), (0.42, 0.05), (0.5, 0.15), (0.45, 0.19), (-0.47, 0.19)], 0.34, material='teamDark', bevel=0.008)
    k.hull(1.0, 0.52, 0.17, 0.28, 'team', nose=0.05, glacis=0.16, rear=0.05, bevel=0.016)
    for s in (1, -1):
        k.box((0.04, 0.86, 0.03), (s * 0.28, 0, 0.19), 'teamDark', bevel=0.006)
        k.light((s * 0.18, 0.49, 0.22), 'lamp', 0.018)
        k.box((0.06, 0.26, 0.05), (s * 0.18, -0.26, 0.3), 'dark', bevel=0.008)  # capacitor banks
        for j in range(3):
            k.cyl(0.018, 0.03, (s * 0.18, -0.17 - j * 0.09, 0.33), 'copper', 'z', 8)
    tur = k.empty('turret', (0, -0.02, 0.28))
    k.cast_turret(0.2, 0.13, (0, -0.02, 0.28), parent=tur)
    k.cyl(0.05, 0.14, (0, -0.02, 0.45), 'dark', 'z', 10, bevel=0.01, parent=tur)
    for z in (0.5, 0.55, 0.6):
        k.torus(0.07, 0.014, (0, -0.02, z), 'copper', 'z', 14, 6, parent=tur)
    k.cyl(0.03, 0.2, (0, -0.02, 0.56), 'steel', 'z', 8, parent=tur)
    k.sphere(0.05, (0, -0.02, 0.68), 'tesla', 12, 6, parent=tur)
    gun = k.empty('barrel', (0, 0.18, 0.36), parent=tur)
    k.box((0.1, 0.16, 0.08), (0, 0.22, 0.36), 'dark', bevel=0.014, parent=gun, taper=(0.7, 0.8, 0.01))
    k.cyl(0.03, 0.12, (0, 0.34, 0.36), 'copper', 'y', 10, r2=0.018, parent=gun)
    k.sphere(0.022, (0, 0.41, 0.36), 'tesla', 8, 4, parent=gun)


@model('tankDestroyer')
def tank_destroyer(k):
    """Coalition Tank Destroyer: a low casemate with a long fixed gun."""
    tracked_base(k, 1.0, 0.7, track_w=0.18, track_h=0.16)
    k.prism([(-0.47, 0.05), (0.42, 0.05), (0.5, 0.14), (0.45, 0.18), (-0.47, 0.18)], 0.34, material='teamDark', bevel=0.008)
    # Casemate: steep sloped plates all round.
    k.box((0.52, 0.8, 0.16), (0, -0.04, 0.24), 'team', bevel=0.016, taper=(0.72, 0.78, 0.04))
    for s in (1, -1):
        k.box((0.04, 0.92, 0.03), (s * 0.27, 0, 0.17), 'teamDark', bevel=0.006)
        k.light((s * 0.2, 0.47, 0.2), 'lamp', 0.018)
        k.box((0.1, 0.16, 0.04), (s * 0.15, -0.32, 0.33), 'steelDark', bevel=0.006)
    k.hatch((0.08, -0.14, 0.33), 0.05)
    k.cyl(0.045, 0.03, (-0.1, -0.08, 0.335), 'steelDark', 'z', 10, bevel=0.006)
    k.grille(-0.36, 3, 0.2, 0.322)
    gun = k.empty('barrel', (0, 0.24, 0.26))
    k.sphere(0.07, (0, 0.24, 0.26), 'steelDark', 12, 6, scale=(1.2, 0.8, 1))  # ball mantlet
    k.barrel(0.62, 0.026, (0, 0.26, 0.26), parent=gun)
    k.cyl(0.04, 0.09, (0, 0.6, 0.26), 'gun', 'y', 10, bevel=0.008, parent=gun)


@model('mirageTank')
def mirage_tank(k):
    """Coalition Mirage Tank: angular hull, cannon turret and mirage emitter panels."""
    tracked_base(k, 0.96, 0.66, track_w=0.16, track_h=0.15)
    k.prism([(-0.46, 0.05), (0.42, 0.05), (0.48, 0.13), (0.44, 0.17), (-0.46, 0.17)], 0.34, material='steelDark', bevel=0.008)
    k.hull(0.96, 0.46, 0.15, 0.25, 'team', nose=0.06, glacis=0.2, rear=0.06, bevel=0.014)
    for s in (1, -1):
        k.box((0.012, 0.3, 0.12), (s * 0.25, -0.2, 0.31), 'chrono', rot=(0, s * 20, 0))  # emitter panels
        k.box((0.02, 0.32, 0.03), (s * 0.24, -0.2, 0.25), 'steel', bevel=0.004)
        k.light((s * 0.17, 0.46, 0.19), 'lamp', 0.016)
    tur = k.empty('turret', (0, 0.0, 0.25))
    k.box((0.3, 0.34, 0.1), (0, 0.0, 0.3), 'team', bevel=0.02, parent=tur, taper=(0.82, 0.8, 0.0))
    k.cyl(0.06, 0.03, (0, -0.05, 0.36), 'chrono', 'z', 12, parent=tur)
    k.cyl(0.075, 0.02, (0, -0.05, 0.35), 'steel', 'z', 12, parent=tur)
    gun = k.empty('barrel', (0, 0.16, 0.3), parent=tur)
    k.barrel(0.44, 0.02, (0, 0.15, 0.3), parent=gun)


@model('robotTank')
def robot_tank(k):
    """Coalition Robot Tank: unmanned, a smooth hull with a sensor eye."""
    tracked_base(k, 0.92, 0.66, track_w=0.17, track_h=0.15)
    k.prism([(-0.44, 0.05), (0.4, 0.05), (0.46, 0.13), (0.42, 0.17), (-0.44, 0.17)], 0.32, material='steelDark', bevel=0.008)
    k.lathe([(0.0, 0.14), (0.26, 0.14), (0.27, 0.18), (0.22, 0.24), (0.0, 0.25)], (0, -0.04, 0), 'steel', 8).scale = (0.85, 1.6, 1)
    tur = k.empty('turret', (0, 0.0, 0.24))
    k.sphere(0.13, (0, -0.02, 0.24), 'team', 12, 6, scale=(1, 1.1, 0.75), parent=tur, half=True)
    k.cyl(0.05, 0.03, (0, 0.11, 0.29), 'dark', 'y', 12, parent=tur)
    k.cyl(0.03, 0.02, (0, 0.125, 0.29), 'redLamp', 'y', 10, parent=tur)
    k.antenna((-0.07, -0.08, 0.32), 0.12, parent=tur)
    gun = k.empty('barrel', (0, 0.12, 0.26), parent=tur)
    for x in (-0.06, 0.06):
        k.cyl(0.014, 0.26, (x, 0.24, 0.26), 'gun', 'y', 8, parent=gun)


@model('battleFortress')
def battle_fortress(k):
    """Coalition Battle Fortress: a huge armoured hull with firing ports and a big turret."""
    tracked_base(k, 1.0, 0.8, track_w=0.22, track_h=0.2, pitch=1.0 / 18)
    k.prism([(-0.47, 0.06), (0.42, 0.06), (0.5, 0.16), (0.45, 0.22), (-0.47, 0.22)], 0.36, material='teamDark', bevel=0.01)
    k.prism([(-0.48, 0.2), (0.3, 0.2), (0.5, 0.26), (0.36, 0.42), (-0.44, 0.42), (-0.49, 0.36)], 0.62, material='team', bevel=0.02)
    for s in (1, -1):
        for y in (0.2, 0.02, -0.16, -0.34):
            k.box((0.03, 0.08, 0.05), (s * 0.31, y, 0.34), 'steelDark', bevel=0.006)
            k.box((0.01, 0.05, 0.02), (s * 0.327, y, 0.34), 'glassDark')
        k.light((s * 0.22, 0.47, 0.3), 'lamp', 0.02)
        k.box((0.08, 0.3, 0.05), (s * 0.24, -0.26, 0.445), 'steelDark', bevel=0.008)
    k.grille(-0.3, 4, 0.26, 0.425)
    tur = k.empty('turret', (0, -0.02, 0.42))
    k.box((0.42, 0.44, 0.13), (0, -0.04, 0.485), 'team', bevel=0.026, parent=tur, taper=(0.82, 0.84, -0.01))
    k.hatch((-0.1, -0.12, 0.555), 0.055, parent=tur)
    k.cyl(0.05, 0.04, (0.11, -0.06, 0.565), 'steelDark', 'z', 10, bevel=0.008, parent=tur)
    for s in (1, -1):
        k.cyl(0.007, 0.12, (s * 0.15, 0.06, 0.56), 'gun', 'y', 6, parent=tur)
    k.antenna((-0.17, -0.22, 0.54), 0.26, parent=tur)
    gun = k.empty('barrel', (0, 0.18, 0.49), parent=tur)
    k.box((0.2, 0.08, 0.11), (0, 0.18, 0.49), 'steelDark', bevel=0.02, parent=gun)
    k.barrel(0.5, 0.032, (0, 0.18, 0.49), parent=gun)


@model('harvester')
def harvester(k):
    """Ore Harvester: tracked hauler, cab and collector drum at the front, ore in the hopper."""
    tracked_base(k, 1.0, 0.72, track_w=0.18, track_h=0.18)
    k.prism([(-0.48, 0.08), (0.44, 0.08), (0.49, 0.2), (-0.48, 0.2)], 0.4, material='teamDark', bevel=0.01)
    # Hopper: a tapered open bin, with ore heaped inside.
    k.box((0.6, 0.58, 0.22), (0, -0.16, 0.31), 'team', bevel=0.02, taper=(1.08, 1.06, 0))
    k.box((0.5, 0.48, 0.02), (0, -0.16, 0.41), 'dark')
    for x, y, r in [(-0.12, -0.08, 0.1), (0.1, -0.22, 0.11), (0.0, -0.3, 0.09), (0.13, -0.04, 0.08), (-0.14, -0.3, 0.08)]:
        k.sphere(r, (x, y, 0.4), 'ore', 8, 4, scale=(1, 1, 0.55))
    for s in (1, -1):
        k.box((0.025, 0.6, 0.05), (s * 0.31, -0.16, 0.44), 'hazard', bevel=0.004)
    # Cab, offset left, with a glazed front.
    k.box((0.26, 0.22, 0.2), (-0.17, 0.28, 0.3), 'team', bevel=0.018, taper=(0.9, 0.8, -0.01))
    k.box((0.22, 0.012, 0.08), (-0.17, 0.39, 0.33), 'glassDark', rot=(-20, 0, 0))
    k.light((-0.06, 0.39, 0.38), 'redLamp', 0.016)
    k.cyl(0.024, 0.18, (0.16, 0.22, 0.38), 'steelDark', 'z', 8)  # exhaust stack
    # Collector drum across the front: it turns as the harvester drives.
    drum = k.empty('wheel0', (0, 0.5, 0.11))
    k.cyl(0.08, 0.52, (0, 0.5, 0.11), 'steelDark', 'x', 10, parent=drum)
    for i in range(6):
        import math
        a = i * math.pi / 3
        k.box((0.5, 0.02, 0.05), (0, 0.5 + 0.08 * math.cos(a), 0.11 + 0.08 * math.sin(a)), 'hazard', parent=drum, rot=(math.degrees(a), 0, 0))
    for s in (1, -1):
        k.box((0.04, 0.16, 0.06), (s * 0.28, 0.44, 0.13), 'teamDark', bevel=0.006)
