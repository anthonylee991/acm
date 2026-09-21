import { describe, expect, test } from "bun:test";
import {
  identifyConsolidationCandidates,
  clusterEpisodicTraces,
  runSynapticConsolidation,
  type EpisodicMemoryRecord,
} from "../src/index.js";

describe("ACM Synaptic Consolidation Daemon Tests", () => {
  test("identifyConsolidationCandidates captures decayed memories while preserving pinned guardrails", () => {
    const memories: EpisodicMemoryRecord[] = [
      { id: "m1", text: "Drank cold brew coffee this morning", importance: "default", strength: 0.12 },
      { id: "m2", text: "Drank iced matcha latte on Wednesday", importance: "default", strength: 0.18 },
      { id: "m3", text: "Recent deployment to production staging", importance: "default", strength: 0.65 },
      { id: "m4", text: "NEVER log plaintext API tokens", importance: "pinned", strength: 0.10 }, // low strength but pinned!
    ];

    const candidates = identifyConsolidationCandidates(memories, 0.20);
    const candidateIds = candidates.map((c) => c.id);

    expect(candidateIds).toContain("m1");
    expect(candidateIds).toContain("m2");
    expect(candidateIds).not.toContain("m3"); // strength > 0.20
    expect(candidateIds).not.toContain("m4"); // pinned guardrails are immune
  });

  test("clusterEpisodicTraces groups related decaying memories by token similarity", () => {
    const candidates: EpisodicMemoryRecord[] = [
      { id: "r1", text: "Ran 5 miles around the lake morning exercise", importance: "default", strength: 0.10 },
      { id: "r2", text: "Morning run exercise 6 miles along the river", importance: "default", strength: 0.15 },
      { id: "d1", text: "Dinner at Italian restaurant ordered Margherita pizza", importance: "default", strength: 0.08 },
    ];

    const clusters = clusterEpisodicTraces(candidates, 0.25);
    expect(clusters.length).toBe(2);

    const runningCluster = clusters.find((c) => c.some((m) => m.id === "r1"));
    expect(runningCluster).toBeDefined();
    expect(runningCluster?.map((m) => m.id)).toContain("r2");
    expect(runningCluster?.some((m) => m.id === "d1")).toBe(false);
  });

  test("runSynapticConsolidation abstracts episodic clusters into semantic axioms and prunes leaves", () => {
    const memories: EpisodicMemoryRecord[] = [
      { id: "e1", text: "Refactored user auth service route in TypeScript", importance: "default", strength: 0.14 },
      { id: "e2", text: "Fixed user auth token validation service in TypeScript", importance: "default", strength: 0.12 },
      { id: "e3", text: "Updated user auth permission checks in TypeScript", importance: "default", strength: 0.10 },
      { id: "recent", text: "Active work on billing payments module", importance: "default", strength: 0.85 },
      { id: "pinned", text: "Always use Bun test runner", importance: "pinned", strength: 1.0 },
    ];

    const result = runSynapticConsolidation(memories, {
      decayFloor: 0.20,
      minClusterSize: 2,
    });

    expect(result.newAxioms.length).toBe(1);
    expect(result.prunedCount).toBe(3); // e1, e2, e3
    expect(result.prunedMemoryIds).toContain("e1");
    expect(result.prunedMemoryIds).toContain("e2");
    expect(result.prunedMemoryIds).toContain("e3");

    // Axiom must carry provenance back to source episodic records
    const axiom = result.newAxioms[0]!;
    expect(axiom.sourceEpisodicIds).toEqual(["e1", "e2", "e3"]);
    expect(axiom.strength).toBe(0.85); // refreshed semantic strength
    expect(axiom.text).toContain("Consolidated Semantic Habit / Fact");

    // Active memory pool must contain the recent memory, pinned memory, and the new axiom
    expect(result.activeMemories.some((m) => m.id === "recent")).toBe(true);
    expect(result.activeMemories.some((m) => m.id === "pinned")).toBe(true);
    expect(result.activeMemories.some((m) => m.id === axiom.id)).toBe(true);
    expect(result.activeMemories.some((m) => m.id === "e1")).toBe(false);

    // Total memory pool reduced from 5 to 3 (40% space savings)
    expect(result.spaceReductionRatio).toBe(0.40);
  });
});
