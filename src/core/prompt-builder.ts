import type {
  PAESlots,
  AskerContextItem,
  SituationalContextItem,
  AnomalyFlagItem,
  ArborNode,
  HysteresisState,
} from "../schema/index.js";
import { formatArborToMarkdown } from "./arbor.js";

export interface BuildPAESlotsParams {
  userQuery: string;
  lens?: "agent" | "personal" | "reference" | "associative";
  askerItems?: AskerContextItem[];
  situationalItems?: SituationalContextItem[];
  anomalyFlags?: AnomalyFlagItem[];
  arborContext?: ArborNode;
  hysteresisState?: HysteresisState;
}

export const MAX_SLOTTED_PAYLOAD_BYTES = 3584; // 3.5 KB budget

export interface FormatSlotsOptions {
  arborContext?: ArborNode;
  hysteresisState?: HysteresisState;
  format?: "slotted" | "tree" | "text" | "json";
  maxBytes?: number;
  /** Situational memories rendered (production: recallLimits(k).situational). Default 5. */
  situationalLimit?: number;
}

export function buildPAESlots(params: BuildPAESlotsParams): PAESlots {
  return {
    user_query: params.userQuery,
    direct_answer: [],
    asker_context: (params.askerItems ?? []).slice(0, 5),
    situational_context: (params.situationalItems ?? []).slice(0, 5),
    anomaly_flags: (params.anomalyFlags ?? []).slice(0, 5),
  };
}

/**
 * A relation triplet supplied by a graph/memory backend, e.g.
 * `[RELATION](Dana)-[SUPERSEDES]->(Dana, on-call for billing)`.
 */
const RELATION_TRIPLET_RE =
  /\[(?:GRAPH )?RELATION\]\s*\((.+?)\)\s*-\[?:?([A-Z_]+)[^\]]*\]?->\s*\((.+?)\)$/i;

/**
 * An explicit per-item supersession declaration. An item whose text begins
 * with `[SUPERSEDES: <memoryId>]` states that the situational item carrying
 * that memoryId has been superseded by this item. The marker is machine
 * metadata: it is stripped from the rendered text and the target is pruned.
 */
const SUPERSEDES_MARKER_RE = /^\[SUPERSEDES:\s*([^\]]+?)\s*\]\s*/;

/**
 * Resolves declared supersession/restriction signals in situational context.
 */
export function resolveSupersededContext(situationalItems: SituationalContextItem[]): SituationalContextItem[] {
  const supersededIds = new Set<string>();
  const tripletTargets = new Set<string>();

  for (const item of situationalItems) {
    const marker = item.text.match(SUPERSEDES_MARKER_RE);
    if (marker) supersededIds.add(marker[1]!);
    const triplet = item.text.match(RELATION_TRIPLET_RE);
    if (triplet && /^(SUPERSEDES|REPLACES)$/i.test(triplet[2]!)) {
      tripletTargets.add(triplet[3]!.trim().toLowerCase());
    }
  }

  const resolved: SituationalContextItem[] = [];
  for (const item of situationalItems) {
    if (supersededIds.has(item.memoryId)) continue;

    const marker = item.text.match(SUPERSEDES_MARKER_RE);
    if (marker) {
      resolved.push({ ...item, text: item.text.slice(marker[0].length) });
      continue;
    }

    const triplet = item.text.match(RELATION_TRIPLET_RE);
    if (triplet) {
      const source = triplet[1]!.trim();
      const predicate = triplet[2]!.toUpperCase();
      const target = triplet[3]!.trim();
      if (predicate === "SUPERSEDES" || predicate === "REPLACES") {
        resolved.push({ ...item, text: `[ACTIVE STATE] ${source}` });
      } else if (predicate === "FORBIDDEN_DUE_TO") {
        resolved.push({ ...item, text: `[RESTRICTION] ${source} (FORBIDDEN DUE TO: ${target})` });
      } else if (predicate === "CONFIDENTIAL_INVARIANT") {
        resolved.push({ ...item, text: `[CONFIDENTIAL INVARIANT] (${target} — details withheld)` });
      } else {
        resolved.push(item);
      }
      continue;
    }

    if (tripletTargets.has(item.text.trim().toLowerCase())) continue;

    resolved.push(item);
  }

  return resolved;
}

function formatAnomalyFlag(item: AnomalyFlagItem): string {
  if (item.text !== undefined) {
    // Surprisal / absence: the memory itself, what is out of the ordinary, and the usual pattern it breaks.
    const date = item.occurredAt ? `(${item.occurredAt.split("T")[0]}) ` : "";
    return `- ${date}${item.text}\n  Out of the ordinary: ${item.description}${item.usual ? `\n  Usual: ${item.usual}` : ""}`;
  }
  const dir = item.direction ? `[FLAG: ${item.direction.toUpperCase()}] ` : "";
  const values = item.value !== undefined && item.baseline !== undefined ? ` (${item.value} vs baseline ${item.baseline})` : "";
  return `- ${dir}${item.metric}: ${item.description}${values}`;
}

export function formatSlotsToMarkdown(slots: PAESlots, options?: FormatSlotsOptions): string {
  const parts: string[] = [];
  const seenTexts = new Set<string>();

  // 0. ANOMALY FLAGS first: agents overlook out-of-the-ordinary memories in a flat list.
  if (slots.anomaly_flags && slots.anomaly_flags.length > 0) {
    parts.push(["### [ANOMALY FLAGS — PAY ATTENTION]", ...slots.anomaly_flags.slice(0, 5).map(formatAnomalyFlag)].join("\n"));
  }

  // 1. ASKER CONTEXT (Pure pinned rules only, max 5, deduplicated)
  if (slots.asker_context && slots.asker_context.length > 0) {
    const askerLines: string[] = ["### [ASKER CONTEXT: Pinned Rules & Preferences]"];
    for (const item of slots.asker_context.slice(0, 5)) {
      const normalized = item.text.trim();
      if (!seenTexts.has(normalized)) {
        askerLines.push(`- ${normalized}`);
        seenTexts.add(normalized);
      }
    }
    if (askerLines.length > 1) {
      parts.push(askerLines.join("\n"));
    }
  }

  // 2. ARBOREAL CONTEXT: Only rendered when explicitly requested via format: "tree"
  if (options?.arborContext && options?.format === "tree") {
    parts.push("### [ARBOREAL CONTEXT: Recursive Substrates]\n" + formatArborToMarkdown(options.arborContext));
  }

  // 3. SITUATIONAL CONTEXT (Deduplicated against Asker context)
  const rawSituational = slots.situational_context ?? [];
  const resolvedSituational = resolveSupersededContext(rawSituational);

  if (resolvedSituational.length > 0) {
    const sitLines: string[] = ["### [SITUATIONAL CONTEXT: Recent Decisions & Context]"];
    for (const item of resolvedSituational.slice(0, options?.situationalLimit ?? 5)) {
      const normalized = item.text.trim();
      if (!seenTexts.has(normalized)) {
        const date = item.occurredAt ? ` [Session Date: ${item.occurredAt.split("T")[0]}]` : "";
        sitLines.push(`- ${normalized}${date}`);
        seenTexts.add(normalized);
      }
    }
    if (sitLines.length > 1) {
      parts.push(sitLines.join("\n"));
    }
  }

  let result = parts.join("\n\n");
  const maxBytes = options?.maxBytes ?? MAX_SLOTTED_PAYLOAD_BYTES;

  if (Buffer.byteLength(result, "utf8") > maxBytes) {
    const buf = Buffer.from(result, "utf8");
    result = buf.subarray(0, maxBytes - 35).toString("utf8") + "\n... [Context truncated to 3.5KB]";
  }

  return result;
}
