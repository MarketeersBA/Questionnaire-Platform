import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { publicApi } from '../services/api';
import {
  findPendingFollowUpQuestionId,
} from '../utils/aiFollowup';
import { useFollowUpOrchestration } from '../hooks/useFollowUpOrchestration';
import TasteTestOpenEndQuestion from '../components/taste-test-respondent/TasteTestOpenEndQuestion';
import TasteTestRespondentNavBar from '../components/taste-test-respondent/TasteTestRespondentNavBar';
import ScaleAnchorLabels from '../components/respondent/ScaleAnchorLabels';
import HorizontalScaleSlider from '../components/respondent/HorizontalScaleSlider';
import {
  ShieldCheck,
  ChevronRight,
  Phone,
  Sparkles,
  ShieldAlert,
  ChevronDown,
  Quote,
  Layout,
  Loader2,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import ConfigurableModuleStep from '../components/survey/ConfigurableModuleStep';
import ProductTestRespondentStep from '../components/product-test-respondent/ProductTestRespondentStep';
import type { ConfigurableModuleId, SurveyStep } from '../types/surveyFlow';
import type { ProductTestWizardMode } from '../types/respondentNavigation';
import type { ModuleAnswersMap } from '../types/moduleQuestions';
import type { QuestionModule } from '../types/questionModules';
import {
  buildStructuredModuleSubmission,
  canReturnToPreviousPublicPhase,
  getNextPhaseStep,
  getPreviousPhaseStep,
  getModulePlaceholderCategory,
  normalizePersistedStep,
  resolveEnabledModuleDocuments,
} from '../utils/surveyFlowOrchestration';
import {
  getProductTestSnapshot,
  buildProductTestWizardJourney,
} from '../utils/productTestFlowOrchestration';
import {
  buildPhase5ProductTestBlock,
  enrichQuestionMapFromProductTestSnapshot,
} from '../utils/productTestStructuredSubmission';
import { buildProductTestRespondentDisplayContext } from '../utils/productTestRespondentDisplay';
import {
  isVoiceEnabledForQuestion,
  isOpenEndAnswerComplete,
  flattenOpenEndValue,
} from '../utils/voiceQuestions';
import { useSurveyPersistence } from '../hooks/useSurveyPersistence';
import { buildL2AnswerKey, buildStructuredAiInsightsBlock } from '../utils/followUpAnswerPersistence';
import {
  advanceTasteTestNavigation,
  applyTasteTestNavigationAdvance,
  extractTasteTestBrandPages,
  filterTasteTestVisibleSections,
  hasTasteTestOverallStep,
  isTasteTestSectionVisible,
  resolveTasteTestContinueLabel,
  resolveTasteTestNavigationPosition,
  resolveTasteTestRespondentNavigation,
} from '../utils/tasteTestRespondentNavigation';
import { collectTasteTestFollowUpScopeIds } from '../utils/followUpNavigationSafety';
import { normalizePublicSurveyAiFollowup } from '../utils/aiFollowupConfig';

const BRAND_QUOTES = [
  "Quality is not an act, it's a habit.",
  "Details create the big picture.",
  "Innovation distinguishes between a leader and a follower.",
  "Excellence is the gradual result of always striving to do better.",
  "Trust starts with consistency.",
  "Design is not just what it looks like — it's how it works."
];

export default function PublicSurvey() {
  const { token } = useParams<{ token: string }>();
  const [survey, setSurvey] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [step, setStep] = useState<SurveyStep>('loading');
  const [currentModuleId, setCurrentModuleId] = useState<ConfigurableModuleId | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [l2Answers, setL2Answers] = useState<Record<string, any>>({});
  const [moduleAnswers, setModuleAnswers] = useState<Record<string, ModuleAnswersMap>>({});
  const [moduleStepIndexes, setModuleStepIndexes] = useState<Record<string, number>>({});
  const [moduleDocs, setModuleDocs] = useState<Partial<Record<ConfigurableModuleId, QuestionModule>>>({});
  const [completedModules, setCompletedModules] = useState<Set<string>>(new Set());
  const [customBrands, setCustomBrands] = useState<string[]>([]);
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+20');
  const [showCountrySelector, setShowCountrySelector] = useState(false);
  const [areaSuggestions, setAreaSuggestions] = useState<string[]>([]);
  const [pulseErrorId, setPulseErrorId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const stepRef = React.useRef<SurveyStep>(step);
  const productTestSnapshot = survey ? getProductTestSnapshot(survey) : null;
  const productTestDisplay = useMemo(
    () => buildProductTestRespondentDisplayContext(
      survey
        ? { ...survey, product_test_snapshot: productTestSnapshot }
        : null,
    ),
    [survey, productTestSnapshot],
  );

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const { savedSession, saveSession, clearSession, isHydrating } = useSurveyPersistence(token);
  const [aiInsights, setAiInsights] = useState<Record<string, string[]>>({});
  const {
    followUpStateMap,
    followUpStateMapRef,
    handleFollowUpTrigger,
    handleVoiceFollowUpTrigger,
    handleFollowUpReplyChange,
    handleFollowUpDismiss,
    suspendFollowUpsForLeavingScope,
  } = useFollowUpOrchestration({ token, survey, setAiInsights });

  // Product test wizard state (Phase 3)
  const [productTestAnswers, setProductTestAnswers] = useState<Record<string, unknown>>({});
  const [productTestPhaseIndex, setProductTestPhaseIndex] = useState(0);
  const [productTestSectionIndex, setProductTestSectionIndex] = useState(0);
  const [productTestWizardMode, setProductTestWizardMode] = useState<ProductTestWizardMode>('intro');

  // Phase 2: Paged state
  const [currentBrandIndex, setCurrentBrandIndex] = useState(0);

  const tasteTestNavigationCursor = useMemo(
    () => ({ brandIndex: currentBrandIndex }),
    [currentBrandIndex],
  );
  const tasteTestAllowCrossPhaseBack = useMemo(
    () => step === 'layer2' && canReturnToPreviousPublicPhase(survey, step, currentModuleId),
    [survey, step, currentModuleId],
  );
  const tasteTestRespondentNavigation = useMemo(
    () => (
      survey
        ? resolveTasteTestRespondentNavigation(tasteTestNavigationCursor, survey, {
          allowCrossPhaseBack: tasteTestAllowCrossPhaseBack,
        })
        : null
    ),
    [survey, tasteTestNavigationCursor, tasteTestAllowCrossPhaseBack],
  );
  const tasteTestNavigationPosition = tasteTestRespondentNavigation?.position ?? null;
  const tasteTestCanGoBack = tasteTestRespondentNavigation?.bounds.canGoBack ?? false;

  const computedModuleLanguage = useMemo(() => {
    if (survey?.language === 'ar') return 'ar';
    const isArabicContext = /[\u0600-\u06FF]/.test(
      survey?.purchase_funnel?.category_name || 
      survey?.customizations?.brand_name || 
      survey?.brand_usage?.target_brand || 
      survey?.brand_pricing_behavior?.target_brand ||
      ''
    );
    return isArabicContext ? 'ar' : 'en';
  }, [survey]);

  const markModuleComplete = (moduleId: string) => {
    setCompletedModules(prev => new Set([...prev, moduleId]));
  };

  const applyNextPhase = async (
    finishedModuleId: string,
    allModuleAnswers: Record<string, ModuleAnswersMap>
  ) => {
    const updatedCompleted = new Set([...completedModules, finishedModuleId]);
    markModuleComplete(finishedModuleId);
    const next = getNextPhaseStep(survey, finishedModuleId, updatedCompleted);

    if (next.type === 'submitAll') {
      await submitAll(l2Answers, allModuleAnswers);
      return;
    }
    if (next.type === 'layer2') {
      setCurrentBrandIndex(0);
      setStep('layer2');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (next.type === 'product_test') {
      setProductTestPhaseIndex(0);
      setProductTestSectionIndex(0);
      setProductTestWizardMode('intro');
      setStep('product_test');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setCurrentModuleId(next.moduleId);
    setStep('module');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const applyPreviousPhase = (): boolean => {
    const previous = getPreviousPhaseStep(survey, step, currentModuleId);
    if (previous.type === 'boundary') return false;

    const moduleToRestore = previous.type === 'layer2'
      ? 'taste_test'
      : previous.type === 'product_test'
        ? 'product_test'
        : previous.type === 'module'
          ? previous.moduleId
          : null;

    if (moduleToRestore) {
      setCompletedModules((prev) => {
        const next = new Set(prev);
        next.delete(moduleToRestore);
        return next;
      });
    }

    if (previous.type === 'layer1') {
      setStep('layer1');
    } else if (previous.type === 'layer2') {
      const brands = extractTasteTestBrandPages(survey);
      const hasOverall = hasTasteTestOverallStep(survey);
      setCurrentBrandIndex(hasOverall ? brands.length : Math.max(0, brands.length - 1));
      setStep('layer2');
    } else if (previous.type === 'product_test' && productTestSnapshot) {
      const journey = buildProductTestWizardJourney(productTestSnapshot);
      const lastStep = journey[journey.length - 1];
      if (lastStep) {
        setProductTestPhaseIndex(lastStep.phaseIndex);
        setProductTestSectionIndex(lastStep.sectionIndex);
        setProductTestWizardMode('section');
      }
      setStep('product_test');
    } else if (previous.type === 'module') {
      setCurrentModuleId(previous.moduleId);
      setStep('module');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
  };

  const handleProductTestBoundaryBack = (): boolean => applyPreviousPhase();

  const updateModuleAnswers = (moduleId: ConfigurableModuleId, next: ModuleAnswersMap) => {
    setModuleAnswers((prev) => ({ ...prev, [moduleId]: next }));
  };

  const updateModuleStepIndex = (moduleId: ConfigurableModuleId, index: number) => {
    setModuleStepIndexes((prev) => ({ ...prev, [moduleId]: index }));
  };

  const getEffectiveBrandName = (brandName: string) => {
    if (!brandName) return '';
    return productTestDisplay.resolveBrandDisplay(brandName);
  };

  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const getKnownTasteBrandKeys = () => {
    const config = survey?.taste_test_config || survey?.config || {};
    const internalNames = config.internal_brands_data?.map((b: any) => b.name).filter(Boolean) || [];
    const competitorNames =
      config.competitor_brands_data?.map((b: any) => b.name).filter(Boolean)
      || config.competitive_brands
      || [];
    return Array.from(new Set([
      ...productTestDisplay.brands,
      ...internalNames,
      ...competitorNames,
      ...(config.own_brand ? [config.own_brand] : []),
      ...(survey?.customizations?.brands || []),
      ...customBrands,
    ].filter(Boolean)));
  };


  const scrollToNextQuestion = (currentId: string, questions: any[]) => {
    const currentIndex = questions.findIndex(q => (q.id || '').toString() === currentId);
    if (currentIndex !== -1 && currentIndex < questions.length - 1) {
      const nextQ = questions[currentIndex + 1];
      const nextId = nextQ.id || (currentIndex + 1).toString();
      setTimeout(() => {
        const element = document.getElementById(`q-${nextId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 500); // 500ms delay for better feedback
    }
  };

  const scrollToError = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setPulseErrorId(id);
      setTimeout(() => setPulseErrorId(null), 5000);
    }
  };

  const countries = [
    { code: '+20', flag: '🇪🇬', name: 'Egypt' },
    { code: '+971', flag: '🇦🇪', name: 'UAE' },
    { code: '+966', flag: '🇸🇦', name: 'KSA' },
    { code: '+974', flag: '🇶🇦', name: 'Qatar' },
    { code: '+965', flag: '🇰🇼', name: 'Kuwait' },
    { code: '+973', flag: '🇧🇭', name: 'Bahrain' },
    { code: '+968', flag: '🇴🇲', name: 'Oman' },
    { code: '+962', flag: '🇯🇴', name: 'Jordan' },
    { code: '+1', flag: '🇺🇸', name: 'USA' },
    { code: '+44', flag: '🇬🇧', name: 'UK' },
  ];

  const commonCities = [
    'Cairo, Egypt', 'Giza, Egypt', 'Alexandria, Egypt',
    'Dubai, UAE', 'Abu Dhabi, UAE', 'Sharjah, UAE',
    'Riyadh, KSA', 'Jeddah, KSA', 'Dammam, KSA',
    'Doha, Qatar', 'Kuwait City, Kuwait', 'Manama, Bahrain', 'Muscat, Oman', 'Amman, Jordan',
    'New York, USA', 'London, UK', 'Paris, France', 'Berlin, Germany', 'Tokyo, Japan'
  ];

  useEffect(() => {
    if (!token || isHydrating || stepRef.current === 'submitted' || stepRef.current === 'failed') return;

    publicApi.getSurvey(token)
      .then(async (data) => {
        setSurvey({
          ...data,
          ai_followup: normalizePublicSurveyAiFollowup(data.ai_followup),
        });
        const docs = await resolveEnabledModuleDocuments(data);
        setModuleDocs(docs);

        // Advanced Hybrid Rehydration
        if (savedSession) {
          setAnswers(savedSession.answers || {});
          setL2Answers(savedSession.l2Answers || {});
          setModuleAnswers(savedSession.moduleAnswers || {});
          setModuleStepIndexes(savedSession.moduleStepIndexes || {});
          setCurrentBrandIndex(savedSession.currentBrandIndex || 0);
          setCompletedModules(new Set(savedSession.completedModules || []));
          setPhone(savedSession.phone || '');
          setCountryCode(savedSession.countryCode || '+20');
          setCustomBrands(savedSession.customBrands || []);
          setAiInsights(savedSession.aiInsights || {});
          setProductTestAnswers(savedSession.productTestAnswers || {});
          setProductTestPhaseIndex(savedSession.productTestPhaseIndex ?? 0);
          setProductTestSectionIndex(savedSession.productTestSectionIndex ?? 0);
          setProductTestWizardMode(savedSession.productTestWizardMode ?? 'intro');
          if (savedSession.startTime) setStartTime(savedSession.startTime);

          const normalized = normalizePersistedStep(savedSession.step, savedSession.currentModuleId);
          setCurrentModuleId(normalized.currentModuleId);
          setStep(normalized.step as SurveyStep);
        } else {
          setStep('layer1');
        }

        setLoading(false);
      })
      .catch((err) => {
        console.error("Survey Fetch Error:", err);
        const detail = err.response?.data?.detail;
        const status = err.response?.status;

        if (status === 403 && (detail?.includes('completed') || detail?.includes('submitted'))) {
          setStep('submitted');
        } else if (status === 403 && detail?.includes('failed')) {
          setStep('failed');
          setError(detail);
        } else {
          setError(`Error: ${detail || err.message || 'Unknown error'}`);
          setStep('failed');
        }
        setLoading(false);
      });
  }, [token, isHydrating, !!savedSession]);

  // Phase 3: High-Advanced Persistence Sync Hook
  useEffect(() => {
    if (!token || step === 'loading' || step === 'submitted') return;

    saveSession({
      answers,
      l2Answers,
      moduleAnswers,
      moduleStepIndexes,
      currentModuleId,
      completedModules: Array.from(completedModules),
      currentBrandIndex,
      step,
      phone,
      countryCode,
      customBrands,
      aiInsights,
      productTestAnswers,
      productTestPhaseIndex,
      productTestSectionIndex,
      productTestWizardMode,
      startTime
    });
  }, [
    answers, l2Answers, moduleAnswers, moduleStepIndexes,
    currentModuleId, completedModules, currentBrandIndex,
    step, phone, countryCode, customBrands, aiInsights,
    productTestAnswers, productTestPhaseIndex, productTestSectionIndex, productTestWizardMode,
    startTime, token, saveSession
  ]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);


  const renderCleanText = (text: string, brandName: string = '') => {
    if (!text) return '';
    const category = productTestDisplay.category || survey?.config?.category || survey?.customizations?.category || 'Product';
    const effectiveBrand = getEffectiveBrandName(brandName);

    let result = text
      .replace(/\[\s*brand\s*\]/gi, effectiveBrand)
      .replace(/\*\s*brand\s*\*/gi, effectiveBrand)
      .replace(/\[\s*category\s*\]/gi, category)
      .replace(/\*\s*category\s*\*/gi, category)
      .replace(/\{brand\}/gi, effectiveBrand)
      .replace(/\{category\}/gi, category)
      .replace(/\[Brand\]/gi, effectiveBrand)
      .replace(/\[Category\]/gi, category);

    const literalBrandKeys = [brandName, ...getKnownTasteBrandKeys()]
      .map((brand) => brand?.trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    literalBrandKeys.forEach((brand) => {
      const displayName = getEffectiveBrandName(brand);
      if (!displayName || displayName === brand) return;
      result = result.replace(new RegExp(escapeRegExp(brand), 'gi'), displayName);
    });

    return result;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!token) return;

      // Phase 6: Smart Validation Scanner
      if (!phone || phone.length < 5) {
        toast.error(survey?.language === 'ar' ? 'يرجى إدخال رقم هاتف صالح' : 'Please enter a valid phone number');
        scrollToError('phone-input');
        return;
      }

      // Check all required questions from the survey payload
      const questions = survey?.questions || [];
      for (const q of questions) {
        const qId = q.id || '';
        if (q.required && !answers[qId]) {
          toast.error(survey?.language === 'ar' ? `يرجى الإجابة على: ${renderCleanText(q.label || q.text)}` : `Please answer: ${renderCleanText(q.label || q.text)}`);
          scrollToError(`q-${qId}`);
          return;
        }
      }

      setLoading(true);

      // Attempt to map dynamic age/gender for backend validation if they exist
      const submitData: Record<string, any> = { ...answers };

      (survey?.questions || []).forEach((q: any, idx: number) => {
        const label = q.label?.toLowerCase() || '';
        const qId = q.id || idx.toString();
        const val = answers[qId];

        if (!val) return;

        if (label.includes('age') || label.includes('سن') || label.includes('years old')) {
          submitData['age'] = val;
        }
        if (label.includes('gender') || label.includes('sex') || label.includes('جنس')) {
          submitData['gender'] = val;
        }
      });

      const fullPhone = `${countryCode} ${phone}`;
      const result = await publicApi.submitLayer1(token, submitData, fullPhone);

      if (result.passed) {
        setStep('passed');
        // The sync effect will take care of persisting 'passed' step

        setTimeout(async () => {
          await applyNextPhase('screening', moduleAnswers);
          setLoading(false);
        }, 2000);
      } else {
        setStep('failed');
        setError(result.message || 'Verification complete. You do not qualify for this study.');
      }
    } catch (err: any) {
      console.error("[Runtime] Submission error details:", err);
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : (err?.response?.data?.message || 'Identity verification failed. Please check your credentials.');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const submitAll = async (
    currentL2Answers: Record<string, unknown>,
    allModuleAnswers: Record<string, ModuleAnswersMap>
  ) => {
    try {
      setLoading(true);
      if (!token) return;

      const structuredAnswers: any = {
        _evaluations: { internal: {}, competitors: {} },
        _metadata: {
          session: {
            duration_seconds: Math.floor((Date.now() - startTime) / 1000),
            platform: window.navigator.platform,
            language: survey?.language || 'en',
            started_at: new Date(startTime).toISOString(),
          }
        },
        question_map: {},
        flat_evaluations: []
      };

      // 1. Build Question Map for easier analysis
      const sections = survey?.layer2_questions?.sections || [];
      sections.forEach((section: any) => {
        section.questions?.forEach((q: any) => {
          if (!structuredAnswers.question_map[q.id]) {
            structuredAnswers.question_map[q.id] = {
              text: q.text || q.label,
              type: q.type,
              attribute: section.attribute || 'General',
              timing: q.timing,
              metric_label: q.text?.includes(':') ? q.text.split(':')[1]?.split('(')[0]?.trim() : q.label
            };
          }
        });
      });

      const internalNames = new Set(
        survey?.internal_brands_data?.map((b: any) => b.name) ||
        (survey?.own_brand ? [survey.own_brand] : [])
      );

      // 2. Process L2 Answers into Structured and Flat formats
      Object.entries(currentL2Answers).forEach(([key, val]) => {
        if (key.includes('_')) {
          const underscoreIndex = key.indexOf('_');
          const brand = key.substring(0, underscoreIndex);
          const qId = key.substring(underscoreIndex + 1);

          const group = internalNames.has(brand) ? 'internal' : 'competitors';

          if (!structuredAnswers._evaluations[group][brand]) {
            structuredAnswers._evaluations[group][brand] = {};
          }

          // Avoid storing the brand name as a key inside itself (fix for user reported bug)
          if (qId !== brand) {
            structuredAnswers._evaluations[group][brand][qId] = val;
          }

          // Add to flat evaluations for easy export
          const qMeta = structuredAnswers.question_map[qId];
          const exportValue = typeof val === 'object' && val !== null && ('text' in val || 'voice_feedback_id' in val)
            ? flattenOpenEndValue(val)
            : val;
          structuredAnswers.flat_evaluations.push({
            brand,
            group,
            attribute: qMeta?.attribute || 'General',
            metric: qMeta?.metric_label || qMeta?.text || qId,
            value: exportValue,
            raw_value: val,
            question_id: qId
          });
        } else {
          structuredAnswers._metadata[key] = val;
        }
      });

      const { topLevel, structured: moduleStructured } = buildStructuredModuleSubmission(allModuleAnswers);

      const ptSnapshot = getProductTestSnapshot(survey);
      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);

      if (ptSnapshot) {
        enrichQuestionMapFromProductTestSnapshot(structuredAnswers.question_map, ptSnapshot);
      }

      const productTestStructured = ptSnapshot
        ? buildPhase5ProductTestBlock({
          snapshot: ptSnapshot,
          answers: productTestAnswers,
          options: {
            durationSeconds,
            submittedAt: new Date().toISOString(),
            resolveBrandDisplay: productTestDisplay.resolveBrandDisplay,
          },
        })
        : null;

      const finalSubmission = {
        ...structuredAnswers._metadata,
        ...topLevel,
        __structured: {
          ...structuredAnswers,
          ...moduleStructured,
          ...(productTestStructured ? { product_test: productTestStructured } : {}),
          ai_insights: buildStructuredAiInsightsBlock(aiInsights),
          submitted_at: new Date().toISOString()
        }
      };

      await publicApi.submitLayer2(token, finalSubmission);

      // Phase 6: Session Cleanup using Hook
      clearSession();
      setStep('submitted');
      toast.success(survey?.language === 'ar' ? 'تم تقديم الاستبيان بنجاح!' : 'Survey submitted successfully!');
    } catch (err) {
      console.error(err);
      toast.error(survey?.language === 'ar' ? 'فشل تقديم الاستبيان. يرجى المحاولة مرة أخرى.' : 'Failed to submit survey. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleL2Submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const navigationPosition = resolveTasteTestNavigationPosition(
      tasteTestNavigationCursor,
      survey,
    );
    const { isOverallStep, currentBrand } = navigationPosition;
    const sections = survey.layer2_questions?.sections || [];

    // Context-aware validation: only validate questions visible on current page
    const validatedOverallQuestions = new Set<string>();
    const visibleQuestionKeys: string[] = [];
    for (const section of sections) {
      if (!section.questions) continue;
      if (!isTasteTestSectionVisible(section, navigationPosition, survey)) continue;

      for (const q of section.questions) {
        if (isOverallStep) {
          const text = (q.text || q.label || '').toLowerCase().trim();
          if (validatedOverallQuestions.has(text)) continue;
          validatedOverallQuestions.add(text);
        }

        const answerKey = currentBrand ? `${currentBrand}_${q.id}` : q.id;
        visibleQuestionKeys.push(answerKey);
        const qIsAutoOpenEnd = q.type === 'mcq' && q.options?.length === 1 && q.options[0].toLowerCase() === 'open-end';
        const qEffectiveType = qIsAutoOpenEnd ? 'open-ended' : q.type;
        const qIsOpenEnd = qEffectiveType === 'open-ended' || qEffectiveType === 'text';
        const qComplete = qIsOpenEnd
          ? isOpenEndAnswerComplete(l2Answers[answerKey])
          : Boolean(l2Answers[answerKey]);
        if (q.required && !qComplete) {
          const promptText = renderCleanText(q.text || q.label || '', currentBrand || '').split('?')[0];
          toast.error(survey?.language === 'ar' ? `يرجى الإجابة على: ${promptText}?` : `Please answer: ${promptText}?`);
          scrollToError(`q-${answerKey}`);
          return;
        }
      }
    }

    const pendingFollowUpQuestionId = findPendingFollowUpQuestionId(followUpStateMap, visibleQuestionKeys);
    if (pendingFollowUpQuestionId) {
      toast.error(
        survey?.language === 'ar'
          ? 'يرجى إكمال سؤال المتابعة الذكي قبل المتابعة'
          : 'Please complete the AI follow-up before continuing'
      );
      scrollToError(`q-${pendingFollowUpQuestionId}`);
      return;
    }

    const advance = advanceTasteTestNavigation(tasteTestNavigationCursor, survey, 'forward');
    const nextCursor = applyTasteTestNavigationAdvance(advance, survey);
    if (nextCursor) {
      if (tasteTestNavigationPosition) {
        suspendFollowUpsForLeavingScope(
          collectTasteTestFollowUpScopeIds(survey, tasteTestNavigationPosition),
        );
      }
      setCurrentBrandIndex(nextCursor.brandIndex);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    await applyNextPhase('taste_test', moduleAnswers);
  };

  const handleTasteTestBack = () => {
    if (tasteTestNavigationPosition) {
      suspendFollowUpsForLeavingScope(
        collectTasteTestFollowUpScopeIds(survey, tasteTestNavigationPosition),
      );
    }

    const advance = advanceTasteTestNavigation(tasteTestNavigationCursor, survey, 'back');

    if (advance.type === 'boundary') {
      applyPreviousPhase();
      setPulseErrorId(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const nextCursor = applyTasteTestNavigationAdvance(advance, survey);
    if (!nextCursor) return;

    setCurrentBrandIndex(nextCursor.brandIndex);
    setPulseErrorId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (step === 'loading' || (loading && !survey)) return (
    <div className="min-h-screen bg-brand-dark dark:bg-slate-950 flex items-center justify-center p-6 text-slate-800 transition-colors duration-500">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-2 border-t-brand-blue border-slate-200 dark:border-slate-800 animate-spin"></div>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">Synchronizing Session</p>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-[100dvh] bg-brand-dark dark:bg-slate-950 flex flex-col items-center justify-center p-0 md:p-6 text-slate-900 dark:text-white font-sans transition-colors duration-500">
      {/* Soft Background Orbs */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40rem] h-[40rem] bg-brand-blue/5 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50rem] h-[50rem] bg-brand-glow/5 rounded-full blur-[150px]"></div>
      </div>

      <AnimatePresence mode="wait">
        {step === 'failed' ? (
          <motion.div
            key="failed"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="m-auto relative z-10 w-full max-w-lg bg-white dark:bg-slate-900 rounded-[2.5rem] p-12 border border-slate-100 dark:border-slate-800 text-center shadow-2xl transition-colors"
          >
            <div className="w-20 h-20 bg-rose-50 dark:bg-rose-950/20 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-rose-100 dark:border-rose-900/50">
              <ShieldAlert className="w-10 h-10 text-rose-500" />
            </div>
            <h1 className="text-3xl font-display font-black mb-4">Verification <span className="text-rose-500">Restricted</span></h1>
            <p className="text-slate-500 font-medium leading-relaxed mb-8">
              {error || "Our automated system has flagged this session as invalid or non-qualifying for the current study."}
            </p>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
              Audit ID: {token?.slice(0, 8)}
            </div>
          </motion.div>
        ) : step === 'submitted' ? (
          <motion.div
            key="submitted"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="m-auto relative z-10 w-full max-w-lg bg-white dark:bg-slate-900 rounded-[2.5rem] p-12 border border-slate-100 dark:border-slate-800 text-center shadow-2xl transition-colors"
          >
            <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-950/20 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-emerald-100 dark:border-emerald-900/50">
              <ShieldCheck className="w-10 h-10 text-emerald-500" />
            </div>
            <h1 className="text-3xl font-display font-bold mb-4">Participation <span className="text-brand-blue">Complete</span></h1>
            <p className="text-slate-500 font-medium leading-relaxed mb-8">
              Thank you for contributing to this research study. Your responses have been securely synchronized.
            </p>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
              Confirmation ID: {token?.slice(-8).toUpperCase()}
            </div>
          </motion.div>
        ) : step === 'module' && currentModuleId && moduleDocs[currentModuleId] ? (
          <motion.div
            key={`module-${currentModuleId}`}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="m-auto relative z-10 w-full max-w-3xl bg-white dark:bg-slate-900 rounded-none md:rounded-[3rem] p-6 md:p-12 border-0 md:border border-slate-100 dark:border-slate-800 shadow-none md:shadow-2xl transition-colors"
          >
            <ConfigurableModuleStep
              moduleId={currentModuleId}
              module={moduleDocs[currentModuleId]!}
              language={computedModuleLanguage}
              category={getModulePlaceholderCategory(survey, currentModuleId)}
              brandContext={
                ['purchase_funnel', 'brand_analyzer', 'brand_usage', 'brand_pricing_behavior'].includes(currentModuleId)
                  ? {
                    masterBrands: [
                      ...(survey?.internal_brands_data?.map((b: any) => b.name) || []),
                      ...(survey?.competitor_brands_data?.map((b: any) => b.name) || []),
                      ...(survey?.purchase_funnel?.brand_list?.map((b: any) =>
                        survey?.language === 'ar' ? (b.name_ar || b.name) : (b.name_en || b.name)
                      ) || []),
                      ...customBrands,
                    ],
                    customBrands,
                    onAddCustomBrand: (brand) =>
                      setCustomBrands((prev) => Array.from(new Set([...prev, brand]))),
                    onCommitCustomBrand: (brand, nextAnswer, questionId) => {
                      setCustomBrands((prev) => Array.from(new Set([...prev, brand])));
                      updateModuleAnswers(currentModuleId, {
                        ...(moduleAnswers[currentModuleId] || {}),
                        [questionId]: nextAnswer,
                      });
                    },
                  }
                  : undefined
              }
              loading={loading}
              answers={moduleAnswers[currentModuleId] || {}}
              stepIndex={moduleStepIndexes[currentModuleId] || 0}
              onAnswersChange={(next) => updateModuleAnswers(currentModuleId, next)}
              onStepIndexChange={(index) => updateModuleStepIndex(currentModuleId, index)}
              onComplete={async (finalAnswers) => {
                const merged = { ...moduleAnswers, [currentModuleId]: finalAnswers };
                setModuleAnswers(merged);
                await applyNextPhase(currentModuleId, merged);
              }}
              completeLabel={
                survey?.language === 'ar' ? 'متابعة' : 'Continue'
              }
              publicToken={token}
              voiceCapture={survey?.voice_capture}
            />
          </motion.div>
        ) : step === 'product_test' && productTestSnapshot ? (
          <motion.div
            key="product_test"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="m-auto relative z-10 w-full max-w-3xl bg-white dark:bg-slate-900 rounded-none md:rounded-[3rem] p-6 md:p-12 border-0 md:border border-slate-100 dark:border-slate-800 shadow-none md:shadow-2xl transition-colors"
          >
            <ProductTestRespondentStep
              snapshot={productTestSnapshot}
              language={computedModuleLanguage}
              loading={loading}
              answers={productTestAnswers}
              phaseIndex={productTestPhaseIndex}
              sectionIndex={productTestSectionIndex}
              wizardMode={productTestWizardMode}
              onAnswersChange={setProductTestAnswers}
              onPhaseIndexChange={setProductTestPhaseIndex}
              onSectionIndexChange={setProductTestSectionIndex}
              onWizardModeChange={setProductTestWizardMode}
              allowCrossPhaseBack={canReturnToPreviousPublicPhase(survey, step, currentModuleId)}
              onBoundaryBack={handleProductTestBoundaryBack}
              onSuspendFollowUpsForScope={suspendFollowUpsForLeavingScope}
              publicToken={token}
              display={productTestDisplay}
              voiceCapture={survey?.voice_capture}
              aiFollowup={survey?.ai_followup}
              onFollowUpTrigger={handleFollowUpTrigger}
              onVoiceFollowUpTrigger={handleVoiceFollowUpTrigger}
              followUpStateMap={followUpStateMap}
              onFollowUpReplyChange={handleFollowUpReplyChange}
              onFollowUpDismiss={handleFollowUpDismiss}
              onComplete={async (finalAnswers) => {
                setProductTestAnswers(finalAnswers);
                await applyNextPhase('product_test', moduleAnswers);
              }}
            />
          </motion.div>
        ) : step === 'passed' ? (
          <motion.div
            key="passed"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="m-auto relative z-10 w-full max-w-lg bg-white dark:bg-slate-900 rounded-[2.5rem] p-12 border border-slate-100 dark:border-slate-800 text-center shadow-2xl transition-colors"
          >
            <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-950/20 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-emerald-100 dark:border-emerald-900/50 animate-pulse">
              <ShieldCheck className="w-10 h-10 text-emerald-500" />
            </div>
            <h1 className="text-3xl font-display font-bold mb-4">Credentials <span className="text-brand-blue">Verified</span></h1>
            <p className="text-slate-500 font-medium leading-relaxed mb-8">
              Optimization successful. Transitioning to the research instrument...
            </p>
            <div className="flex flex-col items-center gap-2">
              <div className="w-48 h-1 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ x: "-100%" }}
                  animate={{ x: "100%" }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  className="w-full h-full bg-brand-blue shadow-[0_0_10px_rgba(37,94,145,0.2)]"
                />
              </div>
            </div>
          </motion.div>
        ) : step === 'layer2' ? (
          <motion.div
            key="layer2"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="m-auto relative z-10 w-full max-w-3xl bg-white dark:bg-slate-900 rounded-none md:rounded-[3rem] p-6 md:p-12 border-0 md:border border-slate-100 dark:border-slate-800 shadow-none md:shadow-2xl transition-colors"
          >
            <div className="flex items-center gap-3 mb-8">
              <Sparkles className="w-5 h-5 text-brand-blue" />
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                {survey?.language === 'ar' ? 'مرحلة' : 'Evaluation'} <span className="text-brand-blue">{survey?.language === 'ar' ? 'التقييم' : 'Phase'}</span>
              </div>
            </div>
            <h1 className="text-3xl font-display font-bold tracking-tight mb-8">
              {survey?.language === 'ar' ? 'أداة' : 'Study'} <span className="text-slate-400 font-light">{survey?.language === 'ar' ? 'البحث' : 'Instrument'}</span>
            </h1>

            <form onSubmit={handleL2Submit} className="space-y-12 h-full flex flex-col">
              <div className="flex-1 space-y-16 px-0 md:px-4">
                {(() => {
                  if (!tasteTestNavigationPosition) return null;

                  const sections = survey?.layer2_questions?.sections || [];
                  const {
                    brandIndex,
                    totalBrandPages,
                    isOverallStep,
                    currentBrand,
                  } = tasteTestNavigationPosition;
                  const renderedOverallQuestions = new Set<string>();
                  const visibleSections = filterTasteTestVisibleSections(
                    sections,
                    tasteTestNavigationPosition,
                    survey,
                  );

                  return (
                    <div className="space-y-12">
                      {/* Overall Evaluation Header */}
                      {isOverallStep && (
                        <div className="p-8 bg-brand-blue/5 rounded-[2.5rem] border-2 border-dashed border-brand-blue/20 text-center space-y-4">
                          <Layout className="w-12 h-12 text-brand-blue/40 mx-auto" />
                          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Overall Evaluation</h2>
                          <p className="text-sm text-slate-500 font-medium italic">Please provide your final impressions across all products tested.</p>
                        </div>
                      )}

                      {/* Top Brand Progress (only during brand pages) */}
                      {!isOverallStep && totalBrandPages > 0 && (
                        <div className="flex items-center justify-between mb-2">
                          <div className="px-5 py-2 rounded-2xl bg-brand-blue/5 border border-brand-blue/20 text-brand-blue text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                            <Sparkles className="w-3 h-3 text-brand-cyan" />
                            {survey?.language === 'ar' ? 'التقدم:' : 'Study Progress:'} {brandIndex + 1} / {totalBrandPages} {survey?.language === 'ar' ? 'ماركة' : 'Brands'}
                          </div>
                          <div className="flex-1 max-w-[200px] h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden ml-4">
                            <div
                              className="h-full bg-brand-blue transition-all duration-700"
                              style={{ width: `${tasteTestNavigationPosition.progressPercent}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {visibleSections.map((section: any, sIdx: number) => (
                          <div key={sIdx} className="space-y-12">
                            {(() => {
                              const sectionTitle = renderCleanText(section.title || '', currentBrand || '');
                              const effectiveCurrentBrand = currentBrand ? getEffectiveBrandName(currentBrand) : '';
                              return (
                                <>
                            {section.title && (
                              <div className="space-y-4">
                                {section.title.toLowerCase().includes('instruction') && (
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.98 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="relative p-8 bg-slate-50 dark:bg-slate-800/80 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm"
                                  >
                                    <div className="absolute top-[-20%] right-[-5%] opacity-10 pointer-events-none">
                                      <Quote className="w-40 h-40 text-brand-blue" />
                                    </div>
                                    <div className="relative z-10 flex flex-col gap-4">
                                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand-blue/60">
                                        <Sparkles className="w-3 h-3" />
                                        Brand Context Insight
                                      </div>
                                      <p className="text-lg md:text-xl font-display font-light italic text-slate-600 dark:text-slate-300 leading-relaxed border-l-4 border-brand-blue/30 pl-6">
                                        "{BRAND_QUOTES[currentBrandIndex % BRAND_QUOTES.length]}"
                                      </p>
                                    </div>
                                  </motion.div>
                                )}
                                <div className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md py-4 border-b border-slate-100 dark:border-slate-800 mb-6 transition-colors">
                                  <h3 className="text-xl font-display font-bold text-brand-blue flex items-center gap-3">
                                    <div className="w-1.5 h-6 bg-brand-blue rounded-full" />
                                    {sectionTitle}
                                  </h3>
                                </div>
                              </div>
                            )}

                            <div className={`space-y-10 p-4 md:p-8 rounded-[2.5rem] bg-slate-50/30 dark:bg-slate-800/20 border border-slate-100/50 dark:border-slate-800/50 shadow-sm transition-colors`}>
                              {currentBrand && (
                                <div className="flex items-center gap-2 mb-6">
                                  <span className="px-5 py-2 rounded-xl bg-brand-blue text-white text-[12px] font-black uppercase tracking-widest shadow-xl shadow-brand-blue/20 flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-brand-cyan shadow-icon" />
                                    {survey?.language === 'ar' ? 'تقييم:' : 'Evaluating:'} {effectiveCurrentBrand}
                                  </span>
                                </div>
                              )}

                              <div className="space-y-12">
                                {section.questions?.filter((q: any) => {
                                  if (isOverallStep) {
                                    const text = (q.text || q.label || '').toLowerCase().trim();
                                    if (renderedOverallQuestions.has(text)) return false;
                                    renderedOverallQuestions.add(text);
                                  }
                                  return true;
                                }).map((q: any) => {
                                  const uniqueKey = buildL2AnswerKey(currentBrand, q.id);
                                  const questionText = renderCleanText(q.text || q.label || '', currentBrand || '');
                                  const scaleMax = q.questionMeta?.scaleMax || 10;
                                  const isAutoOpenEnd = q.type === 'mcq' && q.options?.length === 1 && q.options[0].toLowerCase() === 'open-end';
                                  const effectiveType = isAutoOpenEnd ? 'open-ended' : q.type;
                                  const showVoice = isVoiceEnabledForQuestion(survey, q, section, effectiveType);

                                  return (
                                    <div key={uniqueKey} id={`q-${uniqueKey}`} className={`space-y-8 p-6 md:p-8 rounded-[2rem] bg-white dark:bg-slate-900 border overflow-visible transition-all shadow-premium hover:shadow-premium-hover ${pulseErrorId === `q-${uniqueKey}` ? 'border-rose-400 ring-4 ring-rose-500/30 animate-pulse' : 'border-slate-50 dark:border-slate-800/50'}`}>
                                      <div className="flex justify-between items-start gap-4">
                                        <div className="flex-1 space-y-2">
                                          <p className="text-lg md:text-xl font-bold text-slate-900 dark:text-white leading-tight transition-colors">{questionText}</p>
                                          {q.type === 'mcq' && q.allow_multiple && (
                                            <div className="flex items-center gap-2 px-3 py-1 bg-brand-blue/5 border border-brand-blue/10 rounded-lg self-start w-fit">
                                              <Sparkles className="w-3 h-3 text-brand-blue" />
                                              <span className="text-[10px] font-black uppercase tracking-widest text-brand-blue">
                                                {survey?.language === 'ar' ? 'يمكنك اختيار أكثر من إجابة' : 'Select all that apply'}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                        <AnimatePresence>
                                          {l2Answers[uniqueKey] && effectiveType !== 'open-ended' && effectiveType !== 'text' && (
                                            <motion.div
                                              initial={{ opacity: 0, scale: 0.5, x: 20 }}
                                              animate={{ opacity: 1, scale: 1, x: 0 }}
                                              className="ml-4 px-5 py-4 bg-brand-blue text-white rounded-2xl shadow-premium-blue font-black text-2xl min-w-[4rem] flex items-center justify-center border-2 border-white/20"
                                            >
                                              {typeof l2Answers[uniqueKey] === 'string'
                                                ? renderCleanText(
                                                  String(l2Answers[uniqueKey]),
                                                  currentBrand || String(l2Answers[uniqueKey]),
                                                )
                                                : l2Answers[uniqueKey]}
                                            </motion.div>
                                          )}
                                        </AnimatePresence>
                                      </div>

                                      {effectiveType === 'scale' ? (
                                        <div className="space-y-8 py-4 px-2">
                                          <HorizontalScaleSlider
                                            value={Number(l2Answers[uniqueKey]) || 1}
                                            max={scaleMax}
                                            onChange={(nextValue) => {
                                              setL2Answers({ ...l2Answers, [uniqueKey]: nextValue });
                                            }}
                                            language={computedModuleLanguage}
                                            minLabel={q.questionMeta?.minLabel}
                                            maxLabel={q.questionMeta?.maxLabel}
                                            numberSeparator="dash"
                                            size="large"
                                            pulseError={pulseErrorId === `q-${uniqueKey}`}
                                          />
                                        </div>
                                      ) : effectiveType === 'bipolar' ? (
                                        <div className="space-y-4 py-2 px-2">
                                          <ScaleAnchorLabels
                                            language={computedModuleLanguage}
                                            variant="bipolar"
                                            minLabel={q.questionMeta?.minLabel}
                                            maxLabel={q.questionMeta?.maxLabel}
                                            leftLabel={q.questionMeta?.bipolarLeft}
                                            rightLabel={q.questionMeta?.bipolarRight}
                                          />
                                          <div className="flex flex-wrap gap-2 justify-center">
                                            {[...Array(scaleMax)].map((_, index) => (
                                              <button
                                                key={index}
                                                type="button"
                                                onClick={() => {
                                                  setL2Answers({ ...l2Answers, [uniqueKey]: index + 1 });
                                                }}
                                                className={`w-11 h-11 rounded-xl border font-black transition-all ${l2Answers[uniqueKey] === index + 1
                                                  ? 'bg-brand-blue text-white border-brand-blue scale-110'
                                                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 text-slate-500'
                                                  }`}
                                              >
                                                {index + 1}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      ) : effectiveType === 'number' || effectiveType === 'numeric' ? (
                                        <input
                                          type="number"
                                          className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-6 py-5 text-xl font-bold"
                                          placeholder="Enter number..."
                                          value={l2Answers[uniqueKey] || ''}
                                          onChange={(e) => setL2Answers({ ...l2Answers, [uniqueKey]: e.target.value })}
                                        />
                                      ) : effectiveType === 'text' || effectiveType === 'open-ended' ? (
                                        <TasteTestOpenEndQuestion
                                          questionId={uniqueKey}
                                          questionText={questionText}
                                          effectiveType={effectiveType}
                                          timing={q.timing}
                                          sectionTitle={sectionTitle}
                                          value={l2Answers[uniqueKey]}
                                          onChange={(next) => setL2Answers({ ...l2Answers, [uniqueKey]: next })}
                                          language={computedModuleLanguage}
                                          brandName={effectiveCurrentBrand}
                                          publicToken={token}
                                          showVoice={showVoice}
                                          aiFollowup={survey?.ai_followup}
                                          followUpStateMap={followUpStateMap}
                                          getFollowUpStateSnapshot={() => followUpStateMapRef.current}
                                          onFollowUpTrigger={handleFollowUpTrigger}
                                          onVoiceFollowUpTrigger={handleVoiceFollowUpTrigger}
                                          onFollowUpReplyChange={handleFollowUpReplyChange}
                                        />
                                      ) : (
                                        <div className="grid grid-cols-1 gap-3">
                                          {q.options?.map((opt: string) => {
                                            const optionLabel = renderCleanText(String(opt), currentBrand || String(opt));
                                            return (
                                            <button
                                              key={opt}
                                              type="button"
                                              onClick={() => {
                                                setL2Answers({ ...l2Answers, [uniqueKey]: opt });
                                                const allQs = section.questions;
                                                scrollToNextQuestion(q.id, allQs);
                                              }}
                                              className={`w-full p-5 rounded-2xl border-2 text-left font-bold transition-all ${l2Answers[uniqueKey] === opt ? 'bg-brand-blue/10 border-brand-blue text-brand-blue shadow-lg' : 'bg-slate-50 border-slate-100/50 text-slate-500 hover:border-slate-300'} `}
                                            >
                                              {optionLabel}
                                            </button>
                                          );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                                </>
                              );
                            })()}
                          </div>
                        ))}
                    </div>
                  );
                })()}
              </div>
              <TasteTestRespondentNavBar
                language={computedModuleLanguage}
                loading={loading}
                canGoBack={tasteTestCanGoBack}
                continueLabel={
                  tasteTestNavigationPosition
                    ? resolveTasteTestContinueLabel(
                      tasteTestNavigationPosition,
                      survey?.language === 'ar' ? 'ar' : 'en',
                    )
                    : ''
                }
                onBack={handleTasteTestBack}
              />
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="m-auto relative z-10 w-full max-w-2xl bg-white dark:bg-slate-900 rounded-none md:rounded-[3rem] p-6 md:p-12 border-0 md:border border-slate-100 dark:border-slate-800 shadow-none md:shadow-2xl transition-colors min-h-screen md:min-h-0"
          >
            {(() => {
              const isAr = survey?.language === 'ar';
              return (
            <div dir={isAr ? 'rtl' : 'ltr'}>
            <div className="flex flex-col items-center mb-10">
              <img src="/brand/logo-icon.png" alt="Logo" className="w-20 h-20 mb-4 object-contain brightness-100 dark:brightness-125" />
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                {isAr ? (
                  <>البنية التحتية <span className="text-brand-blue">الآمنة</span></>
                ) : (
                  <>Secure <span className="text-brand-blue">Infrastructure</span></>
                )}
              </div>
            </div>

            <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tight mb-2 text-center text-slate-900 dark:text-white transition-colors">
              {survey?.company_name} <br />{' '}
              <span className="text-slate-400 dark:text-slate-600 font-light font-sans">
                {isAr ? 'بروتوكول المشاركة' : 'Participation Protocol'}
              </span>
            </h1>
            <div className="flex items-center gap-2 mb-8 justify-center flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-brand-blue/10 text-brand-blue border border-brand-blue/10">
                {isAr ? 'المخطط:' : 'Blueprint:'} {survey?.template_name || (isAr ? 'قياسي' : 'Standard')}
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100">
                {isAr ? 'المعرّف:' : 'ID:'} {token?.slice(-6).toUpperCase()}
              </span>
            </div>

            <p className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed mb-10 pb-8 border-b border-slate-50 dark:border-slate-800 transition-colors text-center">
              {isAr
                ? 'يرجى إكمال أسئلة التأهل التالية. بعد التحقق سيتم توجيهك إلى أداة البحث.'
                : 'Please complete the following qualification probe. Upon synchronization, you will be redirected to the research instrument.'}
            </p>

            <form onSubmit={handleSubmit} className="space-y-10">
              <div className="space-y-8 px-0 md:px-2">
                {/* Always include Phone for handoff matching */}
                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">
                    {isAr ? 'بيانات التواصل (رقم الهاتف الدولي)' : 'Contact Protocol (International Mobile)'}
                  </label>
                  <div className="flex gap-2">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowCountrySelector(!showCountrySelector)}
                        className="h-full bg-slate-50 border border-slate-200 rounded-2xl px-4 text-slate-900 flex items-center gap-2 hover:border-brand-blue/50 transition-all font-bold"
                      >
                        <span>{countries.find(c => c.code === countryCode)?.flag}</span>
                        <span className="text-sm">{countryCode}</span>
                        <ChevronDown className={`w-4 h-4 transition-transform ${showCountrySelector ? 'rotate-180' : ''}`} />
                      </button>

                      <AnimatePresence>
                        {showCountrySelector && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-2 shadow-2xl z-50 max-h-60 overflow-y-auto custom-scrollbar transition-colors"
                          >
                            {countries.map(c => (
                              <button
                                key={c.code}
                                type="button"
                                onClick={() => {
                                  setCountryCode(c.code);
                                  setShowCountrySelector(false);
                                }}
                                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                              >
                                <span className="text-xl">{c.flag}</span>
                                <div className="flex flex-col">
                                  <span className="text-xs font-black text-slate-900 dark:text-white transition-colors">{c.code}</span>
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold transition-colors">{c.name}</span>
                                </div>
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="relative flex-1 group">
                      <Phone className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-brand-blue transition-colors" />
                      <input
                        id="phone-input"
                        type="tel"
                        required
                        placeholder="123 456 7890"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl pl-12 pr-6 py-4 text-slate-900 dark:text-white focus:outline-none focus:border-brand-blue/50 focus:ring-4 focus:ring-brand-blue/5 transition-all font-bold placeholder:text-slate-300 dark:placeholder:text-slate-600"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Dynamic Questions from Blueprint */}
                {survey?.questions?.map((q: any, idx: number) => {
                  const qId = q.id || idx.toString();
                  return (
                    <div key={qId} id={`q-${qId}`} className="space-y-3">
                      <label className="text-lg md:text-xl font-semibold text-slate-900 dark:text-white ml-1 leading-tight flex flex-col gap-2">
                        <span>{renderCleanText(q.label || q.text)}</span>
                        {/* Multi-answer tip */}
                        {q.type === 'mcq' && q.allow_multiple && (
                          <span className="text-[11px] font-bold text-brand-blue/70 italic lowercase">
                            {survey?.language === 'ar' ? '* يمكنك اختيار أكثر من إجابة' : '* You can select multiple answers'}
                          </span>
                        )}
                        {/* Income / EGP tip */}
                        {(qId === 'family_income' || q.label?.toLowerCase().includes('income')) && (
                          <span className="text-sm font-black text-brand-blue uppercase bg-brand-blue/5 self-start px-3 py-1 rounded-lg border border-brand-blue/10">
                            {survey?.language === 'ar' ? '(بالجنيه المصري - EGP)' : '(In Egyptian Pounds - EGP)'}
                          </span>
                        )}
                      </label>
                      <div className="relative group">
                        {q.type === 'mcq' ? (
                          <div className="grid grid-cols-1 gap-2">
                            {q.options?.map((opt: string) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => {
                                  if (q.allow_multiple) {
                                    const current = Array.isArray(answers[qId]) ? answers[qId] : (answers[qId] ? [answers[qId]] : []);
                                    if (current.includes(opt)) {
                                      setAnswers({ ...answers, [qId]: current.filter((i: string) => i !== opt) });
                                    } else {
                                      setAnswers({ ...answers, [qId]: [...current, opt] });
                                    }
                                  } else {
                                    setAnswers({ ...answers, [qId]: opt });
                                    // Phase 1: Auto-snap for single choice
                                    scrollToNextQuestion(qId, survey?.questions || []);
                                  }
                                }}
                                className={`w-full p-3 md:p-4 rounded-xl md:rounded-2xl border text-left font-semibold text-xs md:text-sm transition-all ${(q.allow_multiple ? (Array.isArray(answers[qId]) && answers[qId].includes(opt)) : answers[qId] === opt)
                                  ? 'bg-brand-blue/10 border-brand-blue text-brand-blue shadow-sm'
                                  : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-300'
                                  }`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        ) : q.type === 'scale' ? (
                          <div className="flex items-center justify-between gap-2">
                            {[...Array(q.max || 5)].map((_, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => setAnswers({ ...answers, [qId]: i + 1 })}
                                className={`flex-1 h-12 rounded-xl border font-black transition-all ${answers[qId] === i + 1 ? 'bg-brand-blue text-white border-brand-blue' : 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400'}`}
                              >
                                {i + 1}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-2 relative">
                            <textarea
                              rows={q.type === 'email' ? 1 : 2}
                              required={q.required}
                              maxLength={500}
                              placeholder={q.label}
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-6 py-4 text-slate-900 dark:text-white focus:outline-none focus:border-brand-blue/50 transition-all font-bold placeholder:text-slate-300 dark:placeholder:text-slate-600 resize-none"
                              value={answers[qId] || ''}
                              onChange={e => {
                                const val = e.target.value;
                                setAnswers({ ...answers, [qId]: val });
                                if (q.id === 'area' || q.label?.toLowerCase().includes('area')) {
                                  if (val.length > 1) {
                                    const filtered = commonCities.filter(c => c.toLowerCase().includes(val.toLowerCase())).slice(0, 5);
                                    setAreaSuggestions(filtered);
                                  } else {
                                    setAreaSuggestions([]);
                                  }
                                }
                              }}
                            />
                            {q.type !== 'email' && q.type !== 'age' && (
                              <div className="flex justify-end px-2 mt-1">
                                <span className={`text-[8px] font-black uppercase tracking-tighter ${(answers[qId]?.length || 0) >= 450 ? 'text-amber-500' : 'text-slate-400'}`}>
                                  {(answers[qId]?.length || 0)} / 500
                                </span>
                              </div>
                            )}

                            {/* Autocomplete Suggestions */}
                            <AnimatePresence>
                              {(q.id === 'area' || q.label?.toLowerCase().includes('area')) && areaSuggestions.length > 0 && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.95 }}
                                  className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-2 shadow-2xl z-50 overflow-hidden transition-colors"
                                >
                                  {areaSuggestions.map(suggestion => (
                                    <button
                                      key={suggestion}
                                      type="button"
                                      onClick={() => {
                                        setAnswers({ ...answers, [qId]: suggestion });
                                        setAreaSuggestions([]);
                                      }}
                                      className="w-full p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-brand-blue transition-all text-left font-bold text-sm border border-transparent hover:border-slate-100 dark:hover:border-slate-700"
                                    >
                                      {suggestion}
                                    </button>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {/* Legacy Suggestions fallback */}
                            {q.suggestions && (!areaSuggestions.length || !(q.id === 'area' || q.label?.toLowerCase().includes('area'))) && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {q.suggestions.map((suggestion: string) => (
                                  <button
                                    key={suggestion}
                                    type="button"
                                    onClick={() => setAnswers({ ...answers, [qId]: suggestion })}
                                    className="text-[10px] font-bold px-3 py-1.5 rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-brand-blue/5 dark:hover:bg-brand-blue/10 hover:border-brand-blue/20 dark:hover:border-brand-blue/40 hover:text-brand-blue transition-all"
                                  >
                                    {suggestion}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-premium w-full py-5 text-white flex items-center justify-center gap-3 group shadow-xl shadow-brand-accent/20 font-black tracking-widest uppercase text-xs rounded-2xl"
              >
                {loading ? <Sparkles className="w-5 h-5 animate-spin" /> : (
                  <>
                    {isAr ? 'بدء دخول البحث' : 'Initialize Research Access'}
                    <ChevronRight className={`w-5 h-5 group-hover:translate-x-1 transition-transform ${isAr ? 'rotate-180 group-hover:-translate-x-1' : ''}`} />
                  </>
                )}
              </button>
            </form>

            <div className="mt-10 pt-8 border-t border-slate-50 dark:border-slate-800 flex items-center justify-between transition-colors">
              <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span className="text-[10px] font-black uppercase tracking-tighter">
                  {isAr ? 'بروتوكول موثّق' : 'Verified Protocol'}
                </span>
              </div>
              <div className="text-[10px] font-black uppercase text-slate-300 tracking-tighter">
                {isAr ? 'وصول مسجّل للمراجعة' : 'Audit Logged Access'}
              </div>
            </div>
            </div>
              );
            })()}
          </motion.div>
        )
        }
      </AnimatePresence >
    </div >
  );
}
