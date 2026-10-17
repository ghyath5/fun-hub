// @ts-check
/** Pure economy, power, sell and repair rules (sections 5 and 6). */
import { ECONOMY, SELL, REPAIR, POWER } from '../../data/rules.js';

/** @typedef {{ cash: number, stored: number }} Wallet */

/** Credits for a harvester load. @param {number} oreBales @param {number} gemBales */
export const loadValue = (oreBales, gemBales) => oreBales * ECONOMY.oreBaleValue + gemBales * ECONOMY.gemBaleValue;

/**
 * Add harvested credits to stored ore, capped by capacity.
 * @param {Wallet} w @param {number} credits @param {number} capacity
 * @returns {{ wallet: Wallet, lost: number, silosNeeded: boolean }}
 */
export function deposit(w, credits, capacity) {
  const room = Math.max(0, capacity - w.stored);
  const kept = Math.min(room, credits);
  const stored = w.stored + kept;
  const silosNeeded = stored * 1000 >= capacity * Math.round(ECONOMY.silosNeededFraction * 1000) && capacity > 0;
  return { wallet: { cash: w.cash, stored }, lost: credits - kept, silosNeeded };
}

/**
 * Spend from stored ore first, then cash. Never goes negative.
 * @param {Wallet} w @param {number} amount
 * @returns {Wallet | null} New wallet, or null when unaffordable
 */
export function spend(w, amount) {
  if (amount <= 0) return w;
  if (w.stored + w.cash < amount) return null;
  const fromStored = Math.min(w.stored, amount);
  return { stored: w.stored - fromStored, cash: w.cash - (amount - fromStored) };
}

/** Cut stored ore down to a reduced capacity. @param {Wallet} w @param {number} capacity */
export const clampStorage = (w, capacity) => ({ cash: w.cash, stored: Math.min(w.stored, Math.max(0, capacity)) });

/** Displayed credits. @param {Wallet} w */
export const displayCredits = (w) => w.cash + w.stored;

/**
 * Power totals. Output scales with HP (rounded down); drain is always full.
 * @param {{ power: number, hp: number, maxHp: number, active: boolean }[]} structures
 * @returns {{ produced: number, drain: number, ratioK: number, low: boolean, warning: boolean }}
 */
export function powerTotals(structures) {
  let produced = 0;
  let drain = 0;
  for (const s of structures) {
    if (!s.active) continue;
    if (s.power > 0) produced += Math.floor((s.power * s.hp) / s.maxHp);
    else drain -= s.power;
  }
  const ratioK = drain === 0 ? 1000 : Math.floor((produced * 1000) / drain);
  return {
    produced, drain, ratioK,
    low: ratioK < Math.round(POWER.lowPowerBelow * 1000),
    warning: ratioK < Math.round(POWER.warningBelow * 1000),
  };
}

/** Sell refund. @param {number} cost @param {number} hp @param {number} maxHp */
export const sellRefund = (cost, hp, maxHp) => Math.floor((cost * Math.round(SELL.refundFraction * 1000) * hp) / (1000 * maxHp));

/**
 * Survivors from a sold or destroyed structure. The first is an Engineer when
 * cost ≥ 1500; the rest are Riflemen.
 * @param {number} cost @param {number} hp @param {number} maxHp @param {boolean} destroyed
 * @returns {string[]} unit ids
 */
export function survivors(cost, hp, maxHp, destroyed) {
  let n = Math.min(SELL.survivorMax, Math.floor((cost * hp) / (maxHp * SELL.survivorCostDivisor)));
  if (destroyed) n = Math.floor(n * SELL.destroyedSurvivorFactor);
  const out = [];
  for (let i = 0; i < n; i++) out.push(i === 0 && cost >= SELL.engineerCostThreshold ? 'engineer' : 'rifleman');
  return out;
}

/**
 * One structure repair step: HP gained and cost in thousandths of a credit.
 * @param {number} cost @param {number} hp @param {number} maxHp
 */
export function repairStep(cost, hp, maxHp) {
  const gain = Math.max(1, Math.floor(maxHp * REPAIR.hpFractionPerStep));
  return { hp: Math.min(maxHp, hp + gain), costMilli: Math.round(cost * REPAIR.costFractionPerStep * 1000) };
}

/** Steps and total credits to repair from hp to full. @param {number} cost @param {number} hp @param {number} maxHp */
export function repairTotal(cost, hp, maxHp) {
  let steps = 0;
  let milli = 0;
  let h = hp;
  while (h < maxHp) {
    const r = repairStep(cost, h, maxHp);
    h = r.hp;
    milli += r.costMilli;
    steps++;
  }
  return { steps, credits: Math.floor(milli / 1000) };
}
