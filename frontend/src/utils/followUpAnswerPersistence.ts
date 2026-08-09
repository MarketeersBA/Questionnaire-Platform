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

/**
 * Split stored answer text into the respondent's original answer and appended AI exchanges.
 * Persistence format is unchanged — this is for respondent UI only.
 */
export function splitFollowUpAnswerText(text: string): {
  primaryText: string;
  exchanges: FollowUpExchangeBlock[];
} {
  const raw = text || '';
  const exchanges = parseFollowUpExchangeBlocks(raw);
  if (exchanges.length === 0) {
    return { primaryText: raw, exchanges: [] };
  }
  const firstBlockIdx = raw.indexOf(FOLLOWUP_PROMPT_PREFIX);
  if (firstBlockIdx < 0) {
    return { primaryText: raw, exchanges: [] };
  }
  return {
    primaryText: raw.slice(0, firstBlockIdx).trimEnd(),
    exchanges,
  };
}

/** Rebuild stored answer text from primary answer + exchange blocks. */
export function joinFollowUpAnswerText(
  primaryText: string,
  exchanges: FollowUpExchangeBlock[],
): string {
  let result = (primaryText || '').trimEnd();
  for (const exchange of exchanges) {
    result = appendFollowUpExchangeToText(result, exchange.prompt, exchange.respondent);
  }
  return result;
}

/** Keep appended AI exchanges when the respondent edits only the original answer. */
export function replacePrimaryAnswerText(fullText: string, newPrimary: string): string {
  const { exchanges } = splitFollowUpAnswerText(fullText);
  return joinFollowUpAnswerText(newPrimary, exchanges);
}

/** Project an OpenEndAnswer so the textbox shows only the original answer. */
export function projectOpenEndPrimaryOnly(value: unknown): ReturnType<typeof normalizeOpenEndAnswer> {
  const ans = normalizeOpenEndAnswer(value);
  const { primaryText } = splitFollowUpAnswerText(ans.text || '');
  return { ...ans, text: primaryText };
}

/**
 * Commit a textbox/voice edit while preserving appended follow-up blocks on stored text.
 * `editedValue` is what OpenEndAnswerInput emits (primary text only).
 */
export function commitOpenEndPrimaryEdit(
  storedValue: unknown,
  editedValue: unknown,
): ReturnType<typeof updateOpenEndText> {
  const stored = normalizeOpenEndAnswer(storedValue);
  const edited = normalizeOpenEndAnswer(editedValue);
  const mergedText = replacePrimaryAnswerText(stored.text || '', edited.text || '');
  return {
    ...edited,
    text: mergedText,
  };
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
