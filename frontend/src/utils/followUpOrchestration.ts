/**
 * Per-question follow-up concurrency, debounce, and voice-poll session control.
 * Used by useFollowUpOrchestration — keeps PublicSurvey handlers thin.
 */

/** Debounce window for initial text blur triggers (duplicate blur events). */
export const FOLLOWUP_TEXT_DEBOUNCE_MS = 1000;

/** Tracks in-flight follow-up work per question id (not global). */
export class FollowUpInFlightTracker {
  private readonly inFlight = new Set<string>();

  isInFlight(questionId: string): boolean {
    return this.inFlight.has(questionId);
  }

  /** Returns false when this question already has work in flight. */
  tryAcquire(questionId: string): boolean {
    if (this.inFlight.has(questionId)) return false;
    this.inFlight.add(questionId);
    return true;
  }

  release(questionId: string): void {
    this.inFlight.delete(questionId);
  }

  reset(): void {
    this.inFlight.clear();
  }
}

/**
 * Short per-question debounce for initial text triggers.
 * Keyed by question + normalized answer so identical blur replays are ignored.
 */
export class FollowUpDebounceGate {
  private readonly lastTriggerAt = new Map<string, number>();

  private key(questionId: string, answerText: string): string {
    return `${questionId}::${answerText.trim()}`;
  }

  shouldAllow(questionId: string, answerText: string, debounceMs = FOLLOWUP_TEXT_DEBOUNCE_MS): boolean {
    const now = Date.now();
    const key = this.key(questionId, answerText);
    const last = this.lastTriggerAt.get(key) ?? 0;
    if (now - last < debounceMs) return false;
    this.lastTriggerAt.set(key, now);
    return true;
  }

  reset(): void {
    this.lastTriggerAt.clear();
  }
}

/** One abortable voice transcript poll per question — new upload cancels the previous poll. */
export class VoicePollSessionRegistry {
  private readonly controllers = new Map<string, AbortController>();

  start(questionId: string): AbortSignal {
    this.cancel(questionId);
    const controller = new AbortController();
    this.controllers.set(questionId, controller);
    return controller.signal;
  }

  cancel(questionId: string): void {
    const existing = this.controllers.get(questionId);
    if (existing) {
      existing.abort();
      this.controllers.delete(questionId);
    }
  }

  cancelAll(): void {
    for (const controller of this.controllers.values()) {
      controller.abort();
    }
    this.controllers.clear();
  }
}
