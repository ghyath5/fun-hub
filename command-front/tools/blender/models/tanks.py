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
