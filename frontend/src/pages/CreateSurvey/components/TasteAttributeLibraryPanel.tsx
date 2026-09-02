import { useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    Check,
    ChevronDown,
    Info,
    Plus,
    Sparkles,
    Target,
    Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { masterQuestions } from '../../../services/api';
import {
    DEFAULT_MIDDLE_AR,
    buildCenteredLabelsAr,
    buildQuestionTextAr,
    defaultLowIntensifier,
} from '../../../utils/tasteAttributeFormula';

/**
 * Canonical taste-test attribute picker.
 *
 * Shows the real question and its per-point labels for every attribute, so the
 * analyst selects what a respondent will actually see rather than a bare
 * attribute name. Custom attributes are drafted through the same formula the
 * source document follows, then stay editable.
 */

const BRAND_GRADIENT = 'bg-gradient-to-r from-[#21A0FF] via-[#255E91] to-[#CD393B]';

interface LibraryQuestion {
    question_id: string;
    sub_attribute: string | null;
    text: string;
    question_type: string;
    scale_shape: 'centered' | 'hedonic' | 'monotonic' | 'bipolar' | 'open_end';
    scale_min: number;
    scale_max: number;
    point_labels: string[];
    point_labels_ar: string[];
    instruction?: string | null;
    status: 'fixed' | 'optional';
    condition?: string | null;
    ideal_point: number | null;
}

interface LibraryGroup {
    main_attribute: string;
    sub_attributes: LibraryQuestion[];
    overall: LibraryQuestion | null;
}

interface CustomSubDraft {
    /** Sub-attribute name, e.g. "Sweetness". */
    label: string;
    /** Poles used to generate the five answer labels. */
    low: string;
    high: string;
}

interface Props {
    /** `config.attributes` — main attribute -> selected sub-attribute labels. */
    selected: Record<string, string[]>;
    onToggleSub: (mainAttribute: string, subAttribute: string) => void;
    onAddCustom: (draft: {
        main_attribute: string;
        sub_attributes: Array<{ label: string; minLabel: string; maxLabel: string }>;
    }) => void;
    language?: 'en' | 'ar';
}

const SHAPE_BADGE: Record<LibraryQuestion['scale_shape'], { label: string; className: string }> = {
    centered: {
        label: 'Centered 1-5 · middle is ideal',
        className: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
    },
    hedonic: {
        label: 'Liking 1-10 · high is best',
        className: 'bg-[#21A0FF]/12 text-[#255E91] dark:text-[#8ACAEC]',
    },
    monotonic: {
        label: 'Ladder 1-5 · high is best',
        className: 'bg-[#21A0FF]/12 text-[#255E91] dark:text-[#8ACAEC]',
    },
    bipolar: { label: 'Bipolar', className: 'bg-surface-sunken text-ink-muted' },
    open_end: { label: 'Open end', className: 'bg-surface-sunken text-ink-muted' },
};

/** Row of per-point labels, with the ideal answer marked. */
function PointLabelPreview({ question }: { question: LibraryQuestion }) {
    if (question.point_labels.length === 0) return null;

    return (
        <div className="flex items-stretch gap-1 mt-2">
            {question.point_labels.map((label, idx) => {
                const value = question.scale_min + idx;
                const isIdeal = question.ideal_point === value;
                return (
                    <div key={value} className="flex-1 min-w-0 text-center">
                        <span
                            className={`inline-grid place-items-center w-5 h-5 rounded-full text-[10px] font-black mb-0.5 ${
                                isIdeal ? 'bg-emerald-500 text-white' : 'bg-surface-sunken text-ink-subtle'
                            }`}
                        >
                            {value}
                        </span>
                        <p
                            dir="rtl"
                            className={`text-[11px] leading-tight break-words ${
                                isIdeal ? 'font-black text-emerald-600 dark:text-emerald-400' : 'font-semibold text-ink-subtle'
                            }`}
                        >
                            {label}
                        </p>
                    </div>
                );
            })}
        </div>
    );
}


/** Name + low/high poles. The five answer labels are generated from these. */
function SubAttributeFields({
    name, low, high, onName, onLow, onHigh,
}: {
    name: string; low: string; high: string;
    onName: (v: string) => void; onLow: (v: string) => void; onHigh: (v: string) => void;
}) {
    const field =
        'w-full bg-surface border-2 border-line dark:border-line/25 rounded-xl px-3 py-2.5 ' +
        'text-sm font-bold text-ink text-right outline-none focus:border-[#21A0FF] transition-colors';

    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input dir="rtl" value={name} onChange={(e) => onName(e.target.value)}
                   placeholder="اسم الخاصية الفرعية" aria-label="Sub-attribute name" className={field} />
            <input dir="rtl" value={low} onChange={(e) => onLow(e.target.value)}
                   placeholder="الطرف الأدنى" aria-label="Low pole" className={field} />
            <input dir="rtl" value={high} onChange={(e) => onHigh(e.target.value)}
                   placeholder="الطرف الأعلى" aria-label="High pole" className={field} />
        </div>
    );
}

export default function TasteAttributeLibraryPanel({
    selected,
    onToggleSub,
    onAddCustom,
    language = 'ar',
}: Props) {
    const [groups, setGroups] = useState<LibraryGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [open, setOpen] = useState<Record<string, boolean>>({});

    // Custom attribute draft
    const [showCustom, setShowCustom] = useState(false);
    const [customName, setCustomName] = useState('');
    const [customLow, setCustomLow] = useState('');
    const [customHigh, setCustomHigh] = useState('');
    const [customMiddle, setCustomMiddle] = useState(DEFAULT_MIDDLE_AR);
    // Sub-attributes queued onto the attribute being drafted.
    const [customSubs, setCustomSubs] = useState<CustomSubDraft[]>([]);

    // Which library attribute is having a custom sub-attribute added to it.
    const [subTarget, setSubTarget] = useState<string | null>(null);
    const [subName, setSubName] = useState('');
    const [subLow, setSubLow] = useState('');
    const [subHigh, setSubHigh] = useState('');

    useEffect(() => {
        let cancelled = false;
        masterQuestions
            .getTasteTestLibrary(language)
            .then((data: { groups: LibraryGroup[] }) => {
                if (cancelled) return;
                setGroups(data.groups ?? []);
                // Open the first group so the panel is never a wall of collapsed rows.
                if (data.groups?.[0]) setOpen({ [data.groups[0].main_attribute]: true });
            })
            .catch(() => !cancelled && setFailed(true))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [language]);

    const selectedCount = useMemo(
        () => Object.values(selected).reduce((n, subs) => n + (subs?.length ?? 0), 0),
        [selected],
    );

    const previewLabels = useMemo(() => {
        if (!customLow.trim() || !customHigh.trim()) return [];
        return buildCenteredLabelsAr({
            attributeAr: customName,
            lowAr: customLow,
            highAr: customHigh,
            middleAr: customMiddle,
        });
    }, [customName, customLow, customHigh, customMiddle]);

    /** Turn a name + poles into the {label, minLabel, maxLabel} the API expects. */
    const toApiSub = (label: string, low: string, high: string) => {
        const labels = buildCenteredLabelsAr({
            attributeAr: label,
            lowAr: low,
            highAr: high,
            middleAr: customMiddle,
        });
        return { label: label.trim(), minLabel: labels[0], maxLabel: labels[4] };
    };

    const queueSub = () => {
        if (!subName.trim() || !subLow.trim() || !subHigh.trim()) {
            toast.error('Enter the sub-attribute and both poles.');
            return;
        }
        setCustomSubs((prev) => [
            ...prev,
            { label: subName.trim(), low: subLow.trim(), high: subHigh.trim() },
        ]);
        setSubName('');
        setSubLow('');
        setSubHigh('');
    };

    const submitCustom = () => {
        if (!customName.trim() || !customLow.trim() || !customHigh.trim()) {
            toast.error('Enter the attribute and both poles.');
            return;
        }

        // The attribute always measures itself; queued sub-attributes are extra
        // dimensions beneath it, each becoming its own question.
        const subs = [
            toApiSub(customName, customLow, customHigh),
            ...customSubs.map((sub) => toApiSub(sub.label, sub.low, sub.high)),
        ];

        onAddCustom({ main_attribute: customName.trim(), sub_attributes: subs });

        const extra = customSubs.length
            ? ` with ${customSubs.length} sub-attribute${customSubs.length === 1 ? '' : 's'}`
            : '';
        toast.success(`Added "${customName.trim()}"${extra} — editable below.`);
        setCustomName('');
        setCustomLow('');
        setCustomHigh('');
        setCustomMiddle(DEFAULT_MIDDLE_AR);
        setCustomSubs([]);
        setShowCustom(false);
    };

    /** Attach a custom sub-attribute to an existing LIBRARY attribute. */
    const submitSubForLibrary = (mainAttribute: string) => {
        if (!subName.trim() || !subLow.trim() || !subHigh.trim()) {
            toast.error('Enter the sub-attribute and both poles.');
            return;
        }

        // Reusing the library attribute's own name merges the two rather than
        // creating a competing attribute.
        onAddCustom({
            main_attribute: mainAttribute,
            sub_attributes: [toApiSub(subName, subLow, subHigh)],
        });

        toast.success(`Added "${subName.trim()}" under ${mainAttribute}.`);
        setSubName('');
        setSubLow('');
        setSubHigh('');
        setSubTarget(null);
    };

    if (loading) {
        return (
            <div className="rounded-[2rem] border-2 border-line/70 dark:border-line/15 bg-surface p-6">
                <p className="text-sm font-bold text-ink-subtle">Loading attribute library…</p>
            </div>
        );
    }

    if (failed) {
        return (
            <div className="rounded-[2rem] border-2 border-amber-500/40 bg-amber-500/5 p-6 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                    <p className="text-sm font-black text-ink">Attribute library unavailable</p>
                    <p className="text-xs font-semibold text-ink-subtle mt-1">
                        The API did not return the library. You can still add attributes manually below.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-[2rem] border-2 border-line/70 dark:border-line/15 bg-surface overflow-hidden">
            <div className={`h-1.5 ${BRAND_GRADIENT}`} />

            <div className="p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-lg font-black text-ink flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-[#21A0FF]" />
                            Taste Test Attribute Library
                        </h3>
                        <p className="text-sm font-semibold text-ink-subtle mt-0.5">
                            Pick the attributes to measure. Each shows the exact question and answer
                            labels the respondent will see.
                        </p>
                    </div>
                    <span className="px-3 py-1.5 rounded-full bg-[#21A0FF]/12 text-[#255E91] dark:text-[#8ACAEC] text-xs font-black shrink-0">
                        {selectedCount} selected
                    </span>
                </div>

                {/* Groups */}
                <div className="space-y-3">
                    {groups.map((group) => {
                        const isOpen = open[group.main_attribute];
                        const chosen = selected[group.main_attribute] ?? [];

                        return (
                            <div
                                key={group.main_attribute}
                                className="rounded-2xl border-2 border-line/70 dark:border-line/15 overflow-hidden"
                            >
                                <button
                                    type="button"
                                    onClick={() =>
                                        setOpen((o) => ({ ...o, [group.main_attribute]: !isOpen }))
                                    }
                                    className="w-full flex items-center gap-3 p-4 bg-[#21A0FF]/[0.05] hover:bg-[#21A0FF]/[0.09] transition-colors text-left"
                                >
                                    <ChevronDown
                                        className={`w-4 h-4 shrink-0 text-ink-subtle transition-transform ${isOpen ? '' : '-rotate-90'}`}
                                    />
                                    <span className="flex-1 min-w-0 text-base font-black text-ink truncate">
                                        {group.main_attribute}
                                    </span>
                                    {chosen.length > 0 && (
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[11px] font-black shrink-0">
                                            {chosen.length}
                                        </span>
                                    )}
                                    <span className="text-[11px] font-bold text-ink-subtle shrink-0">
                                        {group.sub_attributes.length} question
                                        {group.sub_attributes.length === 1 ? '' : 's'}
                                    </span>
                                </button>

                                {isOpen && (
                                    <div className="p-4 space-y-3 bg-surface">
                                        {group.sub_attributes.map((question) => {
                                            const label = question.sub_attribute ?? question.question_id;
                                            const isSelected = chosen.includes(label);
                                            const badge = SHAPE_BADGE[question.scale_shape];

                                            return (
                                                <button
                                                    key={question.question_id}
                                                    type="button"
                                                    onClick={() => onToggleSub(group.main_attribute, label)}
                                                    className={`w-full text-left rounded-xl border-2 p-3.5 transition-all ${
                                                        isSelected
                                                            ? 'border-[#21A0FF] bg-[#21A0FF]/[0.06]'
                                                            : 'border-line/60 dark:border-line/15 hover:border-[#21A0FF]/50'
                                                    }`}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <span
                                                            className={`w-5 h-5 mt-0.5 shrink-0 rounded-md border-2 grid place-items-center transition-colors ${
                                                                isSelected
                                                                    ? 'bg-[#21A0FF] border-[#21A0FF] text-white'
                                                                    : 'border-line dark:border-line/40'
                                                            }`}
                                                        >
                                                            {isSelected && <Check className="w-3 h-3" />}
                                                        </span>

                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="text-sm font-black text-ink">{label}</span>
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${badge.className}`}>
                                                                    {badge.label}
                                                                </span>
                                                                {/* "Conditional" is about research advice (only ask when
                                                                    the characteristic is natural), not about `status`,
                                                                    which is the platform's inclusion rule. */}
                                                                {question.condition && (
                                                                    <span className="px-2 py-0.5 rounded-full bg-[#CD393B]/12 text-[#CD393B] text-[10px] font-black">
                                                                        conditional
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <p dir="rtl" className="text-sm font-bold text-ink mt-1.5 text-right">
                                                                {question.text}
                                                            </p>

                                                            <PointLabelPreview question={question} />

                                                            {question.condition && (
                                                                <p className="flex items-start gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400 mt-2">
                                                                    <Info className="w-3 h-3 mt-0.5 shrink-0" />
                                                                    <span dir="rtl">{question.condition}</span>
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}

                                        {/* Extend a library attribute with the analyst's own
                                            dimension. It is stored under this same attribute
                                            name so the two merge instead of competing. */}
                                        {subTarget === group.main_attribute ? (
                                            <div className="rounded-xl border-2 border-[#21A0FF]/40 bg-[#21A0FF]/[0.04] p-3.5 space-y-2.5">
                                                <p className="text-[11px] font-black uppercase tracking-wider text-ink-muted">
                                                    New sub-attribute under {group.main_attribute}
                                                </p>
                                                <SubAttributeFields
                                                    name={subName} low={subLow} high={subHigh}
                                                    onName={setSubName} onLow={setSubLow} onHigh={setSubHigh}
                                                />
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => submitSubForLibrary(group.main_attribute)}
                                                        className="flex-1 py-2.5 rounded-xl bg-[#21A0FF] text-white text-xs font-black hover:bg-[#255E91] transition-colors"
                                                    >
                                                        Add sub-attribute
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSubTarget(null)}
                                                        className="px-4 py-2.5 rounded-xl text-xs font-black text-ink-muted hover:text-ink hover:bg-surface-sunken transition-colors"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => { setSubTarget(group.main_attribute); setSubName(''); setSubLow(''); setSubHigh(''); }}
                                                className="w-full py-2.5 rounded-xl border-2 border-dashed border-line dark:border-line/25 text-xs font-black text-ink-muted hover:border-[#21A0FF] hover:text-[#21A0FF] transition-colors flex items-center justify-center gap-1.5"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                                Add sub-attribute to {group.main_attribute}
                                            </button>
                                        )}

                                        {group.overall && (
                                            <div className="rounded-xl border-2 border-dashed border-[#21A0FF]/30 p-3.5 bg-[#21A0FF]/[0.03]">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Target className="w-3.5 h-3.5 text-[#255E91] dark:text-[#8ACAEC]" />
                                                    <span className="text-xs font-black uppercase tracking-wider text-ink-muted">
                                                        Always included
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${SHAPE_BADGE.hedonic.className}`}>
                                                        {SHAPE_BADGE.hedonic.label}
                                                    </span>
                                                </div>
                                                <p dir="rtl" className="text-sm font-bold text-ink mt-1.5 text-right">
                                                    {group.overall.text}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Custom attribute */}
                <div className="rounded-2xl border-2 border-dashed border-[#CD393B]/35 overflow-hidden">
                    <button
                        type="button"
                        onClick={() => setShowCustom((s) => !s)}
                        className="w-full flex items-center gap-3 p-4 hover:bg-[#CD393B]/[0.05] transition-colors text-left"
                    >
                        <span className="w-8 h-8 shrink-0 rounded-xl bg-gradient-to-br from-[#255E91] to-[#CD393B] grid place-items-center text-white">
                            <Wand2 className="w-4 h-4" />
                        </span>
                        <span className="flex-1 min-w-0">
                            <span className="block text-sm font-black text-ink">Add your own attribute</span>
                            <span className="block text-xs font-semibold text-ink-subtle">
                                We draft the question and its five labels for you
                            </span>
                        </span>
                        <ChevronDown className={`w-4 h-4 shrink-0 text-ink-subtle transition-transform ${showCustom ? '' : '-rotate-90'}`} />
                    </button>

                    {showCustom && (
                        <div className="p-4 pt-0 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-ink-muted mb-1.5">
                                        Attribute
                                    </label>
                                    <input
                                        dir="rtl"
                                        value={customName}
                                        onChange={(e) => setCustomName(e.target.value)}
                                        placeholder="الحموضة"
                                        className="w-full bg-surface border-2 border-line dark:border-line/25 rounded-xl px-3 py-2.5 text-sm font-bold text-ink text-right outline-none focus:border-[#21A0FF] transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-ink-muted mb-1.5">
                                        Low pole
                                    </label>
                                    <input
                                        dir="rtl"
                                        value={customLow}
                                        onChange={(e) => setCustomLow(e.target.value)}
                                        placeholder="مش حامض"
                                        className="w-full bg-surface border-2 border-line dark:border-line/25 rounded-xl px-3 py-2.5 text-sm font-bold text-ink text-right outline-none focus:border-[#21A0FF] transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-ink-muted mb-1.5">
                                        High pole
                                    </label>
                                    <input
                                        dir="rtl"
                                        value={customHigh}
                                        onChange={(e) => setCustomHigh(e.target.value)}
                                        placeholder="حامض"
                                        className="w-full bg-surface border-2 border-line dark:border-line/25 rounded-xl px-3 py-2.5 text-sm font-bold text-ink text-right outline-none focus:border-[#21A0FF] transition-colors"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-wider text-ink-muted mb-1.5">
                                    Middle label — the ideal answer
                                </label>
                                <input
                                    dir="rtl"
                                    value={customMiddle}
                                    onChange={(e) => setCustomMiddle(e.target.value)}
                                    className="w-full bg-surface border-2 border-line dark:border-line/25 rounded-xl px-3 py-2.5 text-sm font-bold text-ink text-right outline-none focus:border-[#21A0FF] transition-colors"
                                />
                            </div>

                            {previewLabels.length === 5 && (
                                <div className="rounded-xl bg-surface-sunken border border-line/50 dark:border-line/15 p-3.5">
                                    <p className="text-[11px] font-black uppercase tracking-wider text-ink-muted mb-2">
                                        Generated draft
                                    </p>
                                    {customName.trim() && (
                                        <p dir="rtl" className="text-sm font-bold text-ink text-right mb-2">
                                            {buildQuestionTextAr(customName)}
                                        </p>
                                    )}
                                    <div className="flex items-stretch gap-1">
                                        {previewLabels.map((label, idx) => (
                                            <div key={idx} className="flex-1 min-w-0 text-center">
                                                <span
                                                    className={`inline-grid place-items-center w-5 h-5 rounded-full text-[10px] font-black mb-0.5 ${
                                                        idx === 2 ? 'bg-emerald-500 text-white' : 'bg-surface text-ink-subtle'
                                                    }`}
                                                >
                                                    {idx + 1}
                                                </span>
                                                <p
                                                    dir="rtl"
                                                    className={`text-[11px] leading-tight break-words ${
                                                        idx === 2
                                                            ? 'font-black text-emerald-600 dark:text-emerald-400'
                                                            : 'font-semibold text-ink-subtle'
                                                    }`}
                                                >
                                                    {label}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-[11px] font-semibold text-ink-subtle mt-2.5">
                                        Point 1 uses <span className="font-black">{defaultLowIntensifier(customLow)}</span>{' '}
                                        because the low pole reads as a{' '}
                                        {defaultLowIntensifier(customLow) === 'خالص' ? 'negation' : 'bipolar adjective'}.
                                        Everything here stays editable after adding.
                                    </p>
                                </div>
                            )}

                            {/* Optional extra dimensions beneath the new attribute. */}
                            <div className="rounded-xl bg-surface-sunken border border-line/50 dark:border-line/15 p-3.5 space-y-2.5">
                                <p className="text-[11px] font-black uppercase tracking-wider text-ink-muted">
                                    Sub-attributes <span className="normal-case tracking-normal text-ink-subtle">(optional)</span>
                                </p>

                                {customSubs.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {customSubs.map((sub, idx) => (
                                            <span key={`${sub.label}-${idx}`}
                                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface border border-line/60 dark:border-line/20 text-xs font-black text-ink">
                                                {sub.label}
                                                <button
                                                    type="button"
                                                    onClick={() => setCustomSubs((prev) => prev.filter((_, i) => i !== idx))}
                                                    aria-label={`Remove ${sub.label}`}
                                                    className="text-ink-subtle hover:text-[#CD393B] transition-colors"
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}

                                <SubAttributeFields
                                    name={subName} low={subLow} high={subHigh}
                                    onName={setSubName} onLow={setSubLow} onHigh={setSubHigh}
                                />
                                <button
                                    type="button"
                                    onClick={queueSub}
                                    className="inline-flex items-center gap-1.5 text-xs font-black text-[#21A0FF] hover:text-[#255E91] transition-colors"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Add this sub-attribute
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={submitCustom}
                                className={`w-full py-3 rounded-xl ${BRAND_GRADIENT} text-white font-black text-sm shadow-lg shadow-[#255E91]/25 hover:shadow-xl hover:shadow-[#CD393B]/40 transition-all flex items-center justify-center gap-2`}
                            >
                                <Plus className="w-4 h-4" /> Add attribute
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
