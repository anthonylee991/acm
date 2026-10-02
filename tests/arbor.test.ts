import { describe, expect, test } from "bun:test";
import {
  createArborBranch,
  createArborLeaf,
  bifurcateNode,
  compressBranch,
  formatArborToMarkdown,
  calculateArborTokenSavings,
} from "../src/index.js";

describe("ACM Arborization & Recursive Substrates Tests", () => {
  test("creates hierarchical branch and leaf nodes with packed capillary state", () => {
    const root = createArborBranch({
      id: "root-subsystem",
      name: "Core Architecture",
      summary: "High-level architectural domain",
      depth: 0,
    });

    const branch = createArborBranch({
      id: "branch-billing",
      name: "Billing Subsystem",
      summary: "Stripe and subscription management micro-context",
      depth: 1,
      parentId: root.id,
      children: [
        createArborLeaf({
          id: "leaf-1",
          text: "Stripe webhook handles customer.subscription.updated",
          depth: 2,
        }),
        createArborLeaf({
          id: "leaf-2",
          text: "All monetary amounts are strictly integer cents",
          depth: 2,
        }),
      ],
    });

    root.children = [branch];

    expect(root.type).toBe("root");
    expect(branch.type).toBe("branch");
    expect(branch.isUnpacked).toBe(false); // packed by default
    expect(branch.children?.length).toBe(2);
  });

  test("bifurcateNode unpacks capillary branches when attentional energy meets threshold", () => {
    const branch = createArborBranch({
      id: "branch-db",
      name: "Database Subsystem",
      summary: "PostgreSQL & Kuzu graph topology",
      depth: 1,
      children: [
        createArborLeaf({ id: "leaf-db-1", text: "PostgreSQL pgvector handles dense similarity" }),
        createArborLeaf({ id: "leaf-db-2", text: "Kùzu handles AST code graph joins" }),
      ],
    });

    // Sub-threshold activation: remains packed
    const subResult = bifurcateNode(branch, 0.55, 0.70);
    expect(subResult).toBe(false);
    expect(branch.isUnpacked).toBe(false);

    // Suprathreshold activation: bifurcates and unpacks
    const supraResult = bifurcateNode(branch, 0.85, 0.70);
    expect(supraResult).toBe(true);
    expect(branch.isUnpacked).toBe(true);

    // Compress branch resets capillary state
    compressBranch(branch);
    expect(branch.isUnpacked).toBe(false);
    expect(branch.attentionalEnergy).toBe(0);
  });

  test("formatArborToMarkdown compresses dormant branches and reveals active branches", () => {
    const root = createArborBranch({
      id: "root-system",
      name: "System Spec",
      summary: "Master agent memory tree",
      depth: 0,
    });

    const packedBranch = createArborBranch({
      id: "branch-auth",
      name: "Authentication Subsystem",
      summary: "OAuth2 & JWT rotation",
      depth: 1,
      children: [
        createArborLeaf({ id: "leaf-a1", text: "Secret tokens rotate every 90 days" }),
      ],
    });

    const activeBranch = createArborBranch({
      id: "branch-cache",
      name: "Caching Subsystem",
      summary: "In-memory LRU guardrails",
      depth: 1,
      children: [
        createArborLeaf({ id: "leaf-c1", text: "Cache invalidates on any mutating mutation" }),
      ],
    });

    // Activate only the caching branch
    bifurcateNode(activeBranch, 0.90, 0.70);

    root.children = [packedBranch, activeBranch];
    root.isUnpacked = true;

    const md = formatArborToMarkdown(root);

    // Packed branch must show compressed summary and hide its leaf
    expect(md).toContain("Authentication Subsystem**: OAuth2 & JWT rotation");
    expect(md).not.toContain("Secret tokens rotate every 90 days");

    // Active branch must reveal its full capillary details
    expect(md).toContain("Caching Subsystem");
    expect(md).toContain("Cache invalidates on any mutating mutation");
  });

  test("calculateArborTokenSavings accurately calculates spatial compression", () => {
    const root = createArborBranch({
      id: "root-test",
      name: "Large Architecture",
      summary: "Massive memory mesh",
      depth: 0,
    });

    const largeBranch = createArborBranch({
      id: "branch-large",
      name: "Extensive Subsystem",
      summary: "Summary description",
      depth: 1,
      children: Array.from({ length: 20 }, (_, i) =>
        createArborLeaf({
          id: `leaf-${i}`,
          text: `Detailed architectural invariant and requirement specification note number ${i} for enterprise deployment compliance.`,
          depth: 2,
        })
      ),
    });

    root.children = [largeBranch];
    root.isUnpacked = true;

    const savings = calculateArborTokenSavings(root);
    expect(savings.fullUnpackedChars).toBeGreaterThan(1500);
    expect(savings.bifurcatedChars).toBeLessThan(400);
    expect(savings.savingsRatio).toBeGreaterThanOrEqual(0.70); // > 70% space saved
  });
});
