# Arboreal Cognitive Mesh (ACM): A Biologically-Inspired Hierarchical Memory Architecture for Autonomous AI Agents

**Technical Specification & Whitepaper**  
*Version 3.0 — October 2026*  
*SkillVault Research & Engineering*

---

## Abstract

ACM is the memory architecture behind SkillVault's MemVault. It keeps retrieval as its foundation (dense vectors, a neural reranker, graph-linked memories and episode context) and adds the parts of memory that search alone does not provide:

- **A lifecycle**: Ebbinghaus decay with a savings effect, cue-dependent reactivation, recall-time spreading activation, consolidation, and forgetting by demotion rather than deletion.
- **Attention**: Peripheral Attention Engineering (structured prompt slots), pinned guardrails, and a hysteresis gate so guardrail states do not flicker between turns.
- **Surprisal**: memories that break the pattern of their routine, and routines that have gone quiet, raised as anomaly flags.
- **Recursive substrates**: a level-of-detail tree of memories, unpacked only where attention falls.

On the held-out LoCoMo test split, MemVault (running ACM) scores 91.9% at about 2,800 context tokens, against 93.7% with the whole conversation in context. In a 180-day lifecycle simulation, demotion preserves accuracy (86.0%, vs 85.7% fresh) where deletion loses it (60.6%). On a synthetic personal-routine test, anomaly flags raise answers that account for an out-of-the-ordinary event from 35.4% to 60.4% and noticed stopped routines from 4.5% to 54.5%. The full evaluation is in [PCM-SPEC.md](PCM-SPEC.md), Section 5.

---

## 1. Lineage: PAE → PCM → ACM

```
  ┌─────────────────────────────────┐
  │  PAE (Peripheral Attention      │  Memory delivered as structured slots:
  │  Engineering)                   │  [ANOMALY FLAGS] [ASKER] [SITUATIONAL]
  └────────────────┬────────────────┘
                   │
  ┌────────────────▼────────────────┐
  │  PCM (Peripheral Cognitive      │  Ebbinghaus decay with savings, pinned guardrails,
  │  Mesh)                          │  spreading activation, consolidation, graph links
  └────────────────┬────────────────┘
                   │
  ┌────────────────▼────────────────┐
  │  ACM (Arboreal Cognitive        │  Demotion instead of deletion, surprisal and absence,
  │  Mesh)                          │  hysteresis guardrails, recursive substrates,
  └─────────────────────────────────┘  ingestion hygiene
```

---

## 2. Architecture

```
                         INCOMING QUERY
                               │
        ┌──────────────────────┼───────────────────────┐
        ▼                      ▼                       ▼
 ┌──────────────┐   ┌───────────────────────┐   ┌──────────────┐
 │ HYSTERESIS   │   │ RETRIEVAL             │   │ ARBOR (LOD)  │
 │ GATE         │   │ vectors → reranker →  │   │ unpack only  │
 │ α=0.75 β=0.35│   │ floor → cognitive     │   │ branches with│
 └──────┬───────┘   │ score → episodes      │   │ energy ≥ τ   │
        │           └──────────┬────────────┘   └──────┬───────┘
        │                      ▼                       │
        │           ┌───────────────────────┐          │
        │           │ SURPRISAL / ABSENCE   │          │
        │           │ flags for the routines│          │
        │           │ being asked about     │          │
        │           └──────────┬────────────┘          │
        └──────────────────────┼───────────────────────┘
                               ▼
              ┌────────────────────────────────┐
              │ PERIPHERAL ATTENTION SLOTS      │
              │ [ANOMALY FLAGS — PAY ATTENTION] │
              │ [ASKER CONTEXT]                 │
              │ [ARBOREAL CONTEXT] (on request) │
              │ [SITUATIONAL CONTEXT]           │
              └────────────────┬───────────────┘
                               ▼
              ┌────────────────────────────────┐
              │ BACKGROUND                      │
              │ reinforcement, spreading        │
              │ activation, decay, consolidation│
              │ demotion, surprisal sweep       │
              └────────────────────────────────┘
```

---

## 3. Subsystems

### 3.1 Strength model
Initial strength is 1.0 for pinned, 0.8 for high and 0.4 for default importance. Without reinforcement, after $t$ days:

$$S(t) = \max\left(0.01, \; S_0 \cdot \exp\left(-\frac{t}{\tau}\right)\right), \qquad \tau = \frac{90 \cdot \left(1 + 0.25 \cdot \min(n, 20)\right)}{3}$$

where $n$ is the number of reinforcements. Recall reinforces: $S \leftarrow \min(1, S + 0.17 \ln(1 + r))$. Pinned memories never decay. Implementation: `calculateDecayedStrength`, `boostStrengthOnAccess`.

### 3.2 Cognitive scoring with cue-dependent reactivation
A strong retrieval cue restores a decayed memory to full strength, as a specific question brings back an old memory:

$$c = \min\left(1, \left(\frac{r}{0.40}\right)^2\right), \qquad \tilde{S} = S(1 - c) + c$$

$$\text{Score} = 0.75\, r + 0.25\, \tilde{S} + 0.10\,[\text{same project}] + 0.15\,[\text{graph-linked}] + 0.15\, \ell$$

where $r$ is relevance (the reranker's score when reranked) and $\ell \in [0, 1]$ the strength of the graph link to the query's entities. Candidates below relevance 0.35 are dropped; pinned memories are exempt. Implementation: `calculateReRankScore`, `applyPrecisionFloor`.

### 3.3 Recall size
All limits derive from the number of memories requested, $k$ (default 50, compact 10): $k$ situational slots, $\max(50, 2k)$ vector candidates, a $\max(14{,}000, 900k)$-character prompt budget and $\max(3, k/10)$ episode seeds. Implementation: `recallLimits`.

### 3.4 Episode context
For each episode seed, up to three neighbouring memories on each side saved within 60 minutes are added in time order, skipping memories already recalled and repeated texts. Implementation: `expandEpisodes`.

### 3.5 Spreading activation
After a recall, the associates of the top five recalled memories are reinforced by 10% of a full boost: up to four similarity neighbours per memory ($\cos \ge 0.65$) at weight 1 and same-episode memories (within 60 minutes) at weight 0.7. Associates are computed at recall time; no edge table is stored. The purpose is survival, not ranking: related evidence is kept alive until it is needed. Implementation: `spreadingActivationBoosts`.

### 3.6 Consolidation and forgetting by demotion
Clusters of related short-term memories are consolidated into a long-term record; the source memories are archived, not removed. A memory whose strength is at or below 0.02 and that has not been recalled for 90 days is **demoted** to `archived`: it stops competing in default recall but stays searchable. Nothing is deleted by forgetting. Measured over 180 simulated days, deletion cost a quarter of the accuracy on questions asked later; demotion cost none. Replacing source memories with LLM-written summaries lost 7 points on LoCoMo dev, so summaries supplement sources rather than replace them. Implementation: `forgettingAction`, `runSynapticConsolidation`.

### 3.7 Surprisal and absence
A memory's **family** is up to 12 earlier memories with $\cos \ge 0.45$ (at least four). A small judge model scores how far the memory departs from its family's pattern and records what is different and what is usual. A memory scoring at least 0.7 is flagged when it, or a member of its family, is recalled; flags are ordered by the best recalled rank of the memory or its family.

A routine of a top recalled memory (the memory, its family, and memories whose family shares at least two members with it) with at least five regular entries (interval coefficient of variation below 1) is flagged as **gone quiet** when its last entry is at least three median intervals ago (and 4 to 365 days). Implementation: `selectFamily`, `SurprisalJudge`, `surprisalFlags`, `absenceFlags`, `anomalyFlagsForRecall`.

### 3.8 Recursive substrate bifurcation (level of detail)
Each node of the arbor is a leaf or a centroid summarising a nested subgraph. The attentional energy between query and centroid,

$$\mathcal{E}(q, n) = \cos(\mathbf{e}_q, \mathbf{e}_n) \cdot \left( \omega_{sem} + \omega_{graph} \cdot \deg(n) \right),$$

decides whether a branch is unpacked ($\mathcal{E} \ge \tau_{bif} = 0.70$) or kept as a one-line summary. In MemVault the arbor is rendered only when a caller asks for `format: "tree"`; default recall uses flat slots. Implementation: `createArborBranch`, `bifurcateNode`.

### 3.9 Hysteresis for guardrails
Guardrail states are bistable. With instantaneous relevance $x_t$:

$$\sigma_t = \begin{cases} \text{locked}, & \sigma_{t-1} = \text{relaxed} \land x_t \ge 0.75 \\ \text{relaxed}, & \sigma_{t-1} = \text{locked} \land x_t < 0.35 \\ \sigma_{t-1}, & \text{otherwise} \end{cases}$$

Once a production or security context is entered, its guardrails stay in context across weakly related follow-ups until the conversation clearly leaves it. Implementation: `HysteresisGate`.

### 3.10 Swarm scouting
Read-only scout walks over memory patterns (subject, relation, object type) propose related memories, with pheromone reinforcement only through explicit post-recall feedback. Measured on LoCoMo dev, scouting did not change accuracy (87.8% vs 87.9%) and added about 345 ms, so it is off by default in MemVault. Implementation: `SwarmNavigator`.

### 3.11 Ingestion hygiene
1. **Noise quarantine**: commit logs, merge notices and deploy checks are stored archived, outside default recall (`isMilestoneNoise`).
2. **Supersession**: a memory that states it replaces an earlier one retires the matching older memories (`tombstoneSupersededMemories`).
3. **Figures-aware near duplicates**: memories with similarity $\ge 0.94$ merge only when they state the same figures; "ran 5k in 27:10" and "ran 5k in 41:30" are different events (`isNearDuplicate`).
4. **Honest empty recall**: when nothing qualifies, recall says so instead of padding with weak matches (`createHonestEmptyResponse`).

---

## 4. Evaluation

Measured with MemVault's harness on the production code path, with a fixed answer model (DeepSeek V4.1 Flash), a separate judge (Qwen3.8 Flash) and paired exact McNemar tests. Full method and results: [PCM-SPEC.md](PCM-SPEC.md), Section 5.

| Benchmark | Result |
| :--- | :--- |
| LoCoMo, held-out test (885 questions) | **91.9%** at ~2,830 context tokens (compact recall 87.3% at ~1,090; whole conversation 93.7%) |
| LoCoMo, same harness vs Mem0 cloud (776 questions) | 91.8% vs 89.9% for Mem0's best configuration at 6,771 tokens (p = 0.11, not significant) |
| LongMemEval-S, knowledge updates | 97.2% dev half, 91.7% held-out half (full benchmark not run) |
| 180-day lifecycle, never-asked questions | demotion 86.0%, deletion 60.6%, fresh 85.7% |
| Synthetic surprisal, held-out | outliers accounted for 35.4% → 60.4% (p = 0.012); stopped routines noticed 4.5% → 54.5% (p = 0.001) |

Published LoCoMo numbers from other vendors (Zep 94.7%, Mem0 92.5%, ByteRover 92.2%, Letta 74.0%) use different answer models, judges and prompts and are not comparable.

---

## 5. Quickstart Example

```typescript
import {
  createArborBranch,
  createArborLeaf,
  bifurcateNode,
  HysteresisGate,
  anomalyFlagsForRecall,
  buildPAESlots,
  formatSlotsToMarkdown,
} from "@skillvault/acm-core";

// 1. Recursive substrates: unpack only the branch attention falls on
const root = createArborBranch({ id: "sys", name: "System Spec", summary: "Master Tree" });
const billing = createArborBranch({ id: "b1", name: "Billing", summary: "Stripe integer cents" });
billing.children = [createArborLeaf({ id: "l1", text: "Stripe requires zero-decimal currency handling" })];
root.children = [billing];
bifurcateNode(billing, 0.85);

// 2. Hysteresis gate for guardrails
const gate = new HysteresisGate({ highThreshold: 0.75, lowThreshold: 0.35 });
gate.evaluate(0.8);

// 3. Slotted context, with anomaly flags for the routine being asked about
const flags = anomalyFlagsForRecall(
  [{ id: "r9", text: "Refund batch failed twice, card network timeout", occurredAt: new Date("2026-04-20"),
     surprisal: 0.9, note: "two failed refund batches", usual: "refund batches settle overnight", familyIds: ["r1"] }],
  ["r1"],
);
const slots = buildPAESlots({
  userQuery: "Process refund for charge ch_123",
  askerItems: [{ memoryId: "a1", text: "Refunds require dual-authorization", importance: "pinned", strength: 1.0 }],
  anomalyFlags: flags,
});

console.log(formatSlotsToMarkdown(slots, { arborContext: root, hysteresisState: gate.getState() }));
```

---

## 6. License
MIT © 2026 Anthony Lee & SkillVault Engineering.
