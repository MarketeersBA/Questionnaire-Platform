/**
 * Taste test module metadata and tt_q* ID resolution.
 * Mirrors backend/utils/taste_test_question_ids.py for schema generation.
 */

import type { TasteTestConfig } from '../types/tasteTest';

export const TASTE_TEST_MODULE_ID = 'taste_test';
export const TASTE_TEST_QUESTION_ID_PREFIX = 'tt';

const TT_CANONICAL_RE = /^tt_q\d+$/i;

export interface TasteTestModuleMetadata {
    module_id: string;
    question_id_prefix: string;
    legacy_id_aliases: Record<string, string>;
}

export function isTtCanonicalId(id: string): boolean {
    return Boolean(id) && TT_CANONICAL_RE.test(id.trim());
}

export function resolveTasteTestQuestionId(
    q: { question_id?: string; legacy_id?: string },
    moduleMeta?: TasteTestModuleMetadata
): string {
    const raw = String(q.question_id || '').trim();
    if (isTtCanonicalId(raw)) return raw;

    const aliases = moduleMeta?.legacy_id_aliases || {};
    if (aliases[raw]) return aliases[raw];

    return raw;
}

export function extractTasteTestModuleMeta(
    masterData: Record<string, unknown>
): TasteTestModuleMetadata {
    const meta = masterData._module_metadata as Partial<TasteTestModuleMetadata> | undefined;
    return {
        module_id: meta?.module_id || TASTE_TEST_MODULE_ID,
        question_id_prefix: meta?.question_id_prefix || TASTE_TEST_QUESTION_ID_PREFIX,
        legacy_id_aliases: meta?.legacy_id_aliases || {},
    };
}

/** Collect all taste-test questions from a fetch payload (fixed + attribute buckets). */
export function flattenTasteTestQuestions(masterData: Record<string, unknown>): Array<{
    question_id?: string;
    legacy_id?: string;
}> {
    const out: Array<{ question_id?: string; legacy_id?: string }> = [];
    for (const [key, value] of Object.entries(masterData)) {
        if (key === '_module_metadata' || !Array.isArray(value)) continue;
        for (const q of value) {
            if (q && typeof q === 'object') {
                out.push(q as { question_id?: string; legacy_id?: string });
            }
        }
    }
    return out;
}

export function buildTasteTestIdAliasMap(
    questions: Array<{ question_id?: string; legacy_id?: string }>
): Record<string, string> {
    const map: Record<string, string> = {};
    for (const q of questions) {
        const canonical = resolveTasteTestQuestionId(q, {
            module_id: TASTE_TEST_MODULE_ID,
            question_id_prefix: TASTE_TEST_QUESTION_ID_PREFIX,
            legacy_id_aliases: map,
        });
        if (!canonical) continue;
        map[canonical] = canonical;
        if (q.legacy_id) map[q.legacy_id] = canonical;
        if (q.question_id && q.question_id !== canonical) {
            map[q.question_id] = canonical;
        }
    }
    return map;
}

export function enrichTasteTestConfigWithMetadata(
    config: TasteTestConfig,
    masterData: Record<string, unknown>
): TasteTestConfig {
    const moduleMeta = extractTasteTestModuleMeta(masterData);
    const aliases = moduleMeta.legacy_id_aliases;
    if (Object.keys(aliases).length === 0) {
        moduleMeta.legacy_id_aliases = buildTasteTestIdAliasMap(
            flattenTasteTestQuestions(masterData)
        );
    }
    return {
        ...config,
        module_metadata: moduleMeta,
        question_id_prefix: moduleMeta.question_id_prefix,
    };
}
