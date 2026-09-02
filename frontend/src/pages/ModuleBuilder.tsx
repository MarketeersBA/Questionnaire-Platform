import { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlignLeft,
    ArrowRight,
    BookOpen,
    CheckCircle2,
    ChevronDown,
    CircleDot,
    Download,
    FileSpreadsheet,
    GitBranch,
    Languages,
    Layers,
    List,
    ListChecks,
    Minus,
    MoveHorizontal,
    Pencil,
    Plus,
    Sparkles,
    SlidersHorizontal,
    Target,
    Trash2,
    Type,
    UploadCloud,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { questionModules } from '../services/api';
import SelectMenu from '../components/common/SelectMenu';
import type { SelectMenuOption } from '../components/common/SelectMenu';
import type { ModuleQuestionType, ModuleSection } from '../types/questionModules';

/**
 * Custom Module Builder.
 *
 * The shape a module is authored in is  module -> attribute -> question.
 * An "attribute" is the main research attribute and maps 1:1 onto a backend
 * `ModuleSection` (its title carries the attribute name); the optional finer
 * breakdown lives on each question's `sub_attribute`. Keeping that mapping in
 * one place (`toSections` / `fromSections`) is what lets the Excel import, the
 * manual editor, and the saved document all agree on one structure.
 *
 * English and Arabic are edited side by side rather than behind a language
 * toggle: these questionnaires ship bilingual, so hiding one half meant every
 * question had to be visited twice.
 */

// ── Builder-local state shapes ───────────────────────────────────────────────
// These carry a `uid` so React keys stay stable while rows are reordered or
// deleted. `uid` is stripped before anything is sent to the API.

interface BuilderOption {
    uid: string;
    en_label: string;
    ar_label: string;
}

interface BuilderQuestion {
    uid: string;
    type: ModuleQuestionType;
    en_text: string;
    ar_text: string;
    sub_attribute: string;
    options: BuilderOption[];
    scale_variant: 'linear' | 'bipolar' | 'jar';
    scale_min: number;
    scale_max: number;
    min_label: string;
    max_label: string;
}

interface BuilderAttribute {
    uid: string;
    name_en: string;
    name_ar: string;
    questions: BuilderQuestion[];
}

let uidCounter = 0;
const nextUid = (prefix: string) => `${prefix}_${++uidCounter}`;

// ── Question types ───────────────────────────────────────────────────────────
// Every entry here is accepted by the backend `QuestionType` and has a matching
// branch in ModuleQuestionRenderer, so anything authored here actually renders
// to a respondent.

const QUESTION_TYPES: SelectMenuOption<ModuleQuestionType>[] = [
    { value: 'open_single', label: 'Text Answer', hint: 'One open-ended reply', icon: AlignLeft },
    { value: 'open_loop', label: 'Text List', hint: 'Respondent adds several replies', icon: List },
    { value: 'scq', label: 'Single Choice', hint: 'Pick exactly one option', icon: CircleDot },
    { value: 'mcq', label: 'Multiple Choice', hint: 'Pick any number of options', icon: ListChecks },
    { value: 'linear_scale', label: 'Linear Scale', hint: 'Rating slider, e.g. 1-5', icon: SlidersHorizontal },
];

const usesOptions = (type: ModuleQuestionType) => type === 'mcq' || type === 'scq';

/**
 * One brand gradient for every attribute. An earlier version cycled through
 * accent colours, which made the second attribute red — that reads as an
 * error state rather than as "attribute two".
 */
const BRAND_GRADIENT = 'bg-gradient-to-r from-[#21A0FF] to-[#255E91]';

/** Accent bar. Blue only — a red-tipped bar on a neutral page reads as a warning. */
const BLUE_GRADIENT = 'bg-gradient-to-r from-[#8ACAEC] via-[#21A0FF] to-[#255E91]';

/**
 * Scale variants, mirroring the platform's ScaleAnchorVariant. JAR is the
 * sensory-research scale whose midpoint is the ideal, so analytics has to
 * treat a 3 as the best score rather than a middling one.
 */
const SCALE_VARIANTS: SelectMenuOption<'linear' | 'bipolar' | 'jar'>[] = [
    { value: 'linear', label: 'Intensity', hint: 'Low to high, e.g. 1-7', icon: SlidersHorizontal },
    { value: 'jar', label: 'JAR — Just About Right', hint: 'Sensory 1-5, midpoint is ideal', icon: Target },
    { value: 'bipolar', label: 'Bipolar', hint: 'Opposed adjectives at each end', icon: MoveHorizontal },
];

/**
 * The Excel contract, mirrored from MODULE_TEMPLATE_COLUMNS in
 * backend/routers/question_modules.py. Choice options are authored in the
 * studio, so the sheet carries no option columns.
 */
const TEMPLATE_COLUMNS: Array<{
    name: string;
    required: boolean;
    icon: LucideIcon;
    note: string;
    example: string;
}> = [
    { name: 'Question EN', required: true, icon: Type, note: 'The question in English', example: 'How sweet did you find it?' },
    { name: 'Question AR', required: false, icon: Languages, note: 'The same question in Arabic', example: 'ما مدى حلاوته؟' },
    { name: 'Question Type', required: true, icon: ListChecks, note: 'How it is answered', example: 'linear_scale' },
    { name: 'Attribute', required: true, icon: Layers, note: 'Groups the questions — repeat to add more', example: 'Taste' },
    { name: 'Sub Attribute', required: false, icon: GitBranch, note: 'Finer breakdown under the attribute', example: 'Sweetness' },
    { name: 'Scale Type', required: false, icon: Target, note: 'jar, linear or bipolar', example: 'jar' },
    { name: 'Scale Min', required: false, icon: Minus, note: 'Lowest point (default 1)', example: '1' },
    { name: 'Scale Max', required: false, icon: Plus, note: 'Highest point (default 5)', example: '5' },
];

const STUDIO_PERKS = [
    { icon: Layers, title: 'Attributes first', body: 'Group questions under the attribute they measure.' },
    { icon: Languages, title: 'English & عربي together', body: 'Write both languages in one pass — no toggling.' },
    { icon: Target, title: 'JAR sensory scales', body: 'Just-About-Right scales feed straight into reporting.' },
    { icon: ListChecks, title: 'Five answer types', body: 'Text, lists, single, multiple choice and scales.' },
];

// ── Factories ────────────────────────────────────────────────────────────────

const makeQuestion = (): BuilderQuestion => ({
    uid: nextUid('q'),
    type: 'open_single',
    en_text: '',
    ar_text: '',
    sub_attribute: '',
    options: [],
    scale_variant: 'linear',
    scale_min: 1,
    scale_max: 5,
    min_label: '',
    max_label: '',
});

const makeAttribute = (name = ''): BuilderAttribute => ({
    uid: nextUid('attr'),
    name_en: name,
    name_ar: '',
    questions: [makeQuestion()],
});

// ── API <-> builder mapping ──────────────────────────────────────────────────

/** Builder state -> the `sections` array the API expects. */
function toSections(attributes: BuilderAttribute[]): ModuleSection[] {
    let questionNo = 0;

    return attributes.map((attr, attrIdx) => ({
        section_id: `attr_${attrIdx + 1}`,
        // The section title *is* the main attribute name.
        title_en: attr.name_en.trim(),
        title_ar: attr.name_ar.trim() || attr.name_en.trim(),
        order: attrIdx,
        questions: attr.questions.map((q, qIdx) => {
            questionNo += 1;
            return {
                // Must satisfy the backend's ^[a-z]{2}_q\d+$ pattern.
                question_id: `cm_q${questionNo}`,
                label: (q.en_text || q.ar_text).slice(0, 80),
                type: q.type,
                en_text: q.en_text.trim(),
                ar_text: q.ar_text.trim(),
                order: qIdx,
                required: true,
                sub_attribute: q.sub_attribute.trim() || null,
                options: usesOptions(q.type)
                    ? q.options.map((opt, optIdx) => ({
                        value: `opt_${optIdx + 1}`,
                        // Field names must match the backend QuestionOption
                        // exactly, or the labels are silently dropped.
                        en_label: opt.en_label.trim(),
                        ar_label: opt.ar_label.trim(),
                        order: optIdx,
                    }))
                    : [],
                ...(q.type === 'linear_scale'
                    ? {
                        scale_variant: q.scale_variant,
                        // JAR anchors are fixed at 1 / 3 / 5; the API rejects
                        // any other range for that variant.
                        scale_min: q.scale_variant === 'jar' ? 1 : q.scale_min,
                        scale_max: q.scale_variant === 'jar' ? 5 : q.scale_max,
                        min_label: q.min_label.trim(),
                        max_label: q.max_label.trim(),
                    }
                    : {}),
            };
        }),
    }));
}

/** API `sections` (from Excel import or an existing module) -> builder state. */
function fromSections(sections: any[]): BuilderAttribute[] {
    if (!Array.isArray(sections) || sections.length === 0) return [makeAttribute()];

    return sections.map((section) => ({
        uid: nextUid('attr'),
        name_en: section.title_en ?? '',
        name_ar: section.title_ar ?? '',
        questions: (section.questions ?? []).map((q: any) => ({
            uid: nextUid('q'),
            type: (q.type ?? 'open_single') as ModuleQuestionType,
            en_text: q.en_text ?? '',
            ar_text: q.ar_text ?? '',
            sub_attribute: q.sub_attribute ?? '',
            options: (q.options ?? []).map((opt: any) => ({
                uid: nextUid('opt'),
                // Tolerate either key order; older drafts used label_en/label_ar.
                en_label: opt.en_label ?? opt.label_en ?? '',
                ar_label: opt.ar_label ?? opt.label_ar ?? '',
            })),
            scale_variant: q.scale_variant ?? 'linear',
            scale_min: q.scale_min ?? 1,
            scale_max: q.scale_max ?? 5,
            min_label: q.min_label ?? '',
            max_label: q.max_label ?? '',
        })),
    }));
}

/** Returns a human-readable problem, or null when the draft is saveable. */
function findValidationError(
    moduleName: string,
    attributes: BuilderAttribute[],
): string | null {
    if (!moduleName.trim()) return 'Give the module a name first.';
    if (attributes.length === 0) return 'Add at least one attribute.';

    const totalQuestions = attributes.reduce((n, a) => n + a.questions.length, 0);
    if (totalQuestions === 0) return 'Add at least one question.';

    for (const [i, attr] of attributes.entries()) {
        const attrLabel = attr.name_en.trim() || attr.name_ar.trim() || `Attribute ${i + 1}`;

        if (!attr.name_en.trim() && !attr.name_ar.trim()) return `Attribute ${i + 1} needs a name.`;
        if (attr.questions.length === 0) return `"${attrLabel}" has no questions.`;

        for (const [j, q] of attr.questions.entries()) {
            if (!q.en_text.trim() && !q.ar_text.trim()) {
                return `Question ${j + 1} in "${attrLabel}" has no text.`;
            }
            if (usesOptions(q.type)) {
                const filled = q.options.filter((o) => o.en_label.trim() || o.ar_label.trim());
                if (filled.length < 2) {
                    return `Question ${j + 1} in "${attrLabel}" needs at least 2 options.`;
                }
            }
            if (q.type === 'linear_scale' && q.scale_max <= q.scale_min) {
                return `Question ${j + 1} in "${attrLabel}" needs a scale max above its min.`;
            }
        }
    }
    return null;
}

// ── Small shared pieces ──────────────────────────────────────────────────────

const FIELD =
    'w-full bg-surface border-2 border-line dark:border-line/25 rounded-xl px-3.5 py-3 text-[15px] font-bold text-ink ' +
    'placeholder:text-ink-subtle placeholder:font-medium outline-none transition-colors ' +
    'hover:border-[#21A0FF]/50 focus:border-[#21A0FF] focus:ring-2 focus:ring-[#21A0FF]/20';

// Labels sat at 10px on ink-subtle, which is what made every field read as pale.
const MICRO_LABEL = 'block text-[11px] font-black uppercase tracking-[0.14em] text-ink-muted mb-1.5';

/** English + Arabic on one row, so bilingual authoring is a single pass. */
function BilingualField({
    en,
    ar,
    onEn,
    onAr,
    placeholderEn,
    placeholderAr,
    label,
    big = false,
}: {
    en: string;
    ar: string;
    onEn: (v: string) => void;
    onAr: (v: string) => void;
    placeholderEn: string;
    placeholderAr: string;
    label?: string;
    big?: boolean;
}) {
    const box = big
        ? `${FIELD} text-base font-bold`
        : FIELD;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div>
                <span className={MICRO_LABEL}>{label ? `${label} · EN` : 'English'}</span>
                <input
                    type="text"
                    dir="ltr"
                    value={en}
                    onChange={(e) => onEn(e.target.value)}
                    placeholder={placeholderEn}
                    className={box}
                />
            </div>
            <div>
                <span className={`${MICRO_LABEL} flex items-center gap-1`}>
                    <Languages className="w-3 h-3" />
                    {label ? `${label} · AR` : 'العربية'}
                </span>
                <input
                    type="text"
                    dir="rtl"
                    lang="ar"
                    value={ar}
                    onChange={(e) => onAr(e.target.value)}
                    placeholder={placeholderAr}
                    className={`${box} text-right`}
                />
            </div>
        </div>
    );
}

// ── Page ─────────────────────────────────────────────────────────────────────

type Mode = 'selection' | 'editor';

export default function ModuleBuilder() {
    const [mode, setMode] = useState<Mode>('selection');
    const [moduleName, setModuleName] = useState('');
    const [attributes, setAttributes] = useState<BuilderAttribute[]>([]);
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    // Set once a module exists server-side; makes the next save an update
    // (a new version) rather than creating a duplicate module.
    const [savedModuleId, setSavedModuleId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Excel import — inline on the selection page, no modal.
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [parsing, setParsing] = useState(false);
    const [downloadingTemplate, setDownloadingTemplate] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Existing modules, so a saved module can be reopened and edited.
    const [existing, setExisting] = useState<any[]>([]);

    useEffect(() => {
        let cancelled = false;
        questionModules
            .list()
            .then((rows: any[]) => {
                if (cancelled) return;
                // Only analyst-authored modules are editable here; the seeded
                // built-ins are managed in code.
                setExisting((rows ?? []).filter((r) => String(r.module_id).startsWith('custom_')));
            })
            .catch(() => undefined);
        return () => { cancelled = true; };
    }, []);

    const totalQuestions = useMemo(
        () => attributes.reduce((n, a) => n + a.questions.length, 0),
        [attributes],
    );

    // ── Mutators ─────────────────────────────────────────────────────────────
    // Each returns fresh objects rather than mutating in place, so React sees
    // the change and memoised children re-render correctly.

    const patchAttribute = (attrUid: string, patch: Partial<BuilderAttribute>) =>
        setAttributes((prev) => prev.map((a) => (a.uid === attrUid ? { ...a, ...patch } : a)));

    const patchQuestion = (attrUid: string, qUid: string, patch: Partial<BuilderQuestion>) =>
        setAttributes((prev) =>
            prev.map((a) =>
                a.uid !== attrUid
                    ? a
                    : { ...a, questions: a.questions.map((q) => (q.uid === qUid ? { ...q, ...patch } : q)) },
            ),
        );

    const addAttribute = () => setAttributes((prev) => [...prev, makeAttribute()]);

    const removeAttribute = (attrUid: string) =>
        setAttributes((prev) => prev.filter((a) => a.uid !== attrUid));

    const addQuestion = (attrUid: string) =>
        setAttributes((prev) =>
            prev.map((a) => (a.uid === attrUid ? { ...a, questions: [...a.questions, makeQuestion()] } : a)),
        );

    const removeQuestion = (attrUid: string, qUid: string) =>
        setAttributes((prev) =>
            prev.map((a) =>
                a.uid !== attrUid ? a : { ...a, questions: a.questions.filter((q) => q.uid !== qUid) },
            ),
        );

    const changeType = (attrUid: string, qUid: string, type: ModuleQuestionType) =>
        setAttributes((prev) =>
            prev.map((a) =>
                a.uid !== attrUid
                    ? a
                    : {
                        ...a,
                        questions: a.questions.map((q) => {
                            if (q.uid !== qUid) return q;
                            // Switching *into* a choice type with no options yet
                            // seeds two blanks, the minimum that validates.
                            const needsSeed = usesOptions(type) && q.options.length === 0;
                            return {
                                ...q,
                                type,
                                options: needsSeed
                                    ? [
                                        { uid: nextUid('opt'), en_label: '', ar_label: '' },
                                        { uid: nextUid('opt'), en_label: '', ar_label: '' },
                                    ]
                                    : q.options,
                            };
                        }),
                    },
            ),
        );

    const mutateOptions = (
        attrUid: string,
        qUid: string,
        fn: (opts: BuilderOption[]) => BuilderOption[],
    ) =>
        setAttributes((prev) =>
            prev.map((a) =>
                a.uid !== attrUid
                    ? a
                    : {
                        ...a,
                        questions: a.questions.map((q) => (q.uid === qUid ? { ...q, options: fn(q.options) } : q)),
                    },
            ),
        );

    // ── Actions ──────────────────────────────────────────────────────────────

    const startManual = () => {
        setSavedModuleId(null);
        setModuleName('');
        setAttributes([makeAttribute()]);
        setMode('editor');
    };

    const openExisting = async (moduleId: string) => {
        try {
            const doc = await questionModules.get(moduleId);
            setSavedModuleId(doc.module_id);
            setModuleName(doc.name ?? '');
            setAttributes(fromSections(doc.sections ?? []));
            setMode('editor');
            toast.success('Module loaded — saving will publish a new version.');
        } catch {
            toast.error('Could not load that module.');
        }
    };

    const downloadTemplate = async () => {
        setDownloadingTemplate(true);
        try {
            const blob = await questionModules.downloadTemplate();
            const url = URL.createObjectURL(blob as Blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'module_template.xlsx';
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (error: any) {
            toast.error(error?.response?.data?.detail ?? 'Could not download the template.');
        } finally {
            setDownloadingTemplate(false);
        }
    };

    const parseFile = async () => {
        if (!selectedFile) return;
        setParsing(true);
        try {
            const draft = await questionModules.parseExcel(selectedFile);
            const parsed = fromSections(draft.sections ?? []);
            setModuleName(draft.name ?? '');
            setAttributes(parsed);
            setSavedModuleId(null);
            setSelectedFile(null);
            setMode('editor');

            const qCount = parsed.reduce((n, a) => n + a.questions.length, 0);
            toast.success(
                `Imported ${qCount} question${qCount === 1 ? '' : 's'} across ${parsed.length} attribute${parsed.length === 1 ? '' : 's'} — edit anything before you save.`,
            );
        } catch (error: any) {
            // The API explains which column or row is at fault; surface that
            // instead of a generic failure.
            toast.error(error?.response?.data?.detail ?? 'Could not parse that file.');
        } finally {
            setParsing(false);
        }
    };

    const save = async () => {
        const problem = findValidationError(moduleName, attributes);
        if (problem) {
            toast.error(problem);
            return;
        }

        setSaving(true);
        const payload = {
            name: moduleName.trim(),
            description: 'Custom module',
            sections: toSections(attributes),
        };

        try {
            if (savedModuleId) {
                await questionModules.update(savedModuleId, payload as any);
                toast.success('Module updated — a new version is now active.');
            } else {
                const created = await questionModules.create(payload);
                setSavedModuleId(created.module_id);
                toast.success('Module saved and activated. You can keep editing it.');
                setExisting((prev) => [
                    ...prev.filter((m) => m.module_id !== created.module_id),
                    { module_id: created.module_id, name: created.name, question_count: created.question_count },
                ]);
            }
        } catch (error: any) {
            toast.error(error?.response?.data?.detail ?? 'Could not save the module.');
        } finally {
            setSaving(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────

    return (
        // Layout's #main-content already owns the scrolling and the page
        // padding, so this only constrains width.
        <div className="text-ink max-w-6xl mx-auto">

            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="flex items-center gap-4 pb-6 mb-7 border-b border-line/70 dark:border-line/15">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#8ACAEC] via-[#21A0FF] to-[#255E91]
                    grid place-items-center shadow-lg shadow-[#255E91]/25 shrink-0">
                    <Layers className="w-6 h-6 text-white" />
                </div>
                <div className="min-w-0">
                    <h1 className="text-2xl font-black tracking-tight text-ink truncate">Custom Module Builder</h1>
                    <p className="text-sm font-semibold text-ink-subtle mt-0.5">
                        Build a module as <span className="text-primary-soft font-bold">attributes</span> holding their
                        own questions — by hand or from an Excel sheet.
                    </p>
                </div>
            </div>

            {/* ── Mode selection: two self-contained cards, no modal ──────── */}
            {mode === 'selection' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">

                        {/* Interactive Studio */}
                        <section className="group relative overflow-hidden rounded-3xl border-2 border-line/70 dark:border-line/15
                            bg-surface flex flex-col transition-all duration-300
                            hover:border-[#21A0FF]/60 hover:shadow-xl hover:shadow-[#21A0FF]/10 hover:-translate-y-1">
                            <div className={`h-2 ${BLUE_GRADIENT}`} />
                            <div className="p-7 flex flex-col flex-1">
                                <div className="flex items-center gap-4 mb-5">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#21A0FF] to-[#255E91]
                                        grid place-items-center text-white shadow-lg shadow-[#21A0FF]/30 shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                                        <BookOpen className="w-7 h-7" />
                                    </div>
                                    <div className="min-w-0">
                                        <h2 className="text-2xl font-black text-ink leading-tight">Interactive Studio</h2>
                                        <p className="text-sm font-black text-[#21A0FF]">Build it by hand</p>
                                    </div>
                                </div>

                                <p className="text-base font-semibold text-ink-muted leading-relaxed mb-6">
                                    Full control over every attribute and question — with English and Arabic side by side.
                                </p>

                                <div className="space-y-3 mb-7">
                                    {STUDIO_PERKS.map((perk) => {
                                        const Icon = perk.icon;
                                        return (
                                            <div key={perk.title} className="flex items-start gap-3.5 rounded-xl p-2 -m-2 hover:bg-[#21A0FF]/[0.05] transition-colors">
                                                <span className="w-10 h-10 shrink-0 rounded-xl grid place-items-center
                                                    bg-gradient-to-br from-[#8ACAEC]/25 to-[#21A0FF]/20 text-[#255E91] dark:text-[#8ACAEC]">
                                                    <Icon className="w-5 h-5" />
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="text-base font-black text-ink leading-snug">{perk.title}</p>
                                                    <p className="text-sm font-semibold text-ink-subtle leading-snug">{perk.body}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <button
                                    onClick={startManual}
                                    className={`mt-auto w-full py-4 rounded-2xl ${BRAND_GRADIENT}
                                        text-white font-black text-base shadow-lg shadow-[#255E91]/30
                                        hover:shadow-xl hover:shadow-[#21A0FF]/45 hover:-translate-y-0.5 active:translate-y-0
                                        transition-all flex items-center justify-center gap-2 group`}
                                >
                                    Start building
                                    <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                                </button>
                            </div>
                        </section>

                        {/* Excel Import */}
                        <section className="group relative overflow-hidden rounded-3xl border-2 border-line/70 dark:border-line/15
                            bg-surface flex flex-col transition-all duration-300
                            hover:border-[#21A0FF]/60 hover:shadow-xl hover:shadow-[#21A0FF]/10 hover:-translate-y-1">
                            <div className={`h-2 ${BLUE_GRADIENT}`} />
                            <div className="p-7 flex flex-col flex-1">
                                <div className="flex items-center gap-4 mb-5">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#255E91] to-[#21A0FF]
                                        grid place-items-center text-white shadow-lg shadow-[#255E91]/30 shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                                        <UploadCloud className="w-7 h-7" />
                                    </div>
                                    <div className="min-w-0">
                                        <h2 className="text-2xl font-black text-ink leading-tight">Excel Import</h2>
                                        <p className="text-sm font-black text-[#255E91] dark:text-[#8ACAEC]">Bring a whole sheet at once</p>
                                    </div>
                                </div>

                                <p className="text-base font-semibold text-ink-muted leading-relaxed mb-6">
                                    One row per question. The <span className="font-black text-ink">Attribute</span> column
                                    groups them — repeat a name to add more questions to it.
                                </p>

                                {/* Column contract, inline */}
                                <div className="rounded-2xl bg-surface-sunken border-2 border-line/60 dark:border-line/15 p-4 mb-5">
                                    <div className="flex items-center justify-between gap-2 mb-2.5">
                                        <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-ink-muted">
                                            <FileSpreadsheet className="w-3.5 h-3.5 text-[#21A0FF]" />
                                            Sheet columns
                                        </span>
                                        <button
                                            onClick={downloadTemplate}
                                            disabled={downloadingTemplate}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                                                bg-[#21A0FF] text-white text-xs font-black shadow-sm
                                                hover:bg-[#255E91] hover:shadow-md disabled:opacity-50
                                                transition-all shrink-0"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            {downloadingTemplate ? 'Preparing…' : 'Download template'}
                                        </button>
                                    </div>
                                    {/* One row per column with a worked example — the
                                        previous chip cloud named the columns but never
                                        said what belongs in them. */}
                                    <ul className="divide-y divide-line/40 dark:divide-line/10 rounded-xl overflow-hidden border border-line/50 dark:border-line/15">
                                        {TEMPLATE_COLUMNS.map((col, idx) => {
                                            const ColIcon = col.icon;
                                            return (
                                                <li
                                                    key={col.name}
                                                    className="group/col flex items-center gap-3 px-3 py-2.5 bg-surface hover:bg-[#21A0FF]/[0.06] transition-colors"
                                                >
                                                    <span className="w-6 h-6 shrink-0 rounded-lg grid place-items-center text-[11px] font-black bg-[#21A0FF]/12 text-[#255E91] dark:text-[#8ACAEC]">
                                                        {idx + 1}
                                                    </span>
                                                    <ColIcon className="w-4 h-4 shrink-0 text-ink-subtle group-hover/col:text-[#21A0FF] transition-colors" />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="flex items-center gap-2">
                                                            <span className="text-[13px] font-black text-ink">{col.name}</span>
                                                            {col.required ? (
                                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-[#21A0FF]/15 text-[#255E91] dark:text-[#8ACAEC]">
                                                                    required
                                                                </span>
                                                            ) : (
                                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-surface-sunken text-ink-subtle">
                                                                    optional
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span className="block text-[11px] font-semibold text-ink-muted leading-snug">
                                                            {col.note}
                                                        </span>
                                                    </span>
                                                    <code
                                                        dir="auto"
                                                        className="hidden sm:block shrink-0 max-w-[9rem] truncate px-2 py-1 rounded-md bg-surface-sunken text-[11px] font-mono text-ink-muted"
                                                        title={col.example}
                                                    >
                                                        {col.example}
                                                    </code>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>

                                {/* File picker */}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".xlsx,.xls"
                                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                                    className="sr-only"
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`w-full border-2 border-dashed rounded-2xl p-5 mb-4 flex flex-col items-center gap-1.5
                                        transition-colors ${
                                            selectedFile
                                                ? 'border-[#21A0FF]/70 bg-[#21A0FF]/[0.07]'
                                                : 'border-line dark:border-line/30 hover:border-[#21A0FF] hover:bg-[#21A0FF]/[0.07] hover:shadow-md'
                                        }`}
                                >
                                    <FileSpreadsheet className={`w-7 h-7 ${selectedFile ? 'text-[#21A0FF]' : 'text-ink-subtle'}`} />
                                    {selectedFile ? (
                                        <>
                                            <span className="text-base font-black text-ink break-all">{selectedFile.name}</span>
                                            <span className="text-xs font-bold text-[#255E91] dark:text-[#8ACAEC]">
                                                Click to choose a different file
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-base font-black text-ink">Choose an Excel file</span>
                                            <span className="text-xs font-semibold text-ink-subtle">.xlsx or .xls</span>
                                        </>
                                    )}
                                </button>

                                <button
                                    onClick={parseFile}
                                    disabled={!selectedFile || parsing}
                                    className={`mt-auto w-full py-4 rounded-2xl font-black text-base
                                        transition-all flex items-center justify-center gap-2 group ${
                                            selectedFile && !parsing
                                                ? `${BRAND_GRADIENT} text-white shadow-lg shadow-[#255E91]/30 hover:shadow-xl hover:shadow-[#21A0FF]/45 hover:-translate-y-0.5 active:translate-y-0`
                                                : 'bg-transparent text-ink-muted border-2 border-dashed border-line dark:border-line/30 cursor-not-allowed'
                                        }`}
                                >
                                    {parsing ? 'Parsing…' : selectedFile ? 'Import & edit' : 'Choose a file first'}
                                    {!parsing && selectedFile && (
                                        <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                                    )}
                                </button>
                            </div>
                        </section>
                    </div>

                    {/* Editing an already-saved module */}
                    {existing.length > 0 && (
                        <section className="rounded-3xl border border-line/70 dark:border-line/15 bg-surface p-5">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-ink-subtle mb-3.5">
                                Or edit a saved module
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                {existing.map((m) => (
                                    <button
                                        key={m.module_id}
                                        onClick={() => openExisting(m.module_id)}
                                        className="group flex items-center gap-3 p-3 rounded-2xl border border-line/70 dark:border-line/15
                                            bg-surface-raised hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
                                    >
                                        <div className="w-9 h-9 rounded-xl grid place-items-center text-white shrink-0 bg-[#255E91]">
                                            <Pencil className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-black text-ink truncate">{m.name}</p>
                                            <p className="text-[11px] font-bold text-ink-subtle">
                                                {m.question_count ?? 0} question{(m.question_count ?? 0) === 1 ? '' : 's'}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            )}

            {/* ── Editor ─────────────────────────────────────────────────── */}
            {mode === 'editor' && (
                <div className="pb-8">
                    <button
                        onClick={() => setMode('selection')}
                        className="text-sm font-bold text-ink-muted hover:text-primary transition-colors mb-6"
                    >
                        &larr; Back to modes
                    </button>

                    {/* Module name */}
                    <div className="relative overflow-hidden rounded-3xl border border-line/70 dark:border-line/15 bg-surface mb-6">
                        <div className="h-1.5 bg-gradient-to-r from-[#8ACAEC] via-[#21A0FF] to-[#255E91]" />
                        <div className="p-6">
                            <label className={MICRO_LABEL} htmlFor="module-name">Module name</label>
                            <input
                                id="module-name"
                                type="text"
                                value={moduleName}
                                onChange={(e) => setModuleName(e.target.value)}
                                placeholder="e.g., Advanced Packaging Insights"
                                className="w-full text-2xl font-black bg-transparent border-b-2 border-line/70 dark:border-line/20
                                    focus:border-primary outline-none pb-2 transition-colors text-ink placeholder:text-ink-subtle/60"
                            />
                            <div className="flex flex-wrap items-center gap-2 mt-3.5">
                                <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-black">
                                    {attributes.length} attribute{attributes.length === 1 ? '' : 's'}
                                </span>
                                <span className="px-2.5 py-1 rounded-full bg-surface-sunken text-ink-muted text-[11px] font-black">
                                    {totalQuestions} question{totalQuestions === 1 ? '' : 's'}
                                </span>
                                {savedModuleId && (
                                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 text-[11px] font-black">
                                        Saved · editing live
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Attributes */}
                    <div className="space-y-5">
                        {attributes.map((attr, attrIdx) => {
                            const isCollapsed = collapsed[attr.uid];

                            return (
                                <div
                                    key={attr.uid}
                                    className="rounded-3xl border border-line/70 dark:border-line/15 bg-surface overflow-hidden"
                                >
                                    <div className="h-1.5 bg-gradient-to-r from-[#8ACAEC] via-[#21A0FF] to-[#255E91]" />

                                    {/* Attribute header */}
                                    <div className="p-5 border-b border-line/70 dark:border-line/15 bg-[#21A0FF]/[0.05]">
                                        <div className="flex items-center gap-3 mb-3">
                                            <span className="w-9 h-9 shrink-0 rounded-xl text-white grid place-items-center text-sm font-black bg-gradient-to-br from-[#21A0FF] to-[#255E91]">
                                                {attrIdx + 1}
                                            </span>
                                            <span className="text-xs font-black uppercase tracking-[0.16em] text-ink-muted flex-1">
                                                Attribute
                                            </span>
                                            <span className="hidden sm:inline text-[11px] font-black text-ink-subtle shrink-0">
                                                {attr.questions.length} Q
                                            </span>
                                            <button
                                                onClick={() => setCollapsed((c) => ({ ...c, [attr.uid]: !isCollapsed }))}
                                                aria-label={isCollapsed ? 'Expand attribute' : 'Collapse attribute'}
                                                className="p-2 rounded-lg text-ink-subtle hover:text-ink hover:bg-surface transition-colors shrink-0"
                                            >
                                                <ChevronDown className={`w-4 h-4 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                                            </button>
                                            <button
                                                onClick={() => removeAttribute(attr.uid)}
                                                aria-label="Delete attribute"
                                                className="p-2 rounded-lg text-ink-subtle hover:text-accent hover:bg-accent/10 transition-colors shrink-0"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>

                                        <BilingualField
                                            en={attr.name_en}
                                            ar={attr.name_ar}
                                            onEn={(v) => patchAttribute(attr.uid, { name_en: v })}
                                            onAr={(v) => patchAttribute(attr.uid, { name_ar: v })}
                                            placeholderEn="e.g., Taste"
                                            placeholderAr="مثال: الطعم"
                                            label="Attribute name"
                                            big
                                        />
                                    </div>

                                    {!isCollapsed && (
                                        <div className="p-5 space-y-4">
                                            {attr.questions.map((q, qIdx) => (
                                                <div
                                                    key={q.uid}
                                                    className="rounded-2xl border-2 border-line/70 dark:border-line/15 bg-surface-raised p-5"
                                                >
                                                    <div className="flex items-center gap-3 mb-4 pb-3 border-b border-line/60 dark:border-line/15">
                                                        <span className="w-7 h-7 shrink-0 rounded-lg bg-gradient-to-br from-[#21A0FF] to-[#255E91] text-white grid place-items-center text-xs font-black">
                                                            {qIdx + 1}
                                                        </span>
                                                        <span className="text-xs font-black uppercase tracking-[0.16em] text-ink-muted flex-1">
                                                            Question
                                                        </span>
                                                        <button
                                                            onClick={() => removeQuestion(attr.uid, q.uid)}
                                                            aria-label={`Delete question ${qIdx + 1}`}
                                                            className="p-1.5 rounded-lg text-ink-subtle hover:text-accent hover:bg-accent/10 transition-colors shrink-0"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>

                                                    <div className="space-y-3">
                                                        <BilingualField
                                                            en={q.en_text}
                                                            ar={q.ar_text}
                                                            onEn={(v) => patchQuestion(attr.uid, q.uid, { en_text: v })}
                                                            onAr={(v) => patchQuestion(attr.uid, q.uid, { ar_text: v })}
                                                            placeholderEn="Enter your question here…"
                                                            placeholderAr="اكتب سؤالك هنا…"
                                                            label="Question"
                                                        />

                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                                            <div>
                                                                <span className={MICRO_LABEL}>Answer type</span>
                                                                <SelectMenu<ModuleQuestionType>
                                                                    value={q.type}
                                                                    options={QUESTION_TYPES}
                                                                    onChange={(type) => changeType(attr.uid, q.uid, type)}
                                                                    aria-label="Answer type"
                                                                />
                                                            </div>
                                                            <div>
                                                                <span className={MICRO_LABEL}>
                                                                    Sub attribute{' '}
                                                                    <span className="text-ink-subtle/70 normal-case tracking-normal">(optional)</span>
                                                                </span>
                                                                <input
                                                                    type="text"
                                                                    value={q.sub_attribute}
                                                                    onChange={(e) => patchQuestion(attr.uid, q.uid, { sub_attribute: e.target.value })}
                                                                    placeholder="e.g., Sweetness"
                                                                    className={FIELD}
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Choice options */}
                                                        {usesOptions(q.type) && (
                                                            <div className="rounded-xl bg-surface-sunken border border-line/50 dark:border-line/10 p-3.5">
                                                                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-ink-muted mb-3">
                                                                    Options
                                                                </p>
                                                                <div className="space-y-2.5">
                                                                    {q.options.map((opt, optIdx) => (
                                                                        <div key={opt.uid} className="flex items-center gap-2">
                                                                            <span className={`w-4 h-4 shrink-0 border-2 border-line dark:border-line/40 ${q.type === 'mcq' ? 'rounded' : 'rounded-full'}`} />
                                                                            <input
                                                                                type="text"
                                                                                dir="ltr"
                                                                                value={opt.en_label}
                                                                                onChange={(e) =>
                                                                                    mutateOptions(attr.uid, q.uid, (opts) =>
                                                                                        opts.map((o) => (o.uid === opt.uid ? { ...o, en_label: e.target.value } : o)),
                                                                                    )
                                                                                }
                                                                                placeholder={`Option ${optIdx + 1}`}
                                                                                className="flex-1 min-w-0 bg-surface border-2 border-line/70 dark:border-line/20 rounded-lg px-3 py-2
                                                                                    text-sm font-bold text-ink outline-none focus:border-[#21A0FF] transition-colors
                                                                                    placeholder:text-ink-subtle placeholder:font-medium"
                                                                            />
                                                                            <input
                                                                                type="text"
                                                                                dir="rtl"
                                                                                lang="ar"
                                                                                value={opt.ar_label}
                                                                                onChange={(e) =>
                                                                                    mutateOptions(attr.uid, q.uid, (opts) =>
                                                                                        opts.map((o) => (o.uid === opt.uid ? { ...o, ar_label: e.target.value } : o)),
                                                                                    )
                                                                                }
                                                                                placeholder={`خيار ${optIdx + 1}`}
                                                                                className="flex-1 min-w-0 bg-surface border-2 border-line/70 dark:border-line/20 rounded-lg px-3 py-2
                                                                                    text-sm font-bold text-ink text-right outline-none focus:border-[#21A0FF] transition-colors
                                                                                    placeholder:text-ink-subtle placeholder:font-medium"
                                                                            />
                                                                            <button
                                                                                onClick={() =>
                                                                                    mutateOptions(attr.uid, q.uid, (opts) => opts.filter((o) => o.uid !== opt.uid))
                                                                                }
                                                                                aria-label={`Remove option ${optIdx + 1}`}
                                                                                className="p-1 rounded text-ink-subtle hover:text-accent transition-colors shrink-0"
                                                                            >
                                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                <button
                                                                    onClick={() =>
                                                                        mutateOptions(attr.uid, q.uid, (opts) => [
                                                                            ...opts,
                                                                            { uid: nextUid('opt'), en_label: '', ar_label: '' },
                                                                        ])
                                                                    }
                                                                    className="mt-3 inline-flex items-center gap-1 text-xs font-black text-primary hover:text-primary-soft transition-colors"
                                                                >
                                                                    <Plus className="w-3.5 h-3.5" /> Add option
                                                                </button>
                                                            </div>
                                                        )}

                                                        {/* Scale configuration */}
                                                        {q.type === 'linear_scale' && (
                                                            <div className="rounded-xl bg-surface-sunken border border-line/50 dark:border-line/10 p-4">
                                                                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-ink-muted mb-3">
                                                                    Scale setup
                                                                </p>

                                                                <div className="mb-3">
                                                                    <span className={MICRO_LABEL}>Scale type</span>
                                                                    <SelectMenu<'linear' | 'bipolar' | 'jar'>
                                                                        value={q.scale_variant}
                                                                        options={SCALE_VARIANTS}
                                                                        onChange={(scale_variant) =>
                                                                            patchQuestion(attr.uid, q.uid, {
                                                                                scale_variant,
                                                                                // JAR is defined as a 1-5 scale.
                                                                                ...(scale_variant === 'jar'
                                                                                    ? { scale_min: 1, scale_max: 5 }
                                                                                    : {}),
                                                                            })
                                                                        }
                                                                        aria-label="Scale type"
                                                                    />
                                                                </div>

                                                                {q.scale_variant === 'jar' ? (
                                                                    /* JAR anchors are standardised, so there is nothing
                                                                       to configure — show what respondents will see
                                                                       rather than inputs that do nothing. */
                                                                    <div className="rounded-lg bg-surface border border-line/60 dark:border-line/15 p-3">
                                                                        <p className="text-[11px] font-bold text-ink-subtle mb-2.5">
                                                                            Fixed 5-point sensory scale — the midpoint is the ideal:
                                                                        </p>
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            {[
                                                                                { n: 1, en: 'Too Little', ar: 'قليل جداً' },
                                                                                { n: 3, en: 'Suitable', ar: 'مناسب', ideal: true },
                                                                                { n: 5, en: 'Too Much', ar: 'كثير جداً' },
                                                                            ].map((anchor) => (
                                                                                <div key={anchor.n} className="text-center flex-1 min-w-0">
                                                                                    <span
                                                                                        className={`inline-grid place-items-center w-7 h-7 rounded-full text-[11px] font-black mb-1 ${
                                                                                            anchor.ideal
                                                                                                ? 'bg-emerald-500 text-white'
                                                                                                : 'bg-surface-sunken text-ink-muted'
                                                                                        }`}
                                                                                    >
                                                                                        {anchor.n}
                                                                                    </span>
                                                                                    <p className="text-[11px] font-black text-ink truncate">{anchor.en}</p>
                                                                                    <p className="text-[11px] font-bold text-ink-subtle truncate" dir="rtl">{anchor.ar}</p>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                                                        <div>
                                                                            <span className={MICRO_LABEL}>Min</span>
                                                                            <input
                                                                                type="number"
                                                                                value={q.scale_min}
                                                                                onChange={(e) => patchQuestion(attr.uid, q.uid, { scale_min: Number(e.target.value) })}
                                                                                className={FIELD}
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <span className={MICRO_LABEL}>Max</span>
                                                                            <input
                                                                                type="number"
                                                                                value={q.scale_max}
                                                                                onChange={(e) => patchQuestion(attr.uid, q.uid, { scale_max: Number(e.target.value) })}
                                                                                className={FIELD}
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <span className={MICRO_LABEL}>Min label</span>
                                                                            <input
                                                                                type="text"
                                                                                value={q.min_label}
                                                                                onChange={(e) => patchQuestion(attr.uid, q.uid, { min_label: e.target.value })}
                                                                                placeholder="Poor"
                                                                                className={FIELD}
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <span className={MICRO_LABEL}>Max label</span>
                                                                            <input
                                                                                type="text"
                                                                                value={q.max_label}
                                                                                onChange={(e) => patchQuestion(attr.uid, q.uid, { max_label: e.target.value })}
                                                                                placeholder="Excellent"
                                                                                className={FIELD}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}

                                            <button
                                                onClick={() => addQuestion(attr.uid)}
                                                className="w-full py-3.5 rounded-2xl border-2 border-dashed border-line dark:border-line/25
                                                    text-[15px] font-black text-ink-muted hover:border-[#21A0FF] hover:text-[#21A0FF] hover:bg-[#21A0FF]/5
                                                    transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Plus className="w-4 h-4" />
                                                Add question to {attr.name_en.trim() || attr.name_ar.trim() || `attribute ${attrIdx + 1}`}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        <button
                            onClick={addAttribute}
                            className="w-full py-5 rounded-3xl border-2 border-dashed border-[#21A0FF]/40
                                text-base font-black text-[#255E91] dark:text-[#8ACAEC] hover:bg-[#21A0FF]/10 hover:border-[#21A0FF]
                                transition-colors flex items-center justify-center gap-2"
                        >
                            <Sparkles className="w-4 h-4" /> Add attribute
                        </button>
                    </div>

                    {/* Save bar — sticky inside the scroll container, so it never
                        has to guess the sidebar width the way a fixed bar does. */}
                    <div className="sticky bottom-0 mt-8 px-5 py-4 rounded-2xl
                        bg-surface/95 backdrop-blur-sm border border-line/70 dark:border-line/20 shadow-lg
                        flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-bold text-ink-muted">
                            {savedModuleId
                                ? 'Saving publishes a new version of this module.'
                                : 'You can keep editing after saving.'}
                        </p>
                        <button
                            onClick={save}
                            disabled={saving}
                            className={`px-8 py-3.5 rounded-2xl ${BRAND_GRADIENT}
                                text-white font-black text-base shadow-lg shadow-[#255E91]/30
                                hover:shadow-xl hover:shadow-[#21A0FF]/45 disabled:opacity-50 disabled:cursor-not-allowed
                                flex items-center gap-2 transition-all`}
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            {saving ? 'Saving…' : savedModuleId ? 'Update module' : 'Save & activate module'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
