import { describe, expect, test } from "bun:test";
import {
  PheromoneMesh,
  SwarmNavigator,
} from "../src/index.js";

describe("ACM Swarm Intelligence & Stigmergy Tests", () => {
  test("deposits pheromones on edges and calculates effective reinforced weight", () => {
    const mesh = new PheromoneMesh();

    const baseSim = 0.50;
    const initialWeight = mesh.getEffectiveWeight("node-query", "node-auth", baseSim);
    expect(initialWeight).toBe(baseSim); // 0 pheromones -> 1 + ln(1+0) = 1.0 -> 0.50

    // Deposit pheromones across multiple successful recalls
    mesh.depositPheromone("node-query", "node-auth", 1.0);
    mesh.depositPheromone("node-query", "node-auth", 1.0);

    const reinforcedWeight = mesh.getEffectiveWeight("node-query", "node-auth", baseSim);
    expect(reinforcedWeight).toBeGreaterThan(initialWeight);
    expect(mesh.getPheromone("node-query", "node-auth")).toBe(2.0);
  });

  test("evaporates pheromones over time matching Ebbinghaus decay", () => {
    const mesh = new PheromoneMesh(0.10); // 10% daily evaporation rate
    mesh.depositPheromone("node-a", "node-b", 5.0);

    // After 14 days of dormancy
    mesh.evaporatePheromones(14 * 24 * 60 * 60 * 1000);
    const decayed = mesh.getPheromone("node-a", "node-b");

    expect(decayed).toBeLessThan(5.0);
    expect(decayed).toBeGreaterThan(0.01);
  });

  test("SwarmNavigator scouts follow high-pheromone pathways to locate target memory", () => {
    const mesh = new PheromoneMesh();

    // Create a graph topology:
    // Query -> [Branch A (General), Branch B (Security)]
    // Branch B -> [Leaf Secret (Target)]
    const adjacency = new Map<string, Array<{ targetId: string; similarity: number }>>();
    adjacency.set("query", [
      { targetId: "branch-general", similarity: 0.60 },
      { targetId: "branch-security", similarity: 0.65 },
    ]);
    adjacency.set("branch-general", [
      { targetId: "leaf-distractor", similarity: 0.50 },
    ]);
    adjacency.set("branch-security", [
      { targetId: "leaf-target-secret", similarity: 0.85 },
    ]);

    // Heavily reinforce the security pathway via prior successful trails
    mesh.depositPheromone("query", "branch-security", 4.0);
    mesh.depositPheromone("branch-security", "leaf-target-secret", 5.0);

    const navigator = new SwarmNavigator(mesh, {
      scoutCount: 16,
      maxSteps: 3,
    });

    const results = navigator.search(["query"], adjacency);

    expect(results.length).toBeGreaterThan(0);
    // The top-ranked result discovered by the swarm consensus should be leaf-target-secret
    expect(results[0]?.nodeId).toBe("leaf-target-secret");
    expect(results[0]?.accumulatedScore).toBeGreaterThan(0.5);

    // Scout search is read-only: pheromone should NOT be mutated prematurely
    expect(mesh.getPheromone("branch-security", "leaf-target-secret")).toBe(5.0);

    // Explicit feedback reinforces the verified path
    navigator.reinforcePath(results[0]!.visitedPath, 0.4);
    expect(mesh.getPheromone("branch-security", "leaf-target-secret")).toBe(5.4);

    // Explicit penalty decreases pheromone
    navigator.penalizePath(results[0]!.visitedPath, 0.2);
    expect(mesh.getPheromone("branch-security", "leaf-target-secret")).toBe(5.2);
  });
});
