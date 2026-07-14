import { questionModules } from '../services/api';
import type { QuestionModule } from '../types/questionModules';

const moduleCache = new Map<string, QuestionModule>();

export async function fetchQuestionModuleDoc(
    moduleId: string,
    fallback: () => QuestionModule,
    force = false
): Promise<QuestionModule> {
    if (!force && moduleCache.has(moduleId)) {
        return moduleCache.get(moduleId)!;
    }
    try {
        const mod = await questionModules.get(moduleId);
        moduleCache.set(moduleId, mod);
        return mod;
    } catch {
        return fallback();
    }
}

export function resolveModuleFromSurveySnapshot(
    survey: any,
    moduleId: string
): QuestionModule | null {
    const snapshot = survey?.module_snapshots?.[moduleId];
    if (snapshot?.sections?.length) {
        return snapshot as QuestionModule;
    }
    return null;
}

export async function resolveQuestionModule(
    moduleId: string,
    fallback: (survey?: any) => QuestionModule,
    survey?: any
): Promise<QuestionModule> {
    const fromSurvey = survey ? resolveModuleFromSurveySnapshot(survey, moduleId) : null;
    if (fromSurvey) return fromSurvey;

    // If survey is present, we are in runtime & snapshot is missing. 
    // NEVER fetch from analyst API as that requires a session token.
    if (survey) {
        console.warn(`[Orchestration] Module "${moduleId}" snapshot missing in runtime. Using fallback.`);
        return fallback(survey);
    }

    return fetchQuestionModuleDoc(moduleId, () => fallback(survey));
}
