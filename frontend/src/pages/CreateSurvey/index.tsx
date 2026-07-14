import React, { useState, useEffect } from 'react';
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
    Sparkles
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



export default function CreateSurvey() {

    const [currentStep, setCurrentStep] = useState(1);
    const [successData, setSuccessData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [showCloneModal, setShowCloneModal] = useState(false);
    const [packagingHeatmapPending, setPackagingHeatmapPending] = useState<PackagingHeatmapPendingFiles>({});

    const { draft, saveDraft, clearDraft } = useCreateSurveyPersistence();
    const [hasRestored, setHasRestored] = useState(false);

    const [formData, setFormData] = useState<SurveyFormData>({
        survey_name: '',
        survey_code: '',
        survey_type: '',
        links_count: 1000,
        sample_capacity: 200,
        gate_quotas: {},
        config: null,
        internal_brands_data: [],
        competitor_brands_data: [],
        template_snapshot_schema: null,
        template_snapshot_questions: [],
        template_snapshot_l2: null,
        schema: {
            layer1_structure: { sections: [] },
            layer2_structure: { sections: [] }
        },
        layer1_screening_config: INITIAL_SCREENING_CONFIG,
        google_form_url: '',
        google_form_id: '',
        industry: '',
        sample_intelligence: true,
        sec_classes: [],
        purchase_funnel_id: undefined,
        purchase_funnel: {
            is_enabled: false,
            category_name: '',
            brand_list: []
        },
        brand_usage: { is_enabled: false },
        brand_pricing_behavior: { is_enabled: false },
        voice_capture: { ...DEFAULT_VOICE_CAPTURE },
        ai_followup: { ...DEFAULT_AI_FOLLOWUP },
        blueprint: {
            category: '',
            ratingScale: 10,
            own_brand: null,
            brands: [],
            attributes: {},
            custom_research_attributes: []
        }
    } as SurveyFormData);

    // Progressive Save Effect
    useEffect(() => {
        if (formData.survey_name || formData.survey_type) {
            saveDraft(formData, currentStep);
        }
    }, [formData, currentStep, saveDraft]);

    // Draft Rehydration Effect
    useEffect(() => {
        if (draft && !hasRestored) {
            setFormData(draft.formData);
            setCurrentStep(draft.currentStep);
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
    }, [draft, hasRestored, clearDraft]);

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
                    'Secondary (Thanaweyya) / ثانوي (ثانوية عامة)',
                    'Primary / Preparatory / ابتدائي / إعدادي',
                    'Reads & writes / Illiterate / يقرأ ويكتب / أمي'
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
                type: 'number',
                required: true,
                questionMeta: { nature: 'fixed', inputType: 'numeric' }
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
                survey_objective: survey.survey_objective || '',
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
            if (needsSurveyObjective && !formData.survey_objective) {
                toast.error('Select a survey objective before proceeding');
                scrollToError('survey-objective-section');
                return;
            }
            if (needsSurveyObjective && formData.survey_objective === 'other' && !formData.survey_objective_other?.trim()) {
                toast.error('Please specify your survey objective');
                scrollToError('survey-objective-section');
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

        setCurrentStep(prev => Math.min(prev + 1, 5));
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const prevStep = () => {
        setCurrentStep(prev => Math.max(prev - 1, 1));
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
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
                // We no longer send pre-composed structures. 
                // The backend OrchestrationService will rebuild them from parameters.
                layer1_structure: { sections: [] },
                layer2_structure: { sections: [] },
                layer1_questions: []
            };

            const tRes = await templates.create(templateData);

            const blueprintSnapshots = buildBlueprintSubmitSnapshots(formData);

            // 2. Prepare Survey Parameters
            const surveyData = {
                company_name: formData.survey_name,
                survey_code: formData.survey_code,
                template_id: tRes._id,
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
                respondent_count: 0,
                gate_counts: {},
                voice_capture: formData.voice_capture || DEFAULT_VOICE_CAPTURE,
                ai_followup: formData.ai_followup ?? DEFAULT_AI_FOLLOWUP,
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

    return (
        <div className="relative">
            <div className="relative z-10 space-y-10">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 text-left">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-600">
                            Survey <span className="text-brand-blue">Setup</span>
                        </div>
                        <h1 className="text-3xl font-display font-black tracking-tight text-slate-900 dark:text-white transition-colors">
                            Configure <span className="text-slate-500 dark:text-slate-400 font-light">Survey</span>
                        </h1>
                    </div>

                    <div className="hidden lg:flex items-center gap-6 glass-panel p-4 rounded-3xl shadow-premium border-white/5 dark:border-slate-800/50 backdrop-blur-xl bg-white/50 dark:bg-slate-900/50 transition-colors">
                        {steps.map((s, idx) => (
                            <React.Fragment key={s.id}>
                                <div
                                    className={`flex items-center gap-3 transition-all duration-500 ${currentStep === s.id ? 'text-brand-blue scale-105' : currentStep > s.id ? 'text-emerald-500' : 'text-slate-600'}`}
                                >
                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center border-2 transition-all duration-500 ${currentStep === s.id ? 'border-brand-blue bg-brand-blue/10 shadow-lg shadow-brand-blue/20' : currentStep > s.id ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-400 dark:border-slate-600 bg-white/50 dark:bg-slate-900/50'}`}>
                                        <s.icon size={14} strokeWidth={currentStep === s.id ? 3 : 2} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black uppercase tracking-[0.2em]">{s.name}</span>
                                        {currentStep === s.id && <span className="text-[7px] font-bold text-brand-blue/60 dark:text-brand-blue/80 uppercase tracking-widest animate-pulse">Active</span>}
                                    </div>
                                </div>
                                {idx < steps.length - 1 && (
                                    <div className={`w-8 h-[1px] ${currentStep > s.id ? 'bg-emerald-500/30' : 'bg-slate-400 dark:bg-slate-600'}`} />
                                )}
                            </React.Fragment>
                        ))}
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
                                className="space-y-12"
                            >
                                {currentStep === 1 && (
                                    <IdentityStep
                                        formData={formData}
                                        setFormData={setFormData}
                                        onOpenClone={() => setShowCloneModal(true)}
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

                                <div className="space-y-4 pt-10 border-t border-slate-200 dark:border-slate-700 transition-colors">
                                    {currentStep < 4 ? (
                                        <button
                                            type="button"
                                            onClick={nextStep}
                                            className="group w-full py-5 bg-white dark:bg-slate-900 border-2 border-slate-400 dark:border-slate-600 rounded-3xl font-black text-xs uppercase tracking-[0.2em] text-slate-900 dark:text-white flex items-center justify-between px-8 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all shadow-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/20"
                                        >
                                            Continue to {steps[currentStep].name}
                                            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform text-brand-blue" />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleSubmit}
                                            disabled={loading}
                                            className="group w-full py-6 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] text-white flex items-center justify-center gap-4 hover:shadow-lg hover:shadow-emerald-500/20 hover:scale-[1.01] transition-all disabled:opacity-50"
                                        >
                                            {loading ? <Sparkles className="w-6 h-6 animate-spin" /> : (
                                                <>
                                                    Deploy Survey
                                                    <Check className="w-6 h-6 animate-in zoom-in" />
                                                </>
                                            )}
                                        </button>
                                    )}
                                    {currentStep > 1 && (
                                        <button
                                            type="button"
                                            onClick={prevStep}
                                            className="w-full py-4 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-900 dark:hover:text-slate-300 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <ArrowLeft className="w-4 h-4" />
                                            Return to Phase {steps[currentStep - 2].name}
                                        </button>
                                    )}
                                </div>

                                <AnimatePresence>
                                    {formData.survey_name && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="mt-10 p-6 glass-panel rounded-[2rem] border-slate-200 dark:border-slate-700 bg-white/30 dark:bg-slate-950/20 shadow-inner"
                                        >
                                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600 dark:text-slate-400 mb-3 transition-colors text-left">Project Definition</p>
                                            <p className="text-xs font-black text-slate-900 dark:text-white truncate bg-white/50 dark:bg-slate-900 px-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 shadow-sm transition-colors text-left">{formData.survey_name}</p>
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
