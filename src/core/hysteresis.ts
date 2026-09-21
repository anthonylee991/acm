import type { HysteresisState } from "../schema/index.js";

export const DEFAULT_HYSTERESIS_HIGH_THRESHOLD = 0.75;
export const DEFAULT_HYSTERESIS_LOW_THRESHOLD = 0.35;

export interface HysteresisConfig {
  highThreshold?: number; // α_high: excitation threshold to snap into locked attractor
  lowThreshold?: number;  // β_low: deactivation threshold to release locked attractor
  initialState?: HysteresisState;
  domain?: string;
}

export interface HysteresisTransitionEvent {
  from: HysteresisState;
  to: HysteresisState;
  score: number;
  timestamp: string;
  context?: string;
  reason: string;
}

/**
 * Bifurcation Hysteresis Gate.
 * Implements a nonlinear bistable attractor basin that eliminates
 * prompt-flickering for guardrails and critical operational modes.
 *
 * State transition rules:
 * - In "relaxed" state: Snaps to "locked" ONLY if score >= highThreshold (α_high).
 * - In "locked" state: Retains lock across intermediate scores (e.g. 0.40 - 0.74);
 *   only drops lock if score < lowThreshold (β_low).
 */
export class HysteresisGate {
  private state: HysteresisState;
  private readonly highThreshold: number;
  private readonly lowThreshold: number;
  private readonly domain: string;
  private lastScore: number = 0;
  private lockedContext?: string;
  private history: HysteresisTransitionEvent[] = [];

  constructor(config: HysteresisConfig = {}) {
    this.highThreshold = config.highThreshold ?? DEFAULT_HYSTERESIS_HIGH_THRESHOLD;
    this.lowThreshold = config.lowThreshold ?? DEFAULT_HYSTERESIS_LOW_THRESHOLD;
    this.domain = config.domain ?? "default";
    this.state = config.initialState ?? "relaxed";

    if (this.lowThreshold >= this.highThreshold) {
      throw new Error(
        `Invalid Hysteresis configuration: lowThreshold (${this.lowThreshold}) must be strictly less than highThreshold (${this.highThreshold})`
      );
    }
  }

  /**
   * Evaluates an incoming signal score against the nonlinear hysteresis loop.
   */
  public evaluate(
    signalScore: number,
    context?: string
  ): {
    state: HysteresisState;
    changed: boolean;
    score: number;
    reason: string;
  } {
    this.lastScore = signalScore;
    const previousState = this.state;
    let changed = false;
    let reason = "In attractor basin (bistable hysteresis retention)";

    if (this.state === "relaxed") {
      if (signalScore >= this.highThreshold) {
        this.state = "locked";
        this.lockedContext = context;
        changed = true;
        reason = `Bifurcation threshold exceeded (score ${signalScore.toFixed(3)} >= α_high ${this.highThreshold}). Attractor locked.`;
        this.recordTransition(previousState, this.state, signalScore, reason, context);
      } else {
        reason = `Sub-critical activation (score ${signalScore.toFixed(3)} < α_high ${this.highThreshold}). Remained relaxed.`;
      }
    } else {
      // Current state is "locked"
      if (signalScore < this.lowThreshold) {
        this.state = "relaxed";
        this.lockedContext = undefined;
        changed = true;
        reason = `Release threshold breached (score ${signalScore.toFixed(3)} < β_low ${this.lowThreshold}). Attractor unlocked.`;
        this.recordTransition(previousState, this.state, signalScore, reason, context);
      } else {
        reason = `Hysteresis retention: intermediate score ${signalScore.toFixed(3)} retained locked state (requires < β_low ${this.lowThreshold} to release).`;
      }
    }

    return {
      state: this.state,
      changed,
      score: signalScore,
      reason,
    };
  }

  public isLocked(): boolean {
    return this.state === "locked";
  }

  public getState(): HysteresisState {
    return this.state;
  }

  public getLastScore(): number {
    return this.lastScore;
  }

  public getLockedContext(): string | undefined {
    return this.lockedContext;
  }

  public forceLock(context?: string, reason: string = "Manual topological lock override"): void {
    const prev = this.state;
    this.state = "locked";
    this.lockedContext = context;
    this.recordTransition(prev, "locked", 1.0, reason, context);
  }

  public forceRelease(reason: string = "Manual topological release override"): void {
    const prev = this.state;
    this.state = "relaxed";
    this.lockedContext = undefined;
    this.recordTransition(prev, "relaxed", 0.0, reason);
  }

  public getDiagnostics(): {
    domain: string;
    state: HysteresisState;
    highThreshold: number;
    lowThreshold: number;
    lastScore: number;
    lockedContext?: string;
    transitionCount: number;
    history: HysteresisTransitionEvent[];
  } {
    return {
      domain: this.domain,
      state: this.state,
      highThreshold: this.highThreshold,
      lowThreshold: this.lowThreshold,
      lastScore: this.lastScore,
      lockedContext: this.lockedContext,
      transitionCount: this.history.length,
      history: [...this.history],
    };
  }

  private recordTransition(
    from: HysteresisState,
    to: HysteresisState,
    score: number,
    reason: string,
    context?: string
  ): void {
    this.history.push({
      from,
      to,
      score,
      timestamp: new Date().toISOString(),
      reason,
      context,
    });
  }
}
