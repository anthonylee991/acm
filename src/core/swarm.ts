export interface PheromoneEdge {
  sourceId: string;
  targetId: string;
  pheromone: number; // τ_ij: stigmergy trail intensity
  traversalCount: number;
  lastTraversedAt: number; // timestamp in ms
}

export interface SwarmScoutConfig {
  scoutCount?: number;      // Number of parallel ant scouts
  maxSteps?: number;        // Maximum hops per scout walker
  alpha?: number;           // Pheromone importance exponent (default: 1.2)
  beta?: number;            // Heuristic visibility / similarity exponent (default: 1.5)
  evaporationRate?: number; // Rate at which pheromones decay per day (default: 0.05)
}

export interface ScoutPathResult {
  nodeId: string;
  accumulatedScore: number;
  visitedPath: string[];
  pheromoneDeposit: number;
  isTerminal?: boolean;
}

/**
 * Ant-Colony Stigmergy Mesh.
 * Tracks digital pheromone trails deposited along successful cognitive reasoning pathways.
 * Frequently used associative bridges become high-speed cognitive superhighways.
 */
export class PheromoneMesh {
  private edges: Map<string, PheromoneEdge> = new Map();
  private readonly defaultEvaporationRate: number;

  constructor(evaporationRate: number = 0.05) {
    this.defaultEvaporationRate = evaporationRate;
  }

  private edgeKey(sourceId: string, targetId: string): string {
    return `${sourceId}->${targetId}`;
  }

  /**
   * Deposits pheromone on an associative edge between two memory nodes.
   */
  public depositPheromone(sourceId: string, targetId: string, amount: number = 0.5): void {
    const key = this.edgeKey(sourceId, targetId);
    const existing = this.edges.get(key);
    const now = Date.now();

    if (existing) {
      existing.pheromone = Math.min(10.0, existing.pheromone + amount);
      existing.traversalCount += 1;
      existing.lastTraversedAt = now;
    } else {
      this.edges.set(key, {
        sourceId,
        targetId,
        pheromone: amount,
        traversalCount: 1,
        lastTraversedAt: now,
      });
    }
  }

  /**
   * Evaporates pheromones across all edges according to elapsed time.
   * Dormant paths naturally wither away, clearing dead-end associations.
   */
  public evaporatePheromones(elapsedMs: number, customRate?: number): void {
    const rate = customRate ?? this.defaultEvaporationRate;
    const elapsedDays = Math.max(0, elapsedMs / (1000 * 60 * 60 * 24));
    const retentionFactor = Math.exp(-rate * elapsedDays);

    for (const [key, edge] of this.edges.entries()) {
      edge.pheromone = Math.max(0.01, edge.pheromone * retentionFactor);
      if (edge.pheromone <= 0.01 && edge.traversalCount === 0) {
        this.edges.delete(key);
      }
    }
  }

  /**
   * Computes the effective association weight combining base cosine similarity
   * with pheromone stigmergy intensity: W_ij = baseSim * (1 + ln(1 + τ_ij))
   */
  public getEffectiveWeight(sourceId: string, targetId: string, baseSim: number): number {
    const key = this.edgeKey(sourceId, targetId);
    const edge = this.edges.get(key);
    const pheromone = edge?.pheromone ?? 0;
    const reinforcement = 1 + Math.log(1 + pheromone);
    return Math.min(1.0, baseSim * reinforcement);
  }

  public getPheromone(sourceId: string, targetId: string): number {
    const key = this.edgeKey(sourceId, targetId);
    return this.edges.get(key)?.pheromone ?? 0;
  }

  public getAllEdges(): PheromoneEdge[] {
    return Array.from(this.edges.values());
  }

  /**
   * Penalizes pheromone on an edge (negative stigmergy feedback upon failed recall/correction).
   */
  public penalizePheromone(sourceId: string, targetId: string, amount: number = 0.2): void {
    const key = this.edgeKey(sourceId, targetId);
    const existing = this.edges.get(key);
    if (existing) {
      existing.pheromone = Math.max(0.01, existing.pheromone - amount);
    }
  }

  /**
   * Explicitly reinforces an entire path of nodes after confirmed utility.
   */
  public reinforcePath(visitedPath: string[], amount: number = 0.4): void {
    for (let i = 0; i < visitedPath.length - 1; i++) {
      this.depositPheromone(visitedPath[i]!, visitedPath[i + 1]!, amount);
    }
  }

  /**
   * Explicitly penalizes an entire path of nodes after confirmed failure or distraction.
   */
  public penalizePath(visitedPath: string[], amount: number = 0.2): void {
    for (let i = 0; i < visitedPath.length - 1; i++) {
      this.penalizePheromone(visitedPath[i]!, visitedPath[i + 1]!, amount);
    }
  }

  public clear(): void {
    this.edges.clear();
  }
}

/**
 * Decentralized Swarm Navigator.
 * Dispatches parallel particle/ant scout walkers across the cognitive mesh,
 * navigating along pheromone gradients to locate target memories in < 5ms
 * without brute-force scanning.
 */
export class SwarmNavigator {
  private mesh: PheromoneMesh;
  private config: Required<SwarmScoutConfig>;

  constructor(mesh: PheromoneMesh, config: SwarmScoutConfig = {}) {
    this.mesh = mesh;
    this.config = {
      scoutCount: config.scoutCount ?? 8,
      maxSteps: config.maxSteps ?? 4,
      alpha: config.alpha ?? 1.2,
      beta: config.beta ?? 1.5,
      evaporationRate: config.evaporationRate ?? 0.05,
    };
  }

  /**
   * Explicitly reinforces a path upon confirmed recall utility or positive agent feedback.
   * Decoupled from search to prevent premature reinforcement of misleading paths.
   */
  public reinforcePath(visitedPath: string[], amount: number = 0.4): void {
    this.mesh.reinforcePath(visitedPath, amount);
  }

  /**
   * Explicitly penalizes a path when verified as a distractor, superseded, or erroneous.
   */
  public penalizePath(visitedPath: string[], amount: number = 0.2): void {
    this.mesh.penalizePath(visitedPath, amount);
  }

  /**
   * Navigates the swarm from seed entry points across candidate graph edges.
   * Returns ranked nodes discovered by the swarm.
   * NOTE: Search is read-only. It does NOT automatically mutate pheromones to avoid premature canalization.
   */
  public search(
    seedNodeIds: string[],
    adjacency: Map<string, Array<{ targetId: string; similarity: number }>>
  ): ScoutPathResult[] {
    if (seedNodeIds.length === 0) return [];

    const nodeScores = new Map<string, { score: number; path: string[]; hits: number }>();

    // Dispatch parallel scouts
    for (let s = 0; s < this.config.scoutCount; s++) {
      // Pick random seed start
      const startNode = seedNodeIds[s % seedNodeIds.length]!;
      let currentNode = startNode;
      const currentPath: string[] = [currentNode];
      let currentScore = 1.0;

      for (let step = 0; step < this.config.maxSteps; step++) {
        const neighbors = adjacency.get(currentNode) || [];
        if (neighbors.length === 0) break;

        // Compute transition probabilities using Ant Colony Optimization formula:
        // P(i -> j) = (tau_ij^alpha * eta_ij^beta) / sum(...)
        const weights: Array<{ targetId: string; weight: number; sim: number }> = [];
        let totalWeight = 0;

        for (const n of neighbors) {
          const tau = Math.max(0.1, this.mesh.getPheromone(currentNode, n.targetId));
          const eta = Math.max(0.01, n.similarity);
          const score = Math.pow(tau, this.config.alpha) * Math.pow(eta, this.config.beta);
          weights.push({ targetId: n.targetId, weight: score, sim: n.similarity });
          totalWeight += score;
        }

        if (totalWeight === 0) break;

        // Roulette wheel selection
        let pick = Math.random() * totalWeight;
        let chosen = weights[0]!;
        for (const w of weights) {
          pick -= w.weight;
          if (pick <= 0) {
            chosen = w;
            break;
          }
        }

        currentNode = chosen.targetId;
        currentPath.push(currentNode);
        const nodeScore = chosen.sim;
        const isTerminal = (adjacency.get(currentNode)?.length ?? 0) === 0;

        // Record node visit in swarm consensus
        const existing = nodeScores.get(currentNode);
        if (existing) {
          existing.score = Math.max(existing.score, nodeScore);
          existing.hits += 1;
        } else {
          nodeScores.set(currentNode, {
            score: nodeScore,
            path: [...currentPath],
            hits: 1,
            isTerminal,
          });
        }
      }
    }

    // Rank discovered nodes by consensus score (activation * frequency)
    const results: ScoutPathResult[] = [];
    for (const [nodeId, data] of nodeScores.entries()) {
      const terminalBoost = data.isTerminal ? 1.2 : 1.0;
      const consensusScore = data.score * terminalBoost * (1 + 0.15 * Math.log2(data.hits));
      results.push({
        nodeId,
        accumulatedScore: Math.min(1.0, consensusScore),
        visitedPath: data.path,
        pheromoneDeposit: 0.1 * data.hits,
        isTerminal: data.isTerminal,
      });
    }

    // Rank discovered nodes: prioritize destination terminal memories, then consensus score
    results.sort((a, b) => {
      if (Boolean(a.isTerminal) !== Boolean(b.isTerminal)) {
        return a.isTerminal ? -1 : 1;
      }
      return b.accumulatedScore - a.accumulatedScore;
    });

    // NOTE: Scout search is pure read-only exploration.
    // Explicit reinforcement is performed via navigator.reinforcePath(...) upon confirmed feedback.

    return results;
  }
}
