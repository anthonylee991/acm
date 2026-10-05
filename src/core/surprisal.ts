import type { AnomalyFlagItem } from "../schema/index.js";

/**
 * Surprisal (PAE): a memory that shares a statistical shape with a family of earlier, similar memories (a
 * routine) but suddenly does not: an unusual value, a different place or person, something qualitatively
 * different. The outlier can be the context an agent needs, or a signal that it needs the usual pattern too.
 *
 * Agents given raw memories miss about half of such outliers even when they are in context. Raising them as
 * anomaly flags, on a synthetic held-out test of personal routines, took answers that account for the outlier
 * from 35.4% to 60.4% (p = 0.012); flagging routines that went quiet took noticed absences from 4.5% to 54.5%
 * (p = 0.001).
 */
export const FAMILY_SIM = 0.45;
export const FAMILY_MAX = 12;
export const FAMILY_MIN = 4;
export const SURPRISAL_FLAG = 0.7;
export const MAX_ANOMALY_FLAGS = 5;

export interface DatedMemory {
  id: string;
  text: string;
  occurredAt: Date;
}

/**
 * The family of `memory`: up to FAMILY_MAX EARLIER memories with similarity >= FAMILY_SIM, oldest first.
 * Returns null when fewer than FAMILY_MIN qualify (no pattern to break).
 */
export function selectFamily<T extends DatedMemory>(
  memory: DatedMemory,
  candidates: Array<T & { similarity: number }>,
): T[] | null {
  const members = candidates
    .filter((c) => c.id !== memory.id && c.occurredAt < memory.occurredAt && c.similarity >= FAMILY_SIM)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, FAMILY_MAX)
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  return members.length >= FAMILY_MIN ? members : null;
}

export interface SurprisalVerdict {
  /** 0 = ordinary, 1 = clearly out of the ordinary. */
  score: number;
  /** What is different, with the new value. */
  what: string;
  /** The family's usual pattern. */
  usual: string;
}

/** Any model call that returns a verdict (production uses a small, cheap model in JSON mode). */
export interface SurprisalJudge {
  judge(family: DatedMemory[], memory: DatedMemory): Promise<SurprisalVerdict | null>;
}

export const SURPRISAL_SYSTEM_PROMPT = `You notice when something in a person's life or work is out of the ordinary.
You are shown earlier entries about what looks like the same routine or topic, and one new entry.
Decide how far the new entry departs from the pattern of the earlier ones:
- an unusual value (a much longer time, a much higher reading or amount),
- a different kind of thing than usual (another place, person, product or activity),
- something qualitatively different (a problem, symptom, worry, failure, change in someone's behaviour).
Ordinary variation within the earlier range is NOT out of the ordinary. If the earlier entries are not really
the same routine or topic as the new entry, it is not out of the ordinary.
Output ONLY JSON: {"score": <0.0-1.0>, "what": "<one short line: what is different, quoting the new value>", "usual": "<one short line: the usual pattern, with typical values>"}`;

export function buildSurprisalPrompt(family: DatedMemory[], memory: DatedMemory): string {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const earlier = family.map((m) => `- (${day(m.occurredAt)}) ${m.text}`).join("\n");
  return `Earlier entries (oldest first):\n${earlier}\n\nNew entry (${day(memory.occurredAt)}): ${memory.text}`;
}

/** A memory with a stored verdict and the ids of the family it was judged against. */
export interface JudgedMemory extends DatedMemory {
  surprisal?: number | null;
  note?: string | null;
  usual?: string | null;
  familyIds?: string[] | null;
}

/**
 * Surprisal flags for a recall: surprising memories that were recalled, or whose family contains a recalled
 * memory (the outlier of the routine being asked about, even if it ranked too low to be recalled). Ordered by
 * the best recalled rank of the memory or its family, so the routine the request is about comes first.
 */
export function surprisalFlags(
  judged: JudgedMemory[],
  recalledIds: string[],
): Array<{ rank: number; flag: AnomalyFlagItem }> {
  const rank = new Map(recalledIds.map((id, i) => [id, i]));
  return judged
    .filter((m) => (m.surprisal ?? 0) >= SURPRISAL_FLAG)
    .map((m) => ({
      rank: Math.min(...[m.id, ...(m.familyIds ?? [])].map((id) => rank.get(id) ?? Infinity)),
      flag: {
        metric: "surprisal",
        description: m.note ?? "out of the ordinary for this routine",
        memoryId: m.id,
        text: m.text,
        occurredAt: m.occurredAt.toISOString(),
        usual: m.usual ?? undefined,
        score: m.surprisal ?? undefined,
      } as AnomalyFlagItem,
    }))
    .filter((r) => Number.isFinite(r.rank));
}

export const ABSENCE_SEEDS = 10;
export const ABSENCE_MIN_ENTRIES = 5;
export const ABSENCE_GAP_FACTOR = 3;

/**
 * Absence: a regular routine that has gone quiet. For each of the top recalled memories, its routine is the
 * memory, its family, and every memory whose family shares at least two members with them. A routine with at
 * least ABSENCE_MIN_ENTRIES entries at regular intervals (coefficient of variation < 1) whose last entry is at
 * least ABSENCE_GAP_FACTOR median intervals ago (and 4..365 days) is flagged.
 */
export function absenceFlags(
  memories: JudgedMemory[],
  recalledIds: string[],
  asOf: Date = new Date(),
): Array<{ rank: number; flag: AnomalyFlagItem }> {
  const byId = new Map(memories.map((m) => [m.id, m]));
  const DAY = 86_400_000;
  const out: Array<{ rank: number; flag: AnomalyFlagItem }> = [];
  const flagged: Array<Set<string>> = [];
  recalledIds.slice(0, ABSENCE_SEEDS).forEach((seedId, rank) => {
    const seed = byId.get(seedId);
    if (!seed) return;
    const mine = new Set([seed.id, ...(seed.familyIds ?? [])]);
    const members = memories.filter(
      (m) => mine.has(m.id) || (m.familyIds ?? []).filter((id) => mine.has(id)).length >= 2,
    );
    const ids = new Set(members.map((m) => m.id));
    if (members.length < ABSENCE_MIN_ENTRIES) return;
    if (flagged.some((f) => [...ids].filter((id) => f.has(id)).length >= ids.size / 2)) return;

    const times = members.map((m) => m.occurredAt.getTime()).sort((a, b) => a - b);
    const gaps = times.slice(1).map((t, i) => (t - times[i]!) / DAY);
    const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!;
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);
    if (median <= 0 || sd / mean >= 1) return;
    const since = (asOf.getTime() - times[times.length - 1]!) / DAY;
    if (since < Math.max(ABSENCE_GAP_FACTOR * median, 4) || since > 365) return;

    const last = members.reduce((a, b) => (b.occurredAt > a.occurredAt ? b : a));
    const usual = last.usual ?? members.find((m) => m.usual)?.usual ?? undefined;
    flagged.push(ids);
    out.push({
      rank,
      flag: {
        metric: "absence",
        description:
          `nothing about this since ${last.occurredAt.toISOString().slice(0, 10)} (${Math.round(since)} days); ` +
          `it usually comes up about every ${Math.max(1, Math.round(median))} days`,
        memoryId: last.id,
        text: last.text,
        occurredAt: last.occurredAt.toISOString(),
        usual: usual ?? undefined,
      } as AnomalyFlagItem,
    });
  });
  return out;
}

/** Surprisal and absence flags merged, most relevant first, capped at `limit`. */
export function anomalyFlagsForRecall(
  memories: JudgedMemory[],
  recalledIds: string[],
  options: { limit?: number; absence?: boolean; asOf?: Date } = {},
): AnomalyFlagItem[] {
  const ranked = [
    ...surprisalFlags(memories, recalledIds),
    ...(options.absence === false ? [] : absenceFlags(memories, recalledIds, options.asOf)),
  ];
  ranked.sort((a, b) => a.rank - b.rank || (b.flag.occurredAt ?? "").localeCompare(a.flag.occurredAt ?? ""));
  return ranked.slice(0, options.limit ?? MAX_ANOMALY_FLAGS).map((r) => r.flag);
}
