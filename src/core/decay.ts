import type { Importance } from "../schema/index.js";

/**
 * Strength model used in production by MemVault (SkillVault): Ebbinghaus decay with a savings effect.
 * A default memory falls to ~5% of its initial strength over DEFAULT_DECAY_WINDOW_DAYS without reinforcement;
 * each reinforcement lengthens that window by 25% (up to 20 reinforcements, 6x).
 */
export const DEFAULT_DECAY_WINDOW_DAYS = 90;
export const PINNED_STRENGTH = 1.0;
export const HIGH_INITIAL_STRENGTH = 0.8;
export const DEFAULT_INITIAL_STRENGTH = 0.4;
export const MIN_DECAYED_STRENGTH = 0.01;
/** Reinforcement on recall: S += BOOST_ALPHA * ln(1 + retrievals in the window). */
export const BOOST_ALPHA = 0.17;
/** Project scope bonus in the re-rank score. */
export const SCOPE_BONUS = 0.1;

const INVARIANT_PATTERNS = [
  /anaphylactic/i,
  /life-threatening\s+allergy/i,
  /epipen/i,
  /severe\s+allergy/i,
  /never\s+disclose/i,
  /critical.*invariant/i,
  /confidential.*invariant/i,
  /strict.*invariant/i,
  /prescription\s+medication.*anxiety/i,
];

export function isInvariantContent(text: string): boolean {
  if (!text) return false;
  return INVARIANT_PATTERNS.some((pat) => pat.test(text));
}

export function getInitialStrength(importance: Importance, text?: string): number {
  if (importance === "pinned" || (text && isInvariantContent(text))) {
    return PINNED_STRENGTH;
  }
  switch (importance) {
    case "high":
      return HIGH_INITIAL_STRENGTH;
    case "default":
    default:
      return DEFAULT_INITIAL_STRENGTH;
  }
}

/**
 * Decayed strength after `elapsedMs` without reinforcement:
 *   S(t) = S_0 * exp(-t / tau),  tau = T_eff / 3,  T_eff = windowDays * (1 + 0.25 * min(B, 20))
 * where B is the number of reinforcements (the savings effect).
 */
export function calculateDecayedStrength(
  initialStrength: number,
  elapsedMs: number,
  boostCount: number = 0,
  importance: Importance = "default",
  decayWindowDays: number = DEFAULT_DECAY_WINDOW_DAYS,
  text?: string,
): number {
  if (importance === "pinned" || (text && isInvariantContent(text))) {
    return PINNED_STRENGTH;
  }

  // Garbage in, floor out. Callers can pass NaN here via unparseable date
  // arithmetic, and NaN propagates through every downstream score
  // comparison (NaN < x is always false, so rankers keep the row and sort
  // unpredictably). A memory we cannot date must rank last, never break
  // ordering. Future-dated (negative) elapsed still clamps to zero below.
  if (
    !Number.isFinite(elapsedMs) ||
    !Number.isFinite(boostCount) ||
    !Number.isFinite(initialStrength) ||
    !Number.isFinite(decayWindowDays)
  ) {
    return MIN_DECAYED_STRENGTH;
  }

  const elapsedDays = Math.max(0, elapsedMs / (1000 * 60 * 60 * 24));
  const effectiveWindowDays = decayWindowDays * (1 + 0.25 * Math.min(Math.max(0, boostCount), 20));
  const tau = effectiveWindowDays / 3;
  const decayed = initialStrength * Math.exp(-elapsedDays / tau);

  return Math.max(MIN_DECAYED_STRENGTH, Math.min(1.0, decayed));
}

/** Reinforcement on recall, with diminishing returns for repeated retrievals in the same window. */
export function boostStrengthOnAccess(
  currentStrength: number,
  importance: Importance,
  retrievalsInWindow: number = 1,
): number {
  if (importance === "pinned") {
    return PINNED_STRENGTH;
  }
  return Math.min(1.0, currentStrength + BOOST_ALPHA * Math.log(1 + Math.max(1, retrievalsInWindow)));
}

export function calculateReRankScore(
  item: {
    memoryId: string;
    similarity: number;
    strength: number;
    createdAt?: Date;
    isProjectMatch?: boolean;
    /** The memory is linked to the query's entities in the knowledge graph. */
    isGraphConnected?: boolean;
    /** Strength of that graph link, 0..1. */
    graphLinkStrength?: number;
  },
  now: Date = new Date(),
  graphBoost: number = 0.15,
): number {
  // Cued Reactivation Dynamics:
  // When an explicit retrieval cue strongly matches a memory (similarity >= 0.25),
  // the semantic resonance depolarizes the memory and reactivates it, preventing
  // passive temporal decay from burying historical facts when explicitly queried.
  // When similarity is weak (< 0.20), recency/strength prevents ambient stale noise from surfacing.
  const cueActivation = Math.min(1.0, Math.pow(Math.max(0, item.similarity) / 0.40, 2));
  const effectiveStrength = item.strength * (1.0 - cueActivation) + 1.0 * cueActivation;

  let score = item.similarity * 0.75 + effectiveStrength * 0.25;
  if (item.isProjectMatch) {
    score += SCOPE_BONUS;
  }
  if (item.isGraphConnected) score += graphBoost;
  score += graphBoost * Math.max(0, Math.min(1, item.graphLinkStrength ?? 0));
  return score;
}
