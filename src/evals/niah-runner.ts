import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  getInitialStrength,
  calculateDecayedStrength,
  calculateReRankScore,
  buildPAESlots,
  formatSlotsToMarkdown,
} from "../core/index.js";
import { evaluateWithJudge } from "./judge.js";

export interface RealNIAHResult {
  haystackSize: number;
  needleDepthPercent: number;
  engine: string;
  retrievedTop1: boolean;
  retrievedTop3: boolean;
  judgePassed: boolean;
  latencyMs: number;
  tokens: number;
}

// Reusable distractor templates to generate large memory haystacks
const DISTRACTOR_TEMPLATES = [
  "Updated caching policy for endpoint /api/v1/{topic} to TTL {num} seconds.",
  "Refactored user authentication module in service {topic} to enforce JWT refresh rotation.",
  "Scaled background worker pool for {topic} queue to {num} concurrent workers.",
  "Fixed race condition in database migration script for {topic} table index.",
  "Added automated healthcheck monitoring for {topic} cluster on port {num}.",
  "Configured Prometheus telemetry scraping for {topic} with {num}s scrape interval.",
  "Optimized composite B-tree index on table {topic}(tenant_id, created_at DESC).",
  "Provisioned read-only database replica for {topic} at host db-replica-{num}.internal.",
  "Upgraded TypeScript strict mode flags across package @acm/{topic}.",
  "Configured rate limiting on public API gateway for {topic} with {num} requests/minute limit.",
];

const TOPICS = [
  "billing", "analytics", "inventory", "notifications", "search",
  "payments", "orders", "users", "shipping", "catalog", "webhooks",
  "audit_log", "reporting", "auth", "crm", "sessions", "media"
];

function generateHaystackMemories(count: number): Array<{ id: string; text: string; daysAgo: number }> {
  const memories: Array<{ id: string; text: string; daysAgo: number }> = [];
  for (let i = 0; i < count; i++) {
    const template = DISTRACTOR_TEMPLATES[i % DISTRACTOR_TEMPLATES.length]!;
    const topic = TOPICS[(i * 3) % TOPICS.length]!;
    const num = ((i * 17) % 500) + 10;
    const text = template.replace("{topic}", topic).replace("{num}", String(num));
    memories.push({
      id: `distractor-mem-${i}`,
      text,
      daysAgo: (i % 60) + 1,
    });
  }
  return memories;
}

export async function runRealMemoryNIAH(options: {
  haystackSizes?: number[];
  depths?: number[];
  verifyWithJudge?: boolean;
} = {}) {
  const {
    haystackSizes = [500, 1000, 2500, 5000],
    depths = [10, 50, 90],
    verifyWithJudge = false,
  } = options;

  console.log("\n=========================================================================================");
  console.log("            REAL MEMORY NEEDLE IN A HAYSTACK (NIAH) SCALE BENCHMARK                      ");
  console.log("=========================================================================================\n");

  const targetNeedle = {
    id: "needle-master-encryption-salt",
    text: "The primary database replica encryption salt is `salt_98412_kazu_aes` stored at vault cluster 7.",
    targetToken: "salt_98412_kazu_aes",
  };
  const query = "What is the primary database replica encryption salt and where is it stored?";
  const qTokens = new Set(query.toLowerCase().split(/\W+/).filter((w) => w.length > 2));

  const results: RealNIAHResult[] = [];
  const evalDate = new Date();

  for (const size of haystackSizes) {
    console.log(`\nTesting Haystack Scale: ${size.toLocaleString()} memories...`);

    for (const depth of depths) {
      const distractors = generateHaystackMemories(size);
      const needleIndex = Math.floor((depth / 100) * size);

      // Insert needle at exact depth
      distractors.splice(needleIndex, 0, {
        id: targetNeedle.id,
        text: targetNeedle.text,
        daysAgo: 2,
      });

      // 1. ACM Evaluation
      const acmStart = performance.now();
      const acmScored = distractors.map((m) => {
        const elapsedMs = m.daysAgo * 86400000;
        const str = calculateDecayedStrength(getInitialStrength("default"), elapsedMs, 1, "default");
        const mTokens = m.text.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
        let matchCount = 0;
        for (const tok of mTokens) {
          if (qTokens.has(tok)) matchCount++;
        }
        const sim = matchCount / Math.max(1, qTokens.size);
        const score = calculateReRankScore({ memoryId: m.id, similarity: sim, strength: str }, evalDate);
        return { ...m, score, sim };
      }).sort((a, b) => b.score - a.score);

      const acmLatency = performance.now() - acmStart;
      const acmTop1 = acmScored[0]?.id === targetNeedle.id;
      const acmTop3 = acmScored.slice(0, 3).some((m) => m.id === targetNeedle.id);

      results.push({
        haystackSize: size,
        needleDepthPercent: depth,
        engine: "ACM (Arboreal Cognitive Mesh)",
        retrievedTop1: acmTop1,
        retrievedTop3: acmTop3,
        judgePassed: acmTop1,
        latencyMs: acmLatency,
        tokens: Math.round((acmScored.slice(0, 3).map((m) => m.text).join("\n").length) / 4),
      });

      // 2. Standard Vector RAG
      const ragStart = performance.now();
      const ragScored = distractors.map((m) => {
        const mTokens = m.text.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
        let matchCount = 0;
        for (const tok of mTokens) {
          if (qTokens.has(tok)) matchCount++;
        }
        const sim = matchCount / Math.max(1, qTokens.size);
        return { ...m, sim };
      }).sort((a, b) => b.sim - a.sim);

      const ragLatency = performance.now() - ragStart;
      const ragTop1 = ragScored[0]?.id === targetNeedle.id;
      const ragTop3 = ragScored.slice(0, 3).some((m) => m.id === targetNeedle.id);

      results.push({
        haystackSize: size,
        needleDepthPercent: depth,
        engine: "Standard Semantic RAG",
        retrievedTop1: ragTop1,
        retrievedTop3: ragTop3,
        judgePassed: ragTop1,
        latencyMs: ragLatency,
        tokens: Math.round((ragScored.slice(0, 3).map((m) => m.text).join("\n").length) / 4),
      });

      console.log(`   Depth ${depth}%: ACM Top-1=${acmTop1 ? 'PASS' : 'FAIL'} (${acmLatency.toFixed(1)}ms) | RAG Top-1=${ragTop1 ? 'PASS' : 'FAIL'} (${ragLatency.toFixed(1)}ms)`);
    }
  }

  // Summary Table
  console.log("\n=========================================================================================");
  console.log("            REAL MEMORY NIAH BENCHMARK SUMMARY (HIT@1 RETRIEVAL)                         ");
  console.log("=========================================================================================");

  const summaryRows: any[] = [];
  const engines = ["ACM (Arboreal Cognitive Mesh)", "Standard Semantic RAG"];

  for (const eng of engines) {
    const row: any = { "Memory Engine": eng };
    for (const size of haystackSizes) {
      const match = results.filter((r) => r.engine === eng && r.haystackSize === size);
      const top1Count = match.filter((m) => m.retrievedTop1).length;
      const total = match.length;
      row[`${size.toLocaleString()} Memories`] = `${((top1Count / total) * 100).toFixed(0)}% (${top1Count}/${total})`;
    }
    const avgLat = (results.filter((r) => r.engine === eng).reduce((acc, r) => acc + r.latencyMs, 0) / (results.length / 2)).toFixed(2) + "ms";
    row["Avg Latency"] = avgLat;
    summaryRows.push(row);
  }

  console.table(summaryRows);
  return summaryRows;
}

if (import.meta.main) {
  runRealMemoryNIAH({
    haystackSizes: [500, 1000, 2500, 5000],
    depths: [10, 50, 90],
  });
}
