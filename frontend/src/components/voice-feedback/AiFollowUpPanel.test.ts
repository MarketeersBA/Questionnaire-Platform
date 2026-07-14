import { describe, expect, it } from 'vitest';
import {
  resolveFollowUpPanelPhase,
  resolveFollowUpTriggerOutcome,
  type FollowUpPanelState,
} from '../../utils/aiFollowup';

/** Mirrors AiFollowUpPanel visibility + state rendering (no DOM). */
function resolvePanelViewModel(
  visible: boolean,
  state: FollowUpPanelState,
  maxRounds?: number,
) {
  const phase = resolveFollowUpPanelPhase(visible, state);
  return {
    phase,
    showRoundDots: maxRounds != null && maxRounds > 0,
    activeRoundDots: state.round,
  };
}

describe('AiFollowUpPanel state machine', () => {
  const baseState: FollowUpPanelState = {
    questionId: 'q1',
    round: 1,
    followUpText: null,
    loading: false,
  };

  it('returns hidden when not visible', () => {
    expect(resolvePanelViewModel(false, { ...baseState, loading: true }).phase).toBe('hidden');
  });

  it('shows loading phase while AI is composing', () => {
    expect(resolvePanelViewModel(true, { ...baseState, loading: true }).phase).toBe('loading');
  });

  it('shows reply phase when followUpText is present', () => {
    const vm = resolvePanelViewModel(true, {
      ...baseState,
      followUpText: 'What did you mean by sweet?',
    });
    expect(vm.phase).toBe('reply');
  });

  it('tracks round indicator against maxRounds', () => {
    const vm = resolvePanelViewModel(
      true,
      { ...baseState, round: 2, followUpText: 'Round 2 probe' },
      3,
    );
    expect(vm.showRoundDots).toBe(true);
    expect(vm.activeRoundDots).toBe(2);
  });
});

describe('resolveFollowUpTriggerOutcome (handleFollowUpTrigger logic)', () => {
  it('advances round on probe with followup_text', () => {
    const outcome = resolveFollowUpTriggerOutcome(
      {
        action: 'probe',
        followup_text: 'Can you elaborate?',
        key_insights: ['brief answer'],
      },
      1,
    );
    expect(outcome.kind).toBe('probe');
    expect(outcome.followUpText).toBe('Can you elaborate?');
    expect(outcome.nextRound).toBe(2);
    expect(outcome.keyInsights).toEqual(['brief answer']);
    expect(outcome.showInfraToast).toBe(false);
  });

  it('uses legacy follow_up_question for probe outcome', () => {
    const outcome = resolveFollowUpTriggerOutcome(
      { action: 'probe', follow_up_question: 'Legacy probe?' },
      1,
    );
    expect(outcome.kind).toBe('probe');
    expect(outcome.followUpText).toBe('Legacy probe?');
  });

  it('completes silently when AI judges answer sufficient', () => {
    const outcome = resolveFollowUpTriggerOutcome(
      {
        action: 'complete',
        followup_text: null,
        reasoning: 'Answer is detailed enough',
      },
      1,
    );
    expect(outcome.kind).toBe('complete');
    expect(outcome.showInfraToast).toBe(false);
    expect(outcome.nextRound).toBe(1);
  });

  it('signals infra toast on exception or quota reasoning', () => {
    const outcome = resolveFollowUpTriggerOutcome(
      {
        action: 'complete',
        followup_text: null,
        reasoning: 'Backend exception: OpenAI timeout',
      },
      1,
    );
    expect(outcome.kind).toBe('infra_failure');
    expect(outcome.showInfraToast).toBe(true);
  });

  it('does not probe when action is probe but text is null', () => {
    const outcome = resolveFollowUpTriggerOutcome(
      { action: 'probe', followup_text: null },
      2,
    );
    expect(outcome.kind).toBe('complete');
    expect(outcome.followUpText).toBeNull();
  });
});
