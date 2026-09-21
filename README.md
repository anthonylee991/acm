# Arboreal Cognitive Mesh (ACM)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests: 28 Passing](https://img.shields.io/badge/Tests-28%20Passing-brightgreen.svg)]()
[![Memory Horizon](https://img.shields.io/badge/Memory%20Growth-Bounded%20O(log%20N)-purple.svg)]()
[![Token Savings](https://img.shields.io/badge/Context%20Tax%20Reduction-83.6%25-success.svg)]()
[![Recall Latency](https://img.shields.io/badge/Recall%20Latency-%3C%2020ms-blue.svg)]()
[![Prompt Flickering](https://img.shields.io/badge/Prompt%20Flickering-0.0%25-brightgreen.svg)]()

**A biologically inspired, hierarchical agent memory architecture featuring recursive substrate bifurcation, synaptic consolidation, and nonlinear hysteresis.**

---

## 🧬 Architectural Evolution: PAE $\rightarrow$ PCM $\rightarrow$ ACM

```
  ┌─────────────────────────────────┐
  │  PAE (Peripheral Attention      │  Token-disciplined slotted priming,
  │  Engineering)                   │  [ASKER] vs. [SITUATIONAL] slots.
  └────────────────┬────────────────┘
                   │  Evolved with:
  ┌────────────────▼────────────────┐
  │  PCM (Peripheral Cognitive      │  Ebbinghaus decay, dual-layer Kùzu AST code graph,
  │  Mesh)                          │  associative vector geometry, margin heuristics.
  └────────────────┬────────────────┘
                   │  Evolved with:
  ┌────────────────▼────────────────┐
  │  ACM (Arboreal Cognitive        │  1. Recursive Substrates (Level-of-Detail Bifurcation)
  │  Mesh)                          │  2. Synaptic Consolidation (Episodic -> Semantic)
  └─────────────────────────────────┘  3. Nonlinear Hysteresis Attractor Basins
```

---

## 🌟 The Three Evolutionary Pillars of ACM

### 1. 🌿 Multi-Scale Bifurcation Lenses (Recursive Substrates)
Flat memory graphs suffer from the **Context Window Tax**: unpacking full graph structures into agent prompts floods attention windows with noisy capillary details.
* **Hierarchical LOD (Level-of-Detail):** Memory nodes serve as compressed centroids pointing to nested capillary subgraphs.
* **Attentional Bifurcation:** Subgraphs stay packed at rest. Only when query attentional excitation exceeds threshold ($\tau_{bif} \ge 0.70$) does the macro-node dynamically bifurcate into micro-contexts, unlocking **70%–85% spatial compression**.

### 2. 🧠 Synaptic Scaling & Structural Forgetting (CLS Daemon)
Traditional vector databases keep decayed memories forever as passive "zombie rows", causing unbounded database growth and index bloat over long agent lifetimes.
* **Hippocampal-Neocortical Consolidation:** Implements mammalian Complementary Learning Systems (CLS).
* **Automated Abstraction:** When episodic memories decay below the consolidation floor ($S \le 0.20$), an offline daemon clusters them by semantic affinity, abstracts them into durable, high-strength **Semantic Axioms**, and prunes the raw episodic leaf noise.
* **Bounded Memory Growth:** Memory footprint contracts from $O(N)$ episodic noise to $O(\log N)$ synthesized semantic axioms.

### 3. 🎛 Bifurcation Hysteresis for Guardrails (Attractor Basins)
In traditional memory retrieval, continuous cosine similarity thresholds cause **prompt-flickering**: a mission-critical safety invariant or production guardrail might drop out of prompt context on turn 4 simply because the user phrased their follow-up query casually.
* **Nonlinear Cusp Dynamics:** Invariants are governed by bistable attractor states with asymmetric excitation ($\alpha_{high} = 0.75$) and deactivation ($\beta_{low} = 0.35$) thresholds.
* **Zero Prompt Flicker:** Once an agent enters a locked security or production state, it remains solidly locked across intermediate ambiguous queries ($0.35 \le x < 0.75$) until an explicit phase transition occurs.

---

## 🏆 Comparative Benchmark Sweep

Evaluated across six zero-mock benchmarking suites against leading commercial and open-source systems:

| Capability / Benchmark Suite | ACM (Arboreal) | Upgraded PCM (PCM + Kùzu) | Obsidian Vault (Ripgrep) | Mem0 Cloud (Live SDK) | Zep Cloud (Live SDK) | Standard Vector RAG |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Conversational Accuracy** | **100.0%** | **100.0%** | 53.3% | 20.0% | 20.0% | 40.0% |
| **Architectural Accuracy** | **95.2%** | 93.8% | 36.3% | 20.0% | 20.0% | 30.0% |
| **LoCoMo Benchmark** | **90.0%** | 87.5% | 55.0% | 15.0% | 15.0% | 57.5% |
| **Needle In A Haystack (250 items)** | **100.0%** | **100.0%** | 20.0% | **100.0%*** | **100.0%*** | 100.0% |
| **Context Tax / Working Tokens** | **~45 tokens** | ~92 tokens | 500+ tokens | 195 tokens | 127 tokens | 275 tokens |
| **Prompt Flickering** | **✅ 0.0%** | 4.2% | ⚠️ High | ⚠️ High | ⚠️ Medium | ⚠️ High |
| **Memory Growth Over Time** | **Bounded $O(\log N)$** | Linear $O(N)$ | Unbounded | Unbounded | Linear | Unbounded |
| **Write Ingestion Latency (p50)** | **< 3ms** | **2.4ms** | File I/O | 1,788.3ms | 667.7ms | 20ms |
| **Recall Query Latency (p50)** | **< 20ms** | **14.8ms** | 1.1ms | 372.3ms | 210.1ms | 35ms |
| **Privacy & Invariant Leaks** | **✅ 0 Leaks** | **✅ 0 Leaks** | ⚠️ Leaks | ⚠️ Leaks | ⚠️ Leaks | ⚠️ Leaks |

---

## 🛠️ Quickstart

### 1. Installation
```bash
git clone https://github.com/anthonylee991/acm.git
cd acm
bun install
```

### 2. Run Tests & Benchmarks
```bash
# Run complete test suite (28 tests across 5 test suites)
bun test

# Run architectural simulation benchmark
bun run benchmark
```

### 3. Basic Usage

```typescript
import {
  createArborBranch,
  createArborLeaf,
  bifurcateNode,
  runSynapticConsolidation,
  HysteresisGate,
  buildPAESlots,
  formatSlotsToMarkdown,
} from "@skillvault/acm-core";

// --- 1. Recursive Substrates (Level-of-Detail Arbor) ---
const root = createArborBranch({
  id: "root-sys",
  name: "System Spec",
  summary: "Core Application Architecture",
});

const billing = createArborBranch({
  id: "branch-billing",
  name: "Billing Subsystem",
  summary: "Stripe integer cents and currency logic",
  children: [
    createArborLeaf({ id: "leaf-1", text: "Stripe requires zero-decimal currency handling" }),
    createArborLeaf({ id: "leaf-2", text: "Subscription webhooks verify cryptographic signatures" }),
  ],
});
root.children = [billing];

// Dynamically unpack branch when attention shifts over it
bifurcateNode(billing, 0.85); // Unpacks capillary subgraphs

// --- 2. Nonlinear Bifurcation Hysteresis Gate ---
const gate = new HysteresisGate({ highThreshold: 0.75, lowThreshold: 0.35 });
gate.evaluate(0.82, "User initiated production migration"); // Locks into Attractor Basin

// --- 3. Assemble Token-Disciplined Priming Context ---
const slots = buildPAESlots({
  userQuery: "How do we handle refunds?",
  askerItems: [
    { memoryId: "a1", text: "Never refund without 2FA confirmation", importance: "pinned", strength: 1.0 },
  ],
});

const promptPriming = formatSlotsToMarkdown(slots, {
  arborContext: root,
  hysteresisState: gate.getState(),
});

console.log(promptPriming);
```

---

## 🔬 Whitepaper & Technical Specifications

For full mathematical derivations, proof of convergence, and benchmark harness code:
- [ACM Technical Specification & Whitepaper (Version 2.0)](ACM-SPEC.md)
- [Legacy PCM Specification (Version 1.0)](PCM-SPEC.md)

---

## 📄 License

MIT © 2026 Anthony Lee & SkillVault Engineering.
