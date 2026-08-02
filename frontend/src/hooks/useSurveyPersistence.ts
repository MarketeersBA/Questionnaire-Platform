import { useState, useEffect, useCallback, useRef } from 'react';
import type { SurveyStep, ConfigurableModuleId } from '../types/surveyFlow';
import type { ModuleAnswersMap } from '../types/moduleQuestions';
import type { ProductTestWizardMode } from '../types/respondentNavigation';
import type { ProductTestAnswers } from '../utils/productTestFlowOrchestration';
import { sessions } from '../services/api';
import { normalizeAiInsightsMap } from '../utils/followUpAnswerPersistence';

export interface SurveySessionData {
    answers: Record<string, any>;
    l2Answers: Record<string, any>;
    moduleAnswers: Record<string, ModuleAnswersMap>;
    moduleStepIndexes: Record<string, number>;
    currentModuleId: ConfigurableModuleId | null;
    completedModules: string[];
    currentBrandIndex: number;
    productTestAnswers: ProductTestAnswers;
    productTestPhaseIndex: number;
    productTestSectionIndex: number;
    productTestWizardMode: ProductTestWizardMode;
    step: SurveyStep;
    phone: string;
    countryCode: string;
    customBrands: string[];
    aiInsights: Record<string, string[]>;
    startTime: number;
    last_updated: string;
    version: number;
}

const SESSION_VERSION = 4;
const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const SYNC_DEBOUNCE_MS = 2000; // 2 seconds

function hydrateSessionData(raw: Partial<SurveySessionData> & Record<string, unknown>): SurveySessionData {
    return {
        answers: (raw.answers as Record<string, any>) || {},
        l2Answers: (raw.l2Answers as Record<string, any>) || {},
        moduleAnswers: (raw.moduleAnswers as Record<string, ModuleAnswersMap>) || {},
        moduleStepIndexes: (raw.moduleStepIndexes as Record<string, number>) || {},
        currentModuleId: (raw.currentModuleId as ConfigurableModuleId | null) ?? null,
        completedModules: (raw.completedModules as string[]) || [],
        currentBrandIndex: typeof raw.currentBrandIndex === 'number' ? raw.currentBrandIndex : 0,
        productTestAnswers: (raw.productTestAnswers as ProductTestAnswers) || {},
        productTestPhaseIndex: typeof raw.productTestPhaseIndex === 'number' ? raw.productTestPhaseIndex : 0,
        productTestSectionIndex: typeof raw.productTestSectionIndex === 'number' ? raw.productTestSectionIndex : 0,
        productTestWizardMode: raw.productTestWizardMode === 'section' ? 'section' : 'intro',
        step: (raw.step as SurveyStep) || 'layer1',
        phone: (raw.phone as string) || '',
        countryCode: (raw.countryCode as string) || '+20',
        customBrands: (raw.customBrands as string[]) || [],
        aiInsights: normalizeAiInsightsMap(raw.aiInsights as Record<string, string[]>),
        startTime: typeof raw.startTime === 'number' ? raw.startTime : Date.now(),
        last_updated: (raw.last_updated as string) || new Date().toISOString(),
        version: SESSION_VERSION,
    };
}

export function useSurveyPersistence(token: string | undefined) {
    const persistenceKey = token ? `survey_session_v${SESSION_VERSION}_${token}` : null;
    const [isHydrating, setIsHydrating] = useState(true);
    const syncTimeoutRef = useRef<any>(null);
    const lastSyncedRef = useRef<string | null>(null);

    // Main session state
    const [session, setSession] = useState<SurveySessionData | null>(null);

    // ── Hybrid Hydration System (Priority: Newer of Cloud vs Local) ────────────
    useEffect(() => {
        if (!token || !persistenceKey) {
            setIsHydrating(false);
            return;
        }

        const runHydration = async () => {
            console.log('[Persistence] Initiating Hybrid Hydration...');

            let localData: SurveySessionData | null = null;
            const savedLocal = localStorage.getItem(persistenceKey);

            if (savedLocal) {
                try {
                    const parsed = hydrateSessionData(JSON.parse(savedLocal));
                    const age = Date.now() - new Date(parsed.last_updated).getTime();
                    if (age < MAX_SESSION_AGE_MS) {
                        localData = parsed;
                    }
                } catch (e) {
                    console.warn('[Persistence] Local cache corruption detected');
                }
            }

            try {
                // Fetch from Cloud
                const cloudData = await sessions.get(token);

                if (cloudData) {
                    const cloudTS = new Date(cloudData.last_updated).getTime();
                    const localTS = localData ? new Date(localData.last_updated).getTime() : 0;

                    if (cloudTS >= localTS) {
                        console.log('[Persistence] Cloud state is dominant');
                        const hydrated = hydrateSessionData(cloudData);
                        setSession(hydrated);
                        localStorage.setItem(persistenceKey, JSON.stringify(hydrated));
                        lastSyncedRef.current = JSON.stringify(hydrated);
                    } else if (localData) {
                        console.log('[Persistence] Local cache is more recent than cloud');
                        setSession(localData);
                        // Trigger a sync for the cloud to catch up
                        sessions.update(token, localData).catch(console.error);
                    }
                } else if (localData) {
                    console.log('[Persistence] No cloud state, using local cache');
                    setSession(localData);
                    // Sync local to cloud
                    sessions.update(token, localData).catch(console.error);
                }
            } catch (error) {
                console.error('[Persistence] Cloud reachability failed. Operating in offline mode.', error);
                if (localData) {
                    setSession(localData);
                    toastInfo('Offline mode: Progress saved locally');
                }
            } finally {
                setIsHydrating(false);
            }
        };

        runHydration();
    }, [token, persistenceKey]);

    // ── Systematic Auto-Save Processor ───────────────────────────────────────
    const saveSession = useCallback((data: Omit<SurveySessionData, 'last_updated' | 'version'>) => {
        if (!persistenceKey || !token) return;

        const timestamp = new Date().toISOString();
        const fullData: SurveySessionData = {
            ...data,
            last_updated: timestamp,
            version: SESSION_VERSION
        };

        const serialized = JSON.stringify(fullData);

        // Skip update if content is identical (ignoring timestamp)
        // Optimization: compare data part only
        const dataOnly = JSON.stringify(data);
        if (lastSyncedRef.current && lastSyncedRef.current.includes(dataOnly)) {
            return;
        }

        // 1. Instant Local Update
        localStorage.setItem(persistenceKey, serialized);
        setSession(fullData);

        // 2. Optimized Cloud Push
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

        syncTimeoutRef.current = setTimeout(async () => {
            try {
                await sessions.update(token, fullData);
                lastSyncedRef.current = serialized;
                console.debug('[Persistence] State synced to cloud');
            } catch (err) {
                console.error('[Persistence] Cloud push failed', err);
            }
        }, SYNC_DEBOUNCE_MS);
    }, [persistenceKey, token]);

    const clearSession = useCallback(async () => {
        if (!persistenceKey || !token) return;
        localStorage.removeItem(persistenceKey);
        setSession(null);
        lastSyncedRef.current = null;
        try {
            await sessions.delete(token);
        } catch (e) {
            console.error('[Persistence] Cloud purge failed', e);
        }
    }, [persistenceKey, token]);

    // Helper for Toast (avoiding global toast dep here if possible, but used for UX)
    const toastInfo = (msg: string) => {
        import('sonner').then(({ toast }) => toast.info(msg));
    };

    return {
        savedSession: session,
        saveSession,
        clearSession,
        isHydrating
    };
}
