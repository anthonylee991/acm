import { describe, expect, test } from "bun:test";
import {
  isMilestoneNoise,
  classifyIngestHygiene,
  extractSupersessionTarget,
  tombstoneSupersededMemories,
  filterActiveMemories,
  applyPrecisionFloor,
  createHonestEmptyResponse,
  SIMILARITY_FLOOR,
  MAX_SLOTTED_PAYLOAD_BYTES,
  buildPAESlots,
  formatSlotsToMarkdown,
  PheromoneMesh,
  SwarmNavigator,
  formatArborToMarkdown,
  type ArborNode,
  type IngestSituationalItem,
} from "../src/index.js";

describe("Fable 5.1 Production Audit Upgrades", () => {
  describe("1. Ingestion Hygiene Gate (Quarantine Routine Noise)", () => {
    test("isMilestoneNoise detects PRs, commits, post-deploy checks, and ephemeral milestones", () => {
      expect(isMilestoneNoise("Milestone: PR #268 merged")).toBe(true);
      expect(isMilestoneNoise("Milestone (infra): streamlined docker build")).toBe(true);
      expect(isMilestoneNoise("Commit [a1b2c3d] by dev: fixed minor typo in readme")).toBe(true);
      expect(isMilestoneNoise("post-deploy check PASSED for cluster-us-east")).toBe(true);
      expect(isMilestoneNoise("Progress: completed migration of table auth_tokens")).toBe(true);
      expect(isMilestoneNoise("Status: closed PR #104")).toBe(true);

      // High-signal knowledge must NOT be quarantined
      expect(isMilestoneNoise("Invariant: NEVER store plaintext API keys")).toBe(false);
      expect(isMilestoneNoise("Trap: Redis cluster mode fails silently if cluster-enabled is not set")).toBe(false);
      expect(isMilestoneNoise("Decision: Use PostgreSQL row-level security for tenant isolation")).toBe(false);
      expect(isMilestoneNoise("Procedure: Run DB migration before launching app pods")).toBe(false);
    });

    test("classifyIngestHygiene tags ephemeral noise as archived with immediate stale_at", () => {
      const noisyItem: IngestSituationalItem = {
        memoryId: "noise-1",
        rawText: "Milestone: PR #42 merged into staging",
        importance: "default",
      };

      const classifiedNoise = classifyIngestHygiene(noisyItem);
      expect(classifiedNoise.state).toBe("archived");
      expect(classifiedNoise.staleAt).toBeDefined();
      expect(classifiedNoise.lastPrunedReason).toBe("routine_milestone");
      expect(classifiedNoise.strength).toBe(0.1);

      const signalItem: IngestSituationalItem = {
        memoryId: "signal-1",
        rawText: "Trap: Node.js worker threads do not share global memory",
        importance: "high",
      };

      const classifiedSignal = classifyIngestHygiene(signalItem);
      expect(classifiedSignal.state).toBe("active");
      expect(classifiedSignal.staleAt).toBeUndefined();
      expect(classifiedSignal.lastPrunedReason).toBeUndefined();
    });
  });

  describe("2. Active Supersession Tombstoning", () => {
    test("extractSupersessionTarget extracts target phrasing from text", () => {
      expect(extractSupersessionTarget("Use pnpm instead of yarn. supersedes: Use yarn v1")).toBe("Use yarn v1");
      expect(extractSupersessionTarget("correction for: old auth middleware")).toBe("old auth middleware");
      expect(extractSupersessionTarget("replaces: Deprecated v1 API client")).toBe("Deprecated v1 API client");
      expect(extractSupersessionTarget("Standard logging procedure without replacement")).toBeNull();
    });

    test("tombstoneSupersededMemories soft-prunes older matching active memories", () => {
      const pool: IngestSituationalItem[] = [
        {
          memoryId: "mem-v1",
          rawText: "Procedure: deploy using legacy bash script ./deploy.sh",
          importance: "default",
          state: "active",
        },
        {
          memoryId: "mem-other",
          rawText: "Rule: always require 2 PR approvals",
          importance: "pinned",
          state: "active",
        },
      ];

      const { count, tombstonedIds } = tombstoneSupersededMemories(pool, "deploy using legacy bash script");
      expect(count).toBe(1);
      expect(tombstonedIds).toContain("mem-v1");

      const memV1 = pool.find((m) => m.memoryId === "mem-v1")!;
      expect(memV1.state).toBe("archived");
      expect(memV1.staleAt).toBeDefined();
      expect(memV1.lastPrunedReason).toBe("superseded");
      expect(memV1.strength).toBe(0.1);

      const otherMem = pool.find((m) => m.memoryId === "mem-other")!;
      expect(otherMem.state).toBe("active");
      expect(otherMem.staleAt).toBeUndefined();
    });
  });

  describe("3. Retrieval Precision Floor & Honest Emptiness", () => {
    test("filterActiveMemories excludes soft-pruned and stale memories", () => {
      const candidates: IngestSituationalItem[] = [
        { memoryId: "active-1", rawText: "Active item", state: "active" },
        { memoryId: "archived-1", rawText: "Old milestone", state: "archived" },
        { memoryId: "stale-1", rawText: "Superseded rule", state: "active", staleAt: "2026-09-01T00:00:00Z" },
      ];

      const active = filterActiveMemories(candidates);
      expect(active.length).toBe(1);
      expect(active[0]?.memoryId).toBe("active-1");
    });

    test("applyPrecisionFloor drops similarities below the floor unless pinned", () => {
      const candidates = [
        { memoryId: "1", text: "Top match", similarity: 0.85, importance: "high" },
        { memoryId: "2", text: "Borderline match", similarity: SIMILARITY_FLOOR, importance: "default" },
        { memoryId: "3", text: "Weak distractor", similarity: 0.21, importance: "default" },
        { memoryId: "4", text: "Pinned safety rule with low query sim", similarity: 0.20, importance: "pinned" },
      ];

      const filtered = applyPrecisionFloor(candidates);
      expect(filtered.length).toBe(3);
      expect(filtered.some((c) => c.memoryId === "3")).toBe(false);
      expect(filtered.some((c) => c.memoryId === "4")).toBe(true); // Pinned survives floor
    });

    test("createHonestEmptyResponse returns clean empty notice without distractor padding", () => {
      const emptyNotice = createHonestEmptyResponse();
      expect(emptyNotice.rawText).toContain("[MEMVAULT]\nNo memories found matching query.");
    });
  });

  describe("4. Prompt Formatter Payload Hardening & Clean Output", () => {
    test("formatSlotsToMarkdown defaults to slotted format (< 3.5KB, no Arbor tree)", () => {
      const slots = buildPAESlots({
        userQuery: "Build deployment pipeline",
        askerItems: [
          { memoryId: "ask-1", text: "Invariant: Zero downtime deployments only", importance: "pinned", strength: 1.0 },
        ],
        situationalItems: [
          { memoryId: "sit-1", text: "Use blue-green deployment topology", importance: "high", strength: 0.9 },
        ],
      });

      const md = formatSlotsToMarkdown(slots);
      expect(Buffer.byteLength(md, "utf-8")).toBeLessThanOrEqual(MAX_SLOTTED_PAYLOAD_BYTES);
      expect(md).not.toContain("CAPILLARY TREE");
      expect(md).not.toContain("ATTRACTOR BASIN");
      expect(md).toContain("Zero downtime deployments only");
      expect(md).toContain("Use blue-green deployment topology");
    });

    test("cross-section deduplication prevents duplicate facts between asker and situational context", () => {
      const sharedFact = "Always use encrypted S3 buckets";
      const slots = buildPAESlots({
        userQuery: "Configure storage",
        askerItems: [
          { memoryId: "ask-1", text: sharedFact, importance: "pinned", strength: 1.0 },
        ],
        situationalItems: [
          { memoryId: "sit-1", text: sharedFact, importance: "high", strength: 0.9 }, // duplicate!
          { memoryId: "sit-2", text: "Store audit logs in us-west-2", importance: "default", strength: 0.8 },
        ],
      });

      const md = formatSlotsToMarkdown(slots);
      // sharedFact should appear exactly once in the rendered output
      const occurrences = (md.match(new RegExp(sharedFact, "g")) || []).length;
      expect(occurrences).toBe(1);
    });

    test("formatArborToMarkdown removes teasing '(N leaves hidden)' strings", () => {
      const branch: ArborNode = {
        id: "branch-root",
        type: "branch",
        text: "Architecture",
        energy: 0.2, // Dormant
        isUnpacked: false,
        summary: "Microservices design and service mesh layout",
        children: [
          { id: "leaf-1", type: "leaf", text: "gRPC Service RPC", energy: 0.1 },
          { id: "leaf-2", type: "leaf", text: "Envoy Proxy config", energy: 0.1 },
        ],
      };

      const treeMd = formatArborToMarkdown(branch);
      expect(treeMd).not.toContain("leaves hidden");
      expect(treeMd).toContain("Architecture");
      expect(treeMd).toContain("Microservices design");
    });
  });

  describe("5. Decoupled Swarm Pheromone Search & Explicit Feedback", () => {
    test("SwarmNavigator search is read-only and requires explicit reinforcePath / penalizePath", () => {
      const mesh = new PheromoneMesh();
      const adjacency = new Map<string, Array<{ targetId: string; similarity: number }>>();
      adjacency.set("q", [
        { targetId: "path-1", similarity: 0.7 },
        { targetId: "path-2", similarity: 0.6 },
      ]);
      adjacency.set("path-1", [
        { targetId: "target-node", similarity: 0.9 },
      ]);

      const nav = new SwarmNavigator(mesh, { scoutCount: 8, maxSteps: 3 });

      // Before search: baseline pheromone is 0
      expect(mesh.getPheromone("path-1", "target-node")).toBe(0);

      // Search executes
      const results = nav.search(["q"], adjacency);
      expect(results.length).toBeGreaterThan(0);

      // CRITICAL: Search alone does NOT deposit pheromones
      expect(mesh.getPheromone("path-1", "target-node")).toBe(0);

      // Explicit reinforcement upon confirmed positive utility
      nav.reinforcePath(["path-1", "target-node"], 0.5);
      expect(mesh.getPheromone("path-1", "target-node")).toBe(0.5);

      // Explicit penalty upon correction
      nav.penalizePath(["path-1", "target-node"], 0.2);
      expect(mesh.getPheromone("path-1", "target-node")).toBe(0.3);
    });
  });
});
