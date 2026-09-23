import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    templates,
    surveys,
    masterQuestions,
    purchaseFunnels,
    productTestQuestions,
} from '../../services/api';
import { buildSelectedModules, resolveModuleSequence } from '../../constants/surveyModules';
import {
    ArrowLeft,
    Check,
    ChevronRight,
    Edit3,
    Layout,
    Beaker,
    Activity,
    Sparkles,
    RotateCcw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

import { composeSurveySchema } from '../../utils/schemaComposer';
import {
    resolveBrandArchitecture,
    validateProductTestPreflight,
    validateProductTestPostGeneration,
    countLayerQuestions,
    DEFAULT_PRODUCT_TEST_CONFIG,
} from '../../utils/blueprintGenerationGuards';
import {
    buildBlueprintSubmitSnapshots,
    buildSurveyBlueprint,
    restoreProductTestConfigFromSurvey,
    resolveClonedL2Snapshot,
} from '../../utils/surveyBlueprintBuilder';
import { countProductTestSnapshotStats } from '../../utils/productTestBlueprintUtils';
import { enrichTasteTestConfigWithMetadata } from '../../utils/tasteTestModuleUtils';
import { SurveyFormData, DEFAULT_TASTE_CONFIG, INITIAL_SCREENING_CONFIG, DEFAULT_AI_FOLLOWUP } from './types';

import IdentityStep from './steps/IdentityStep';
import { ParametersStep } from './steps/ParametersStep';
import { ArchitectStep } from './steps/ArchitectStep';
import { DeploymentStep } from './steps/DeploymentStep';
import { SuccessModal } from './components/SuccessModal';
import { CloneSurveyModal } from './components/CloneSurveyModal';
import { getSurveyLink } from '../../utils/surveyLinks';
import { DEFAULT_VOICE_CAPTURE } from './types';
import { useCreateSurveyPersistence } from '../../hooks/useCreateSurveyPersistence';
import { flushPendingPackagingHeatmapUploads, type PackagingHeatmapPendingFiles } from '../../utils/packagingHeatmapConfig';

const DEFAULT_QUALITY_CONTROL = {
    is_enabled: false,
    min_time_seconds: 60,
    max_time_seconds: 1200,
    min_time_message_en: "You weren't focused on the survey",
    min_time_message_ar: 'لم تكن مركزاً في الاستبيان',
    max_time_message_en: 'Out of time',
    max_time_message_ar: 'انتهى الوقت المسموح',
};

function createEmptyFormData(): SurveyFormData {
    return {
        survey_name: '',
        survey_code: '',
        survey_type: '',
        links_count: 1000,
        sample_capacity: 200,
        gate_quotas: {},
        locked_quotas: {},
        config: null,
        product_test_config: null,
        internal_brands_data: [],
        competitor_brands_data: [],
        template_snapshot_schema: null,
        template_snapshot_questions: [],
        template_snapshot_l2: null,
        schema: {
            layer1_structure: { sections: [] },
            layer2_structure: { sections: [] },
        },
        layer1_screening_config: { ...INITIAL_SCREENING_CONFIG },
        google_form_url: '',
        google_form_id: '',
        industry: '',
        survey_objective: '',
        survey_objective_other: '',
        sample_intelligence: true,
        sec_classes: [],
        purchase_funnel_id: undefined,
        purchase_funnel: {
            is_enabled: false,
            category_name: '',
            brand_list: [],
        },
        brand_usage: { is_enabled: false },
        brand_pricing_behavior: { is_enabled: false },
        brand_analyzer: {
            is_enabled: false,
            sync_with_purchase_funnel: true,
            selected_attributes: [],
            brand_list: [],
        },
        voice_capture: { ...DEFAULT_VOICE_CAPTURE },
        ai_followup: { ...DEFAULT_AI_FOLLOWUP },
        quality_control: { ...DEFAULT_QUALITY_CONTROL },
        attached_modules: [],
        selected_modules: [],
        module_sequence: [],
        blueprint: {
            category: '',
            ratingScale: 10,
            own_brand: null,
            brands: [],
            attributes: {},
            custom_research_attributes: [],
        },
    } as SurveyFormData;
}

const LEGACY_OBJECTIVE_IDS = new Set([
    'taste_new_product',
    'product_preference',
    'sensory_evaluation',
    'price_sensitivity',
    'improvement_insights',
    'purchase_intent',
    'other',
]);

/** Free-text business question; strip old choice-card enum ids. */
function resolveBusinessQuestion(objective?: string | null, other?: string | null): string {
    if (objective === 'other') return (other || '').trim();
    if (!objective || LEGACY_OBJECTIVE_IDS.has(objective)) return '';
    return objective;
}



interface CreateSurveyProps {
    editSurveyId?: string;
    initialSurveyData?: any;
}

export default function CreateSurvey({ editSurveyId, initialSurveyData }: CreateSurveyProps = {}) {
    const isEditMode = Boolean(editSurveyId);
    const navigate = useNavigate();

    const [currentStep, setCurrentStep] = useState(1);
    const [maxStepReached, setMaxStepReached] = useState(1);
    const [successData, setSuccessData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [showCloneModal, setShowCloneModal] = useState(false);
    const [packagingHeatmapPending, setPackagingHeatmapPending] = useState<PackagingHeatmapPendingFiles>({});

    const { draft, saveDraft, clearDraft } = useCreateSurveyPersistence();
    const [hasRestored, setHasRestored] = useState(false);

    const [formData, setFormData] = useState<SurveyFormData>(() => createEmptyFormData());

    // Populate form from existing survey data when in edit mode
    useEffect(() => {
        if (isEditMode && initialSurveyData && !hasRestored) {
            const s = initialSurveyData;
            const blueprint = s.blueprint || s.taste_test_config || {};
            const normalizeBrands = (bs: any[]) => (bs || []).map((b: any) => typeof b === 'string' ? { name: b, role: 'competitor' } : b);
            const clonedConfig = {
                ...DEFAULT_TASTE_CONFIG,
                ...blueprint,
                category: blueprint.category || s.customizations?.category || '',
                brands: normalizeBrands(blueprint.brands || []),
                attributes: blueprint.attributes || {},
                custom_research_attributes: blueprint.custom_research_attributes || [],
                // `blueprint` (ResearchBlueprint) has no language field, so it was
                // falling through to DEFAULT_TASTE_CONFIG.language = 'en' and
                // silently turning an Arabic survey English on every edit — the
                // saved schema is then recomposed in English.
                language:
                    s.taste_test_config?.language
                    || s.product_test_config?.language
                    || s.language
                    || blueprint.language
                    || DEFAULT_TASTE_CONFIG.language,
                internal_brands_data: normalizeBrands(blueprint.internal_brands_data || s.internal_brands_data || []),
                competitor_brands_data: normalizeBrands(blueprint.competitor_brands_data || s.competitor_brands_data || [])
            };

            setFormData(prev => ({
                ...prev,
                survey_name: s.company_name || s.name || '',
                survey_code: s.survey_code || '',
                survey_type: s.type || '',
                survey_objective: resolveBusinessQuestion(s.survey_objective, s.survey_objective_other),
                survey_objective_other: '',
                industry: s.industry || '',
                links_count: s.links_count || s.link_count || 1000,
                sample_capacity: s.sample_capacity || 200,
                sec_classes: s.sec_classes || [],
                gate_quotas: s.gate_quotas || {},
                layer1_screening_config: s.layer1_screening_config || prev.layer1_screening_config,
                google_form_id: s.google_form_id || '',
                google_form_url: s.google_form_url || '',
                config: clonedConfig,
                product_test_config: s.product_test_config || null,
                blueprint: s.blueprint || prev.blueprint,
                purchase_funnel: s.purchase_funnel || prev.purchase_funnel,
                brand_usage: s.brand_usage || prev.brand_usage,
                brand_pricing_behavior: s.brand_pricing_behavior || prev.brand_pricing_behavior,
                brand_analyzer: s.brand_analyzer || prev.brand_analyzer,
                selected_modules: s.selected_modules || prev.selected_modules,
                module_sequence: s.module_sequence || prev.module_sequence,
                template_snapshot_schema: s.template_snapshot_schema || null,
                template_snapshot_questions: s.template_snapshot_questions || [],
                template_snapshot_l2: s.template_snapshot_l2 || null,
                internal_brands_data: normalizeBrands(s.internal_brands_data || []),
                competitor_brands_data: normalizeBrands(s.competitor_brands_data || []),
                voice_capture: s.voice_capture || prev.voice_capture,
                ai_followup: s.ai_followup || prev.ai_followup,
            }));
            setHasRestored(true);
        }
    }, [isEditMode, initialSurveyData, hasRestored]);

    // Progressive Save Effect (skip in edit mode to avoid overwriting the edit draft)
    useEffect(() => {
        if (!isEditMode && (formData.survey_name || formData.survey_type)) {
            saveDraft(formData, currentStep);
        }
    }, [formData, currentStep, saveDraft, isEditMode]);

    // Draft Rehydration Effect (skip in edit mode)
    useEffect(() => {
        if (isEditMode) return;
        if (draft && !hasRestored) {
            setFormData({
                ...draft.formData,
                survey_objective: resolveBusinessQuestion(
                    draft.formData.survey_objective,
                    draft.formData.survey_objective_other,
                ),
                survey_objective_other: '',
            });
            setCurrentStep(draft.currentStep);
            setMaxStepReached(Math.max(draft.currentStep || 1, 1));
            setHasRestored(true);
            toast.info('Progress restored from draft', {
                description: `Last saved: ${new Date(draft.updatedAt).toLocaleTimeString()}`,
                action: {
                    label: 'Reset',
                    onClick: () => {
                        clearDraft();
                        window.location.reload();
                    }
                }
            });
        }
    }, [draft, hasRestored, clearDraft, isEditMode]);

    const [attributeBanksData, setAttributeBanksData] = useState<{ category: string; display_name: string }[]>([]);
    const [selectedBank, setSelectedBank] = useState<string | null>(null);

    const buildL1Default = (cfg: any) => {
        const questions: any[] = [];
        if (!cfg) return { title: 'Respondent Screening / فلترة المشاركين', questions: [] };

        if (cfg.full_name !== false) {
            questions.push({
                id: 'name',
                label: 'Full Name / الاسم بالكامل',
                text: 'Full Name / الاسم بالكامل',
                type: 'text',
                required: true,
                questionMeta: { nature: 'fixed' }
            });
        }
        if (cfg.gender) {
            questions.push({
                id: 'gender_auto',
                label: 'Gender / النوع',
                text: 'Gender / النوع',
                type: 'mcq',
                options: ['Male / ذكر', 'Female / أنثى'],
                required: true,
                correct_answer: cfg.allowed_genders && cfg.allowed_genders.length > 0 ? cfg.allowed_genders : null,
                questionMeta: { nature: 'fixed' }
            });
        }
        if (cfg.age) {
            const allAgeOptions = ['Under 18', '18-25', '26-35', '36-45', '46-55', '56-65', '65+'];
            questions.push({
                id: 'age_auto',
                label: 'Age Range / الفئة العمرية',
                text: 'Age Range / الفئة العمرية',
                type: 'mcq',
                options: allAgeOptions,
                required: true,
                correct_answer: cfg.allowed_age_ranges && cfg.allowed_age_ranges.length > 0 ? cfg.allowed_age_ranges : null,
                questionMeta: { nature: 'fixed' }
            });
        }
        if (cfg.location) {
            const areaMode = cfg.area_mode || 'mcq';
            if (areaMode === 'free_text') {
                questions.push({
                    id: 'area',
                    label: 'Location / Area / المحافظة أو المنطقة',
                    text: 'Location / Area / المحافظة أو المنطقة',
                    type: 'text',
                    required: true,
                    questionMeta: { nature: 'fixed' }
                });
            } else {
                const EGYPT_AREAS = [
                    "Cairo / القاهرة", "Giza / الجيزة", "Delta / الدلتا", "Upper Egypt / صعيد مصر",
                    "Alexandria / الإسكندرية"
                ];
                questions.push({
                    id: 'area',
                    label: 'Location / Area / المحافظة أو المنطقة',
                    text: 'Location / Area / المحافظة أو المنطقة',
                    type: 'mcq',
                    options: EGYPT_AREAS,
                    required: true,
                    correct_answer: cfg.allowed_areas && cfg.allowed_areas.length > 0 && !cfg.allowed_areas.includes("All Egypt / كل مصر") ? cfg.allowed_areas : null,
                    questionMeta: { nature: 'fixed' }
                });
            }
        }
        if (cfg.education || cfg.ses_screening) {
            questions.push({
                id: 'education',
                label: 'Education Level / المستوى التعليمي',
                text: 'Education Level / المستوى التعليمي',
                type: 'mcq',
                options: [
                    'Postgraduate (Masters / PhD) / دراسات عليا (ماجستير / دكتوراه)',
                    'University / College degree / مؤهل جامعي',
                    'Secondary / ثانوي',
                    'Primary / Preparatory / ابتدائي / إعدادي',
                    'Uneducated / غير متعلم'
                ],
                required: true,
                correct_answer: cfg.allowed_education && cfg.allowed_education.length > 0 ? cfg.allowed_education : null,
                questionMeta: { nature: 'fixed' }
            });
        }
        if (cfg.occupation || cfg.ses_screening) {
            questions.push({
                id: 'occupation',
                label: 'Occupation / المهنة',
                text: 'Occupation / المهنة',
                type: 'mcq',
                options: [
                    'CEO / GM / Large company owner / Senior government official / مدير تنفيذي / مدير عام / صاحب شركة كبيرة / مسؤول حكومي رفيع',
                    'Company manager / High-skill professional (doctor, engineer) / Trader / Small business owner / University professor / مدير شركة / مهني عالي المهارة (طبيب، مهندس) / تاجر / صاحب مشروع صغير / أستاذ جامعي',
                    'Mid-level admin / Government mid-level / Small shop owner / Technician / Secondary school teacher / إداري متوسط / موظف حكومي متوسط / صاحب محل صغير / فني / مدرس ثانوي',
                    'Supervisor / Clerk / Bank employee / Low-grade government employee / Primary school teacher / مشرف / كاتب / موظف بنك / موظف حكومي درجة منخفضة / مدرس ابتدائي',
                    'Skilled labor (carpenter, electrician, plumber, salesman, cook, waiter) / عامل ماهر (نجار، كهربائي، سباك، بائع، طباخ، نادل)',
                    'Unskilled labor / Unemployed / Servant / Street vendor / عامل غير ماهر / عاطل عن العمل / خادم / بائع متجول'
                ],
                required: true,
                correct_answer: cfg.allowed_occupations && cfg.allowed_occupations.length > 0 ? cfg.allowed_occupations : null,
                questionMeta: { nature: 'fixed' }
            });
        }
        if (cfg.family_income || cfg.ses_screening) {
            questions.push({
                id: 'family_income',
                label: 'Family Monthly Income / الدخل الشهري للأسرة',
                text: 'Family Monthly Income / الدخل الشهري للأسرة',
                type: 'mcq',
                options: [
                    'Above 40,000 EGP / أكثر من ٤٠٠٠٠ جنيه',
                    '12,001 - 40,000 EGP / ١٢٠٠١ - ٤٠٠٠٠ جنيه',
                    '6,001 - 12,000 EGP / ٦٠٠١ - ١٢٠٠٠ جنيه',
                    '4,001 - 6,000 EGP / ٤٠٠١ - ٦٠٠٠ جنيه',
                    'Below 4,000 EGP / أقل من ٤٠٠٠ جنيه',
                ],
                required: true,
                correct_answer: cfg.allowed_income && cfg.allowed_income.length > 0 ? cfg.allowed_income : null,
                questionMeta: { nature: 'fixed' }
            });
        }
        if (cfg.marital_status) {
            questions.push({
                id: 'marital_status',
                label: 'Marital Status / الحالة الاجتماعية',
                text: 'Marital Status / الحالة الاجتماعية',
                type: 'mcq',
                options: ['Single / أعزب', 'Married / متزوج', 'Divorced / مطلق', 'Widowed / أرمل'],
                required: true,
                correct_answer: cfg.allowed_marital_status && cfg.allowed_marital_status.length > 0 ? cfg.allowed_marital_status : null,
                questionMeta: { nature: 'fixed' }
            });
        }

        return { title: 'Respondent Screening / فلترة المشاركين', questions };
    };

    const mergeL1 = (generatedSchema: any, screeningConfig?: any) => {
        const l1Section = buildL1Default(screeningConfig);
        const baseSections = generatedSchema.layer1_structure?.sections || [];

        // Find existing screening section to replace it, or prepend if not found
        // Use the exact title from buildL1Default to identify it
        const screeningTitle = 'Respondent Screening / فلترة المشاركين';
        const existingIdx = baseSections.findIndex((s: any) => s.title === screeningTitle);

        let newSections;
        if (existingIdx !== -1) {
            newSections = [...baseSections];
            newSections[existingIdx] = l1Section;
        } else {
            newSections = [l1Section, ...baseSections];
        }

        return {
            ...generatedSchema,
            layer1_structure: {
                ...generatedSchema.layer1_structure,
                sections: newSections
            },
            layer3_structure: generatedSchema.layer3_structure || { sections: [{ title: 'Premium Metrics', questions: [] }] }
        };
    };

    const scrollToError = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('ring-2', 'ring-rose-500/50');
            setTimeout(() => element.classList.remove('ring-2', 'ring-rose-500/50'), 3000);
        }
    };

    const handleGenerateSchema = async (freshData?: SurveyFormData) => {
        try {
            const currentData = freshData || formData;
            const isTasteTest = currentData.survey_type === 'taste_test';
            const isProductTest = currentData.survey_type === 'product_test';

            const activeSequence = resolveModuleSequence(currentData);
            const hasTasteTestInSequence = activeSequence.includes('taste_test') && !isProductTest;
            const hasProductTestInSequence = activeSequence.includes('product_test') || isProductTest;
            const hasPFInSequence = activeSequence.includes('purchase_funnel');
            const hasUsageInSequence = currentData.brand_usage?.is_enabled || activeSequence.includes('brand_usage');
            const hasPricingInSequence = currentData.brand_pricing_behavior?.is_enabled || activeSequence.includes('brand_pricing_behavior');
            const hasBAInSequence = currentData.brand_analyzer?.is_enabled || activeSequence.includes('brand_analyzer');

            if (isTasteTest || isProductTest || hasTasteTestInSequence || hasProductTestInSequence || hasPFInSequence || hasUsageInSequence || hasPricingInSequence || hasBAInSequence) {
                const configData = currentData.config as any;
                const { hasBrands } = resolveBrandArchitecture(currentData);
                const hasAttributes = Object.keys(configData?.attributes || {}).length > 0 || (configData?.custom_research_attributes || []).length > 0;

                // Validate Taste Test
                if ((isTasteTest || hasTasteTestInSequence) && (!configData?.category || !hasBrands || !hasAttributes)) {
                    let missingFields = [];
                    if (!configData?.category) {
                        missingFields.push("Product Category");
                        scrollToError('config-category-input');
                    } else if (!hasBrands) {
                        missingFields.push("Brands (Own or Competitive)");
                        scrollToError('brand-architecture-section');
                    } else if (!hasAttributes) {
                        missingFields.push("Research Attributes");
                        scrollToError('research-attributes-section');
                    }

                    toast.error(`Missing required fields: ${missingFields.join(', ')}`);
                    return;
                }

                // Validate Product Test — category + brands (bank checked async via /status)
                if (isProductTest || hasProductTestInSequence) {
                    if (!configData?.category) {
                        scrollToError('config-category-input');
                        toast.error('Missing required field: Product Category');
                        return;
                    }
                    if (!hasBrands) {
                        scrollToError('brand-architecture-section');
                        toast.error('Missing required field: Brands (Own or Competitive)');
                        return;
                    }
                }

                setLoading(true);
                const mainContent = document.getElementById('main-content');
                if (mainContent) {
                    mainContent.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
                toast.loading('Architecting your structural blueprint...', { id: 'generator' });

                try {
                    const config = currentData.config || DEFAULT_TASTE_CONFIG;
                    const hasTasteTestInSequenceInner = (config?.module_sequence || []).includes('taste_test');

                    // Pre-flight: product test bank health (fast status endpoint)
                    let ptBankStatus = null as Awaited<ReturnType<typeof productTestQuestions.getBankStatus>> | null;
                    if (isProductTest || hasProductTestInSequence) {
                        try {
                            ptBankStatus = await productTestQuestions.getBankStatus();
                        } catch (bankErr) {
                            console.error('[handleGenerateSchema] bank status fetch failed:', bankErr);
                            toast.error('Could not verify product test question bank. Check your connection and try again.', { id: 'generator' });
                            return;
                        }

                        const bankPreflight = validateProductTestPreflight(currentData, ptBankStatus, {
                            packagingHeatmapPending,
                        });
                        if (!bankPreflight.ok) {
                            if (bankPreflight.scrollTargetId) {
                                scrollToError(bankPreflight.scrollTargetId);
                            }
                            toast.error(bankPreflight.message, { id: 'generator' });
                            return;
                        }
                    }

                    const selections = config.attributes as Record<string, string[]>;

                    // Parallel fetch: taste test master data + product test question banks
                    const tasteMasterPromise = (isTasteTest || hasTasteTestInSequenceInner)
                        ? masterQuestions.fetchTasteTest(selections)
                        : Promise.resolve({});
                    const ptQuestionsPromise = (isProductTest || hasProductTestInSequence)
                        ? productTestQuestions.listProductQuestions()
                        : Promise.resolve([]);
                    const pkgQuestionsPromise = (isProductTest || hasProductTestInSequence)
                        ? productTestQuestions.listPackageQuestions()
                        : Promise.resolve([]);

                    const [tasteMasterData, ptQuestions, pkgQuestions] = await Promise.all([
                        tasteMasterPromise,
                        ptQuestionsPromise,
                        pkgQuestionsPromise
                    ]);

                    const masterData = {
                        ...tasteMasterData,
                        product_test_questions: ptQuestions,
                        package_test_questions: pkgQuestions
                    };
                    const schema = await composeSurveySchema(currentData, masterData);
                    const merged = mergeL1(schema, currentData.layer1_screening_config);

                    // Post-generation guard: block empty L2 for product test
                    if (isProductTest || hasProductTestInSequence) {
                        const postCheck = validateProductTestPostGeneration(merged, ptBankStatus);
                        if (!postCheck.ok) {
                            toast.error(postCheck.message, { id: 'generator' });
                            return;
                        }
                    }

                    const l1Count = countLayerQuestions(merged, 'layer1_structure');
                    const ptStats = countProductTestSnapshotStats(merged.product_test_snapshot);

                    setFormData(prev => {
                        if (isProductTest || hasProductTestInSequence) {
                            toast.success(
                                `Blueprint generated: ${l1Count} Screening + ${ptStats.phaseCount} phases · ${ptStats.sectionCount} sections · ${ptStats.questionCount} questions`,
                                { id: 'generator' },
                            );
                        } else {
                            toast.success(`Generated ${l1Count} Screening Questions in Layer 1`, { id: 'generator' });
                        }
                        const enrichedConfig = (isTasteTest || hasTasteTestInSequenceInner) && prev.config
                            ? enrichTasteTestConfigWithMetadata(prev.config, masterData)
                            : prev.config;
                        return { ...prev, schema: merged, config: enrichedConfig };
                    });

                    setCurrentStep(3);
                    setMaxStepReached(m => Math.max(m, 3));
                    if (mainContent) {
                        mainContent.scrollTo({ top: 0, behavior: 'smooth' });
                    } else {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                } finally {
                    setLoading(false);
                }
            } else {
                // Truly simple standard survey with no deep modules
                setFormData((prev: SurveyFormData) => {
                    const base = prev.schema || { layer1_structure: { sections: [] }, layer2_questions: { sections: [] } };
                    return { ...prev, schema: mergeL1(base, prev.layer1_screening_config) };
                });
                nextStep();
            }
        } catch (err) {
            console.error(err);
            toast.error('Generator failed to fetch master data', { id: 'generator' });
        }
    };

    const handleCloneSurvey = async (survey: any) => {
        const previousData = { ...formData }; // Capture state for undo
        try {
            console.log('[handleCloneSurvey] Cloned Survey Data:', survey);

            // 1. Thorough Question Snapshot Recovery (Attempt all possible fields)
            let questions: any[] = [];
            if (survey.template_snapshot_questions?.length) {
                questions = survey.template_snapshot_questions;
            } else if (survey.layer1_questions?.length) {
                questions = survey.layer1_questions;
            } else if (survey.template_snapshot_schema?.layer1_structure?.sections?.length) {
                questions = survey.template_snapshot_schema.layer1_structure.sections.flatMap((s: any) => s.questions || []);
            } else if (survey.schema?.layer1_structure?.sections?.length) {
                questions = survey.schema.layer1_structure.sections.flatMap((s: any) => s.questions || []);
            }

            const l2Snapshot = resolveClonedL2Snapshot(survey, survey.type || '');
            const blueprint = (survey.blueprint || survey.taste_test_config || {});
            const clonedProductTestConfig = restoreProductTestConfigFromSurvey(survey);

            // 2. Discovery Pass - Reconstruct configuration
            const discoveredAttributes: Record<string, string[]> = {};
            const discoveredCustomAttrs: Record<string, any> = {};
            const discoveredBrandsMap: Set<string> = new Set();
            let discoveredCategory = '';
            let pfEnabled = false;

            // A. Discovery from L2 Snapshot (Very accurate for Attributes/Brands)
            if (l2Snapshot.sections?.length > 0) {
                l2Snapshot.sections.forEach((sec: any) => {
                    if (sec.brand && sec.brand !== 'None' && sec.brand !== 'global' && sec.brand !== 'Instructions') {
                        discoveredBrandsMap.add(sec.brand);
                    }
                    if (sec.attribute && sec.attribute !== 'None' && sec.attribute !== 'After Taste') {
                        // Avoid adding system sections as attributes
                        if (!['General Evaluation', 'Instructions', 'Preference'].includes(sec.attribute)) {
                            discoveredAttributes[sec.attribute] = [];
                        }
                    }
                });
            }

            // B. Discovery from Flat Questions (Backup and PF/Category)
            const pfKeywords = ['pf_', 'awareness', 'aided', 'purchas', 'frequen', 'loyalty', 'brands_used'];
            questions.forEach((q: any) => {
                const id = (q.id || q.question_id || "").toLowerCase();
                const text = (q.text || q.en_text || q.label || "").toLowerCase();

                // Detect Purchase Funnel markers
                if (pfKeywords.some(kw => id.includes(kw) || text.includes(kw))) {
                    pfEnabled = true;
                    // Extract category from common patterns
                    if (text.includes('purchase')) {
                        const m = text.match(/purchase (.*)\?/);
                        if (m && m[1] && !discoveredCategory) discoveredCategory = m[1].trim();
                    } else if (text.includes('thinking of')) {
                        const m = text.match(/of (.*) category/);
                        if (m && m[1] && !discoveredCategory) discoveredCategory = m[1].trim();
                    }
                }

                // Detect Custom Sub-Attributes
                if (text.includes(' - ') && (q.type === 'scale' || q.questionMeta?.inputType === 'scale')) {
                    const parts = (q.text || q.label || '').split(' - ');
                    if (parts.length > 1) {
                        const mainAttr = parts[0].trim();
                        const subLabel = parts[1].split(' (')[0].trim();
                        if (!discoveredCustomAttrs[mainAttr]) {
                            discoveredCustomAttrs[mainAttr] = { main_attribute: mainAttr, sub_attributes: [] };
                        }
                        if (!discoveredCustomAttrs[mainAttr].sub_attributes.some((s: any) => s.label === subLabel)) {
                            discoveredCustomAttrs[mainAttr].sub_attributes.push({
                                label: subLabel,
                                minLabel: q.questionMeta?.minLabel || q.minLabel || '',
                                maxLabel: q.questionMeta?.maxLabel || q.maxLabel || ''
                            });
                        }
                    }
                }
            });

            // 2. Map Configuration (Parameters Stage)
            // Backend now persists taste_test_config; fallback to discovery
            const typeValue = survey.type || (clonedProductTestConfig ? 'product_test' : (discoveredBrandsMap.size > 0 ? 'taste_test' : 'standard'));

            const normalizeBrands = (bs: any[]) => bs.map(b => typeof b === 'string' ? { name: b, role: 'competitor' } : b);

            const clonedConfig = {
                ...DEFAULT_TASTE_CONFIG,
                ...blueprint,
                category: blueprint.category || survey.customizations?.category || discoveredCategory || '',
                brands: normalizeBrands(blueprint.brands || Array.from(discoveredBrandsMap)),
                attributes: (blueprint.attributes && Object.keys(blueprint.attributes).length > 0)
                    ? blueprint.attributes
                    : discoveredAttributes,
                custom_research_attributes: blueprint.custom_research_attributes || Object.values(discoveredCustomAttrs),
                // Same trap as edit mode: the blueprint carries no language, so
                // cloning an Arabic survey used to produce an English one.
                language:
                    survey.taste_test_config?.language
                    || survey.product_test_config?.language
                    || survey.language
                    || blueprint.language
                    || DEFAULT_TASTE_CONFIG.language,
                internal_brands_data: normalizeBrands(blueprint.internal_brands_data || survey.internal_brands_data || []),
                competitor_brands_data: normalizeBrands(blueprint.competitor_brands_data || survey.competitor_brands_data || [])
            };

            // Hybrid restoration of Layer 4 from scan
            const historicalPFQuestions = questions.filter((q: any) => {
                const id = (q.id || q.question_id || "").toLowerCase();
                const text = (q.text || q.en_text || q.label || "").toLowerCase();
                return pfKeywords.some(kw => id.includes(kw) || text.includes(kw));
            });


            // 3. Map Configuration (Parameters Stage)
            const finalBlueprint = buildSurveyBlueprint({
                ...formData,
                survey_type: typeValue,
                config: clonedConfig,
                product_test_config: clonedProductTestConfig,
            } as SurveyFormData);

            setFormData({
                survey_name: survey.company_name || survey.name || '',
                survey_code: '', // Force user to enter a new unique code
                survey_type: typeValue as any,
                survey_objective: resolveBusinessQuestion(survey.survey_objective, survey.survey_objective_other),
                industry: survey.industry || '',
                links_count: survey.links_count || survey.link_count || 1000,
                sample_capacity: survey.sample_capacity || survey.respondent_target || 200,
                config: clonedConfig,
                product_test_config: clonedProductTestConfig || (typeValue === 'product_test' ? DEFAULT_PRODUCT_TEST_CONFIG : undefined),
                blueprint: finalBlueprint,
                schema: {
                    layer1_structure: {
                        sections: [{
                            title: 'Respondent Screening / فلترة المشاركين',
                            questions: questions.map((q: any) => ({ ...q }))
                        }]
                    },
                    layer2_structure: l2Snapshot,
                    layer4_structure: { sections: historicalPFQuestions }
                },
                template_snapshot_schema: {
                    ...survey.schema,
                    layer1_structure: {
                        sections: [{
                            title: 'Screening Questions',
                            questions: questions.map((q: any) => ({ ...q }))
                        }]
                    },
                    layer2_structure: l2Snapshot,
                },
                template_snapshot_questions: questions.map((q: any) => ({ ...q })),
                template_snapshot_l2: l2Snapshot,
                internal_brands_data: clonedConfig.internal_brands_data || [],
                competitor_brands_data: clonedConfig.competitor_brands_data || [],
                layer1_screening_config: survey.layer1_screening_config || INITIAL_SCREENING_CONFIG,
                gate_quotas: survey.gate_quotas || {},
                google_form_id: '',
                google_form_url: '',
                selected_modules: survey.selected_modules || (typeValue === 'product_test' ? ['screening', 'product_test'] : []),
                module_sequence: survey.module_sequence || (typeValue === 'product_test' ? ['screening', 'product_test'] : []),
                module_snapshots: survey.module_snapshots || {},
                purchase_funnel: survey.purchase_funnel ? {
                    ...survey.purchase_funnel,
                    is_enabled: true,
                    brand_list: (survey.purchase_funnel.brand_list && survey.purchase_funnel.brand_list.length > 0)
                        ? survey.purchase_funnel.brand_list
                        : (survey.customizations?.brands || [])
                } : (pfEnabled ? {
                    is_enabled: true,
                    category_name: discoveredCategory || clonedConfig.category || '',
                    brand_list: survey.customizations?.brands || []
                } : undefined),
                brand_usage: survey.brand_usage ? {
                    ...survey.brand_usage,
                    is_enabled: survey.brand_usage.is_enabled ?? true
                } : undefined,
                brand_pricing_behavior: survey.brand_pricing_behavior ? {
                    ...survey.brand_pricing_behavior,
                    is_enabled: survey.brand_pricing_behavior.is_enabled ?? true
                } : undefined,
                brand_analyzer: survey.brand_analyzer ? {
                    ...survey.brand_analyzer,
                    is_enabled: survey.brand_analyzer.is_enabled ?? true,
                    sync_with_purchase_funnel: survey.brand_analyzer.sync_with_purchase_funnel ?? true,
                    selected_attributes: survey.brand_analyzer.selected_attributes || [],
                    brand_list: survey.brand_analyzer.brand_list || []
                } : undefined
            } as SurveyFormData);

            setShowCloneModal(false);
            toast.success('Historical project cloned', {
                description: 'Architecture restored. Please assign a new unique code.',
                action: {
                    label: 'Undo Clone',
                    onClick: () => setFormData(previousData)
                }
            });
        } catch (err) {
            console.error('Clone mapping failed:', err);
            toast.error('Failed to parse historical data correctly');
        }
    };

    const scrollStepToTop = () => {
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const goToStep = (targetId: number) => {
        if (targetId === currentStep) return;

        // Allow free navigation to any step already reached
        if (targetId < currentStep || targetId <= maxStepReached) {
            setCurrentStep(targetId);
            scrollStepToTop();
            return;
        }

        // Advance one step forward via existing validation (and schema generation)
        if (targetId === currentStep + 1) {
            nextStep();
            return;
        }

        toast.error('Complete the current steps in order before jumping ahead');
    };

    const nextStep = () => {
        if (currentStep === 1) {
            if (!formData.survey_name) {
                toast.error('Survey name is required');
                scrollToError('survey-name-input');
                return;
            }
            if (!formData.industry) {
                toast.error('Please select an industry');
                scrollToError('survey-industry-input');
                return;
            }
            if (!formData.survey_code) {
                toast.error('Survey code is required for tracking');
                scrollToError('survey-code-input');
                return;
            }
            if (!formData.survey_type) {
                toast.error('Select a survey architecture type');
                scrollToError('survey-type-section');
                return;
            }
            const needsSurveyObjective = formData.survey_type === 'taste_test' || formData.survey_type === 'product_test';
            if (needsSurveyObjective && !formData.survey_objective?.trim()) {
                toast.error('Enter a business question before proceeding');
                scrollToError('survey-objective-section');
                return;
            }
            if (needsSurveyObjective && !formData.config?.category?.trim()) {
                toast.error('Product category is required');
                scrollToError('config-category-input');
                return;
            }
        }

        if (currentStep === 2) {
            if (!formData.survey_type) {
                toast.error('Select a survey architecture');
                return;
            }

            // Enforce target brand selection at Parameters stage
            const targetBrand = formData.config?.own_brand;
            if (!targetBrand) {
                toast.error('You must designate a target brand before proceeding');
                scrollToError('brand-architecture-section');
                return;
            }

            // TRIGGER GENERATOR when moving from Parameters to Architect
            const isTasteTest = formData.survey_type === 'taste_test';
            const isProductTest = formData.survey_type === 'product_test';
            const hasTasteTestInSequence = (formData.config?.module_sequence || []).includes('taste_test');
            const hasProductTestInSequence = (formData.config?.module_sequence || formData.module_sequence || []).includes('product_test');
            const hasPFInSequence = (formData.config?.module_sequence || []).includes('purchase_funnel');
            const hasUsageInSequence = formData.brand_usage?.is_enabled
                || (formData.config?.module_sequence || []).includes('brand_usage');
            const hasPricingInSequence = formData.brand_pricing_behavior?.is_enabled
                || (formData.config?.module_sequence || []).includes('brand_pricing_behavior');
            const hasBAInSequence = formData.brand_analyzer?.is_enabled
                || (formData.config?.module_sequence || []).includes('brand_analyzer');

            if (isTasteTest || isProductTest || hasTasteTestInSequence || hasProductTestInSequence || hasPFInSequence || hasUsageInSequence || hasPricingInSequence || hasBAInSequence) {
                handleGenerateSchema(formData);
                return; // handleGenerateSchema will call setCurrentStep(3)
            }
        }

        if (currentStep === 3) {
            // No operation needed here. Manual edits in ArchitectStep have already updated formData.schema.
            // Move straight to Deployment Step (4).
        }

        setCurrentStep(prev => {
            const next = Math.min(prev + 1, 5);
            setMaxStepReached(m => Math.max(m, next));
            return next;
        });
        scrollStepToTop();
    };

    const prevStep = () => {
        setCurrentStep(prev => Math.max(prev - 1, 1));
        scrollStepToTop();
    };

    const handleSubmit = async () => {
        if (!formData.survey_name) {
            toast.error('Survey name missing');
            return;
        }

        setLoading(true);

        try {
            const selectedModules = buildSelectedModules(formData);
            const moduleSequence = resolveModuleSequence(formData);
            const blueprintSnapshots = buildBlueprintSubmitSnapshots(formData);

            const surveyPayload = {
                company_name: formData.survey_name,
                survey_code: formData.survey_code,
                type: formData.survey_type,
                industry: formData.industry,
                survey_objective: formData.survey_objective || null,
                survey_objective_other: formData.survey_objective_other || null,
                sec_classes: formData.sec_classes,
                taste_test_config: formData.config,
                product_test_config: formData.product_test_config || null,
                selected_modules: selectedModules,
                module_sequence: moduleSequence,
                blueprint: buildSurveyBlueprint(formData),
                ...(blueprintSnapshots ? {
                    template_snapshot_schema: blueprintSnapshots.template_snapshot_schema,
                    template_snapshot_questions: blueprintSnapshots.template_snapshot_questions,
                    template_snapshot_l2: blueprintSnapshots.template_snapshot_l2,
                    product_test_snapshot: blueprintSnapshots.product_test_snapshot,
                } : {}),
                google_form_id: formData.google_form_id,
                google_form_url: formData.google_form_url,
                links_count: formData.links_count,
                internal_brands_data: formData.config?.internal_brands_data || [],
                competitor_brands_data: formData.config?.competitor_brands_data || [],
                purchase_funnel: formData.purchase_funnel,
                brand_usage: formData.brand_usage,
                brand_pricing_behavior: formData.brand_pricing_behavior,
                brand_analyzer: formData.brand_analyzer,
                customizations: {
                    brands: (formData.config?.brands || []).map((b: any) => typeof b === 'string' ? b : (b.name || b.label)),
                    category: formData.config?.category || '',
                    modified_questions: blueprintSnapshots?.template_snapshot_questions || [],
                    blueprint_edited: Boolean(blueprintSnapshots),
                },
                layer1_rules: {
                    gender: null,
                    age_min: formData.layer1_screening_config?.age ? (formData.layer1_screening_config.age_min ?? null) : null,
                    age_max: formData.layer1_screening_config?.age ? (formData.layer1_screening_config.age_max ?? null) : null,
                    extra_conditions: []
                },
                layer1_screening_config: formData.layer1_screening_config || null,
                sample_capacity: formData.sample_capacity || 0,
                gate_quotas: formData.gate_quotas || {},
                voice_capture: formData.voice_capture || DEFAULT_VOICE_CAPTURE,
                ai_followup: formData.ai_followup ?? DEFAULT_AI_FOLLOWUP,
            };

            // ── EDIT MODE: PUT /surveys/{id} ──────────────────────────────────
            if (isEditMode && editSurveyId) {
                await surveys.update(editSurveyId, surveyPayload);
                toast.success('Survey updated successfully', {
                    description: 'All changes have been saved.',
                    action: { label: 'View Surveys', onClick: () => navigate('/surveys') }
                });
                setLoading(false);
                navigate('/surveys');
                return;
            }

            // ── CREATE MODE ───────────────────────────────────────────────────
            // 1. Create Template (as a persistent configuration record)
            const templateData = {
                name: formData.survey_name,
                survey_code: formData.survey_code,
                type: formData.survey_type || 'standard',
                template_type: (['taste_test', 'product_test'].includes(formData.survey_type || '') ? formData.survey_type : 'standard'),
                industry: formData.industry,
                sec_classes: formData.sec_classes,
                purchase_funnel: formData.purchase_funnel,
                brand_usage: formData.brand_usage,
                brand_pricing_behavior: formData.brand_pricing_behavior,
                brand_analyzer: formData.brand_analyzer,
                selected_modules: selectedModules,
                module_sequence: moduleSequence,
                layer1_screening_config: formData.layer1_screening_config,
                taste_test_config: {
                    ...formData.config,
                    industry: formData.industry,
                    sec_classes: formData.sec_classes,
                    purchase_funnel: formData.purchase_funnel,
                    brand_usage: formData.brand_usage,
                    brand_pricing_behavior: formData.brand_pricing_behavior,
                    brand_analyzer: formData.brand_analyzer,
                    layer1_screening_config: formData.layer1_screening_config
                },
                product_test_config: formData.product_test_config || null,
                layer1_structure: { sections: [] },
                layer2_structure: { sections: [] },
                layer1_questions: []
            };

            const tRes = await templates.create(templateData);

            // 2. Create Survey
            const surveyData = {
                ...surveyPayload,
                template_id: tRes._id,
                respondent_count: 0,
                gate_counts: {},
            };

            const res = await surveys.create(surveyData);

            if (
                formData.product_test_config?.packaging_heatmap_enabled
                && (packagingHeatmapPending.front || packagingHeatmapPending.back)
            ) {
                try {
                    const { updatedConfig, uploadedSides } = await flushPendingPackagingHeatmapUploads(
                        res._id,
                        formData.product_test_config,
                        packagingHeatmapPending,
                    );
                    if (updatedConfig && uploadedSides.length > 0) {
                        await surveys.update(res._id, { product_test_config: updatedConfig });
                    }
                    setPackagingHeatmapPending({});
                } catch (uploadErr) {
                    console.error('Packaging heatmap upload failed after survey create:', uploadErr);
                    toast.error('Survey created, but packaging image upload failed. Re-open the draft to retry.');
                }
            }

            // Handle Purchase Funnel save if enabled
            if (formData.purchase_funnel?.is_enabled) {
                const pfCategory = formData.purchase_funnel.category_name || formData.config?.category;
                if (pfCategory) {
                    try {
                        // Check if it already exists or just update
                        await purchaseFunnels.create({
                            survey_id: res._id,
                            category_name: pfCategory,
                            brand_list: formData.purchase_funnel.brand_list,
                            is_enabled: true
                        });
                    } catch (pfErr: any) {
                        // If it already exists, we could try updating, but for now we just log it
                        // Since survey creation might have upserted the survey, the PF might already be there.
                        if (pfErr.response?.data?.detail?.includes("already exists")) {
                            console.log("Purchase Funnel already exists, skipping create.");
                        } else {
                            console.error("Failed to save purchase funnel", pfErr);
                            toast.error("Survey created, but Purchase Funnel configuration failed to save.");
                        }
                    }
                }
            }

            setSuccessData(res);
            clearDraft();
            const publicUrl = res.generated_tokens?.length ? getSurveyLink(res.generated_tokens[0]) : '';
            if (publicUrl) {
                toast.success('Gateway Connection Established', {
                    action: {
                        label: 'Copy Public Link',
                        onClick: () => {
                            navigator.clipboard.writeText(publicUrl);
                            toast.success('Link copied');
                        }
                    }
                });
            } else {
                toast.success('Gateway Connection Established');
            }
        } catch (err) {
            console.error(err);
            toast.error('Gateway Connection Failed');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const fetchAttributes = async () => {
            try {
                const isTasteTest = formData.survey_type === 'taste_test';
                const attrs = isTasteTest
                    ? await masterQuestions.getTasteTestAttributes()
                    : await masterQuestions.getAttributes();

                setAttributeBanksData(attrs.map((a: string) => ({ category: a, display_name: a })));
            } catch (err) {
                console.error('Failed to fetch attributes', err);
            }
        };
        fetchAttributes();
    }, [formData.survey_type]);

    const [bankDetails, setBankDetails] = useState<any>(null);
    useEffect(() => {
        if (selectedBank) {
            const fetchSubAttributes = async () => {
                try {
                    const isTasteTest = formData.survey_type === 'taste_test';
                    const subs = isTasteTest
                        ? await masterQuestions.getTasteTestSubAttributes(selectedBank)
                        : await masterQuestions.getSubAttributes(selectedBank);

                    setBankDetails({
                        display_name: selectedBank,
                        core_attributes: subs.map((s: string) => ({
                            label: s,
                            attribute_id: s.toLowerCase().replace(/\s+/g, '_')
                        }))
                    });
                } catch (err) {
                    console.error(err);
                }
            };
            fetchSubAttributes();
        } else {
            setBankDetails(null);
        }
    }, [selectedBank, formData.survey_type]);

    const steps = [
        { id: 1, name: 'Definition', icon: Layout },
        { id: 2, name: 'Parameters', icon: Beaker },
        { id: 3, name: 'Structural Blueprint', icon: Edit3 },
        { id: 4, name: 'Quality Control', icon: Activity },
    ];

    const resetCurrentStep = () => {
        const empty = createEmptyFormData();
        const stepName = steps[currentStep - 1]?.name || 'this page';

        setFormData(prev => {
            switch (currentStep) {
                case 1:
                    return {
                        ...prev,
                        survey_name: empty.survey_name,
                        survey_code: empty.survey_code,
                        survey_type: empty.survey_type,
                        industry: empty.industry,
                        survey_objective: empty.survey_objective,
                        survey_objective_other: empty.survey_objective_other,
                        layer1_screening_config: { ...INITIAL_SCREENING_CONFIG },
                        gate_quotas: {},
                        locked_quotas: {},
                        sec_classes: [],
                        purchase_funnel_id: undefined,
                        purchase_funnel: empty.purchase_funnel,
                        brand_usage: empty.brand_usage,
                        brand_pricing_behavior: empty.brand_pricing_behavior,
                        brand_analyzer: empty.brand_analyzer,
                        attached_modules: [],
                        selected_modules: [],
                        module_sequence: [],
                        sample_intelligence: true,
                        // Keep category off identity until type is chosen again
                        config: prev.config
                            ? { ...prev.config, category: '' }
                            : prev.config,
                    };
                case 2:
                    return {
                        ...prev,
                        sample_capacity: empty.sample_capacity,
                        links_count: empty.links_count,
                        config: prev.survey_type === 'taste_test' || prev.survey_type === 'product_test'
                            ? {
                                ...DEFAULT_TASTE_CONFIG,
                                category: prev.config?.category || '',
                                language: 'en',
                            }
                            : null,
                        product_test_config: prev.survey_type === 'product_test'
                            ? { ...DEFAULT_PRODUCT_TEST_CONFIG }
                            : null,
                        internal_brands_data: [],
                        competitor_brands_data: [],
                        blueprint: empty.blueprint,
                        ai_followup: { ...DEFAULT_AI_FOLLOWUP },
                        purchase_funnel: {
                            is_enabled: prev.purchase_funnel?.is_enabled || false,
                            category_name: '',
                            brand_list: [],
                        },
                        brand_usage: {
                            is_enabled: prev.brand_usage?.is_enabled || false,
                            target_brand: '',
                            selected_questions: prev.brand_usage?.is_enabled
                                ? ['us_q1', 'us_q2', 'us_q3', 'us_q4']
                                : undefined,
                        },
                        brand_pricing_behavior: {
                            is_enabled: prev.brand_pricing_behavior?.is_enabled || false,
                            target_brand: '',
                            selected_questions: prev.brand_pricing_behavior?.is_enabled
                                ? ['cb_q1', 'cb_q2', 'cb_q3', 'cb_q4']
                                : undefined,
                        },
                        brand_analyzer: {
                            is_enabled: prev.brand_analyzer?.is_enabled || false,
                            sync_with_purchase_funnel: true,
                            selected_attributes: [],
                            brand_list: [],
                        },
                    };
                case 3:
                    return {
                        ...prev,
                        schema: {
                            layer1_structure: { sections: [] },
                            layer2_structure: { sections: [] },
                        },
                        template_snapshot_schema: null,
                        template_snapshot_questions: [],
                        template_snapshot_l2: null,
                    };
                case 4:
                    return {
                        ...prev,
                        quality_control: { ...DEFAULT_QUALITY_CONTROL },
                        voice_capture: { ...DEFAULT_VOICE_CAPTURE },
                    };
                default:
                    return prev;
            }
        });

        if (currentStep === 2) {
            setSelectedBank(null);
            setPackagingHeatmapPending({});
        }

        if (!isEditMode && currentStep === 1) {
            clearDraft();
        }

        toast.success(`${stepName} reset`, {
            description: 'This page’s fields were restored to defaults. Other steps were left unchanged.',
        });
    };

    return (
        <div className="relative">
            <div className="relative z-10 space-y-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 text-left">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-600">
                            Survey <span className="text-primary-soft">{isEditMode ? 'Edit' : 'Setup'}</span>
                        </div>
                        <h1 className="text-3xl font-display font-black tracking-tight text-ink transition-colors">
                            {isEditMode ? 'Edit' : 'Configure'} <span className="text-ink-muted font-light">Survey</span>
                        </h1>
                    </div>

                    <div className="hidden lg:flex items-center gap-6 glass-panel p-4 rounded-3xl shadow-premium border-white/5 dark:border-slate-800/50 backdrop-blur-xl bg-white/50 dark:bg-slate-900/50 transition-colors">
                        {steps.map((s, idx) => {
                            const isActive = currentStep === s.id;
                            const isComplete = maxStepReached > s.id;
                            const canNavigate = s.id <= maxStepReached || s.id === currentStep + 1;
                            return (
                                <React.Fragment key={s.id}>
                                    <button
                                        type="button"
                                        onClick={() => goToStep(s.id)}
                                        disabled={!canNavigate && !isActive}
                                        title={canNavigate || isActive ? `Go to ${s.name}` : 'Complete earlier steps first'}
                                        className={`flex items-center gap-3 transition-all duration-500 ${isActive ? 'text-primary-soft scale-105' : isComplete ? 'text-emerald-500' : 'text-slate-600'} ${canNavigate || isActive ? 'cursor-pointer hover:opacity-90' : 'cursor-not-allowed opacity-50'}`}
                                    >
                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center border-2 transition-all duration-500 ${isActive ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20' : isComplete ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-400 dark:border-slate-600 bg-white/50 dark:bg-slate-900/50'}`}>
                                            <s.icon size={14} strokeWidth={isActive ? 3 : 2} />
                                        </div>
                                        <div className="flex flex-col text-left">
                                            <span className="text-[9px] font-black uppercase tracking-[0.2em]">{s.name}</span>
                                            {isActive && <span className="text-[7px] font-bold text-primary-soft/60 dark:text-primary-soft/80 uppercase tracking-widest animate-pulse">Active</span>}
                                        </div>
                                    </button>
                                    {idx < steps.length - 1 && (
                                        <div className={`w-8 h-[1px] ${isComplete ? 'bg-emerald-500/30' : 'bg-slate-400 dark:bg-slate-600'}`} />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>

                <SuccessModal successData={successData} />
                <CloneSurveyModal
                    isOpen={showCloneModal}
                    onClose={() => setShowCloneModal(false)}
                    onSelect={handleCloneSurvey}
                />

                <div className="w-full">
                    <div className="w-full">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentStep}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                {currentStep === 1 && (
                                    <IdentityStep
                                        formData={formData}
                                        setFormData={setFormData}
                                        onOpenClone={() => setShowCloneModal(true)}
                                        // Without this the uniqueness check matches the survey
                                        // against itself, so editing anything else on the page
                                        // reported the project's own code as already taken.
                                        draftSurveyId={editSurveyId}
                                    />
                                )}
                                {currentStep === 2 && (
                                    <ParametersStep
                                        formData={formData}
                                        setFormData={setFormData}
                                        attributeBanksData={attributeBanksData}
                                        selectedBank={selectedBank}
                                        setSelectedBank={setSelectedBank}
                                        bankDetails={bankDetails}
                                        packagingHeatmapPending={packagingHeatmapPending}
                                        onPackagingHeatmapPendingChange={setPackagingHeatmapPending}
                                    />
                                )}
                                {currentStep === 3 && (
                                    <ArchitectStep
                                        formData={formData}
                                        setFormData={setFormData}
                                        loading={loading}
                                        handleGenerateSchema={() => handleGenerateSchema()}
                                    />
                                )}
                                {currentStep === 4 && <DeploymentStep formData={formData} setFormData={setFormData} />}

                                <div className="space-y-2.5 pt-5 border-t border-slate-200 dark:border-slate-700 transition-colors">
                                    {currentStep < 4 ? (
                                        <button
                                            type="button"
                                            onClick={nextStep}
                                            className="group w-full py-4 bg-surface border border-slate-400 dark:border-slate-600 rounded-2xl font-black text-xs uppercase tracking-[0.2em] text-ink flex items-center justify-between px-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all shadow-sm focus:outline-none focus:ring-4 focus:ring-primary/20"
                                        >
                                            Continue to {steps[currentStep].name}
                                            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform text-primary-soft" />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleSubmit}
                                            disabled={loading}
                                            className="group w-full py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-2xl font-black text-xs uppercase tracking-[0.2em] text-white flex items-center justify-center gap-3 hover:shadow-lg hover:shadow-emerald-500/20 hover:scale-[1.01] transition-all disabled:opacity-50"
                                        >
                                            {loading ? <Sparkles className="w-5 h-5 animate-spin" /> : (
                                                <>
                                                    {isEditMode ? 'Save Changes' : 'Deploy Survey'}
                                                    <Check className="w-5 h-5 animate-in zoom-in" />
                                                </>
                                            )}
                                        </button>
                                    )}
                                    <div className={`grid gap-2 ${currentStep > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                                        <button
                                            type="button"
                                            onClick={resetCurrentStep}
                                            className="w-full py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 border border-transparent hover:border-rose-500/30 hover:bg-rose-500/5 rounded-2xl transition-all flex items-center justify-center gap-2"
                                        >
                                            <RotateCcw className="w-3.5 h-3.5" />
                                            Reset {steps[currentStep - 1].name}
                                        </button>
                                        {currentStep > 1 && (
                                            <button
                                                type="button"
                                                onClick={prevStep}
                                                className="w-full py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-900 dark:hover:text-slate-300 transition-colors flex items-center justify-center gap-2"
                                            >
                                                <ArrowLeft className="w-4 h-4" />
                                                Return to {steps[currentStep - 2].name}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <AnimatePresence>
                                    {formData.survey_name && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="mt-6 p-5 glass-panel rounded-[2rem] border-slate-200 dark:border-slate-700 bg-white/30 dark:bg-slate-950/20 shadow-inner"
                                        >
                                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-muted mb-3 transition-colors text-left">Project Definition</p>
                                            <p className="text-xs font-black text-ink truncate bg-white/50 dark:bg-slate-900 px-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 shadow-sm transition-colors text-left">{formData.survey_name}</p>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
}
