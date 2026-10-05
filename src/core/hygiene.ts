export const MILESTONE_NOISE_PATTERNS = [
  /^(?:Milestone(?:\s*\([^)]*\))?|Status|Progress):\s*(?:pushed|merged|completed|overhauled|fixed|built|streamlined|resolved|re-ran|closed PR|PR #|[a-z0-9_-]+\s+built|[a-z0-9_-]+\s+merged|post-deploy)/i,
  /^Commit \[[0-9a-f]+\] by /i,
  /post-deploy (?:check|hash check) (?:PASSED|FAILED)/i,
];

export const SUPERSESSION_TARGET_PATTERNS = [
  /(?:supersedes|correction for|replaces):\s*([^\n;]+)/i,
  /^\[SUPERSEDES:\s*([^\]]+?)\s*\]/i,
];

export interface IngestHygieneClassification {
  isNoise: boolean;
  state: "active" | "archived";
  stale_at?: string;
  staleAt?: string;
  last_pruned_reason?: string;
  lastPrunedReason?: string;
  strength?: number;
}

export type StringOrItemWithText =
  | string
  | { text?: string; rawText?: string; raw_text?: string; supersedes?: string };

function resolveText(input: StringOrItemWithText): string {
  if (typeof input === "string") return input;
  if (!input) return "";
  return input.text || input.rawText || input.raw_text || "";
}

/**
 * Checks if incoming memory text represents routine progress, commit, or milestone noise.
 * Routine progress is quarantined as archived so it never pollutes active semantic vector search.
 */
export function isMilestoneNoise(input: StringOrItemWithText): boolean {
  const text = resolveText(input);
  const trimmed = text.trim();
  return MILESTONE_NOISE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Classifies an incoming text payload for ingestion hygiene.
 */
export function classifyIngestHygiene(input: StringOrItemWithText): IngestHygieneClassification {
  if (isMilestoneNoise(input)) {
    const nowIso = new Date().toISOString();
    return {
      isNoise: true,
      state: "archived",
      stale_at: nowIso,
      staleAt: nowIso,
      last_pruned_reason: "routine_milestone",
      lastPrunedReason: "routine_milestone",
      strength: 0.1,
    };
  }

  return {
    isNoise: false,
    state: "active",
  };
}

/**
 * Extracts a target rule or phrase that this new memory explicitly supersedes.
 */
export function extractSupersessionTarget(
  input: StringOrItemWithText,
  explicitTarget?: string
): string | null {
  if (explicitTarget && explicitTarget.trim().length > 0) {
    return explicitTarget.trim();
  }

  if (typeof input !== "string" && input?.supersedes) {
    return input.supersedes.trim();
  }

  const text = resolveText(input);
  for (const pattern of SUPERSESSION_TARGET_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

export interface MemoryWithLifecycle {
  id?: string;
  memoryId?: string;
  text?: string;
  rawText?: string;
  raw_text?: string;
  state?: "active" | "archived" | "stm" | "ltm";
  stale_at?: string;
  staleAt?: string;
  last_pruned_reason?: string;
  lastPrunedReason?: string;
  strength?: number;
  project?: string;
}

/**
 * Applies supersession tombstones to older matching memories when a new correction or override arrives.
 * Matching older rows are retired with stale_at = now() and strength = 0.1.
 */
export function tombstoneSupersededMemories<T extends MemoryWithLifecycle>(
  memories: T[],
  targetPhrase: string,
  projectScope?: string
): { updated: T[]; tombstonedIds: string[]; count: number } {
  const targetLower = targetPhrase.toLowerCase().trim();
  const tombstonedIds: string[] = [];
  const nowIso = new Date().toISOString();

  const updated = memories.map((m) => {
    // If already stale or different project scope, keep unchanged
    if (m.stale_at || m.staleAt) return m;
    if (projectScope && m.project && m.project.toLowerCase() !== projectScope.toLowerCase()) {
      return m;
    }

    const memText = (m.text || m.rawText || m.raw_text || "").toLowerCase();
    const memId = (m.id || m.memoryId || "").toLowerCase();
    const isTargetMatch =
      memText.includes(targetLower) ||
      (memId.length > 0 && memId === targetLower);

    if (isTargetMatch) {
      const matchedId = m.id || m.memoryId || "unknown";
      tombstonedIds.push(matchedId);

      // Mutate in-place for referenced objects and return clone
      m.state = "archived";
      m.stale_at = nowIso;
      m.staleAt = nowIso;
      m.last_pruned_reason = "superseded";
      m.lastPrunedReason = "superseded";
      m.strength = 0.1;

      return {
        ...m,
        state: "archived" as const,
        stale_at: nowIso,
        staleAt: nowIso,
        last_pruned_reason: "superseded",
        lastPrunedReason: "superseded",
        strength: 0.1,
      };
    }

    return m;
  });

  return { updated, tombstonedIds, count: tombstonedIds.length };
}

/**
 * Near-duplicate test for ingestion. Embeddings put "Ran 5k in 27:10" and "Ran 5k in 41:30" above any sensible
 * duplicate threshold, but they are different events; merging them drops routine entries (the outliers
 * surprisal looks for) and re-dates the old entry. Near duplicates must state the same figures.
 */
export const NEAR_DUPLICATE_SIMILARITY = 0.94;

export function sameFigures(a: string, b: string): boolean {
  const figures = (s: string) => (s.match(/\d+(?:[.,:/]\d+)*/g) ?? []).sort().join(" ");
  return figures(a) === figures(b);
}

export function isNearDuplicate(similarity: number, existingText: string, newText: string): boolean {
  return similarity >= NEAR_DUPLICATE_SIMILARITY && sameFigures(existingText, newText);
}
