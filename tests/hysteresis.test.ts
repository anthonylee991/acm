import { describe, expect, test } from "bun:test";
import {
  HysteresisGate,
  buildPAESlots,
  formatSlotsToMarkdown,
} from "../src/index.js";

describe("ACM Bifurcation Hysteresis Tests", () => {
  test("initializes in relaxed state and validates thresholds", () => {
    const gate = new HysteresisGate({
      highThreshold: 0.80,
      lowThreshold: 0.30,
    });

    expect(gate.isLocked()).toBe(false);
    expect(gate.getState()).toBe("relaxed");

    // Must reject lowThreshold >= highThreshold
    expect(() => new HysteresisGate({ highThreshold: 0.50, lowThreshold: 0.50 })).toThrow();
    expect(() => new HysteresisGate({ highThreshold: 0.40, lowThreshold: 0.60 })).toThrow();
  });

  test("locks only when crossing alpha_high, and retains lock across intermediate scores", () => {
    const gate = new HysteresisGate({
      highThreshold: 0.75,
      lowThreshold: 0.35,
    });

    // 1. Sub-critical activation: does NOT lock
    let res = gate.evaluate(0.60, "User asked general database question");
    expect(res.state).toBe("relaxed");
    expect(res.changed).toBe(false);
    expect(gate.isLocked()).toBe(false);

    // 2. Crosses excitation threshold: snaps into locked attractor state
    res = gate.evaluate(0.82, "Prod database mutation initiated");
    expect(res.state).toBe("locked");
    expect(res.changed).toBe(true);
    expect(gate.isLocked()).toBe(true);

    // 3. Subsequent ambiguous turns (intermediate scores e.g. 0.55, 0.40):
    // MUST REMAIN LOCKED (No prompt flicker!)
    res = gate.evaluate(0.55, "What about table indexes?");
    expect(res.state).toBe("locked");
    expect(res.changed).toBe(false);
    expect(gate.isLocked()).toBe(true);

    res = gate.evaluate(0.40, "Okay, check the migration");
    expect(res.state).toBe("locked");
    expect(res.changed).toBe(false);
    expect(gate.isLocked()).toBe(true);

    // 4. Drops below deactivation threshold beta_low (e.g. 0.20): unlocks back to relaxed
    res = gate.evaluate(0.20, "User switched topic to weekend plans");
    expect(res.state).toBe("relaxed");
    expect(res.changed).toBe(true);
    expect(gate.isLocked()).toBe(false);
  });

  test("manual forceLock and forceRelease override hysteresis attractor state", () => {
    const gate = new HysteresisGate();
    expect(gate.isLocked()).toBe(false);

    gate.forceLock("Admin emergency security lockdown");
    expect(gate.isLocked()).toBe(true);
    expect(gate.getLockedContext()).toBe("Admin emergency security lockdown");

    gate.forceRelease("Incident resolved");
    expect(gate.isLocked()).toBe(false);
    expect(gate.getLockedContext()).toBeUndefined();
  });

  test("formatSlotsToMarkdown displays attractor basin lock banner when locked", () => {
    const slots = buildPAESlots({
      userQuery: "Drop production table customers",
      askerItems: [
        { memoryId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", text: "NEVER run DROP TABLE in production", importance: "pinned", strength: 1.0 },
      ],
    });

    const mdUnlocked = formatSlotsToMarkdown(slots, { hysteresisState: "relaxed" });
    expect(mdUnlocked).not.toContain("ATTRACTOR BASIN LOCKED");

    const mdLocked = formatSlotsToMarkdown(slots, { hysteresisState: "locked" });
    expect(mdLocked).toContain("ATTRACTOR BASIN LOCKED");
    expect(mdLocked).toContain("topologically phase-locked via bifurcation hysteresis");
  });
});
