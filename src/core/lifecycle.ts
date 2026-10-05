import type { Importance } from "../schema/index.js";
import { BOOST_ALPHA } from "./decay.js";

/**
 * Forgetting by demotion. A faded memory (strength at or below the floor, not recalled for `idleDays`) is
 * demoted to `archived`: it stops competing in default recall but stays searchable. Production measurement
 * (LoCoMo dev, 180 simulated days): deleting faded memories left never-asked questions at 60.6% accuracy;
 * demoting them kept 86.0%, the same as a fresh store (85.7%).
 */
export interface ForgettingParams {
  /** Strength at or below which a memory counts as faded. */
  strengthFloor: number;
  /** Days without recall before a faded memory is forgotten. */
  idleDays: number;
  mode: "demote" | "delete";
}

export const DEFAULT_FORGETTING: ForgettingParams = { strengthFloor: 0.02, idleDays: 90, mode: "demote" };

export type ForgettingAction = "keep" | "demote" | "delete";

export function forgettingAction(
  memory: { strength: number; importance: Importance; lastRecalledAt?: Date | null; createdAt: Date; state?: string },
  now: Date = new Date(),
  params: ForgettingParams = DEFAULT_FORGETTING,
): ForgettingAction {
  if (memory.importance === "pinned" || memory.state === "archived") return "keep";
  const last = memory.lastRecalledAt ?? memory.createdAt;
  const idle = (now.getTime() - last.getTime()) / 86_400_000;
  if (memory.strength > params.strengthFloor || idle < params.idleDays) return "keep";
  return params.mode;
}

/**
 * Recall-time spreading activation. Its purpose is survival, not ranking: the associates of recalled memories
 * are reinforced so related evidence is not forgotten before it is needed (180-day simulation: 58.3% of
 * not-yet-asked evidence alive vs 55.8% without). Associates are found at recall time, so no edge table is
 * stored (stored edges were ~half of storage and had no measurable accuracy effect).
 */
export const SPREAD_SEEDS = 5;
export const SPREAD_NEIGHBOURS_PER_SEED = 4;
export const SPREAD_MIN_SIMILARITY = 0.65;
export const SPREAD_EPISODE_WEIGHT = 0.7;
export const SPREAD_EPISODE_WINDOW_MINUTES = 60;
/** Share of a full retrieval boost an associate receives. */
export const SPREAD_BOOST = 0.1;

export interface AssociateCandidate {
  id: string;
  /** Cosine similarity to the seed, if it is a similarity neighbour. */
  similarity?: number;
  /** Minutes between this memory and the seed, if it is from the same episode. */
  minutesApart?: number;
}

/**
 * Strength increments for the associates of the top recalled memories: up to SPREAD_NEIGHBOURS_PER_SEED
 * similarity neighbours (>= SPREAD_MIN_SIMILARITY) per seed at weight 1, plus same-episode memories at
 * SPREAD_EPISODE_WEIGHT. Recalled memories themselves are excluded (they get the full boost).
 */
export function spreadingActivationBoosts(
  seeds: Array<{ id: string; candidates: AssociateCandidate[] }>,
  recalledIds: Set<string>,
): Map<string, number> {
  const fullBoost = BOOST_ALPHA * Math.log(2);
  const boosts = new Map<string, number>();
  for (const seed of seeds.slice(0, SPREAD_SEEDS)) {
    const similar = seed.candidates
      .filter((c) => (c.similarity ?? 0) >= SPREAD_MIN_SIMILARITY)
      .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
      .slice(0, SPREAD_NEIGHBOURS_PER_SEED);
    const episode = seed.candidates.filter(
      (c) => c.minutesApart !== undefined && Math.abs(c.minutesApart) <= SPREAD_EPISODE_WINDOW_MINUTES,
    );
    for (const [list, weight] of [[similar, 1], [episode, SPREAD_EPISODE_WEIGHT]] as const) {
      for (const c of list) {
        if (c.id === seed.id || recalledIds.has(c.id)) continue;
        boosts.set(c.id, Math.max(boosts.get(c.id) ?? 0, fullBoost * SPREAD_BOOST * weight));
      }
    }
  }
  return boosts;
}

/**
 * Episode context: single memories rarely answer a question alone. For each seed (the top recalled memories),
 * up to `radius` memories on each side saved within `windowMinutes`, in time order, skipping memories already
 * recalled and repeated texts. LoCoMo test: 85.3% -> 87.3% (p = 0.03).
 */
export function expandEpisodes<T extends { id: string; text: string; occurredAt: Date }>(
  seeds: T[],
  timeline: T[],
  recalled: Set<string>,
  options: { radius?: number; windowMinutes?: number } = {},
): T[] {
  const radius = options.radius ?? 3;
  const windowMs = (options.windowMinutes ?? 60) * 60_000;
  const sorted = [...timeline].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const seenIds = new Set(recalled);
  const seenTexts = new Set(seeds.map((s) => s.text.trim().toLowerCase()));
  const out: T[] = [];
  for (const seed of seeds) {
    const i = sorted.findIndex((m) => m.id === seed.id);
    if (i < 0) continue;
    for (let j = Math.max(0, i - radius); j <= Math.min(sorted.length - 1, i + radius); j++) {
      const m = sorted[j]!;
      if (j === i || seenIds.has(m.id)) continue;
      if (Math.abs(m.occurredAt.getTime() - seed.occurredAt.getTime()) > windowMs) continue;
      const key = m.text.trim().toLowerCase();
      if (seenTexts.has(key)) continue;
      seenIds.add(m.id);
      seenTexts.add(key);
      out.push(m);
    }
  }
  return out;
}
