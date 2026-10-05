import type { PAESlots, RecallResponse } from "../schema/index.js";
import type { MemoryWithLifecycle } from "./hygiene.js";

/**
 * Relevance floor for recall candidates. 0.35 (with a neural reranker) is the production value: on LoCoMo dev
 * it scored 68.7% vs 64.9% at 0.52 while still returning nothing for 87% of off-topic queries.
 */
export const DEFAULT_SIMILARITY_PRECISION_FLOOR = 0.35;
export const SIMILARITY_FLOOR = DEFAULT_SIMILARITY_PRECISION_FLOOR;

/** Default number of memories per recall (high-context). Callers wanting compact recall pass k = 10. */
export const DEFAULT_RECALL_K = 50;

export interface RecallLimits {
  /** Situational slots returned. */
  situational: number;
  /** Vector candidates fetched before reranking. */
  vectorCandidates: number;
  /** Character budget for the rendered prompt. */
  promptChars: number;
  /** Top memories whose episode neighbours are added. */
  episodeSeeds: number;
}

/**
 * Every recall limit derives from k, so k = 10 reproduces compact recall (LoCoMo test 87.3% at ~1,090 context
 * tokens) and k = 50 the high-context default (91.9% at ~2,830).
 */
export function recallLimits(k: number = DEFAULT_RECALL_K): RecallLimits {
  return {
    situational: Math.max(10, k),
    vectorCandidates: Math.max(50, 2 * k),
    promptChars: Math.max(14_000, 900 * k),
    episodeSeeds: Math.max(3, Math.round(k / 10)),
  };
}

export interface ScoredMemoryCandidate extends MemoryWithLifecycle {
  similarity: number;
  importance?: "pinned" | "high" | "default";
  score?: number;
}

/**
 * Filters out inactive or stale memories from the candidate retrieval pool.
 */
export function filterActiveMemories<T extends MemoryWithLifecycle>(memories: T[]): T[] {
  return memories.filter((m) => {
    if (m.stale_at || m.staleAt) return false;
    if (m.state === "archived") return false;
    return true;
  });
}

/**
 * Applies the precision floor gate.
 * Memories below the floor are dropped to prevent distractor padding,
 * unless they are explicitly pinned invariants (which are always immune).
 */
export function applyPrecisionFloor<T extends ScoredMemoryCandidate>(
  candidates: T[],
  floor: number = DEFAULT_SIMILARITY_PRECISION_FLOOR
): T[] {
  return candidates.filter((item) => {
    if (item.importance === "pinned") return true;
    return item.similarity >= floor;
  });
}

/**
 * Generates an honest, unpadded empty recall response when zero memories qualify.
 */
export function createHonestEmptyResponse(query: string = ""): RecallResponse {
  const emptySlots: PAESlots = {
    user_query: query,
    direct_answer: [],
    asker_context: [],
    situational_context: [],
    anomaly_flags: [],
  };

  const textNotice = query
    ? `[MEMVAULT]\nNo relevant memories found for: "${query}"\n`
    : `[MEMVAULT]\nNo memories found matching query.\n`;

  return {
    rawText: textNotice,
    slots: emptySlots,
    format: "acm-slotted-v1",
    lens: "agent",
  };
}
