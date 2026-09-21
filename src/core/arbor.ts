import type { ArborNode, ArborNodeType, Importance } from "../schema/index.js";

export const DEFAULT_BIFURCATION_THRESHOLD = 0.70;

export interface CreateBranchParams {
  id: string;
  name: string;
  summary: string;
  depth?: number;
  parentId?: string;
  importance?: Importance;
  children?: ArborNode[];
  metadata?: Record<string, unknown>;
}

export interface CreateLeafParams {
  id: string;
  text: string;
  depth?: number;
  parentId?: string;
  importance?: Importance;
  strength?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Creates an Arbor branch centroid that points to nested capillary subgraphs.
 * At rest, the branch remains structurally packed (isUnpacked = false).
 */
export function createArborBranch(params: CreateBranchParams): ArborNode {
  return {
    id: params.id,
    text: params.name,
    summary: params.summary,
    type: (params.depth ?? 0) === 0 ? "root" : "branch",
    depth: params.depth ?? 0,
    parentId: params.parentId,
    importance: params.importance ?? "default",
    isUnpacked: false,
    attentionalEnergy: 0,
    children: params.children ?? [],
    metadata: params.metadata,
  };
}

/**
 * Creates an atomic episodic or semantic leaf memory in the Arbor tree.
 */
export function createArborLeaf(params: CreateLeafParams): ArborNode {
  return {
    id: params.id,
    text: params.text,
    type: "leaf",
    depth: params.depth ?? 1,
    parentId: params.parentId,
    importance: params.importance ?? "default",
    strength: params.strength ?? 0.70,
    isUnpacked: true, // leaves are always unpacked when their parent branch is unpacked
    metadata: params.metadata,
  };
}

/**
 * Evaluates attentional energy against the bifurcation threshold.
 * When energy >= threshold, the macro-node bifurcates into micro-contexts,
 * unpacking child capillaries into working memory.
 */
export function bifurcateNode(
  node: ArborNode,
  attentionalEnergy: number,
  threshold: number = DEFAULT_BIFURCATION_THRESHOLD
): boolean {
  node.attentionalEnergy = attentionalEnergy;

  if (attentionalEnergy >= threshold) {
    node.isUnpacked = true;
    return true;
  }

  node.isUnpacked = false;
  return false;
}

/**
 * Collapses inactive capillary branches back into a compressed summary centroid,
 * freeing up working attention window space.
 */
export function compressBranch(node: ArborNode): void {
  node.isUnpacked = false;
  node.attentionalEnergy = 0;
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      if (child.type === "branch" || child.type === "root") {
        compressBranch(child);
      }
    }
  }
}

/**
 * Recursively renders an Arbor hierarchy into token-disciplined markdown.
 * Unpacked branches display full child details.
 * Packed branches only display their compressed summary pointer.
 */
export function formatArborToMarkdown(node: ArborNode, indentLevel: number = 0): string {
  const indent = "  ".repeat(indentLevel);
  const prefix = indentLevel === 0 ? "🌳" : node.type === "branch" ? "🌿" : "🍃";

  if (node.type === "leaf") {
    return `${indent}- ${prefix} ${node.text}`;
  }

  // Branch or Root
  if (!node.isUnpacked && indentLevel > 0) {
    // Compressed capillary pointer
    return `${indent}- ${prefix} **${node.text}** [COMPRESSED SUBGRAPH: ${node.summary ?? "Nested context"} (${node.children?.length ?? 0} leaves hidden)]`;
  }

  const lines: string[] = [];
  lines.push(`${indent}- ${prefix} **${node.text}**${node.summary ? `: ${node.summary}` : ""}`);

  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      lines.push(formatArborToMarkdown(child, indentLevel + 1));
    }
  }

  return lines.join("\n");
}

/**
 * Computes the token/character compression ratio achieved by bifurcation.
 */
export function calculateArborTokenSavings(root: ArborNode): {
  fullUnpackedChars: number;
  bifurcatedChars: number;
  savingsRatio: number;
} {
  // 1. Calculate full unpacked size
  function getFullSize(n: ArborNode): number {
    let size = (n.text.length) + (n.summary?.length ?? 0);
    if (n.children) {
      for (const c of n.children) size += getFullSize(c);
    }
    return size;
  }

  // 2. Calculate active bifurcated size
  function getBifurcatedSize(n: ArborNode): number {
    if (n.type === "leaf") return n.text.length;
    if (!n.isUnpacked && n.depth > 0) {
      return n.text.length + (n.summary?.length ?? 0) + 30; // summary pointer
    }
    let size = n.text.length + (n.summary?.length ?? 0);
    if (n.children) {
      for (const c of n.children) size += getBifurcatedSize(c);
    }
    return size;
  }

  const full = getFullSize(root);
  const bifurcated = getBifurcatedSize(root);
  const ratio = full > 0 ? (full - bifurcated) / full : 0;

  return {
    fullUnpackedChars: full,
    bifurcatedChars: bifurcated,
    savingsRatio: Math.max(0, Math.round(ratio * 100) / 100),
  };
}
