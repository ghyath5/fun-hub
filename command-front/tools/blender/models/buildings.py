# Base buildings, modelled on their footprint in game cells (kit.at: cell
# (x, y) is Blender (x, -y)); the front faces south. Spinning parts (dishes,
# cranes, rings) hang under spinN empties.
import math

BLD = dict(maxEdge=0.35, ao=0.25, aoStrength=0.8)


def crane(k, name, x, y, z, h, jib):
    """A yellow lattice crane whose jib slews (spinN)."""
    k.lattice_tower(x, y, z, 0.1, h, 'hazard', 6)
    e = k.empty(name, (x, -y, z + h))
    k.box((jib, 0.05, 0.05), (x + jib * 0.3, -y, z + h + 0.04), 'hazard', bevel=0.006, parent=e)
    k.box((0.16, 0.1, 0.1), (x - jib * 0.18, -y, z + h + 0.03), 'concreteDark', bevel=0.012, parent=e)
    k.box((0.09, 0.09, 0.09), (x, -y, z + h - 0.02), 'team', bevel=0.012, parent=e)
    k.cyl(0.006, 0.3, (x + jib * 0.7, -y, z + h - 0.12), 'black', 'z', 4, parent=e)
    k.box((0.05, 0.05, 0.03), (x + jib * 0.7, -y, z + h - 0.28), 'steelDark', parent=e)


@model('constructionYard@union', **BLD)
def construction_yard_union(k):
    t = k.foundation(3, 3, 'concreteDark')
    k.slab(0.2, 0.3, 2.1, 1.65, t, 0.72, 'concrete', bevel=0.03)          # main hall
    k.gable(0.2, 0.3, 2.1, 1.65, 0.72, 0.34, 'team', along='x')
    k.slab(0.25, 1.65, 1.0, 2.25, t, 1.02, 'concrete', bevel=0.03)        # control block
    k.slab(0.22, 1.62, 1.03, 2.28, 1.02, 1.08, 'team', bevel=0.012)
    k.window_row(0.3, 0.95, 2.25, 0.85, 4, 0.1)
    k.window_row(0.3, 0.95, 2.25, 0.6, 4, 0.1)
    k.window_row(0.3, 2.0, 0.3, 0.55, 7, 0.08, mat='glassDark', facing='north')
    k.bay_door(1.6, 1.65, 0.8, 0.5, t)
    k.star(0.62, 1.95, 1.09, 0.17)
    k.chimney(2.4, 0.5, t, 0.11, 1.15)
    k.storage_tank(2.45, 2.45, t, 0.24, 0.42)
    crane(k, 'spin0', 2.55, 1.45, t, 1.1, 0.9)
    k.radar_dish('spin1', 0.55, 0.65, 1.06, 0.16)
    k.stripes(0.1, 2.9, 2.85, n=10)
    for x in (0.12, 2.88):
        k.floodlight(x, 2.85, t)
    k.pipe_run([(2.1, 1.0, 0.3), (2.3, 1.0, 0.3), (2.3, 2.2, 0.3)])


@model('barracks@union', **BLD)
def barracks_union(k):
    t = k.foundation(2, 2, 'concreteDark')
    k.slab(0.25, 0.3, 1.75, 1.45, t, 0.5, 'concrete', bevel=0.03)
    k.gable(0.25, 0.3, 1.75, 1.45, 0.5, 0.3, 'team', along='x')
    k.slab(0.75, 1.3, 1.25, 1.62, t, 0.42, 'concreteDark', bevel=0.02)  # porch
    k.slab(0.72, 1.27, 1.28, 1.65, 0.42, 0.46, 'team', bevel=0.01)
    k.box((0.26, 0.04, 0.28), (1.0, -1.62, t + 0.14), 'steelDark', bevel=0.006)  # door
    k.star(1.0, 1.66, 0.42, 0.07, 'redLamp')
    k.window_row(0.3, 0.72, 1.45, 0.34, 2, 0.08)
    k.window_row(1.28, 1.7, 1.45, 0.34, 2, 0.08)
    # Watchtower at the north-east corner, sandbags at the front.
    k.lattice_tower(1.78, 0.25, t, 0.16, 0.7, 'steelDark', 4)
    k.slab(1.66, 0.13, 1.9, 0.37, 0.76, 0.8, 'steelDark', bevel=0.004)
    k.gable(1.66, 0.13, 1.9, 0.37, 0.8, 0.1, 'team', along='x', overhang=0.02)
    k.floodlight(1.72, 0.3, 0.8, 0.1)
    for i in range(7):
        a = math.pi * (0.1 + 0.8 * i / 6)
        k.box((0.14, 0.07, 0.06), (1.0 + math.cos(a) * 0.5, -(1.9 - math.sin(a) * 0.08), t + 0.03), 'sand', bevel=0.02,
              rot=(0, 0, math.degrees(a) + 90))
    k.cyl(0.012, 0.6, (0.3, -1.75, t + 0.3), 'steel', 'z', 6)  # flagpole
    k.box((0.2, 0.012, 0.12), (0.4, -1.75, t + 0.54), 'team')


@model('warFactory@union', **BLD)
def war_factory_union(k):
    t = k.foundation(3, 3, 'concreteDark')
    # Long assembly hall with an arched (barrel-vaulted) team roof.
    k.slab(0.25, 0.25, 2.75, 2.2, t, 0.62, 'concrete', bevel=0.03)
    arc = [(-1.0 * math.cos(math.pi * i / 10) * 1.29, 0.62 + 0.36 * math.sin(math.pi * i / 10)) for i in range(11)]
    k.prism([(x, z) for x, z in arc], 1.97, (1.5, -1.225, 0), 'team', bevel=0.0, axis='y')
    for y in (0.5, 0.9, 1.3, 1.7):
        k.box((2.6, 0.04, 0.03), (1.5, -y, 0.98), 'teamDark')  # roof ribs
    k.bay_door(1.5, 2.2, 1.0, 0.5, t)
    k.slab(0.95, 2.2, 2.05, 2.95, t, t + 0.02, 'asphalt', bevel=0.0)  # driveway
    for i in range(6):
        k.cyl(0.03, 0.9, (1.5, -(2.3 + i * 0.1), t + 0.03), 'steelDark', 'x', 8)  # rollers
    for x in (0.4, 2.6):
        k.chimney(x, 0.45, 0.62, 0.08, 0.6)
    k.window_row(0.3, 0.95, 2.2, 0.42, 3, 0.1)
    k.window_row(2.05, 2.7, 2.2, 0.42, 3, 0.1)
    k.star(0.62, 2.22, 0.2, 0.12, 'team')
    k.slab(0.25, 0.25, 0.75, 0.7, 0.62, 0.9, 'concreteDark', bevel=0.02)  # roof plant room
    k.radar_dish('spin0', 0.5, 0.48, 0.9, 0.12)
    for x in (0.12, 2.88):
        k.floodlight(x, 2.88, t)


@model('radarDome@union', **BLD)
def radar_union(k):
    t = k.foundation(2, 2, 'concreteDark')
    k.slab(0.2, 0.9, 1.1, 1.7, t, 0.4, 'concrete', bevel=0.03)
    k.slab(0.17, 0.87, 1.13, 1.73, 0.4, 0.45, 'team', bevel=0.012)
    k.window_row(0.3, 1.0, 1.7, 0.27, 3, 0.08)
    k.box((0.2, 0.04, 0.26), (0.65, -1.71, t + 0.13), 'steelDark')
    k.lattice_tower(1.35, 0.75, t, 0.36, 0.95, 'steelDark', 6)
    k.slab(1.12, 0.52, 1.58, 0.98, 1.0, 1.06, 'steelDark', bevel=0.01)
    k.radar_dish('spin0', 1.35, 0.75, 1.06, 0.36)
    k.light((1.35, -0.75, 1.62), 'redLamp', 0.03)
    k.storage_tank(1.6, 1.55, t, 0.16, 0.3, 'concreteDark')
    k.pipe_run([(1.1, 1.3, 0.25), (1.4, 1.3, 0.25), (1.4, 1.5, 0.25)])


@model('serviceDepot', **BLD)
def service_depot(k):
    """Repair pad in the middle cell, a slewing repair arm and workshops."""
    t = k.foundation(3, 3, 'concreteDark')
    k.cyl(0.62, 0.04, (1.5, -1.5, t + 0.02), 'asphalt', 'z', 24)
    k.torus(0.56, 0.03, (1.5, -1.5, t + 0.04), 'hazard', 'z', 28, 4)
    k.cyl(0.42, 0.02, (1.5, -1.5, t + 0.045), 'steelDark', 'z', 8)
    for a in range(4):
        x, y = 1.5 + 0.48 * math.cos(a * math.pi / 2 + math.pi / 4), 1.5 + 0.48 * math.sin(a * math.pi / 2 + math.pi / 4)
        k.light((x, -y, t + 0.07), 'greenLamp', 0.025)
    k.slab(0.15, 0.15, 2.85, 0.65, t, 0.55, 'concrete', bevel=0.03)       # workshop row (north)
    k.slab(0.12, 0.12, 2.88, 0.68, 0.55, 0.6, 'team', bevel=0.012)
    k.window_row(0.3, 2.7, 0.65, 0.38, 8, 0.08)
    for x in (0.7, 2.3):
        k.bay_door(x, 0.65, 0.5, 0.35, t)
    k.slab(0.15, 0.7, 0.55, 2.85, t, 0.4, 'concreteDark', bevel=0.02)   # parts store (west)
    k.slab(0.12, 0.67, 0.58, 2.88, 0.4, 0.44, 'team', bevel=0.01)
    k.storage_tank(2.55, 2.5, t, 0.2, 0.35)
    # Repair arm on a pillar beside the pad.
    k.cyl(0.08, 0.55, (2.45, -1.0, t + 0.27), 'steelDark', 'z', 10)
    e = k.empty('spin0', (2.45, -1.0, t + 0.55))
    k.box((0.7, 0.07, 0.06), (2.15, -1.0, t + 0.6), 'hazard', bevel=0.01, parent=e)
    k.box((0.06, 0.06, 0.2), (1.82, -1.0, t + 0.5), 'steelDark', parent=e)
    k.light((1.82, -1.0, t + 0.38), 'tesla', 0.03, parent=e)
    k.stripes(0.6, 2.4, 2.9, n=7)


@model('advPowerPlant', **BLD)
def adv_power_plant(k):
    """A reactor: cooling tower, a domed core with a glowing heart, pipes."""
    t = k.foundation(3, 3, 'concreteDark')
    k.lathe([(0.62, t), (0.56, 0.4), (0.44, 0.85), (0.46, 1.15), (0.5, 1.3), (0.44, 1.3), (0.4, 1.15), (0.38, 0.85), (0.5, 0.4), (0.56, t)],
            (0.95, -0.95, 0), 'concrete', 24)
    k.torus(0.47, 0.025, (0.95, -0.95, 1.24), 'team', 'z', 24, 4)
    k.cyl(0.38, 0.02, (0.95, -0.95, 0.9), 'dark', 'z', 20)
    k.cyl(0.46, 0.5, (2.05, -1.95, t + 0.25), 'concrete', 'z', 20)           # reactor drum
    k.sphere(0.46, (2.05, -1.95, t + 0.5), 'team', 20, 8, scale=(1, 1, 0.7), half=True)
    k.cyl(0.18, 0.06, (2.05, -1.95, t + 0.84), 'steel', 'z', 14)
    k.cyl(0.12, 0.04, (2.05, -1.95, t + 0.89), 'rad', 'z', 14)
    for a in range(6):
        x, y = 2.05 + 0.47 * math.cos(a * math.pi / 3), 1.95 + 0.47 * math.sin(a * math.pi / 3)
        k.box((0.05, 0.05, 0.5), (x, -y, t + 0.25), 'steelDark', rot=(0, 0, a * 60))
        k.box((0.012, 0.03, 0.12), (x, -y, t + 0.3), 'rad', rot=(0, 0, a * 60))
    k.slab(0.2, 2.1, 1.3, 2.85, t, 0.45, 'concrete', bevel=0.03)
    k.slab(0.17, 2.07, 1.33, 2.88, 0.45, 0.5, 'team', bevel=0.012)
    k.window_row(0.3, 1.2, 2.85, 0.3, 5, 0.08)
    for y in (0.6, 0.9):
        k.pipe_run([(1.45, y + 0.4, 0.25), (1.75, y + 0.4, 0.25), (1.75, 1.6, 0.25)], 0.035)
    k.pipe_run([(1.3, 2.5, 0.25), (1.62, 2.5, 0.25), (1.62, 2.2, 0.25)], 0.035)
    k.storage_tank(2.45, 0.5, t, 0.22, 0.45)
    k.radar_dish('spin0', 1.85, 0.45, t, 0.12)
    k.stripes(1.5, 2.9, 2.92, n=5)


@model('silo', **BLD)
def ore_silo(k):
    t = k.foundation(1, 1, 'concreteDark')
    k.cyl(0.36, 0.52, (0.5, -0.5, t + 0.26), 'steel', 'z', 18)
    k.sphere(0.36, (0.5, -0.5, t + 0.52), 'team', 18, 7, scale=(1, 1, 0.45), half=True)
    for z in (0.16, 0.34, 0.5):
        k.torus(0.365, 0.014, (0.5, -0.5, t + z), 'steelDark', 'z', 18, 4)
    k.box((0.14, 0.02, 0.3), (0.5, -0.86, t + 0.28), 'ore', bevel=0.004)  # ore gauge window
    k.box((0.04, 0.02, 0.5), (0.8, -0.72, t + 0.26), 'steelDark', rot=(0, 0, 45))  # ladder
    k.pipe_run([(0.14, 0.86, 0.12), (0.14, 0.6, 0.12)], 0.03)


@model('kennel', **BLD)
def kennel(k):
    t = k.foundation(1, 1, 'concreteDark')
    k.slab(0.18, 0.2, 0.82, 0.72, t, 0.32, 'leather', bevel=0.02)
    k.gable(0.18, 0.2, 0.82, 0.72, 0.32, 0.18, 'team', along='y', overhang=0.04)
    k.box((0.16, 0.02, 0.18), (0.5, -0.72, t + 0.09), 'black', bevel=0.02)  # doorway
    k.fence([(0.05, 0.75), (0.05, 0.95), (0.95, 0.95), (0.95, 0.75)])
    k.cyl(0.07, 0.03, (0.78, -0.85, t + 0.015), 'steel', 'z', 10)  # bowl
    k.sphere(0.05, (0.25, -0.86, t + 0.02), 'white', 6, 3, scale=(1.5, 0.4, 0.4))  # bone


@model('helipad', **BLD)
def helipad(k):
    t = k.foundation(2, 2, 'concreteDark')
    k.cyl(0.84, 0.08, (1.0, -1.0, t + 0.04), 'concrete', 'z', 8, bevel=0.02)
    k.cyl(0.78, 0.01, (1.0, -1.0, t + 0.085), 'asphalt', 'z', 8)
    k.torus(0.72, 0.02, (1.0, -1.0, t + 0.09), 'white', 'z', 32, 4)
    for x in (0.82, 1.18):
        k.box((0.06, 0.5, 0.008), (x, -1.0, t + 0.092), 'white')
    k.box((0.36, 0.06, 0.008), (1.0, -1.0, t + 0.092), 'white')
    for a in range(8):
        x, y = 1.0 + 0.8 * math.cos(a * math.pi / 4 + math.pi / 8), 1.0 + 0.8 * math.sin(a * math.pi / 4 + math.pi / 8)
        k.light((x, -y, t + 0.1), 'lamp' if a % 2 else 'greenLamp', 0.022)
    k.slab(1.62, 0.08, 1.95, 0.42, t, 0.38, 'team', bevel=0.02)   # control hut
    k.box((0.25, 0.02, 0.08), (1.78, -0.43, t + 0.26), 'glassDark')
    k.antenna((1.9, -0.15, 0.38), 0.3)
    k.box((0.06, 0.06, 0.2), (0.15, -1.85, t + 0.1), 'hazard')  # windsock pole
    k.cyl(0.03, 0.14, (0.22, -1.85, t + 0.2), 'redLamp' if False else 'hazard', 'x', 6, r2=0.015)


@model('airfield', **BLD)
def airfield(k):
    """4 × 3 apron: four parking pads at the game's slots, tower and dish."""
    t = k.foundation(4, 3, 'concrete')
    for x, y in ((1, 0.95), (3, 0.95), (1, 2.1), (3, 2.1)):
        k.cyl(0.62, 0.012, (x, -y, t + 0.006), 'asphalt', 'z', 28)
        k.torus(0.56, 0.025, (x, -y, t + 0.014), 'white', 'z', 32, 4)
        k.box((0.05, 0.4, 0.006), (x, -y, t + 0.015), 'hazard')
        k.box((0.3, 0.05, 0.006), (x, -(y + 0.36), t + 0.015), 'team')
    for i in range(6):
        k.box((0.05, 0.22, 0.006), (2.0, -(0.25 + i * 0.47), t + 0.006), 'white')
    for i in range(9):
        k.light((0.08 + i * 0.48, -2.93, t + 0.01), 'lamp' if i % 2 else 'greenLamp', 0.022)
    # Control tower between the pads.
    k.cyl(0.14, 0.9, (2.0, -1.52, t + 0.45), 'concrete', 'z', 12, r2=0.11)
    k.cyl(0.26, 0.16, (2.0, -1.52, t + 0.98), 'team', 'z', 8, r2=0.3)
    k.cyl(0.25, 0.12, (2.0, -1.52, t + 1.12), 'glass', 'z', 8)
    k.cyl(0.29, 0.04, (2.0, -1.52, t + 1.2), 'dark', 'z', 8)
    k.antenna((2.1, -1.5, t + 1.22), 0.28)
    k.radar_dish('spin0', 2.0, 0.12, t, 0.14)
    for y in (0.5, 2.55):
        k.slab(1.75, y - 0.1, 2.25, y + 0.1, t, 0.2, 'concreteDark', bevel=0.02)  # fuel bunkers
        k.box((0.1, 0.02, 0.04), (2.0, -(y + 0.1), t + 0.12), 'hazard')


@model('navalYard', **BLD)
def naval_yard(k):
    """Coalition shipyard on the water: piers round a slip, a crane, a works."""
    k.slab(0.05, 0.05, 2.95, 0.7, 0, 0.18, 'concrete', bevel=0.02)        # quay
    for x in (0.05, 2.55):
        k.slab(x, 0.7, x + 0.4, 2.95, 0, 0.16, 'concrete', bevel=0.02)     # piers
        for y in (1.1, 1.6, 2.1, 2.6):
            k.cyl(0.035, 0.24, (x + 0.2, -y, 0.08), 'dark', 'z', 8)
            k.light((x + (0.38 if x < 1 else 0.02), -y, 0.17), 'lamp', 0.018)
    k.slab(0.2, 0.1, 1.3, 0.6, 0.18, 0.62, 'team', bevel=0.03)
    k.slab(0.17, 0.07, 1.33, 0.63, 0.62, 0.66, 'white', bevel=0.01)
    k.window_row(0.3, 1.2, 0.6, 0.45, 5, 0.08)
    k.bay_door(0.75, 0.6, 0.5, 0.3, 0.18)
    crane(k, 'spin0', 2.3, 0.4, 0.18, 0.9, 1.0)
    k.storage_tank(1.65, 0.38, 0.18, 0.16, 0.3)
    k.radar_dish('spin1', 1.0, 0.3, 0.66, 0.1)
    k.stripes(0.5, 2.5, 0.68, 0.181, n=8)


@model('subPen', **BLD)
def sub_pen(k):
    """Union sub pen: a heavy concrete bunker arching over a water slip."""
    k.slab(0.05, 0.05, 2.95, 0.6, 0, 0.2, 'concreteDark', bevel=0.02)
    for x in (0.05, 2.35):
        k.slab(x, 0.6, x + 0.6, 2.95, 0, 0.42, 'concrete', bevel=0.03)
        k.slab(x - 0.02, 0.58, x + 0.62, 2.97, 0.42, 0.46, 'team', bevel=0.01)
    arc = [(-0.95 * math.cos(math.pi * i / 10), 0.42 + 0.4 * math.sin(math.pi * i / 10)) for i in range(11)]
    k.prism(arc, 1.6, (1.5, -1.25, 0), 'concrete', axis='y')
    arc2 = [(-1.0 * math.cos(math.pi * i / 10), 0.44 + 0.42 * math.sin(math.pi * i / 10)) for i in range(11)]
    k.prism(arc2, 0.16, (1.5, -2.1, 0), 'team', axis='y')
    k.box((1.5, 0.04, 0.3), (1.5, -0.47, 0.35), 'black')                   # slip mouth (north)
    k.star(1.5, 2.2, 0.875, 0.16, 'redLamp')
    k.chimney(0.35, 0.3, 0.2, 0.08, 0.5)
    for y in (1.0, 1.6, 2.2):
        for x in (0.62, 2.38):
            k.light((x, -y, 0.3), 'redLamp', 0.02)
    k.storage_tank(2.6, 0.32, 0.2, 0.16, 0.26, 'concreteDark')


@model('industrialPlant', **BLD)
def industrial_plant(k):
    """Union Industrial Plant (3 × 2): sawtooth factory hall, chimneys, conveyor."""
    t = k.foundation(3, 2, 'concreteDark')
    k.slab(0.15, 0.15, 2.2, 1.6, t, 0.45, 'concrete', bevel=0.03)
    for i in range(5):
        y0 = 0.15 + i * 0.29
        k.prism([(-y0, 0.45), (-(y0 + 0.29), 0.45), (-(y0 + 0.29), 0.64)], 2.05, (1.175, 0, 0), 'team', axis='x')
        k.box((2.0, 0.02, 0.16), (1.175, -(y0 + 0.29), 0.54), 'glassDark')
    for x in (2.45, 2.75):
        k.chimney(x, 0.5, t, 0.11, 1.0)
    k.storage_tank(2.6, 1.4, t, 0.22, 0.4)
    k.bay_door(0.8, 1.6, 0.6, 0.32, t)
    k.box((1.0, 0.18, 0.04), (1.7, -1.75, t + 0.12), 'dark', bevel=0.01)  # conveyor
    for i in range(4):
        k.box((0.12, 0.12, 0.1), (1.35 + i * 0.22, -1.75, t + 0.19), 'olive', bevel=0.01)
    k.window_row(1.2, 2.15, 1.6, 0.3, 4, 0.08)
    k.pipe_run([(2.2, 0.8, 0.3), (2.5, 0.8, 0.3), (2.5, 1.2, 0.3)], 0.035)


@model('cloneLab', **BLD)
def clone_lab(k):
    """Union Clone Lab: a lab block and four glowing cloning vats."""
    t = k.foundation(2, 2, 'concreteDark')
    k.slab(0.15, 0.15, 1.85, 0.75, t, 0.5, 'concrete', bevel=0.03)
    k.slab(0.12, 0.12, 1.88, 0.78, 0.5, 0.55, 'team', bevel=0.012)
    k.window_row(0.25, 1.75, 0.75, 0.33, 6, 0.08, mat='psi')
    for x, y in ((0.45, 1.15), (1.0, 1.15), (1.55, 1.15), (1.0, 1.65)):
        k.cyl(0.18, 0.06, (x, -y, t + 0.03), 'steel', 'z', 14)
        k.cyl(0.14, 0.42, (x, -y, t + 0.27), 'psi', 'z', 14)
        k.cyl(0.18, 0.06, (x, -y, t + 0.51), 'steel', 'z', 14)
        k.sphere(0.06, (x, -y, t + 0.28), 'skin', 8, 4, scale=(1, 1, 2))
        k.pipe_run([(x, y - 0.12, t + 0.54), (x, 0.8, t + 0.54)], 0.02)
    k.radar_dish('spin0', 1.6, 0.45, 0.55, 0.1)


@model('phaseShifter', **BLD)
def phase_shifter(k):
    """Coalition Phase Shifter: a platform under a turning ring of emitters."""
    t = k.foundation(2, 2, 'concrete')
    k.cyl(0.85, 0.12, (1.0, -1.0, t + 0.06), 'white', 'z', 24, bevel=0.03)
    k.cyl(0.6, 0.02, (1.0, -1.0, t + 0.13), 'chrono', 'z', 24)
    for a in range(4):
        ang = a * math.pi / 2 + math.pi / 4
        x, y = 1.0 + 0.75 * math.cos(ang), 1.0 + 0.75 * math.sin(ang)
        k.cyl(0.06, 0.5, (x, -y, t + 0.37), 'steel', 'z', 10)
    e = k.empty('spin0', (1.0, -1.0, t + 0.62))
    k.torus(0.72, 0.05, (1.0, -1.0, t + 0.62), 'team', 'z', 32, 6, parent=e)
    for a in range(6):
        ang = a * math.pi / 3
        k.sphere(0.06, (1.0 + 0.72 * math.cos(ang), -1.0 - 0.72 * math.sin(ang), t + 0.62), 'chrono', 8, 4, parent=e)
    k.sphere(0.2, (1.0, -1.0, t + 0.4), 'chrono', 16, 8)
    k.lathe([(0.0, 0.0), (0.12, 0.0), (0.04, 0.22), (0.0, 0.24)], (1.0, -1.0, t + 0.12), 'steelDark', 12)


@model('missileSilo', **BLD)
def missile_silo(k):
    """Union Missile Silo (2 × 1): blast doors, a gantry and warning lights."""
    t = k.foundation(2, 1, 'concreteDark')
    k.slab(0.1, 0.1, 1.3, 0.9, t, 0.16, 'concrete', bevel=0.03)
    for s in (-1, 1):
        k.slab(0.7 + s * 0.27 - 0.25, 0.18, 0.7 + s * 0.27 + 0.25, 0.82, 0.16, 0.2, 'team', bevel=0.012)
        k.box((0.02, 0.6, 0.006), (0.7 + s * 0.04, -0.5, 0.203), 'hazard')
    k.sphere(0.06, (0.7, -0.5, 0.2), 'redLamp', 8, 4, half=True)
    for x, y in ((0.15, 0.15), (1.25, 0.15), (0.15, 0.85), (1.25, 0.85)):
        k.light((x, -y, 0.18), 'redLamp', 0.025)
    k.slab(1.4, 0.15, 1.9, 0.85, t, 0.42, 'concrete', bevel=0.03)
    k.slab(1.37, 0.12, 1.93, 0.88, 0.42, 0.46, 'team', bevel=0.01)
    k.window_row(1.45, 1.85, 0.85, 0.3, 2, 0.08, mat='redLamp')
    k.lattice_tower(1.65, 0.5, 0.46, 0.14, 0.35, 'steelDark', 3)
    k.light((1.65, -0.5, 0.84), 'redLamp', 0.03)


# ── Neutral map buildings ───────────────────────────────────────

@model('civilian-house', **BLD)
def civilian_house(k):
    """A two-storey civilian house with a tiled roof and a garden fence."""
    t = k.foundation(1, 1, 'grass', t=0.03)
    k.slab(0.16, 0.18, 0.84, 0.7, t, 0.42, 'white', bevel=0.02)
    k.gable(0.16, 0.18, 0.84, 0.7, 0.42, 0.24, 'copper', along='x', overhang=0.05)
    k.slab(0.62, 0.22, 0.72, 0.32, 0.5, 0.72, 'concreteDark', bevel=0.008)  # chimney
    k.window_row(0.2, 0.8, 0.7, 0.32, 3, 0.07, w=0.09)
    k.window_row(0.2, 0.42, 0.7, 0.13, 1, 0.07, w=0.09)
    k.box((0.1, 0.02, 0.18), (0.62, -0.705, t + 0.09), 'leather')  # door
    k.fence([(0.05, 0.78), (0.05, 0.95), (0.95, 0.95), (0.95, 0.78)], z=t, h=0.07, mat='white')
    k.sphere(0.07, (0.18, -0.86, t + 0.06), 'olive', 8, 4)


@model('bridgeHut', **BLD)
def bridge_hut(k):
    t = k.foundation(1, 1, 'concreteDark')
    k.slab(0.2, 0.25, 0.8, 0.75, t, 0.34, 'concrete', bevel=0.02)
    k.slab(0.17, 0.22, 0.83, 0.78, 0.34, 0.38, 'hazard', bevel=0.01)
    k.box((0.14, 0.02, 0.2), (0.5, -0.755, t + 0.1), 'steelDark')
    k.window_row(0.22, 0.4, 0.75, 0.24, 1, 0.06, w=0.1)
    k.window_row(0.6, 0.78, 0.75, 0.24, 1, 0.06, w=0.1)
    k.antenna((0.7, -0.35, 0.38), 0.28)
    k.light((0.3, -0.35, 0.4), 'redLamp' if False else 'lamp', 0.02)


def mine(k, glow):
    """A well head on a rocky mound (no pad: mines stand in their fields)."""
    t = 0.0
    k.lathe([(0.0, 0.0), (0.46, 0.0), (0.4, 0.1), (0.22, 0.2), (0.0, 0.2)], (0.5, -0.5, 0), 'concreteDark', 9)
    k.cyl(0.14, 0.04, (0.5, -0.5, 0.21), glow, 'z', 12)
    for a in range(3):
        ang = a * 2 * math.pi / 3 + 0.3
        x, y = 0.5 + 0.3 * math.cos(ang), 0.5 + 0.3 * math.sin(ang)
        k.box((0.05, 0.05, 0.36), (x, -y, 0.3), 'steelDark', rot=(0, 0, math.degrees(ang)))
    k.cyl(0.05, 0.12, (0.5, -0.5, 0.48), 'steelDark', 'z', 8)
    for x, y, r in ((0.2, 0.25, 0.06), (0.8, 0.3, 0.05), (0.75, 0.8, 0.06), (0.22, 0.78, 0.05)):
        k.sphere(r, (x, -y, t + 0.02), glow, 6, 3, scale=(1, 1, 0.7))


@model('oreMine', **BLD)
def ore_mine(k):
    mine(k, 'ore')


@model('gemMine', **BLD)
def gem_mine(k):
    mine(k, 'prism')
