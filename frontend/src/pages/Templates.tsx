import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { templates } from '../services/api';
import {
    History,
    Trash2,
    Edit3,
    Layers,
    Sparkles,
    X,
    RotateCcw,
    CheckCircle2,
    Upload,
    Plus,
    ChevronDown,
    GripVertical,
    Users
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import QuestionBlock from '../components/TemplateEditor/QuestionBlock';
import TasteTestConfigModal from '../components/TasteTestConfigModal';
import { generateTasteTestModuleSchema } from '../utils/tasteTestGenerator';
import { TasteTestConfig } from '../types/tasteTest';
import OnboardingTooltip from '../components/OnboardingTooltip';

interface TemplateState {
    _id?: string;
    name: string;
    type: string;
    layer1_questions: any[];
    layer1_structure: { sections: any[] };
    layer2_structure: { sections: any[] };
    layer3_structure?: { sections: any[] };
    layer4_structure?: { sections: any[] };
    layer5_structure?: { sections: any[] };
    layer6_structure?: { sections: any[] };
    template_type?: 'standard' | 'taste_test';
    taste_test_config?: TasteTestConfig | null;
}

export default function Templates() {
    const [templateList, setTemplateList] = useState([]);
    const [history, setHistory] = useState<any[]>([]);
    const [showHistoryName, setShowHistoryName] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [activeLayer, setActiveLayer] = useState<number>(1);
    const [currentTemplate, setCurrentTemplate] = useState<TemplateState>({
        name: '',
        type: 'standard',
        template_type: 'standard',
        taste_test_config: null,
        layer1_questions: [],
        layer1_structure: {
            sections: [
                {
                    title: 'Respondent Information',
                    questions: [
                        { id: 'name', label: 'Full Name', type: 'text', required: true },
                        { id: 'age_auto', label: 'Age Range', type: 'mcq', options: ['12-18', '19-25', '26-40', '41-60'], required: true },
                        { id: 'gender_auto', label: 'Gender', type: 'mcq', options: ['Male', 'Female'], required: true },
                        { id: 'area', label: 'Area', type: 'text', required: true },
                        { id: 'email', label: 'Email Address', type: 'email', required: true }
                    ]
                }
            ]
        },
        layer2_structure: { sections: [] },
        layer3_structure: { sections: [] },
        layer4_structure: { sections: [] },
        layer5_structure: { sections: [] },
        layer6_structure: { sections: [] }
    });

    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

    const fetchTemplates = async () => {
        setLoading(true);
        const data = await templates.list();
        setTemplateList(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchTemplates();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const flatL1 = (currentTemplate as any).layer1_structure?.sections?.flatMap((s: any) => s.questions || []) || [];
        const templateToSave = {
            ...currentTemplate,
            layer1_questions: flatL1,
            taste_test_config: currentTemplate.taste_test_config || null,
            template_type: currentTemplate.template_type || 'standard',
            // Explicitly include all layers
            layer1_structure: currentTemplate.layer1_structure,
            layer2_structure: currentTemplate.layer2_structure,
            layer3_structure: currentTemplate.layer3_structure || { sections: [] },
            layer4_structure: currentTemplate.layer4_structure || { sections: [] },
            layer5_structure: currentTemplate.layer5_structure || { sections: [] },
            layer6_structure: currentTemplate.layer6_structure || { sections: [] }
        };

        if (isEditing && (currentTemplate as any)._id) {
            await templates.update((currentTemplate as any)._id, templateToSave);
        } else {
            await templates.create(templateToSave);
        }
        setIsEditing(false);
        setCurrentTemplate({
            name: '',
            type: 'standard',
            template_type: 'standard',
            taste_test_config: null,
            layer1_questions: [],
            layer1_structure: { sections: [] },
            layer2_structure: { sections: [] },
            layer3_structure: { sections: [] },
            layer4_structure: { sections: [] },
            layer5_structure: { sections: [] },
            layer6_structure: { sections: [] }
        });
        fetchTemplates();
    };

    const handleEdit = (template: any) => {
        // Migration helper: If layer1_structure is empty but layer1_questions has data
        let migratedTemplate = { ...template };
        if ((!template.layer1_structure || !template.layer1_structure.sections || template.layer1_structure.sections.length === 0) && template.layer1_questions?.length > 0) {
            migratedTemplate.layer1_structure = {
                sections: [{
                    title: 'Initial Screening',
                    questions: template.layer1_questions
                }]
            };
        }

        // Ensure all structures exist with sections array
        const layers = ['layer1_structure', 'layer2_structure', 'layer3_structure', 'layer4_structure', 'layer5_structure', 'layer6_structure'];
        layers.forEach(layerKey => {
            if (!migratedTemplate[layerKey] || !migratedTemplate[layerKey].sections) {
                migratedTemplate[layerKey] = { sections: [] };
            }
        });

        setCurrentTemplate(migratedTemplate);
        setIsEditing(true);
        setActiveLayer(1);
    };

    const handleDelete = async (id: string) => {
        if (window.confirm('Archive this template schema?')) {
            await templates.delete(id);
            fetchTemplates();
        }
    };

    const handleViewHistory = async (name: string) => {
        const data = await templates.getHistory(name);
        setHistory(data);
        setShowHistoryName(name);
    };

    const handleRollback = async (id: string) => {
        if (window.confirm('Rollback to this version? A new version will be committed.')) {
            await templates.rollback(id);
            fetchTemplates();
            if (showHistoryName) handleViewHistory(showHistoryName);
        }
    };

    const handleTasteTestConfirm = async (config: TasteTestConfig) => {
        try {
            const attrKeys = Object.keys(config.attributes || {});
            const response = await fetch(`${import.meta.env.VITE_API_URL}/api/questions/taste-test?category=${encodeURIComponent(config.category)}&attributes=${encodeURIComponent(attrKeys.join(','))}`);
            if (!response.ok) throw new Error('Failed to fetch taste test questions');
            const dbQuestions = await response.json();

            const schema = generateTasteTestModuleSchema(config, dbQuestions);
            setCurrentTemplate({
                ...currentTemplate,
                name: `${config.category} Taste Test`,
                template_type: 'taste_test',
                taste_test_config: config,
                layer1_structure: schema.layer1_structure,
                layer2_structure: schema.layer2_structure
            });
            setIsConfigModalOpen(false);
            setIsEditing(true);
            setActiveLayer(1);
        } catch (error) {
            console.error('Error confirming taste test:', error);
            alert('Error generating schema. Please try again.');
        }
    };

    const handleRegenerate = async () => {
        if (!currentTemplate.taste_test_config) return;
        if (window.confirm('This will replace all dynamic questions based on current config. Continue?')) {
            try {
                const config = currentTemplate.taste_test_config;
                const attrKeys = Object.keys(config.attributes || {});
                const response = await fetch(`${import.meta.env.VITE_API_URL}/api/questions/taste-test?category=${encodeURIComponent(config.category)}&attributes=${encodeURIComponent(attrKeys.join(','))}`);
                if (!response.ok) throw new Error('Failed to fetch taste test questions');
                const dbQuestions = await response.json();

                const schema = generateTasteTestModuleSchema(config, dbQuestions);
                setCurrentTemplate(prev => ({
                    ...prev,
                    layer1_structure: schema.layer1_structure,
                    layer2_structure: schema.layer2_structure
                }));
            } catch (error) {
                console.error('Error regenerating schema:', error);
                alert('Error regenerating schema. Please try again.');
            }
        }
    };

    // Loading and empty states managed in render

    const renderLayerEditor = (layer: number) => {
        const structureKey = `layer${layer}_structure` as keyof TemplateState;
        const layerData = currentTemplate[structureKey] as any;
        const sections = layerData?.sections || [];

        const layerConfigs: Record<number, any> = {
            1: {
                accent: 'text-primary-soft dark:text-primary-soft',
                bg: 'bg-primary/10 dark:bg-primary/20',
                border: 'border-primary/20 dark:border-primary/30',
                title: 'Screening Phase',
                sub: '(Layer 1)'
            },
            2: {
                accent: 'text-brand-accent dark:text-brand-accent',
                bg: 'bg-brand-accent/10 dark:bg-brand-accent/20',
                border: 'border-brand-accent/20 dark:border-brand-accent/30',
                title: 'Evaluation Modules',
                sub: '(Layer 2)'
            },
            3: {
                accent: 'text-emerald-500 dark:text-emerald-400',
                bg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
                border: 'border-emerald-500/20 dark:border-emerald-500/30',
                title: 'Deep Dive Engine',
                sub: '(Layer 3)'
            },
            4: {
                accent: 'text-orange-500 dark:text-orange-400',
                bg: 'bg-orange-500/10 dark:bg-orange-500/20',
                border: 'border-orange-500/20 dark:border-orange-500/30',
                title: 'Purchase Intent',
                sub: '(Layer 4)'
            },
            5: {
                accent: 'text-violet-500 dark:text-violet-400',
                bg: 'bg-violet-500/10 dark:bg-violet-500/20',
                border: 'border-violet-500/20 dark:border-violet-500/30',
                title: 'Behavioral Insights',
                sub: '(Layer 5)'
            },
            6: {
                accent: 'text-rose-500 dark:text-rose-400',
                bg: 'bg-rose-500/10 dark:bg-rose-500/20',
                border: 'border-rose-500/20 dark:border-rose-500/30',
                title: 'Custom Modules',
                sub: '(Layer 6)'
            }
        };

        const config = layerConfigs[layer] || layerConfigs[1];

        return (
            <div className="space-y-12">
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center ${config.accent} font-black border ${config.border} shadow-sm transition-all`}>
                            {layer}
                        </div>
                        <h3 className="text-xl font-display font-black text-ink uppercase tracking-wider transition-colors">
                            {config.title} <span className="text-ink-subtle text-sm ml-2 font-bold">{config.sub}</span>
                        </h3>
                    </div>
                </div>

                {sections.map((section: any, sIdx: number) => (
                    <motion.div
                        layout
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={sIdx}
                        className="space-y-8 bg-surface rounded-[3rem] p-12 border border-line/80 dark:border-line/10 relative group/section shadow-xl transition-colors"
                    >
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex-1 flex items-center gap-6">
                                <div className={`w-12 h-12 rounded-2xl ${config.bg} flex items-center justify-center ${config.accent} border ${config.border} shadow-inner group-hover/section:scale-110 transition-transform`}>
                                    <Layers className="w-6 h-6" />
                                </div>
                                <div className="flex-1 space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-subtle ml-1">Module Area</label>
                                    <input
                                        type="text"
                                        value={section.title}
                                        onChange={(e) => {
                                            const newSections = [...layerData.sections];
                                            newSections[sIdx].title = e.target.value;
                                            setCurrentTemplate({ ...currentTemplate, [structureKey]: { ...layerData, sections: newSections } });
                                        }}
                                        className="bg-transparent text-3xl font-display font-black text-ink border-b-2 border-transparent focus:border-primary outline-none pb-2 flex-1 w-full transition-all placeholder:text-slate-100 dark:placeholder:text-slate-800"
                                        placeholder="Name this section..."
                                    />
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const newSections = sections.filter((_: any, idx: number) => idx !== sIdx);
                                    setCurrentTemplate({ ...currentTemplate, [structureKey]: { ...layerData, sections: newSections } });
                                }}
                                className="p-3 text-ink-muted hover:text-red-400 dark:hover:text-red-400 transition-colors hover:bg-red-400/5 dark:hover:bg-red-400/10 rounded-xl"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <Reorder.Group
                                axis="y"
                                values={section.questions || []}
                                onReorder={(newQuestions) => {
                                    const newSections = sections.map((s: any, idx: number) => {
                                        if (idx !== sIdx) return s;
                                        return { ...s, questions: newQuestions };
                                    });
                                    setCurrentTemplate({ ...currentTemplate, [structureKey]: { ...layerData, sections: newSections } });
                                }}
                                className="space-y-4"
                            >
                                {(section.questions || []).map((q: any, qIdx: number) => (
                                    <Reorder.Item key={q.id || qIdx} value={q} className="relative group/reorder">
                                        <div className="absolute -left-10 top-1/2 -translate-y-1/2 opacity-0 group-hover/reorder:opacity-100 cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 hover:text-primary-soft transition-all">
                                            <GripVertical className="w-5 h-5" />
                                        </div>
                                        <QuestionBlock
                                            question={q}
                                            showGatekeeper={layer === 1}
                                            onUpdate={(updated) => {
                                                const newSections = sections.map((s: any, idx: number) => {
                                                    if (idx !== sIdx) return s;
                                                    const newQs = [...(s.questions || [])];
                                                    newQs[qIdx] = updated;
                                                    return { ...s, questions: newQs };
                                                });
                                                setCurrentTemplate({ ...currentTemplate, [structureKey]: { ...layerData, sections: newSections } });
                                            }}
                                            onDelete={() => {
                                                const newQuestions = (section.questions || []).filter((_: any, idx: number) => idx !== qIdx);
                                                const newSections = sections.map((s: any, idx: number) => idx === sIdx ? { ...s, questions: newQuestions } : s);
                                                setCurrentTemplate({ ...currentTemplate, [structureKey]: { ...layerData, sections: newSections } });
                                            }}
                                        />
                                    </Reorder.Item>
                                ))}
                            </Reorder.Group>
                        </div>

                        <motion.button
                            layout
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                const newSections = sections.map((s: any, idx: number) => {
                                    if (idx !== sIdx) return s;
                                    return {
                                        ...s,
                                        questions: [...(s.questions || []), {
                                            id: `${layer === 1 ? 'S' : 'Q'}${s.questions?.length + 1}`,
                                            text: '',
                                            label: '',
                                            options: layer === 1 ? ['Yes', 'No'] : ['1', '2', '3', '4', '5'],
                                            type: layer === 1 ? 'mcq' : 'scale'
                                        }]
                                    };
                                });
                                setCurrentTemplate({ ...currentTemplate, [structureKey]: { ...layerData, sections: newSections } });
                            }}
                            className={`w-full py-6 rounded-2xl border-2 border-dashed border-line/80 dark:border-line/10 hover:border-slate-300 dark:hover:border-slate-600 transition-all text-[10px] font-black uppercase tracking-widest text-ink-subtle hover:text-slate-800 dark:hover:text-slate-300 flex items-center justify-center gap-3 group/addQ`}
                        >
                            <div className="p-2 rounded-lg bg-surface-raised group-hover/addQ:bg-white dark:group-hover/addQ:bg-slate-700 transition-colors">
                                <Plus className="w-4 h-4" />
                            </div>
                            Append New Logic Probe
                        </motion.button>
                    </motion.div>
                ))}

                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        const curStruct = (currentTemplate as any)[structureKey];
                        const curSections = curStruct?.sections || [];
                        setCurrentTemplate({
                            ...currentTemplate,
                            [structureKey]: {
                                ...curStruct,
                                sections: [...curSections, { title: 'New Module', questions: [] }]
                            }
                        });
                    }}
                    className={`w-full py-16 rounded-[4rem] bg-surface-raised border-2 border-dashed border-line/80 dark:border-line/10 hover:border-slate-400 dark:hover:border-slate-600 transition-all flex flex-col items-center justify-center gap-4 text-ink-muted hover:text-slate-900 dark:hover:text-white group/newS shadow-lg`}
                >
                    <div className={`p-5 rounded-[2rem] ${config.newSectionIconBg} group-hover/newS:scale-110 group-hover/newS:rotate-90 transition-all duration-500`}>
                        <Plus className="w-8 h-8" />
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="font-black tracking-[0.3em] uppercase text-[10px] mb-1">Architectural expansion</span>
                        <span className="text-xl font-display font-black opacity-80 group-hover/newS:opacity-100 dark:text-white/80">Add New Module</span>
                    </div>
                </button>
            </div>
        );
    };

    return (
        <div className="space-y-10">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-display font-extrabold tracking-tight text-ink transition-colors">
                        Templates
                    </h1>
                    <p className="mt-2 text-ink-muted max-w-xl font-medium">
                        Design and version-control your multi-layered survey schemas.
                    </p>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={() => {
                            setIsEditing(true);
                            setCurrentTemplate({
                                name: '',
                                type: 'standard',
                                template_type: 'standard',
                                taste_test_config: null,
                                layer1_questions: [],
                                layer1_structure: {
                                    sections: [
                                        {
                                            title: 'Respondent Information',
                                            questions: [
                                                { id: 'name', label: 'Full Name', type: 'text', required: true },
                                                { id: 'age_auto', label: 'Age Range', type: 'mcq', options: ['12-18', '19-25', '26-40', '41-60'], required: true },
                                                { id: 'gender_auto', label: 'Gender', type: 'mcq', options: ['Male', 'Female'], required: true },
                                                { id: 'area', label: 'Area', type: 'text', required: true },
                                                { id: 'email', label: 'Email Address', type: 'email', required: true }
                                            ]
                                        }
                                    ]
                                },
                                layer2_structure: { sections: [] }
                            });
                            setActiveLayer(1);
                        }}
                        className="btn-premium flex items-center gap-2 group shadow-lg shadow-brand-accent/20"
                    >
                        Add Template
                    </button>

                    <div className="relative">
                        <input
                            type="file"
                            id="template-upload"
                            className="hidden"
                            accept=".xlsx,.xls,.csv"
                            onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    try {
                                        setLoading(true);
                                        await (templates as any).upload(file);
                                        const data = await templates.list();
                                        setTemplateList(data);
                                    } catch (err) {
                                        console.error('Upload failed:', err);
                                    } finally {
                                        setLoading(false);
                                    }
                                }
                            }}
                        />
                        <label
                            htmlFor="template-upload"
                            className="btn-premium flex items-center gap-2 group shadow-lg shadow-emerald-500/20 bg-emerald-600 dark:bg-emerald-600 hover:bg-emerald-500 dark:hover:bg-emerald-500 cursor-pointer border-none"
                        >
                            <Upload className="w-5 h-5" />
                            Add Excel Sheet
                        </label>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
                {/* Templates Grid */}
                <div className="xl:col-span-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {loading && templateList.length === 0 ? (
                            [1, 2, 3, 4, 5, 6].map(i => (
                                <div key={i} className="h-64 bg-slate-200/50 dark:bg-slate-800/50 rounded-3xl animate-pulse w-full"></div>
                            ))
                        ) : templateList.length === 0 ? (
                            <div className="md:col-span-2 lg:col-span-3 py-24 text-center flex flex-col items-center justify-center">
                                <div className="relative mb-6 group cursor-default">
                                    <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl group-hover:blur-2xl transition-all duration-500"></div>
                                    <div className="w-20 h-20 bg-surface rounded-full flex items-center justify-center border border-white/80 dark:border-slate-800 shadow-xl relative z-10 group-hover:-translate-y-1 transition-transform duration-500">
                                        <Layers className="w-8 h-8 text-slate-300 dark:text-slate-600" strokeWidth={1.5} />
                                    </div>
                                </div>
                                <h3 className="text-xl font-display font-black text-ink mb-2">No active schemas</h3>
                                <p className="text-ink-muted font-medium mb-8 max-w-sm">
                                    The template explorer is empty. Import a schema or use the standard builder to architect your first logic flow.
                                </p>
                            </div>
                        ) : (
                            <AnimatePresence>
                                {templateList.map((t: any, idx) => (
                                    <TemplateCard
                                        key={t._id}
                                        template={t}
                                        idx={idx}
                                        onEdit={() => handleEdit(t)}
                                        onHistory={() => handleViewHistory(t.name)}
                                        onDelete={() => handleDelete(t._id)}
                                    />
                                ))}
                            </AnimatePresence>
                        )}
                    </div>
                </div>

                {/* Info panel */}
                <div className="space-y-6">

                    <div className="bg-surface rounded-3xl p-8 border border-line/80 dark:border-line/10 shadow-sm relative overflow-hidden group">
                        <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="flex items-center gap-3 mb-6 relative">
                            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400">
                                <Layers className="w-5 h-5" />
                            </div>
                            <h3 className="font-bold font-display text-ink">Schema Versioning</h3>
                        </div>
                        <p className="text-sm text-ink-muted leading-relaxed font-medium relative">
                            Each save creates a new immutable version. You can rollback any live survey to a previous schema state instantly.
                        </p>
                    </div>
                </div>
            </div>

            {/* Editor Modal/Panel */}
            {createPortal(
                <AnimatePresence>
                    {isEditing && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsEditing(false)}
                                className="absolute inset-0 bg-brand-dark/95 dark:bg-black/90 backdrop-blur-2xl transition-colors"
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.98, y: 30 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.98, y: 30 }}
                                onClick={(e) => e.stopPropagation()}
                                className="relative w-full max-w-6xl h-[92vh] bg-surface-raised rounded-[3.5rem] border border-line/80 dark:border-line/10 shadow-2xl overflow-hidden flex flex-col transition-colors"
                            >
                                {/* Editor Header */}
                                <div className="flex flex-col border-b border-line/80 dark:border-line/10 bg-surface transition-colors">
                                    <div className="flex justify-between items-center px-12 py-8">
                                        <div>
                                            <OnboardingTooltip
                                                id="template_architect"
                                                title="Welcome to the Architect"
                                                description="This is where you build multi-layer research schemas. Use the tabs below to switch between qualification (L1) and evaluation (L2) modules."
                                                position="bottom"
                                            >
                                                <h2 className="text-3xl font-display font-black text-ink pr-6 inline-block">
                                                    Template <span className="text-primary-soft">Architect</span>
                                                </h2>
                                            </OnboardingTooltip>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] text-ink-subtle uppercase tracking-widest font-black">Design Studio</span>
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSubmit(e);
                                                }}
                                                className="py-4 px-10 text-xs font-black flex items-center gap-3 bg-emerald-600 dark:bg-emerald-600 hover:bg-emerald-500 dark:hover:bg-emerald-500 text-white rounded-2xl shadow-xl shadow-emerald-500/20 group/commit transition-all border-none"
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center group-hover/commit:scale-110 transition-transform">
                                                    <CheckCircle2 className="w-5 h-5 text-white" />
                                                </div>
                                                COMMIT SCHEMA
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setIsEditing(false);
                                                }}
                                                className="p-3 rounded-2xl bg-surface-sunken text-ink-subtle hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-white transition-colors"
                                            >
                                                <X className="w-6 h-6" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex px-12 pb-6 gap-6 overflow-x-auto no-scrollbar">
                                        {[1, 2, 3, 4, 5, 6].map((l) => {
                                            const labels = ['Screening', 'Evaluation', 'Deep Dive', 'Purchase Intent', 'Behavioral', 'Custom'];
                                            const colors = ['brand-blue', 'brand-accent', 'emerald-500', 'orange-500', 'violet-500', 'rose-500'];
                                            const isActive = activeLayer === l;
                                            const hasSections = (currentTemplate as any)[`layer${l}_structure`]?.sections?.length > 0;

                                            return (
                                                <button
                                                    key={l}
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); setActiveLayer(l); }}
                                                    className={`pb-4 px-2 text-[10px] font-black uppercase tracking-widest transition-all relative flex flex-col items-center gap-1 min-w-[80px] ${isActive ? `text-${colors[l - 1]}` : 'text-ink-subtle hover:text-slate-600 dark:hover:text-slate-300'}`}
                                                >
                                                    <span className="opacity-50 text-[8px] leading-none">Layer {l}</span>
                                                    <span className="whitespace-nowrap">{labels[l - 1]}</span>
                                                    {hasSections && !isActive && (
                                                        <div className={`absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-${colors[l - 1]} opacity-40`} />
                                                    )}
                                                    {isActive && (
                                                        <motion.div layoutId="activeTab" className={`absolute bottom-0 left-0 right-0 h-1 bg-${colors[l - 1]} rounded-full`} />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto custom-scrollbar p-12">
                                    <div className="max-w-4xl mx-auto space-y-12 pb-32">
                                        {/* Taste Test Config Banner */}
                                        {currentTemplate.template_type === 'taste_test' && currentTemplate.taste_test_config && (
                                            <div className="bg-slate-900 dark:bg-slate-900/80 rounded-[2rem] p-8 border border-white/5 dark:border-slate-800 shadow-2xl relative overflow-hidden group transition-colors">
                                                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32 transition-all group-hover:bg-primary/10" />
                                                <div className="relative flex items-center justify-between">
                                                    <div className="flex items-center gap-6">
                                                        <div className="w-16 h-16 rounded-2xl bg-primary/10 dark:bg-primary/20 text-primary-soft flex items-center justify-center border border-primary/20 dark:border-primary/40">
                                                            <Sparkles className="w-8 h-8" />
                                                        </div>
                                                        <div>
                                                            <h3 className="text-xl font-black text-white">Taste Test Configuration</h3>
                                                            <div className="flex flex-wrap gap-3 mt-2">
                                                                <span className="px-3 py-1 bg-white/5 dark:bg-slate-800/40 rounded-lg text-[10px] font-black uppercase text-primary-soft border border-primary/20 dark:border-primary/40 transition-colors">
                                                                    Category: {currentTemplate.taste_test_config.category}
                                                                </span>
                                                                <span className="px-3 py-1 bg-white/5 dark:bg-slate-800/40 rounded-lg text-[10px] font-black uppercase text-ink-subtle border border-white/5 dark:border-slate-800/50 transition-colors">
                                                                    {currentTemplate.taste_test_config.brands.length} Brands
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={handleRegenerate}
                                                        className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-primary/20"
                                                    >
                                                        <RotateCcw className="w-4 h-4" />
                                                        Regenerate from Config
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Global Metadata */}
                                        <div className="bg-surface rounded-[2.5rem] p-10 border border-line/80 dark:border-line/10 space-y-8 relative overflow-hidden shadow-sm transition-colors">
                                            <div className="absolute top-0 left-0 w-2 h-full bg-primary" />
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                                <div className="space-y-3">
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-ink-subtle ml-1">Template Identity</label>
                                                    <input
                                                        type="text"
                                                        value={currentTemplate.name}
                                                        onChange={e => setCurrentTemplate({ ...currentTemplate, name: e.target.value })}
                                                        className="w-full bg-transparent text-4xl font-display font-black text-ink border-b-2 border-slate-50 dark:border-slate-800 focus:border-primary outline-none pb-4 transition-all placeholder:text-slate-100 dark:placeholder:text-slate-800"
                                                        placeholder="Untitled Schema"
                                                    />
                                                </div>
                                                <div className="space-y-3">
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted ml-1">Industry Context</label>
                                                    <div className="relative">
                                                        <select
                                                            className="w-full bg-white/5 dark:bg-slate-800/50 border border-white/10 dark:border-slate-700/50 rounded-2xl px-6 py-4 text-lg font-bold outline-none focus:ring-2 focus:ring-primary appearance-none mt-2 dark:text-white"
                                                            value={currentTemplate.type}
                                                            onChange={e => setCurrentTemplate({ ...currentTemplate, type: e.target.value })}
                                                        >
                                                            <option value="taste_test">Taste Test</option>
                                                            <option value="consumer_habit">Consumer Habit</option>
                                                            <option value="b2b_qualification">B2B Qualification</option>
                                                        </select>
                                                        <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-6 h-6 text-ink-muted pointer-events-none" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Dynamic Layer Editor */}
                                        <AnimatePresence mode="wait">
                                            <motion.div
                                                key={activeLayer}
                                                initial={{ opacity: 0, x: activeLayer === 1 ? -20 : 20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: activeLayer === 1 ? 20 : -20 }}
                                                transition={{ duration: 0.3 }}
                                            >
                                                {renderLayerEditor(activeLayer)}
                                            </motion.div>
                                        </AnimatePresence>
                                    </div>
                                </div>

                                <div className="absolute bottom-8 right-12 z-50">
                                    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-line/80 dark:border-line/10 rounded-2xl px-6 py-4 flex items-center gap-6 text-[10px] font-black text-ink-muted shadow-xl transition-colors">
                                        {[1, 2, 3, 4, 5, 6].map(l => {
                                            const colors = ['text-primary-soft', 'text-brand-accent', 'text-emerald-500', 'text-orange-500', 'text-violet-500', 'text-rose-500'];
                                            const count = (currentTemplate as any)[`layer${l}_structure`]?.sections?.length || 0;
                                            if (count === 0 && l > 2) return null;
                                            return (
                                                <div key={l} className={`flex items-center gap-1.5 ${l < 6 ? 'pr-4 border-r border-line/80 dark:border-line/10' : ''}`}>
                                                    <span className={`${colors[l - 1]}`}>L{l}:</span> {count}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* History Side Panel */}
            {createPortal(
                <AnimatePresence>
                    {showHistoryName && (
                        <div className="fixed inset-0 z-[110] flex justify-end">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setShowHistoryName(null)}
                                className="absolute inset-0 bg-brand-dark/60 dark:bg-slate-950/60 backdrop-blur-sm"
                            />
                            <motion.div
                                initial={{ x: '100%' }}
                                animate={{ x: 0 }}
                                exit={{ x: '100%' }}
                                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                className="relative w-full max-w-md bg-surface h-full border-l border-line/80 dark:border-line/10 shadow-2xl p-10 flex flex-col transition-colors"
                            >
                                <div className="flex justify-between items-center mb-10 transition-colors">
                                    <div>
                                        <h2 className="text-2xl font-display font-black text-ink transition-colors">{showHistoryName}</h2>
                                        <p className="text-xs text-ink-subtle uppercase font-black tracking-widest mt-1 transition-colors">Audit Trail & Versioning</p>
                                    </div>
                                    <button onClick={() => setShowHistoryName(null)} className="p-2 rounded-full bg-surface-raised text-ink-subtle hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                                    {history.map((h, i) => (
                                        <div key={h._id} className={`p-6 rounded-2xl border transition-all ${i === 0 ? 'bg-primary/5 dark:bg-primary/10 border-primary/30 dark:border-primary/40' : 'bg-surface-raised/50 border-line/80 dark:border-line/10'}`}>
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${i === 0 ? 'bg-primary text-white' : 'bg-slate-200 dark:bg-slate-700 text-ink-muted'}`}>
                                                        v{h.version}
                                                    </span>
                                                    {i === 0 && <span className="text-[10px] font-black uppercase text-primary-soft bg-primary/10 dark:bg-primary/20 px-2 py-0.5 rounded-full">Active</span>}
                                                </div>
                                                <span className="text-[10px] font-bold text-ink-subtle">
                                                    {new Date(h.created_at).toLocaleDateString()}
                                                </span>
                                            </div>

                                            <div className="text-xs text-ink-muted mb-6 font-medium transition-colors">
                                                Contains {h.layer1_questions.length} logical questions for the <span className="text-ink font-bold">{h.type}</span> flow.
                                            </div>

                                            <button
                                                onClick={() => handleRollback(h._id)}
                                                disabled={i === 0}
                                                className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-surface hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-sm dark:text-white"
                                            >
                                                <RotateCcw className="w-3 h-3" />
                                                Restore Point
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            <TasteTestConfigModal
                isOpen={isConfigModalOpen}
                onClose={() => setIsConfigModalOpen(false)}
                onConfirm={handleTasteTestConfirm}
            />
        </div >
    );
}

function TemplateCard({ template, idx, onEdit, onHistory, onDelete }: any) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.05 }}
            className="glass-card bg-white/60 dark:bg-slate-900/60 rounded-[2rem] p-8 border border-white/5 dark:border-slate-800/50 hover:border-brand-accent/30 transition-all group relative overflow-hidden flex flex-col"
        >
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-accent/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-brand-accent/20 transition-all"></div>

            <div className="relative z-10 flex justify-between items-start mb-6">
                <div className="p-3 rounded-2xl bg-white/5 dark:bg-slate-800/50 group-hover:bg-brand-accent/10 group-hover:text-brand-accent transition-all">
                    <Layers className="w-6 h-6 dark:text-slate-400" />
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 dark:bg-slate-800/50 rounded-full border border-white/5 dark:border-slate-800/50">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                    <span className="text-[10px] font-black text-slate-300 dark:text-slate-400 uppercase tracking-tighter">v{template.version || 1}</span>
                </div>
            </div>

            <div className="relative z-10 flex-1">
                <h3 className="text-xl font-display font-black text-ink mb-2 group-hover:text-primary-soft transition-colors">{template.name}</h3>
                <p className="text-xs text-ink-subtle font-bold uppercase tracking-widest mb-6">{template.type.replace('_', ' ')}</p>

                {(() => {
                    // Advanced Question Aggregator
                    const qCount = [
                        template.layer1_structure,
                        template.layer2_structure,
                        template.layer3_structure,
                        template.layer4_structure
                    ].reduce((acc, layer) => {
                        if (!layer?.sections) return acc;
                        return acc + layer.sections.reduce((sAcc: number, s: any) => sAcc + (s.questions?.length || 0), 0);
                    }, 0) || template.layer1_questions?.length || 0;

                    // Phase 2 Intelligence: Module Detection
                    const isFunNELActive = template.purchase_funnel?.is_enabled === true ||
                        template.taste_test_config?.purchase_funnel?.is_enabled === true ||
                        (template.layer4_structure?.sections?.length > 0);

                    // Phase 2 Intelligence: SEC & Gating
                    const isSESGated = template.layer1_screening_config?.ses_screening === true ||
                        template.taste_test_config?.layer1_screening_config?.ses_screening === true;

                    const secClasses = template.sec_classes?.length > 0
                        ? template.sec_classes
                        : (template.taste_test_config?.sec_classes || template.taste_test_config?.allowed_ses || []);

                    const showGlobalFocus = !isSESGated && secClasses.length === 0;

                    return (
                        <div className="space-y-4 py-6 border-t border-slate-50 dark:border-slate-800/50">
                            {/* 1. Funnel Status */}
                            <div className="flex items-center gap-3">
                                <div className={`p-1.5 rounded-lg border transition-all ${isFunNELActive
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                                    : 'bg-surface-sunken border-slate-200 dark:border-slate-700 text-slate-400'}`}>
                                    <Sparkles size={10} className={isFunNELActive ? 'animate-pulse' : ''} />
                                </div>
                                <div className="flex flex-col gap-0.5 text-left">
                                    <span className="text-[7px] font-black text-ink-subtle uppercase tracking-[0.2em] leading-none">Purchase Funnel</span>
                                    <span className={`text-[9px] font-black uppercase tracking-widest ${isFunNELActive ? 'text-emerald-500' : 'text-slate-400'}`}>
                                        {isFunNELActive ? 'Active Engine' : 'N/A Status'}
                                    </span>
                                </div>
                            </div>

                            {/* 2. Scale & Complexity */}
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary-soft">
                                    <CheckCircle2 size={10} />
                                </div>
                                <div className="flex flex-col gap-0.5 text-left">
                                    <span className="text-[7px] font-black text-ink-subtle uppercase tracking-[0.2em] leading-none">Research Scale</span>
                                    <span className="text-[9px] font-black text-ink uppercase tracking-widest">
                                        {qCount} Logic Probes
                                    </span>
                                </div>
                            </div>

                            {/* 3. Taxonomy: Category & Industry */}
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-500">
                                    <Layers size={10} />
                                </div>
                                <div className="flex flex-col gap-0.5 text-left">
                                    <span className="text-[7px] font-black text-ink-subtle uppercase tracking-[0.2em] leading-none">Taxonomy Domain</span>
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight truncate max-w-[120px]">
                                            {template.taste_test_config?.category || 'General Product'}
                                        </span>
                                        <span className="text-[9px] font-black text-primary-soft uppercase tracking-widest leading-none mt-0.5">
                                            {template.industry || template.taste_test_config?.industry || 'Cross-Sector'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* 4. Target Demographics (SEC) */}
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-500">
                                    <Users size={10} />
                                </div>
                                <div className="flex flex-col gap-1 text-left">
                                    <span className="text-[7px] font-black text-ink-subtle uppercase tracking-[0.2em] leading-none">Social Economic Level</span>
                                    <div className="flex flex-wrap gap-1">
                                        {showGlobalFocus ? (
                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest italic opacity-60">Global Focus</span>
                                        ) : Array.isArray(secClasses) && secClasses.length > 0 ? (
                                            secClasses.map((sec: string) => (
                                                <span key={sec} className="bg-surface px-1.5 py-0.5 rounded text-[7px] font-black text-ink-muted border border-slate-200 dark:border-slate-700 shadow-sm uppercase tracking-tighter">
                                                    {sec}
                                                </span>
                                            ))
                                        ) : (
                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest italic opacity-60">Global Focus</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </div>

            <div className="relative z-10 mt-6 grid grid-cols-3 gap-2">
                <button onClick={onEdit} className="p-2.5 rounded-xl bg-surface-raised/50 hover:bg-primary/10 dark:hover:bg-primary/20 flex items-center justify-center group/btn transition-all text-ink-subtle hover:text-primary-soft">
                    <Edit3 className="w-4 h-4" />
                </button>
                <button onClick={onHistory} className="p-2.5 rounded-xl bg-surface-raised/50 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center group/btn transition-all text-ink-subtle hover:text-slate-600 dark:hover:text-slate-300">
                    <History className="w-4 h-4" />
                </button>
                <button onClick={onDelete} className="p-2.5 rounded-xl bg-surface-raised/50 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center justify-center group/btn transition-all text-ink-subtle hover:text-rose-500">
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </motion.div>
    );
}
