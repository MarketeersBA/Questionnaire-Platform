import { useState, useEffect, useCallback } from 'react';
import { SurveyFormData } from '../pages/CreateSurvey/types';

const STORAGE_KEY = 'questioner_create_survey_draft';
const VERSION_KEY = 'questioner_create_survey_version';
const DRAFT_VERSION = '1.0';

export interface CreateSurveyDraft {
    formData: SurveyFormData;
    currentStep: number;
    updatedAt: number;
}

export function useCreateSurveyPersistence() {
    const [draft, setDraft] = useState<CreateSurveyDraft | null>(null);

    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        const version = localStorage.getItem(VERSION_KEY);

        if (saved && version === DRAFT_VERSION) {
            try {
                const parsed = JSON.parse(saved);
                setDraft(parsed);
            } catch (e) {
                console.error("Failed to parse survey draft:", e);
            }
        }
    }, []);

    const saveDraft = useCallback((formData: SurveyFormData, currentStep: number) => {
        const draftData: CreateSurveyDraft = {
            formData,
            currentStep,
            updatedAt: Date.now()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(draftData));
        localStorage.setItem(VERSION_KEY, DRAFT_VERSION);
    }, []);

    const clearDraft = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(VERSION_KEY);
    }, []);

    return { draft, saveDraft, clearDraft };
}
