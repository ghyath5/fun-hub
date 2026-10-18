// @ts-check
/**
 * Shared type definitions. This file exports nothing at runtime; refer to
 * its types from JSDoc only, as `import('./types.js').Command`.
 */

/** @typedef {'coalition' | 'union'} FactionId */
/** @typedef {FactionId | 'both'} FactionScope */
/** @typedef {'none' | 'wood' | 'light' | 'heavy' | 'concrete'} ArmorId */
/** @typedef {'SA' | 'HE' | 'AP' | 'Fire' | 'HollowPoint' | 'Arc' | 'Laser' | 'Bite' | 'Rad' | 'Chrono' | 'Psi' | 'Drone'} WarheadId */
/** @typedef {'foot' | 'wheel' | 'track' | 'float' | 'air'} LocomotorId */
/** @typedef {'G' | 'A' | 'N' | 'S'} HitLayer */
/** @typedef {'structures' | 'defenses' | 'infantry' | 'vehicles' | 'aircraft' | 'naval'} LineId */
/** @typedef {'guard' | 'hold' | 'holdFire'} StanceId */

/**
 * @typedef {object} WeaponDef
 * @property {string} id
 * @property {string} name
 * @property {number} damage        Damage per shot (negative heals)
 * @property {number} burst         Shots per volley
 * @property {number} burstGap      Seconds between shots in a volley
 * @property {number} range         Cells
 * @property {number} minRange      Cells
 * @property {number} cooldown      Seconds
 * @property {WarheadId | null} warhead
 * @property {number} splash        Cells
 * @property {string} projectile    instant | shell | fastShell | arc | homing | missile | melee | beam | strafe | dropped | torpedo
 * @property {number} speed         Projectile speed, cells/s (0 = instant)
 * @property {number} scatter       Max landing offset at full range, cells
 * @property {HitLayer[]} hits
 * @property {number} ammo          0 = unlimited
 * @property {number} chargeUp      Seconds of wind-up before the shot
 * @property {number} leap          Melee leap distance, cells
 * @property {'infantry' | 'friendlyInfantry' | 'ships' | 'subs' | null} only
 * @property {boolean} powered      Needs the owner's full power to fire
 * @property {'mindControl' | null} effect  Special effect on a direct hit instead of damage
 */

/**
 * @typedef {object} UnitDef
 * @property {string} id
 * @property {string} name
 * @property {FactionScope} faction
 * @property {LineId} line
 * @property {number} cost
 * @property {number} hp
 * @property {ArmorId} armor
 * @property {LocomotorId} loco
 * @property {number} speed        Cells per second
 * @property {number} sight        Cells
 * @property {string[]} weapons    Weapon ids
 * @property {boolean} turret
 * @property {'none' | 'infantry' | 'sandbags'} crusher
 * @property {string[]} requires   Roles
 * @property {number} turnRate     Facing units per tick
 * @property {number} limit        0 = no build limit
 * @property {number} capacity     Transport slots (0 = not a transport)
 * @property {number} slots        Slots this unit takes in a naval transport
 * @property {string[]} tags       Behaviour flags
 * @property {'helipad' | 'airfield'} [pad]  Aircraft: the pad it is built on and rearms at (default: helipad for helicopters, airfield for planes)
 */

/**
 * @typedef {object} StructureDef
 * @property {string} id
 * @property {string} name
 * @property {string} role
 * @property {FactionScope} faction
 * @property {'structures' | 'defenses'} line
 * @property {number} cost          0 for the Construction Yard (comes from an MCV)
 * @property {number} power         Positive = output, negative = drain
 * @property {number} hp
 * @property {number} w
 * @property {number} h
 * @property {string[]} requires
 * @property {ArmorId} armor
 * @property {number} sight
 * @property {number} storage
 * @property {boolean} water        Footprint must be water
 * @property {{x: number, y: number} | null} exit   Cell relative to footprint origin
 * @property {{x: number, y: number} | null} dock
 * @property {{x: number, y: number} | null} pad
 * @property {number[][]} [padSpots]  Aircraft pads: parking spots (one per aircraft), cells from the footprint corner
 * @property {string | null} weapon
 * @property {string[]} powers  Support powers granted (each gated by its own faction)
 * @property {boolean} wall
 * @property {boolean} capturable
 * @property {string[]} tags
 */

/**
 * @typedef {object} Command
 * @property {number} tick
 * @property {number} playerId
 * @property {string} type
 * @property {number[]} entityIds
 * @property {*} target
 */

/**
 * @typedef {object} Cell
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {object} MapData
 * @property {string} id
 * @property {string} name
 * @property {number} width
 * @property {number} height
 * @property {number} maxPlayers
 * @property {string} theme
 * @property {Uint8Array} terrain     Terrain type index per cell (see data/terrain.js)
 * @property {Uint8Array} bales       Resource bales per cell
 * @property {Uint8Array} gem         1 when the resource in the cell is gems
 * @property {Cell[]} starts
 * @property {{cells: number[][], hut: number[]}[]} bridges
 * @property {{type: string, x: number, y: number}[]} neutral
 */

/**
 * @typedef {object} Rng
 * @property {() => number} int32   Signed 32-bit integer
 * @property {(n: number) => number} int   Integer in [0, n)
 * @property {() => number} float   Float in [0, 1) — cosmetic and noise seeding only
 * @property {() => object} state   Exportable state for saves
 */

export {};
