import type { Importance, MemoryScope } from "../schema/index.js";

export const DEFAULT_DECAY_CONSOLIDATION_FLOOR = 0.20;
export const DEFAULT_SEMANTIC_AXIOM_STRENGTH = 0.85;

export interface EpisodicMemoryRecord {
  id: string;
  text: string;
  importance: Importance;
  strength: number;
  occurredAt?: string;
  scope?: MemoryScope;
  tags?: string[];
}

export interface ConsolidatedSemanticAxiom {
  id: string;
  text: string;
  importance: Importance;
  strength: number;
  sourceEpisodicIds: string[];
  createdAt: string;
  scope?: MemoryScope;
}

export interface ConsolidationResult {
  activeMemories: EpisodicMemoryRecord[];
  newAxioms: ConsolidatedSemanticAxiom[];
  prunedMemoryIds: string[];
  prunedCount: number;
  spaceReductionRatio: number;
}

export interface ConsolidationOptions {
  decayFloor?: number;
  minClusterSize?: number;
  synthesizer?: (cluster: EpisodicMemoryRecord[]) => string;
}

/**
 * Identifies episodic memories whose retention strength has fallen below the
 * decay consolidation floor. Pinned memories are strictly excluded.
 */
export function identifyConsolidationCandidates(
  memories: EpisodicMemoryRecord[],
  decayFloor: number = DEFAULT_DECAY_CONSOLIDATION_FLOOR
): EpisodicMemoryRecord[] {
  return memories.filter(
    (m) => m.importance !== "pinned" && m.strength <= decayFloor
  );
}

/**
 * Computes simple token-level Jaccard similarity between two texts.
 */
function tokenSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const setB = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Clusters decaying episodic traces based on shared semantic tokens, tags, or projects.
 */
export function clusterEpisodicTraces(
  candidates: EpisodicMemoryRecord[],
  similarityThreshold: number = 0.25
): EpisodicMemoryRecord[][] {
  const visited = new Set<string>();
  const clusters: EpisodicMemoryRecord[][] = [];

  for (let i = 0; i < candidates.length; i++) {
    const root = candidates[i]!;
    if (visited.has(root.id)) continue;

    const currentCluster: EpisodicMemoryRecord[] = [root];
    visited.add(root.id);

    for (let j = i + 1; j < candidates.length; j++) {
      const other = candidates[j]!;
      if (visited.has(other.id)) continue;

      // Project match + token overlap
      const sameScope =
        !root.scope?.project ||
        !other.scope?.project ||
        root.scope.project.toLowerCase() === other.scope.project.toLowerCase();

      if (sameScope && tokenSimilarity(root.text, other.text) >= similarityThreshold) {
        currentCluster.push(other);
        visited.add(other.id);
      }
    }

    clusters.push(currentCluster);
  }

  return clusters;
}

/**
 * Default rule-based synthesizer that merges episodic memories into a unified semantic axiom.
 */
export function defaultSynthesizeAxiom(cluster: EpisodicMemoryRecord[]): string {
  if (cluster.length === 1) {
    return `Consolidated Semantic Knowledge: ${cluster[0]!.text.replace(/^(yesterday|last week|on \w+|at \d+:\d+)\s*,?\s*/i, "")}`;
  }

  // Extract recurring key terms
  const tokenFreq = new Map<string, number>();
  for (const item of cluster) {
    const tokens = item.text.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    for (const t of new Set(tokens)) {
      tokenFreq.set(t, (tokenFreq.get(t) ?? 0) + 1);
    }
  }

  const topThemes = Array.from(tokenFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([w]) => w)
    .join(", ");

  return `Consolidated Semantic Habit / Fact [Themes: ${topThemes}]: Abstracted across ${cluster.length} historical episodic events. Pattern: ${cluster[0]!.text}`;
}

/**
 * Runs the Synaptic Consolidation Daemon (Complementary Learning Systems).
 * Decayed episodic memories are merged into durable semantic axioms,
 * pruning individual leaves to enforce bounded memory size.
 */
export function runSynapticConsolidation(
  memories: EpisodicMemoryRecord[],
  options: ConsolidationOptions = {}
): ConsolidationResult {
  const decayFloor = options.decayFloor ?? DEFAULT_DECAY_CONSOLIDATION_FLOOR;
  const minClusterSize = options.minClusterSize ?? 2;
  const synthesizer = options.synthesizer ?? defaultSynthesizeAxiom;

  const candidates = identifyConsolidationCandidates(memories, decayFloor);
  const clusters = clusterEpisodicTraces(candidates);

  const newAxioms: ConsolidatedSemanticAxiom[] = [];
  const prunedIds = new Set<string>();

  for (const cluster of clusters) {
    if (cluster.length >= minClusterSize) {
      const sourceIds = cluster.map((m) => m.id);
      for (const id of sourceIds) prunedIds.add(id);

      const axiomText = synthesizer(cluster);
      newAxioms.push({
        id: `axiom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text: axiomText,
        importance: "high",
        strength: DEFAULT_SEMANTIC_AXIOM_STRENGTH,
        sourceEpisodicIds: sourceIds,
        createdAt: new Date().toISOString(),
        scope: cluster[0]?.scope,
      });
    }
  }

  // Active memories = original memories not pruned, plus the newly consolidated axioms
  const remainingEpisodic = memories.filter((m) => !prunedIds.has(m.id));
  const activeMemories: EpisodicMemoryRecord[] = [
    ...remainingEpisodic,
    ...newAxioms.map((a) => ({
      id: a.id,
      text: a.text,
      importance: a.importance,
      strength: a.strength,
      occurredAt: a.createdAt,
      scope: a.scope,
    })),
  ];

  const originalCount = memories.length;
  const newCount = activeMemories.length;
  const reductionRatio = originalCount > 0 ? Math.max(0, (originalCount - newCount) / originalCount) : 0;

  return {
    activeMemories,
    newAxioms,
    prunedMemoryIds: Array.from(prunedIds),
    prunedCount: prunedIds.size,
    spaceReductionRatio: Math.round(reductionRatio * 100) / 100,
  };
}
