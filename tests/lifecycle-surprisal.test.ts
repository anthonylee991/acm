import { describe, expect, test } from "bun:test";
import {
  absenceFlags,
  anomalyFlagsForRecall,
  buildPAESlots,
  buildSurprisalPrompt,
  calculateDecayedStrength,
  expandEpisodes,
  forgettingAction,
  formatSlotsToMarkdown,
  getInitialStrength,
  isNearDuplicate,
  recallLimits,
  sameFigures,
  selectFamily,
  spreadingActivationBoosts,
  surprisalFlags,
  type JudgedMemory,
} from "../src/index.js";

const DAY = 86_400_000;
const at = (day: number) => new Date(Date.UTC(2026, 2, 1) + day * DAY);

describe("Strength model and recall limits", () => {
  test("a default memory falls to ~5% of its initial strength over the 90-day window", () => {
    const s0 = getInitialStrength("default");
    expect(s0).toBe(0.4);
    expect(calculateDecayedStrength(s0, 90 * DAY) / s0).toBeCloseTo(Math.exp(-3), 3);
  });

  test("recall limits derive from k: k = 10 is compact, k = 50 high-context", () => {
    expect(recallLimits(10)).toEqual({ situational: 10, vectorCandidates: 50, promptChars: 14_000, episodeSeeds: 3 });
    expect(recallLimits(50)).toEqual({ situational: 50, vectorCandidates: 100, promptChars: 45_000, episodeSeeds: 5 });
  });
});

describe("Forgetting by demotion", () => {
  const faded = { strength: 0.01, importance: "default" as const, createdAt: at(0), lastRecalledAt: at(0) };

  test("a faded, idle memory is demoted, not deleted", () => {
    expect(forgettingAction(faded, at(120))).toBe("demote");
  });

  test("recently recalled, still strong, or pinned memories are kept", () => {
    expect(forgettingAction(faded, at(30))).toBe("keep");
    expect(forgettingAction({ ...faded, strength: 0.3 }, at(120))).toBe("keep");
    expect(forgettingAction({ ...faded, importance: "pinned" }, at(400))).toBe("keep");
  });
});

describe("Recall-time spreading activation", () => {
  test("reinforces close similarity neighbours and same-episode memories, not weak ones or recalled ones", () => {
    const boosts = spreadingActivationBoosts(
      [{
        id: "seed",
        candidates: [
          { id: "near", similarity: 0.8 },
          { id: "weak", similarity: 0.5 },
          { id: "episode", minutesApart: 20 },
          { id: "recalled", similarity: 0.9 },
        ],
      }],
      new Set(["seed", "recalled"]),
    );
    expect([...boosts.keys()].sort()).toEqual(["episode", "near"]);
    expect(boosts.get("episode")!).toBeLessThan(boosts.get("near")!);
  });
});

describe("Episode context", () => {
  test("adds same-episode neighbours on each side, skipping recalled memories and repeated text", () => {
    const m = (id: string, minute: number, text = id) => ({ id, text, occurredAt: new Date(Date.UTC(2026, 0, 1, 10, minute)) });
    const timeline = [m("a", 0), m("b", 5), m("seed", 10), m("c", 15, "seed"), m("d", 20), m("late", 59 + 120)];
    const added = expandEpisodes([timeline[2]!], timeline, new Set(["seed", "b"]), { radius: 3, windowMinutes: 60 });
    expect(added.map((x) => x.id)).toEqual(["a", "d"]);
  });
});

describe("Near-duplicate figures guard", () => {
  test("restatements merge; entries with different figures never do", () => {
    expect(sameFigures("We use scrypt with 32-byte salt", "We use scrypt with a 32-byte salt")).toBe(true);
    expect(isNearDuplicate(0.97, "Pool swim, 34 minutes today.", "Pool swim, 78 minutes today.")).toBe(false);
    expect(isNearDuplicate(0.97, "Watered the plants", "Did the plant watering")).toBe(true);
  });
});

describe("Surprisal", () => {
  const routine = Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, text: `Commute ${20 + i} minutes`, occurredAt: at(i * 7) }));

  test("a family is the earlier similar memories, oldest first, and needs at least four", () => {
    const outlier = { id: "o", text: "Commute 55 minutes, crash on Main St", occurredAt: at(50) };
    const fam = selectFamily(outlier, [...routine.map((r) => ({ ...r, similarity: 0.8 })), { id: "x", text: "Bought a lamp", occurredAt: at(3), similarity: 0.2 }]);
    expect(fam!.map((f) => f.id)).toEqual(routine.map((r) => r.id));
    expect(selectFamily(outlier, routine.slice(0, 3).map((r) => ({ ...r, similarity: 0.8 })))).toBeNull();
    expect(buildSurprisalPrompt(fam!, outlier)).toContain("New entry (2026-04-20): Commute 55 minutes");
  });

  test("flags surprising memories whose routine was recalled, the routine asked about first", () => {
    const judged: JudgedMemory[] = [
      { id: "o1", text: "old outlier", occurredAt: at(2), surprisal: 0.9, note: "x", familyIds: ["r0"] },
      { id: "o2", text: "new outlier", occurredAt: at(40), surprisal: 0.9, note: "y", familyIds: ["r5"] },
      { id: "o3", text: "ordinary", occurredAt: at(41), surprisal: 0.2, familyIds: ["r0"] },
    ];
    const flags = surprisalFlags(judged, ["r0", "r5"]).sort((a, b) => a.rank - b.rank);
    expect(flags.map((f) => f.flag.memoryId)).toEqual(["o1", "o2"]);
  });

  test("flags a weekly routine gone quiet for over three weeks, and not one on schedule", () => {
    const weekly: JudgedMemory[] = routine.map((r, i) => ({ ...r, familyIds: routine.slice(0, i).map((x) => x.id), usual: "commute every week" }));
    const last = weekly[5]!.occurredAt.getTime();
    const flags = absenceFlags(weekly, ["r5"], new Date(last + 25 * DAY));
    expect(flags[0]!.flag.metric).toBe("absence");
    expect(flags[0]!.flag.description).toContain("(25 days)");
    expect(flags[0]!.flag.description).toContain("every 7 days");
    expect(absenceFlags(weekly, ["r5"], new Date(last + 6 * DAY))).toEqual([]);
  });

  test("anomaly flags render first, with what is different and what is usual", () => {
    const flags = anomalyFlagsForRecall(
      [{ id: "o", text: "Left at 7:10, got there in 55 minutes", occurredAt: at(10), surprisal: 0.9, note: "55-minute commute", usual: "20-25 minutes", familyIds: ["r0"] }],
      ["r0"],
      { absence: false },
    );
    const md = formatSlotsToMarkdown(buildPAESlots({
      userQuery: "Draft a note: I may be late",
      situationalItems: [{ memoryId: "r0", text: "Commute 20 minutes" }],
      anomalyFlags: flags,
    }));
    expect(md.indexOf("[ANOMALY FLAGS")).toBeLessThan(md.indexOf("[SITUATIONAL CONTEXT"));
    expect(md).toContain("- (2026-03-11) Left at 7:10, got there in 55 minutes\n  Out of the ordinary: 55-minute commute\n  Usual: 20-25 minutes");
  });
});
