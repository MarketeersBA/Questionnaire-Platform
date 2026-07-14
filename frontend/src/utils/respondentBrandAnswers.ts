import type { ModuleAnswerValue } from '../types/moduleQuestions';
import { brandsFuzzyMatch, collectAnswerBrands } from './purchaseFunnelBrandLogic';

/** Extract plain brand name strings from MCQ/SCQ brand-list answers. */
export function collectBrandNamesFromAnswer(answer: unknown): string[] {
    return collectAnswerBrands(answer);
}

/** Merge pipeline brands with respondent-added custom brands already stored in the answer. */
export function mergeRespondentBrandChoices(
    pipelineBrands: string[],
    answer: ModuleAnswerValue | undefined
): string[] {
    const selected = collectBrandNamesFromAnswer(answer);
    const extras = selected.filter(
        (brand) => !pipelineBrands.some((candidate) => brandsFuzzyMatch(brand, candidate))
    );
    if (extras.length === 0) return pipelineBrands;

    const seen = new Set(pipelineBrands.map((b) => b.toLowerCase().trim()));
    const merged = [...pipelineBrands];
    for (const brand of extras) {
        const key = brand.toLowerCase().trim();
        if (!seen.has(key)) {
            seen.add(key);
            merged.push(brand);
        }
    }
    return merged;
}

export function applyCustomBrandToAnswer(
    answer: ModuleAnswerValue | undefined,
    brandName: string,
    isMcq: boolean
): ModuleAnswerValue {
    if (isMcq) {
        const list = Array.isArray(answer) ? [...answer] : [];
        if (!list.some((item) => typeof item === 'string' && brandsFuzzyMatch(item, brandName))) {
            list.push(brandName);
        }
        return list;
    }

    return brandName;
}

export function isBrandSelectedInAnswer(
    answer: ModuleAnswerValue | undefined,
    brand: string,
    isMcq: boolean
): boolean {
    if (isMcq) {
        return collectBrandNamesFromAnswer(answer).some((item) => brandsFuzzyMatch(item, brand));
    }
    const single = typeof answer === 'string' ? answer.trim() : '';
    return single ? brandsFuzzyMatch(single, brand) : false;
}
