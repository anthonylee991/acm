# Arboreal Cognitive Mesh (ACM)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests: 53 passing](https://img.shields.io/badge/Tests-53%20passing-brightgreen.svg)]()
[![LoCoMo test: 91.9%](https://img.shields.io/badge/LoCoMo%20test-91.9%25-blue.svg)](#benchmarks)

**The cognitive memory architecture behind [MemVault](https://skillvault.dev), SkillVault's agent memory: high-quality retrieval plus a lifecycle (decay, reinforcement, spreading activation, demotion), an attention layer (slotted priming, pinned guardrails) and surprisal (flagging what is out of the ordinary, and what has stopped).**

This repository is the core logic as a dependency-light TypeScript library: the strength model, recall limits, lifecycle rules, surprisal and absence detection, ingestion hygiene and the slotted prompt format. MemVault runs the same logic in production on PostgreSQL + pgvector, a neural reranker and a Kùzu knowledge graph.

---

## Lineage: PAE → PCM → ACM

```
  PAE  Peripheral Attention Engineering   memory delivered as structured slots:
                                          [ANOMALY FLAGS] [ASKER CONTEXT] [SITUATIONAL CONTEXT]
   │
  PCM  Peripheral Cognitive Mesh          Ebbinghaus decay with a savings effect, pinned guardrails,
                                          spreading activation, consolidation
   │
  ACM  Arboreal Cognitive Mesh            the production architecture: retrieval (vectors, reranker,
                                          graph-linked memories, episode context), lifecycle with
                                          demotion instead of deletion, surprisal and absence flags,
                                          ingestion hygiene, hysteresis for guardrails
```

The full specification, equations and evaluation are in [PCM-SPEC.md](PCM-SPEC.md) (also at [skillvault.dev/pcm-spec](https://skillvault.dev/pcm-spec)) and [ACM-SPEC.md](ACM-SPEC.md).

---

## Components

| Component | What it does | Status in MemVault |
| :--- | :--- | :--- |
| **Retrieval** | Dense vectors (768-d), neural reranker, relevance floor 0.35, recall limits derived from k (`recallLimits`) | Production |
| **Graph-linked memories** | Memories linked to the query's entities in a knowledge graph get a score bonus | Production (+6.6 points on LoCoMo dev) |
| **Episode context** | Neighbouring memories from the same episode around the top results (`expandEpisodes`) | Production |
| **Strength model** | Ebbinghaus decay with a savings effect; cue-dependent reactivation in scoring (`calculateDecayedStrength`, `calculateReRankScore`) | Production |
| **Pinned guardrails** | Strength fixed at 1.0, always delivered in `[ASKER CONTEXT]` (`PinnedGuardrailsCache`) | Production |
| **Spreading activation** | Associates of recalled memories reinforced at recall time, no stored edges (`spreadingActivationBoosts`) | Production |
| **Forgetting by demotion** | Faded memories archived, still searchable (`forgettingAction`) | Production |
| **Consolidation** | Clusters of short-term memories consolidated into long-term records | Production |
| **Surprisal** | Memories that break their routine's pattern raised as anomaly flags (`selectFamily`, `surprisalFlags`) | Production |
| **Absence** | Regular routines that have gone quiet raised as anomaly flags (`absenceFlags`) | Production |
| **Ingestion hygiene** | Quarantines commit/milestone noise, tombstones superseded memories, figures-aware near-duplicate merging (`isNearDuplicate`) | Production |
| **Hysteresis gate** | Bistable lock for guardrail states, so an invariant does not flicker out on a casual follow-up | Production |
| **Arboreal substrates** | Level-of-detail tree of memories, unpacked on attention | Rendered only on request (`format: "tree"`) |
| **Swarm scouting** | Read-only walks over memory patterns to find related memories | Off by default (no measured gain) |

---

## Benchmarks

All results below come from MemVault's evaluation harness, which runs the production code path (real embeddings, reranker, PostgreSQL, graph) on public datasets. Fixed answer model **DeepSeek V4.1 Flash**, separate judge **Qwen3.8 Flash**, prompts copied verbatim from Mem0's published LoCoMo harness and the LongMemEval authors' code. Comparisons are paired (exact McNemar tests on the same questions); configurations were chosen on a dev split and confirmed once on a held-out test split.

### LoCoMo (held-out test split, 885 questions)

| System | Accuracy (95% CI) | Context tokens |
| :--- | :---: | :---: |
| Plain embedding search, top 50 | 77.1% | 1,918 |
| ACM / MemVault, compact recall (k = 10) | 87.3% | ~1,090 |
| **ACM / MemVault, default recall (k = 50 + episode context)** | **91.9%** (89.9-93.5) | ~2,830 |
| Whole conversation in context (ceiling) | 93.7% (91.9-95.1) | 28,201 |

By category: single-hop 96.0%, temporal 92.2%, multi-hop 87.2%, open-domain 67.9%. The same answers score 94.2% under Mem0's more lenient judge.

### Head to head with Mem0 (same harness, same questions)

Mem0's cloud product answered 776 of the 885 test questions. On those 776:

| System | Accuracy | Context tokens |
| :--- | :---: | :---: |
| **ACM / MemVault, default** | **91.8%** | ~2,830 |
| Mem0 cloud, top 200 memories | 89.9% | 6,771 |
| Mem0 cloud, top 50 | 85.6% | 1,616 |
| Mem0 cloud, top 10 | 75.3% | — |

Against Mem0's best configuration the difference is **not statistically significant** (p = 0.11), with less than half the context. Against Mem0 at a similar context size (top 50) it is (p = 6e-8).

### Published numbers from other systems (not comparable)

Vendors publish LoCoMo scores with their own answer models, judges and prompts: Zep 94.7% (an independent re-run measured 75.1%), Mem0 92.5%, ByteRover 92.2%, Letta 74.0%. Our harness deliberately uses a modest answer model and the strict judge. On LoCoMo, ACM is in the same band as the best published systems and within two points of having the whole conversation in context; it does not beat their self-reported numbers.

### LongMemEval (knowledge-update questions only)

72 knowledge-update questions of LongMemEval-S (does memory return the newest version of a changed fact?), in fixed halves: **97.2%** on the dev half (the newest evidence was retrieved for 36 of 36) and **91.7%** on the held-out half. The full LongMemEval benchmark has not been run.

### Lifecycle: 180 simulated days

Production decay and pruning run daily while half of the LoCoMo dev questions are asked along the way; the other half is evaluated at the end.

| Forgetting policy | Accuracy on never-asked questions |
| :--- | :---: |
| Fresh store | 85.7% |
| Delete faded memories | 60.6% |
| **Demote faded memories (ACM)** | **86.0%** |

Consolidation, measured separately at production defaults: 90.7% → 92.7% on LoCoMo dev (p = 0.024).

### Surprisal and absence (synthetic, our own test)

No public benchmark measures whether memory helps an agent notice what is out of the ordinary, so we built one: 24 synthetic personas (12 dev / 12 test), each with 8 personal routines (runs, sleep, bills, calls home) and ~30 unrelated memories. Half the routines contain one planted outlier; in the second version, some routines stop well before the question. Every routine has an everyday request that never mentions the outlier. The datasets are frozen in [`data/surprisal-v1.json`](data/surprisal-v1.json) and [`data/surprisal-v2.json`](data/surprisal-v2.json).

| Held-out test split | Without flags | With flags |
| :--- | :---: | :---: |
| Answers accounting for a planted outlier | 35.4% | **60.4%** (p = 0.012) |
| Same, second independent ingest | 41.7% | 50.0% (p = 0.42) |
| Answers noticing a stopped routine | 4.5% | **54.5%** (p = 0.001) |
| Answers inventing an anomaly (control routines) | 0-2.1% | 3.8-4.2% (n.s.) |

Without flags the outlier was already in the agent's context 90-95% of the time; agents just did not notice it. The detector catches most value and content outliers but only about 55% of category changes (a different store or person); every variant that caught more also flagged more normal entries, so the precise detector is the one in production.

### What did not help (measured, not shipped)

Multi-hop graph walks, canonical entity merging, swarm scouting, adaptive result breadth, candidate pools of 100-150, LLM-written summaries replacing source memories (-7 points), a faster third-party reranker, and stored associative edges (about half of storage, no accuracy effect). All on LoCoMo dev against the production configuration.

### Speed and space

Recall median about 0.7-1.0 s in production, dominated by the hosted embedding and reranker calls (the reranker is worth about 14 points on LoCoMo). Storage about 4.5 KB per memory.

### Limitations

- No result here beats the self-reported LoCoMo numbers of the best commercial systems; those use different protocols.
- Only the knowledge-update slice of LongMemEval has been measured.
- The surprisal results are synthetic; they demonstrate the mechanism, not real-world prevalence.
- The evaluation harness runs MemVault's production services and lives in SkillVault's codebase; the surprisal datasets are published here.

---

## Quickstart

```bash
git clone https://github.com/anthonylee991/acm.git
cd acm
bun install
bun test
```

```typescript
import {
  recallLimits,
  calculateReRankScore,
  anomalyFlagsForRecall,
  buildPAESlots,
  formatSlotsToMarkdown,
  type JudgedMemory,
} from "@skillvault/acm-core";

// Recall size: k = 10 compact, k = 50 high-context (default).
const limits = recallLimits(50); // { situational: 50, vectorCandidates: 100, promptChars: 45000, episodeSeeds: 5 }

// Score a candidate: relevance, cue-reactivated strength, scope and graph bonuses.
const score = calculateReRankScore({ memoryId: "m1", similarity: 0.62, strength: 0.3, isGraphConnected: true });

// Memories with stored surprisal verdicts (your store supplies these; see selectFamily / SurprisalJudge).
const memories: JudgedMemory[] = [
  {
    id: "c9", text: "Left at 7:10, got to work in 55 minutes because of a crash on Main St",
    occurredAt: new Date("2026-04-20T07:35:00Z"),
    surprisal: 0.9, note: "55-minute commute", usual: "20-25 minutes", familyIds: ["c1", "c2", "c3", "c4"],
  },
];

// Recalled memory ids in rank order -> anomaly flags for the routine being asked about.
const flags = anomalyFlagsForRecall(memories, ["c4", "c3"], { asOf: new Date("2026-04-22") });

const slots = buildPAESlots({
  userQuery: "Draft a note saying I might be late to the 7:45 meeting",
  askerItems: [{ memoryId: "p1", text: "Keep messages to my manager short", importance: "pinned", strength: 1.0 }],
  situationalItems: [{ memoryId: "c4", text: "Commute took 22 minutes", occurredAt: "2026-04-13T07:32:00Z" }],
  anomalyFlags: flags,
});

console.log(formatSlotsToMarkdown(slots, { situationalLimit: limits.situational }));
```

---

## Specifications

- [PCM Specification, version 2.0](PCM-SPEC.md): architecture, equations and full evaluation.
- [ACM Specification](ACM-SPEC.md): the arboreal, hysteresis and consolidation subsystems.

## License

MIT © 2026 Anthony Lee & SkillVault Engineering.
