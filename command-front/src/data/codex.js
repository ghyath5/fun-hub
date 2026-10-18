// @ts-check
/**
 * Field manual: the words in the info card of every unit and building
 * (ui/codex.js adds the numbers from the rule tables). Presentation only —
 * never read by the sim.
 *
 *   about    what it is, in one or two sentences
 *   bestFor  what to use it for
 *   weakTo   what beats it (omitted when nothing in particular does)
 */

/** @typedef {{ about: string, bestFor: string, weakTo?: string }} CodexText */

/** @type {Readonly<Record<string, CodexText>>} */
export const CODEX = Object.freeze({
  // ── Infantry ──────────────────────────────────────────────
  rifleman: { about: 'Cheap, quick to train foot soldier with a rifle.', bestFor: 'Massing early, shooting other infantry and guarding against anti-tank troopers.', weakTo: 'Tanks (they run him over), Grenadiers, Flame Troopers and flame towers.' },
  rocketTrooper: { about: 'Soldier with a guided rocket launcher that can also shoot at aircraft.', bestFor: 'Killing tanks and helicopters from behind a screen of riflemen.', weakTo: 'Riflemen, machine guns and anything that splashes infantry.' },
  engineer: { about: 'Unarmed specialist who walks into a building to work on it. Used up on entry.', bestFor: 'Capturing enemy or neutral buildings (enemy ones must be at a quarter health or less; above that he damages them by a third instead), fully repairing your own, and fixing broken bridges at their repair hut.', weakTo: 'Everything — escort him.' },
  grenadier: { about: 'Lobs grenades in an arc; the blast hurts everything near where it lands.', bestFor: 'Breaking clumps of infantry and hitting buildings.', weakTo: 'Tanks and fast units that close in; grenades can scatter and miss moving targets.' },
  flameTrooper: { about: 'Short-range flamethrower that sets the ground in front of him alight.', bestFor: 'Clearing infantry and burning buildings up close.', weakTo: 'Anything that outranges him, and armoured vehicles.' },
  hound: { about: 'Very fast attack dog that leaps on infantry and kills most of them in one bite.', bestFor: 'Hunting infantry, Engineers and Spies — Hounds see through a Spy\'s disguise.', weakTo: 'Any vehicle (it cannot bite them) and machine guns.' },
  medic: { about: 'Field medic who heals wounded friendly infantry nearby. Does not attack.', bestFor: 'Keeping an infantry army alive between fights.', weakTo: 'Anything that shoots at him — keep him behind the line.' },
  spy: { about: 'Looks like a friendly soldier to the enemy (only Hounds can tell). Walks into an enemy building and is used up.', bestFor: 'Infiltrating: a Radar Dome shares their radar, a Refinery or Silo shows their money, a Barracks / War Factory / Helipad / Airfield shows what they are building (3 min), a Naval Yard pings their submarines, anything else reveals the area around it.', weakTo: 'Hounds, and any attack once he is spotted.' },
  thief: { about: 'Walks into an enemy Ore Refinery or Ore Silo and is used up.', bestFor: 'Stealing half of the enemy\'s stored ore money for yourself.', weakTo: 'Defenses and guards around their refineries.' },
  guardTrooper: { about: 'Anti-tank soldier with guided rockets, sturdier than he looks.', bestFor: 'Holding off tanks cheaply, especially in groups.', weakTo: 'Riflemen, the Rotary Tank and splash weapons. Cannot shoot aircraft.' },
  marksman: { about: 'Sniper with a long-range rifle that kills most infantry in one shot. Sees far.', bestFor: 'Picking off infantry and specialists from a safe distance.', weakTo: 'Any vehicle — his rifle cannot hurt them.' },
  shockTrooper: { about: 'Heavily protected soldier with an arc gun that hurts every kind of target equally.', bestFor: 'A tough all-rounder against infantry, vehicles and buildings alike.', weakTo: 'Splash damage and tanks that run infantry over; slow on foot.' },
  flakTrooper: { about: 'Soldier with a flak gun for aircraft and a rifle for ground targets.', bestFor: 'Protecting an infantry group from helicopters and planes.', weakTo: 'Tanks — his rifle barely scratches them.' },
  commando: { about: 'Elite soldier: a long-range rifle that kills infantry in one shot, and C4 that destroys any enemy building 3 s after he plants it. Only one at a time.', bestFor: 'Raids — slip into the enemy base and blow up key buildings one by one.', weakTo: 'Vehicles, defenses and Hounds. An Aegis Field stops his C4.' },

  // ── Vehicles ──────────────────────────────────────────────
  harvester: { about: 'Armoured truck that gathers ore and gems and brings them to your Refinery. Unarmed.', bestFor: 'Your income — more Harvesters means more money.', weakTo: 'Any attacker. Keep fields near defended ground, and protect them.' },
  mcv: { about: 'Mobile Construction Vehicle. Deploys into a new Construction Yard.', bestFor: 'Starting a second base near distant ore fields, or rebuilding after losing your Yard.', weakTo: 'Anything — it is slow and unarmed. Escort it.' },
  mineLayer: { about: 'Lays mines (5 per trip, refilled at a Service Depot). Coalition mines stop vehicles; Union mines stop infantry.', bestFor: 'Sealing chokepoints and ore fields against raids.', weakTo: 'It is unarmed — keep it out of fights.' },
  ranger: { about: 'Very fast armoured car with a machine gun. Sees far.', bestFor: 'Scouting, chasing infantry and raiding harvesters.', weakTo: 'Tanks and anti-tank infantry.' },
  apc: { about: 'Tracked armoured carrier with a machine gun. Carries 5 infantry.', bestFor: 'Moving infantry safely to the front or into the enemy base.', weakTo: 'Tanks and anti-tank rockets.' },
  lightTank: { about: 'Fast, cheap tank with a 75 mm gun. Runs over infantry.', bestFor: 'Early pressure and fast raids in numbers.', weakTo: 'Heavier tanks and anti-tank infantry.' },
  mediumTank: { about: 'The Coalition\'s main battle tank: tougher and harder-hitting than the Light Tank.', bestFor: 'The backbone of a tank army.', weakTo: 'Anti-tank infantry in numbers, Arc weapons and air attack.' },
  artillery: { about: 'Towed howitzer that fires big shells from long range, but cannot hit anything closer than 2 cells.', bestFor: 'Shelling defenses and clumped units from behind your army.', weakTo: 'Anything that gets close — it is fragile.' },
  ifv: { about: 'Fast wheeled carrier with a twin rocket pod that hits ground and air targets.', bestFor: 'Escorting tank columns against helicopters and light vehicles.', weakTo: 'Heavy tanks and massed infantry.' },
  laserTank: { about: 'Fires a powerful laser that is effective against every kind of target, with good range.', bestFor: 'Long-range fire support against anything on the ground.', weakTo: 'Close assault — its armour is light — and anti-tank rockets.' },
  salvoLauncher: { about: 'Rocket artillery: fires a salvo of 6 rockets over a wide area from long range (not closer than 3 cells).', bestFor: 'Breaking groups of infantry and light vehicles and softening bases before an attack.', weakTo: 'Anything that reaches it — it is fragile — and long reloads between salvos.' },
  flakTrack: { about: 'Fast halftrack with a flak cannon for aircraft and a machine gun for the ground. Carries 5 infantry.', bestFor: 'Air defence that keeps up with the army, and moving infantry.', weakTo: 'Tanks and anti-tank rockets.' },
  rotaryTank: { about: 'Tank with a rapid-fire rotary cannon that hits ground and air.', bestFor: 'Shredding infantry (anti-tank troopers too) and helicopters.', weakTo: 'Other tanks — its bullets do little against heavy armour.' },
  arcTank: { about: 'Tank with an arc cannon that does full damage to every kind of target.', bestFor: 'Breaking through mixed armies and defenses.', weakTo: 'Anti-tank infantry in numbers and air attack; slow to reload.' },
  heavyTank: { about: 'The Union\'s main battle tank: twin 105 mm guns and thick armour.', bestFor: 'Winning tank battles head-on.', weakTo: 'Anti-tank infantry in numbers, air attack and artillery.' },
  titanTank: { about: 'Huge tank with twin 120 mm guns and missiles that also hit aircraft. Repairs itself when badly damaged. Crushes sandbag walls.', bestFor: 'Leading an assault — very hard to kill.', weakTo: 'Massed anti-tank weapons; very slow and expensive.' },
  ballisticLauncher: { about: 'Fires a single huge missile from very long range (not closer than 3 cells), with a long reload.', bestFor: 'Destroying buildings and defenses from outside their reach.', weakTo: 'Anything that reaches it — it is fragile.' },

  // ── Aircraft ──────────────────────────────────────────────
  transportHeli: { about: 'Unarmed helicopter that carries 5 infantry and lands anywhere clear.', bestFor: 'Dropping Engineers, Spies or a squad behind enemy lines.', weakTo: 'Any anti-air.' },
  attackHeli: { about: 'Armoured helicopter with 6 rockets, rearmed on its Helipad.', bestFor: 'Hunting tanks and harvesters fast, anywhere on the map.', weakTo: 'Anti-air guns, SAM Sites, Rocket and Flak Troopers.' },
  attackPlane: { about: 'Fast plane with a chain gun (15 bursts) that strafes, then flies home to rearm.', bestFor: 'Quick strikes on infantry, light vehicles and harvesters.', weakTo: 'Anti-air — it is fragile.' },
  strikeJet: { about: 'Jet with 4 missiles that hit ground and air targets, then flies home to rearm.', bestFor: 'Hitting tanks and key targets, or shooting down enemy aircraft.', weakTo: 'Anti-air — it is fragile.' },
  siegeAirship: { about: 'Slow, heavily armoured airship that drops big bombs straight down.', bestFor: 'Flattening bases and defenses that lack anti-air.', weakTo: 'Anti-air — it is too slow to escape. It cannot hit aircraft.' },

  // ── Ships ─────────────────────────────────────────────────
  gunboat: { about: 'Small fast warship with a deck gun and depth charges against submarines.', bestFor: 'Patrolling coasts and hunting submarines early.', weakTo: 'Bigger ships and submarines\' torpedoes.' },
  destroyer: { about: 'Warship with twin guns, depth charges and anti-air missiles. Detects submerged submarines nearby.', bestFor: 'Escorting a fleet: it covers it against submarines and aircraft.', weakTo: 'Massed submarines and Cruisers\' long-range fire.' },
  cruiser: { about: 'Big warship with a long-range cannon (22 cells) that shells the shore. Cannot hit targets closer than 4 cells.', bestFor: 'Bombarding bases and defenses from the sea.', weakTo: 'Submarines and anything close in.' },
  submarine: { about: 'Stays hidden underwater until it fires its torpedoes, which hit ships only.', bestFor: 'Sinking enemy ships.', weakTo: 'Destroyers and Gunboats (depth charges). Cannot attack land.' },
  navalTransport: { about: 'Unarmed boat that carries 5 infantry (large vehicles take two places) across water.', bestFor: 'Landings on another shore.', weakTo: 'Any warship, submarine or aircraft.' },

  // ── Base ──────────────────────────────────────────────────
  constructionYard: { about: 'Your base\'s heart: it builds every building and defense. Comes from deploying an MCV.', bestFor: 'Build near it — new buildings must go close to ones you have.', weakTo: 'Losing it stops all new buildings until you deploy another MCV.' },
  powerPlant: { about: 'Produces power for your base.', bestFor: 'Keeping power above use — low power slows building and shuts down radar, powered defenses and superweapon charging.', weakTo: 'Losing power plants mid-fight switches your defenses off.' },
  advPowerPlant: { about: 'Produces twice the power of a Power Plant.', bestFor: 'Powering a large base in less space.', weakTo: 'Losing one costs a lot of power at once.' },
  refinery: { about: 'Turns ore into money and stores some. Comes with a free Harvester.', bestFor: 'Income — build one near each ore field you work.', weakTo: 'Thieves and Spies; raids on its Harvesters.' },
  silo: { about: 'Stores extra ore money.', bestFor: 'When the announcer says "Silos needed": storage is full and new ore would be wasted.', weakTo: 'Thieves can steal from it.' },
  barracks: { about: 'Trains infantry.', bestFor: 'Each extra Barracks trains infantry faster.' },
  warFactory: { about: 'Builds vehicles.', bestFor: 'Each extra War Factory builds vehicles faster.' },
  radarDome: { about: 'Turns on the minimap and unlocks more advanced units and buildings.', bestFor: 'Seeing the battlefield and reaching the next tech step. Needs power.', weakTo: 'Spies (they share your radar with the enemy).' },
  serviceDepot: { about: 'Repairs vehicles parked on it (for a fee) and reloads Mine Layers.', bestFor: 'Sending damaged tanks back to fight again. Also unlocks the MCV and Mine Layer.' },
  techCenter: { about: 'Unlocks the top units and buildings, and the Satellite Uplink, which reveals the whole map once.', bestFor: 'Late-game power: superweapons, Commando, Titan Tank, Cruiser and more. Uses a lot of power.' },
  kennel: { about: 'Breeds Hounds.', bestFor: 'Training Hounds to hunt infantry and Spies.' },
  helipad: { about: 'Builds helicopters; each Helipad parks, rearms and repairs one.', bestFor: 'One pad per helicopter you want to keep.' },
  airfield: { about: 'Builds planes and airships; each Airfield parks, rearms and repairs one. Gives the Spy Plane and Paradrop support powers.', bestFor: 'One airfield per aircraft you want to keep, plus scouting and surprise paratroopers.' },
  navalYard: { about: 'Builds ships. Must be built on water next to your base.', bestFor: 'Starting a navy on water maps.' },
  subPen: { about: 'Builds submarines and ships. Must be built on water next to your base.', bestFor: 'Starting a navy on water maps.' },
  phaseShifter: { about: 'Superweapon: teleports one of your vehicles to a spot you choose.', bestFor: 'Dropping a heavy tank or a Harvester where the enemy does not expect it.' },
  aegisProjector: { about: 'Superweapon: makes one vehicle or building impossible to damage for 45 s.', bestFor: 'Saving a key building or pushing a tank through heavy fire.' },
  stormGenerator: { about: 'Superweapon: calls a lightning storm on a target area — about 40 strikes over 14 s, after a 3 s warning everyone hears.', bestFor: 'Wrecking a base or an army that stays in one place.' },
  missileSilo: { about: 'Superweapon: an atomic missile that destroys almost everything in a wide area.', bestFor: 'Removing a cluster of key buildings in one blow.' },
  oreProcessor: { about: 'Makes every load of ore and gems worth 25% more. One per player.', bestFor: 'A stronger economy without more Harvesters.' },
  industrialPlant: { about: 'Makes vehicles, aircraft and ships 25% cheaper. One per player.', bestFor: 'Big vehicle armies.' },
  cloneLab: { about: 'Every soldier trained comes out with a free twin (not Engineers, Spies, Thieves, Commandos or Hounds). One per player.', bestFor: 'Doubling an infantry army for the same money.' },
  sensorArray: { about: 'Sees a wide area (16 cells) around it while powered.', bestFor: 'Watching approaches and ore fields far from your base.' },

  // ── Defenses ──────────────────────────────────────────────
  sandbagWall: { about: 'Cheap wall that blocks ground units. Heavy tanks can crush it.', bestFor: 'Funnelling attackers into your defenses. Drag to draw a line.' },
  concreteWall: { about: 'Strong wall that blocks ground units.', bestFor: 'Shielding defenses and closing gaps. Drag to draw a line.' },
  pillbox: { about: 'Bunker with a machine gun.', bestFor: 'Stopping infantry.', weakTo: 'Tanks and artillery.' },
  camoPillbox: { about: 'Pillbox hidden from the enemy until they come close or it fires.', bestFor: 'Ambushing infantry.', weakTo: 'Tanks and artillery once spotted.' },
  gunTurret: { about: 'Rotating cannon turret.', bestFor: 'Stopping tanks and vehicles.', weakTo: 'Infantry swarms and artillery.' },
  aaGun: { about: 'Rapid flak gun against aircraft. Needs power.', bestFor: 'Shooting down helicopters and planes over your base.', weakTo: 'It cannot shoot ground units.' },
  beamTower: { about: 'Laser tower that hits every kind of ground target hard. Needs power.', bestFor: 'The Coalition\'s strongest all-round base defense.', weakTo: 'Artillery from outside its range, and losing power.' },
  shroudGenerator: { about: 'Covers the area around it (10 cells) in black again for the enemy, unless their units are looking at it right now. Needs power.', bestFor: 'Keeping your base layout and army secret.' },
  flameTower: { about: 'Tower that blasts flame at close range.', bestFor: 'Burning infantry that comes near.', weakTo: 'Tanks and anything that outranges it.' },
  arcTower: { about: 'Tower that fires a powerful arc bolt that hurts every kind of target. Needs lots of power.', bestFor: 'The Union\'s strongest base defense.', weakTo: 'Artillery from outside its range, and losing power.' },
  sentryGun: { about: 'Fast machine-gun turret.', bestFor: 'Stopping infantry.', weakTo: 'Tanks and artillery.' },
  longGun: { about: 'Big artillery emplacement that shells targets far away (12 cells) but not closer than 3 cells. Needs power.', bestFor: 'Hitting enemy artillery and armies before they reach your base.', weakTo: 'Units that get close, and losing power.' },
  samSite: { about: 'Missile launcher against aircraft, with long range. Needs power.', bestFor: 'Area air defense for your base.', weakTo: 'It cannot shoot ground units.' },
});

/** The words for a type, or a plain fallback for anything not written up yet. @param {string} type */
export const codexText = (type) => CODEX[type] ?? { about: '', bestFor: '' };
