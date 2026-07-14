/**
 * Canonical AI/MI follow-up answer persistence contract.
 *
 * Analytics and exports expect:
 * - Primary taste-test answers in l2Answers[`${brand}_${questionId}`]
 * - Follow-up exchanges appended inline as text blocks (not separate keys)
 * - aiInsights on session + __structured.ai_insights at submit
 * - Backend probe turns in voice_feedbacks (unchanged collection)
 */

import { normalizeOpenEndAnswer, updateOpenEndText } from './voiceQuestions';

/** Stable markers — do not change without analytics migration. */
export const FOLLOWUP_PROMPT_PREFIX = 'AI Follow-up:';
export const FOLLOWUP_RESPONDENT_PREFIX = 'Respondent:';
export const FOLLOWUP_VOICE_REPLY_PLACEHOLDER = '[Audio Answer]';

export interface FollowUpExchangeBlock {
  prompt: string;
  respondent: string;
}

/** Taste-test L2 answer key: `${brand}_${questionId}` or bare questionId when no brand. */
export function buildL2AnswerKey(brand: string | null | undefined, questionId: string): string {
  const qId = String(questionId || '').trim();
  const b = String(brand || '').trim();
  if (!qId) return '';
  return b ? `${b}_${qId}` : qId;
}

export function formatFollowUpExchangeBlock(
  followUpPrompt: string | null | undefined,
  respondentPart: string,
): string {
  const prompt = (followUpPrompt ?? '').trim();
  const respondent = respondentPart.trim();
  return `${FOLLOWUP_PROMPT_PREFIX} ${prompt}\n${FOLLOWUP_RESPONDENT_PREFIX} ${respondent}`;
}

/**
 * Append one AI/MI exchange to plain text (taste L2, product open-end, heatmap comments).
 */
export function appendFollowUpExchangeToText(
  currentText: string,
  followUpPrompt: string | null | undefined,
  respondentPart: string,
): string {
  const base = (currentText || '').trimEnd();
  const block = formatFollowUpExchangeBlock(followUpPrompt, respondentPart);
  return base ? `${base}\n\n${block}` : block;
}

/** Append exchange into OpenEndAnswer objects used by taste/product open ends. */
export function appendFollowUpExchangeToOpenEndValue(
  value: unknown,
  followUpPrompt: string | null | undefined,
  respondentPart: string,
): ReturnType<typeof updateOpenEndText> {
  const current = normalizeOpenEndAnswer(value);
  const combinedText = appendFollowUpExchangeToText(
    current.text || '',
    followUpPrompt,
    respondentPart,
  );
  return updateOpenEndText(value, combinedText);
}

/**
 * Parse appended follow-up blocks from stored answer text (analytics-safe round-trip).
 * Returns blocks in document order.
 */
export function parseFollowUpExchangeBlocks(text: string): FollowUpExchangeBlock[] {
  if (!text?.trim()) return [];

  const blocks: FollowUpExchangeBlock[] = [];
  const pattern = new RegExp(
    `${FOLLOWUP_PROMPT_PREFIX}\\s*([\\s\\S]*?)\\n${FOLLOWUP_RESPONDENT_PREFIX}\\s*([\\s\\S]*?)(?=\\n\\n${FOLLOWUP_PROMPT_PREFIX}|$)`,
    'g',
  );

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    blocks.push({
      prompt: match[1].trim(),
      respondent: match[2].trim(),
    });
  }
  return blocks;
}

/** Normalize aiInsights for session persistence and final submission. */
export function normalizeAiInsightsMap(
  raw: Record<string, string[]> | null | undefined,
): Record<string, string[]> {
  if (!raw || typeof raw !== 'object') return {};
  const next: Record<string, string[]> = {};
  for (const [questionId, insights] of Object.entries(raw)) {
    if (!Array.isArray(insights)) continue;
    const cleaned = insights
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    if (cleaned.length > 0) {
      next[questionId] = cleaned;
    }
  }
  return next;
}

/** Shape written to __structured.ai_insights on survey submit. */
export function buildStructuredAiInsightsBlock(
  aiInsights: Record<string, string[]>,
): Record<string, string[]> {
  return normalizeAiInsightsMap(aiInsights);
}
