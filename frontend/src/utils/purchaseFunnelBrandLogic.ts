import type { BrandPipeline } from '../constants/purchaseFunnel';

function isSpecifyObject(value: unknown): value is { value: string; otherText: string } {
    return (
        typeof value === 'object' &&
        value !== null &&
        'value' in value &&
        'otherText' in value &&
        typeof (value as { value: string }).value === 'string'
    );
}

/** Minimal shape for brand-pipeline resolution (PF constants or DB module questions). */
export interface BrandPipelineCarrier {
    id: string;
    type: string;
    brandPipeline?: BrandPipeline;
    ancExclude?: string[];
    ancFilter?: string[];
    /** When true, respondent-added brands in the current answer are kept visible and valid. */
    hasOther?: boolean;
}

const normalizeBrand = (value: unknown): string =>
    String(value ?? '').toLowerCase().trim();

const levenshteinDistance = (a: string, b: string): number => {
    const matrix = Array.from({ length: b.length + 1 }, (_, i) =>
        Array.from({ length: a.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            const cost = b[i - 1] === a[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }

    return matrix[b.length][a.length];
};

export const brandsFuzzyMatch = (left: string, right: string): boolean => {
    const a = normalizeBrand(left);
    const b = normalizeBrand(right);
    if (!a || !b) return false;
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 2) return false;
    return levenshteinDistance(a, b) <= 1;
};

export const collectAnswerBrands = (answer: unknown): string[] => {
    if (Array.isArray(answer)) {
        return answer.flatMap((item) => {
            if (typeof item === 'string') {
                const trimmed = item.trim();
                return trimmed ? [trimmed] : [];
            }
            if (isSpecifyObject(item)) {
                return [];
            }
            return [];
        });
    }

    if (typeof answer === 'string') {
        const trimmed = answer.trim();
        return trimmed ? [trimmed] : [];
    }

    return [];
};

const brandIsInSet = (brand: string, allowed: Set<string>): boolean => {
    const normalized = normalizeBrand(brand);
    for (const candidate of allowed) {
        if (brandsFuzzyMatch(normalized, candidate)) return true;
    }
    return false;
};

const resolvePipelineSources = (pipeline: BrandPipeline): string[] => {
    if (pipeline.mode !== 'include_prior') return pipeline.sources;

    if (pipeline.strategy === 'union' || pipeline.strategy === 'intersection') {
        return pipeline.sources;
    }

    // Cascade: only the immediate prior stage drives the next question.
    return pipeline.sources.length > 0
        ? [pipeline.sources[pipeline.sources.length - 1]]
        : [];
};

const collectAllowedBrands = (
    sources: string[],
    answers: Record<string, unknown>,
    strategy: BrandPipeline['strategy']
): Set<string> => {
    const perSource = sources.map((sourceId) => collectAnswerBrands(answers[sourceId]));

    if (perSource.length === 0) return new Set();

    if (strategy === 'intersection') {
        const [first, ...rest] = perSource;
        const intersection = first.filter((brand) =>
            rest.every((sourceBrands) =>
                sourceBrands.some((candidate) => brandsFuzzyMatch(brand, candidate))
            )
        );
        return new Set(intersection.map(normalizeBrand));
    }

    const union = perSource.flat();
    return new Set(union.map(normalizeBrand));
};

/** Legacy config support while older snapshots may still expose ancExclude/ancFilter. */
export const resolveBrandPipeline = (question: BrandPipelineCarrier): BrandPipeline | null => {
    if (question.brandPipeline) return question.brandPipeline;

    if (question.ancExclude?.length) {
        return { mode: 'exclude_prior', sources: question.ancExclude };
    }

    if (question.ancFilter?.length) {
        return {
            mode: 'include_prior',
            sources: question.ancFilter,
            strategy: 'union',
        };
    }

    return null;
};

const collectRespondentCustomBrands = (
    currentAnswer: unknown,
    pipelineBrands: string[],
    masterBrands: string[],
    customBrands: string[] = []
): string[] =>
    collectAnswerBrands(currentAnswer).filter((brand) => {
        if (pipelineBrands.some((candidate) => brandsFuzzyMatch(brand, candidate))) {
            return false;
        }
        if (customBrands.some((candidate) => brandsFuzzyMatch(brand, candidate))) {
            return true;
        }
        return !masterBrands.some((candidate) => brandsFuzzyMatch(brand, candidate));
    });

export const resolvePurchaseFunnelBrands = (
    question: BrandPipelineCarrier,
    masterBrands: string[],
    answers: Record<string, unknown>,
    options?: {
        currentAnswer?: unknown;
        customBrands?: string[];
    }
): string[] => {
    const uniqueMaster = Array.from(
        new Map(masterBrands.map((brand) => [normalizeBrand(brand), brand])).values()
    );

    const pipeline = resolveBrandPipeline(question);
    let pipelineBrands: string[];

    if (!pipeline) {
        pipelineBrands = uniqueMaster;
    } else if (pipeline.mode === 'exclude_prior') {
        const excluded = collectAllowedBrands(pipeline.sources, answers, 'union');
        pipelineBrands = uniqueMaster.filter((brand) => !brandIsInSet(brand, excluded));
    } else {
        const activeSources = resolvePipelineSources(pipeline);
        const allowed = collectAllowedBrands(activeSources, answers, pipeline.strategy ?? 'cascade');

        if (allowed.size === 0) {
            pipelineBrands = [];
        } else {
            pipelineBrands = uniqueMaster.filter((brand) => brandIsInSet(brand, allowed));
        }
    }

    if (!question.hasOther || options?.currentAnswer === undefined) {
        return pipelineBrands;
    }

    const respondentAdded = collectRespondentCustomBrands(
        options.currentAnswer,
        pipelineBrands,
        masterBrands,
        options.customBrands
    );

    if (respondentAdded.length === 0) return pipelineBrands;
    return [...pipelineBrands, ...respondentAdded];
};

export const prunePfAnswerToBrands = (
    answer: unknown,
    allowedBrands: string[],
    questionType: string
): unknown => {
    if (questionType === 'mcq') {
        const selected = collectAnswerBrands(answer);
        return selected.filter((brand) =>
            allowedBrands.some((allowed) => brandsFuzzyMatch(brand, allowed))
        );
    }

    if (questionType === 'grid') {
        if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) return {};
        const obj = answer as Record<string, string[]>;
        const pruned: Record<string, string[]> = {};
        for (const [key, val] of Object.entries(obj)) {
            pruned[key] = val.filter((brand) =>
                allowedBrands.some((allowed) => brandsFuzzyMatch(brand, allowed))
            );
        }
        return pruned;
    }

    if (questionType === 'loop') {
        if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) return {};
        const obj = answer as Record<string, unknown>;
        const pruned: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(obj)) {
            pruned[key] = prunePfAnswerToBrands(val, allowedBrands, 'mcq');
        }
        return pruned;
    }

    if (questionType === 'scq') {
        const selected = String(answer ?? '').trim();
        if (!selected) return answer;
        return allowedBrands.some((allowed) => brandsFuzzyMatch(selected, allowed))
            ? selected
            : '';
    }

    return answer;
};

export const sanitizePfAnswersForQuestion = (
    question: BrandPipelineCarrier,
    masterBrands: string[],
    answers: Record<string, unknown>,
    customBrands: string[] = []
): Record<string, unknown> => {
    const current = answers[question.id];
    const allowedBrands = resolvePurchaseFunnelBrands(
        question,
        masterBrands,
        answers,
        question.hasOther && current !== undefined
            ? { currentAnswer: current, customBrands }
            : undefined
    );
    if (current === undefined) return answers;

    const pruned = prunePfAnswerToBrands(current, allowedBrands, question.type);
    if (JSON.stringify(pruned) === JSON.stringify(current)) return answers;

    return { ...answers, [question.id]: pruned };
};
