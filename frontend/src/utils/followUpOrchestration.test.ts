import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  FOLLOWUP_TEXT_DEBOUNCE_MS,
  FollowUpDebounceGate,
  FollowUpInFlightTracker,
  VoicePollSessionRegistry,
} from './followUpOrchestration';

describe('FollowUpInFlightTracker', () => {
  it('tracks in-flight work per question independently', () => {
    const tracker = new FollowUpInFlightTracker();
    expect(tracker.tryAcquire('q1')).toBe(true);
    expect(tracker.tryAcquire('q2')).toBe(true);
    expect(tracker.tryAcquire('q1')).toBe(false);
    tracker.release('q1');
    expect(tracker.tryAcquire('q1')).toBe(true);
  });
});

describe('FollowUpDebounceGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('blocks duplicate initial triggers within debounce window', () => {
    const gate = new FollowUpDebounceGate();
    expect(gate.shouldAllow('q1', 'great taste')).toBe(true);
    expect(gate.shouldAllow('q1', 'great taste')).toBe(false);
    vi.advanceTimersByTime(FOLLOWUP_TEXT_DEBOUNCE_MS);
    expect(gate.shouldAllow('q1', 'great taste')).toBe(true);
  });

  it('allows different questions or answers without waiting', () => {
    const gate = new FollowUpDebounceGate();
    expect(gate.shouldAllow('q1', 'liked it')).toBe(true);
    expect(gate.shouldAllow('q2', 'liked it')).toBe(true);
    expect(gate.shouldAllow('q1', 'loved it')).toBe(true);
  });
});

describe('VoicePollSessionRegistry', () => {
  it('aborts the previous poll when a new session starts for the same question', () => {
    const registry = new VoicePollSessionRegistry();
    const first = registry.start('q1');
    const second = registry.start('q1');
    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);
  });

  it('cancelAll aborts every active session', () => {
    const registry = new VoicePollSessionRegistry();
    const a = registry.start('q1');
    const b = registry.start('q2');
    registry.cancelAll();
    expect(a.aborted).toBe(true);
    expect(b.aborted).toBe(true);
  });
});
