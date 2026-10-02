import type { PAESlots, RecallResponse } from "../schema/index.js";
import type { MemoryWithLifecycle } from "./hygiene.js";

export const DEFAULT_SIMILARITY_PRECISION_FLOOR = 0.52;
export const SIMILARITY_FLOOR = DEFAULT_SIMILARITY_PRECISION_FLOOR;

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
 * Applies the 0.52 Precision Floor Gate.
 * Memories with similarity < 0.52 are dropped to prevent distractor padding,
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
