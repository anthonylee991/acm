import { z } from "zod";

export const ImportanceSchema = z.enum(["pinned", "high", "default"]);
export type Importance = z.infer<typeof ImportanceSchema>;

export const MemoryStateSchema = z.enum(["active", "archived", "stm", "ltm"]);
export type MemoryState = z.infer<typeof MemoryStateSchema>;

export const MemoryScopeSchema = z.object({
  project: z.string().trim().min(1).optional(),
  repo: z.string().trim().min(1).optional(),
  harness: z.string().trim().min(1).optional(),
  branch: z.string().trim().min(1).optional(),
}).optional();
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;

export const IngestTextRequestSchema = z.object({
  text: z.string().trim().min(1, "Memory text cannot be empty"),
  importance: ImportanceSchema.default("default"),
  occurredAt: z.string().datetime({ offset: true }).optional().or(z.string().datetime().optional()),
  scope: MemoryScopeSchema,
  source: z.enum(["cli", "api", "upload", "mcp", "webhook"]).default("api"),
  sourceRef: z.string().optional(),
  supersedes: z.string().optional(),
  state: MemoryStateSchema.default("active"),
  stale_at: z.string().optional(),
  last_pruned_reason: z.string().optional(),
});
export type IngestTextRequest = z.infer<typeof IngestTextRequestSchema>;

export const IngestBatchRequestSchema = z.object({
  items: z.array(IngestTextRequestSchema).min(1, "Batch must contain at least one item"),
});
export type IngestBatchRequest = z.infer<typeof IngestBatchRequestSchema>;

export const MemoryLensSchema = z.enum(["agent", "personal", "reference", "associative"]);
export type MemoryLens = z.infer<typeof MemoryLensSchema>;

export const RecallRequestSchema = z.object({
  query: z.string().trim().min(1, "Recall query cannot be empty"),
  k: z.coerce.number().int().positive().max(50).default(5),
  lens: MemoryLensSchema.default("agent"),
  scope: MemoryScopeSchema,
  format: z.enum(["slotted", "tree", "text", "json"]).default("slotted"),
  includeStale: z.coerce.boolean().default(false),
});
export type RecallRequest = z.infer<typeof RecallRequestSchema>;

export const AskerContextItemSchema = z.object({
  memoryId: z.string().uuid(),
  text: z.string(),
  importance: ImportanceSchema,
  strength: z.number(),
  scope: MemoryScopeSchema.optional(),
});
export type AskerContextItem = z.infer<typeof AskerContextItemSchema>;

export const SituationalContextItemSchema = z.object({
  memoryId: z.string().uuid(),
  text: z.string(),
  occurredAt: z.string().optional(),
  trajectory: z.string().optional(),
  scope: MemoryScopeSchema.optional(),
  state: MemoryStateSchema.optional(),
  stale_at: z.string().optional(),
  last_pruned_reason: z.string().optional(),
});
export type SituationalContextItem = z.infer<typeof SituationalContextItemSchema>;

/**
 * Something out of the ordinary: a numeric metric against its baseline, or (surprisal / absence) a memory that
 * breaks or has stopped its routine's pattern, with what is different (`description`) and what is usual.
 */
export const AnomalyFlagItemSchema = z.object({
  metric: z.string(),
  value: z.number().optional(),
  baseline: z.number().optional(),
  direction: z.enum(["high", "low"]).optional(),
  description: z.string(),
  memoryId: z.string().optional(),
  text: z.string().optional(),
  occurredAt: z.string().optional(),
  usual: z.string().optional(),
  score: z.number().optional(),
});
export type AnomalyFlagItem = z.infer<typeof AnomalyFlagItemSchema>;

export const PAESlotsSchema = z.object({
  user_query: z.string(),
  direct_answer: z.array(z.string()).default([]),
  asker_context: z.array(AskerContextItemSchema).default([]),
  situational_context: z.array(SituationalContextItemSchema).default([]),
  anomaly_flags: z.array(AnomalyFlagItemSchema).default([]),
});
export type PAESlots = z.infer<typeof PAESlotsSchema>;

export const RecallResponseSchema = z.object({
  slots: PAESlotsSchema,
  format: z.enum(["acm-slotted-v1", "pae-slotted-v1", "tree", "text", "json"]),
  lens: MemoryLensSchema,
  rawText: z.string().optional(),
});
export type RecallResponse = z.infer<typeof RecallResponseSchema>;

// --- ACM (Arboreal Cognitive Mesh) Schemas ---

export const ArborNodeTypeSchema = z.enum(["leaf", "branch", "root"]);
export type ArborNodeType = z.infer<typeof ArborNodeTypeSchema>;

export interface ArborNode {
  id: string;
  text: string;
  type: ArborNodeType;
  depth: number;
  parentId?: string;
  summary?: string;
  attentionalEnergy?: number;
  isUnpacked?: boolean;
  importance?: Importance;
  strength?: number;
  children?: ArborNode[];
  metadata?: Record<string, unknown>;
}

export const ConsolidatedAxiomSchema = z.object({
  id: z.string().uuid(),
  axiom: z.string().min(1),
  sourceEpisodicIds: z.array(z.string().uuid()).min(1),
  confidence: z.number().min(0).max(1.0).default(0.9),
  scope: MemoryScopeSchema,
  createdAt: z.string().datetime({ offset: true }).optional().or(z.string().datetime().optional()),
});
export type ConsolidatedAxiom = z.infer<typeof ConsolidatedAxiomSchema>;

export const HysteresisStateSchema = z.enum(["relaxed", "locked"]);
export type HysteresisState = z.infer<typeof HysteresisStateSchema>;

