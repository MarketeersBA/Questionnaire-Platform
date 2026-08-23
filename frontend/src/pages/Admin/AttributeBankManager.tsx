import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus,
    Save,
    Trash2,
    ChevronRight,
    Database,
    Tag,
    Layers,
    AlertCircle,
    Search
} from 'lucide-react';
import { toast } from 'sonner';
import { attributeBanks } from '../../services/api';
import { Attribute, AttributeBank } from '../../types/tasteTest';


const SCALE_OPTIONS = [
    { value: 'hedonic_9', label: '9-Point Hedonic (1-9)' },
    { value: 'hedonic_7', label: '7-Point Hedonic (1-7)' },
    { value: 'jar_5', label: 'Just About Right (JAR) 5-Point' },
    { value: 'intensity_100', label: 'Intensity (0-100)' },
    { value: 'boolean', label: 'Yes/No (Boolean)' }
];

const DIAGNOSTIC_GROUPS = [
    { value: 'sensory', label: 'Sensory' },
    { value: 'texture', label: 'Texture' },
    { value: 'flavor', label: 'Flavor' },
    { value: 'aroma', label: 'Aroma' },
    { value: 'appearance', label: 'Appearance' }
];

export default function AttributeBankManager() {
    const [categories, setCategories] = useState<{ category: string; display_name: string }[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [currentBank, setCurrentBank] = useState<AttributeBank | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        try {
            const data = await attributeBanks.list();
            setCategories(data);
        } catch (err) {
            toast.error('Failed to load categories');
        }
    };

    const loadBank = async (category: string) => {
        try {
            const data = await attributeBanks.get(category);
            setCurrentBank(data);
            setSelectedCategory(category);
        } catch (err) {
            toast.error('Failed to load bank details');
        }
    };

    const handleCreateNew = () => {
        setCurrentBank({
            category: '',
            display_name: '',
            version: 1,
            core_attributes: [],
            sub_attributes: []
        });
        setSelectedCategory('new');
    };

    const addAttribute = (type: 'core' | 'sub') => {
        if (!currentBank) return;

        const newAttr: Attribute = {
            attribute_id: '',
            label: '',
            scale_type: 'hedonic_9',
            is_required: false,
            diagnostic_group: 'sensory'
        };

        setCurrentBank({
            ...currentBank,
            [type === 'core' ? 'core_attributes' : 'sub_attributes']: [
                ...(type === 'core' ? currentBank.core_attributes : currentBank.sub_attributes),
                newAttr
            ]
        });
    };

    const updateAttribute = (type: 'core' | 'sub', index: number, field: keyof Attribute, value: any) => {
        if (!currentBank) return;

        const list = type === 'core' ? [...currentBank.core_attributes] : [...currentBank.sub_attributes];
        list[index] = { ...list[index], [field]: value };

        setCurrentBank({
            ...currentBank,
            [type === 'core' ? 'core_attributes' : 'sub_attributes']: list
        });
    };

    const removeAttribute = (type: 'core' | 'sub', index: number) => {
        if (!currentBank) return;

        const list = type === 'core' ? [...currentBank.core_attributes] : [...currentBank.sub_attributes];
        list.splice(index, 1);

        setCurrentBank({
            ...currentBank,
            [type === 'core' ? 'core_attributes' : 'sub_attributes']: list
        });
    };

    const handleSave = async () => {
        if (!currentBank) return;
        if (!currentBank.category || !currentBank.display_name) {
            toast.error('Category ID and Display Name are required');
            return;
        }

        setIsSaving(true);
        try {
            await attributeBanks.createOrUpdate(currentBank);
            toast.success('Attribute bank saved successfully');
            fetchCategories();
            setSelectedCategory(currentBank.category);
        } catch (err) {
            toast.error('Failed to save attribute bank');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            {/* Header Area */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-4 transition-colors">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary-soft flex items-center justify-center">
                            <Database className="w-6 h-6" />
                        </div>
                        Attribute Bank Management
                    </h1>
                    <p className="text-ink-muted font-medium mt-2">Manage category-specific research attributes and scales.</p>
                </div>

                <button
                    onClick={handleCreateNew}
                    className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-bold shadow-xl shadow-primary/20 hover:scale-105 transition-all text-sm"
                >
                    <Plus className="w-5 h-5" />
                    New Category
                </button>
            </div>

            <div className="grid grid-cols-12 gap-8 items-start">
                {/* Sidebar: Categories List */}
                <div className="col-span-12 lg:col-span-3 space-y-4">
                    <div className="bg-surface rounded-[2rem] border border-line/80 dark:border-line/10 p-6 shadow-sm transition-colors">
                        <div className="relative mb-6">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search types..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-surface-raised border-none rounded-xl pl-11 pr-4 py-3 text-sm font-medium dark:text-white focus:ring-2 focus:ring-primary/20 transition-all shadow-inner-soft"
                            />
                        </div>

                        <div className="space-y-1 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                            {categories
                                .filter(c => c.display_name.toLowerCase().includes(searchTerm.toLowerCase()))
                                .map((cat) => (
                                    <button
                                        key={cat.category}
                                        onClick={() => loadBank(cat.category)}
                                        className={`
                                        w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-left transition-all group
                                        ${selectedCategory === cat.category
                                                ? 'bg-primary/5 dark:bg-primary/10 text-primary-soft ring-1 ring-primary/20'
                                                : 'text-ink-muted hover:bg-slate-50 dark:hover:bg-slate-800'}
                                    `}
                                    >
                                        <span className="text-sm font-bold tracking-tight">{cat.display_name}</span>
                                        <ChevronRight className={`w-4 h-4 transition-transform ${selectedCategory === cat.category ? 'translate-x-1' : 'opacity-0'}`} />
                                    </button>
                                ))}
                        </div>
                    </div>
                </div>

                {/* Main: Bank Editor */}
                <div className="col-span-9">
                    <AnimatePresence mode="wait">
                        {currentBank ? (
                            <motion.div
                                key={selectedCategory || 'empty'}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="bg-surface rounded-[2.5rem] border border-line/80 dark:border-line/10 shadow-sm overflow-hidden transition-colors"
                            >
                                {/* Editor Header */}
                                <div className="p-8 border-b border-line/80 dark:border-line/10 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between transition-colors">
                                    <div className="flex gap-8">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-ink-subtle px-1">Display Name</label>
                                            <input
                                                type="text"
                                                value={currentBank.display_name}
                                                onChange={(e) => setCurrentBank({ ...currentBank, display_name: e.target.value })}
                                                placeholder="e.g. Dairy & Cheese"
                                                className="block w-64 bg-surface border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold dark:text-white focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-ink-subtle px-1">Category Slug</label>
                                            <input
                                                type="text"
                                                value={currentBank.category}
                                                onChange={(e) => setCurrentBank({ ...currentBank, category: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                                                placeholder="e.g. cheese"
                                                disabled={selectedCategory !== 'new'}
                                                className="block w-48 bg-surface border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold dark:text-white focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all disabled:opacity-50"
                                            />
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleSave}
                                        disabled={isSaving}
                                        className="flex items-center gap-2 bg-slate-900 dark:bg-slate-950 text-white px-8 py-3 rounded-2xl font-bold hover:bg-black dark:hover:bg-black transition-all disabled:opacity-50 shadow-lg shadow-black/10 border border-white/5"
                                    >
                                        {isSaving ? (
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        ) : (
                                            <Save className="w-5 h-5" />
                                        )}
                                        Push Changes
                                    </button>
                                </div>

                                <div className="p-10 space-y-12 h-[calc(70vh-100px)] overflow-y-auto custom-scrollbar">
                                    {/* Core Attributes Section */}
                                    <section>
                                        <div className="flex items-center justify-between mb-8">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-brand-cyan/10 text-brand-cyan flex items-center justify-center">
                                                    <Tag className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h3 className="text-lg font-black text-ink">Core Attributes</h3>
                                                    <p className="text-sm text-ink-subtle font-medium">Measurement metrics required for all products.</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => addAttribute('core')}
                                                className="text-primary-soft hover:bg-primary/5 p-2 rounded-xl transition-all"
                                            >
                                                <Plus className="w-6 h-6" />
                                            </button>
                                        </div>

                                        <div className="space-y-4">
                                            {currentBank.core_attributes.map((attr, idx) => (
                                                <AttributeCard
                                                    key={`core-${idx}`}
                                                    attr={attr}
                                                    onUpdate={(field, val) => updateAttribute('core', idx, field, val)}
                                                    onDelete={() => removeAttribute('core', idx)}
                                                />
                                            ))}
                                            {currentBank.core_attributes.length === 0 && (
                                                <EmptyState message="No core attributes defined. Click + to add." />
                                            )}
                                        </div>
                                    </section>

                                    {/* Sub-Attributes Section */}
                                    <section>
                                        <div className="flex items-center justify-between mb-8">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-brand-purple/10 text-brand-purple flex items-center justify-center">
                                                    <Layers className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h3 className="text-lg font-black text-ink">Sub-Attributes</h3>
                                                    <p className="text-sm text-ink-subtle font-medium">Diagnostic metrics specific to sensory notes.</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => addAttribute('sub')}
                                                className="text-primary-soft hover:bg-primary/5 p-2 rounded-xl transition-all"
                                            >
                                                <Plus className="w-6 h-6" />
                                            </button>
                                        </div>

                                        <div className="space-y-4">
                                            {currentBank.sub_attributes.map((attr, idx) => (
                                                <AttributeCard
                                                    key={`sub-${idx}`}
                                                    attr={attr}
                                                    onUpdate={(field, val) => updateAttribute('sub', idx, field, val)}
                                                    onDelete={() => removeAttribute('sub', idx)}
                                                />
                                            ))}
                                            {currentBank.sub_attributes.length === 0 && (
                                                <EmptyState message="No sub-attributes defined. Click + to add." />
                                            )}
                                        </div>
                                    </section>
                                </div>
                            </motion.div>
                        ) : (
                            <div className="bg-surface rounded-[2.5rem] border border-line/80 dark:border-line/10 border-dashed p-20 flex flex-col items-center justify-center text-center transition-colors">
                                <div className="w-20 h-20 rounded-[2rem] bg-surface-raised text-slate-300 dark:text-slate-600 flex items-center justify-center mb-6 border border-line/80 dark:border-line/10 shadow-inner-soft">
                                    <Database className="w-10 h-10" />
                                </div>
                                <h2 className="text-xl font-black text-ink mb-2">Initialize Knowledge Bank</h2>
                                <p className="text-ink-subtle max-w-sm mb-8 font-medium">Select a category from the sidebar or create a new one to begin defining attributes.</p>
                                <button
                                    onClick={handleCreateNew}
                                    className="bg-primary text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all text-sm"
                                >
                                    Initialize New Category
                                </button>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}

function AttributeCard({ attr, onUpdate, onDelete }: { attr: Attribute; onUpdate: (field: keyof Attribute, val: any) => void; onDelete: () => void }) {
    return (
        <div className="bg-slate-50/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 hover:bg-white dark:hover:bg-slate-800 hover:shadow-premium dark:hover:shadow-none transition-all group/card">
            <div className="grid grid-cols-12 gap-6 items-end">
                <div className="col-span-3 space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-ink-subtle px-1">Attribute ID</label>
                    <input
                        type="text"
                        value={attr.attribute_id}
                        onChange={(e) => onUpdate('attribute_id', e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                        placeholder="e.g. saltiness"
                        className="w-full bg-surface border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold dark:text-white focus:ring-4 focus:ring-primary/5 transition-all shadow-sm"
                    />
                </div>
                <div className="col-span-3 space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-ink-subtle px-1">Label (Visual)</label>
                    <input
                        type="text"
                        value={attr.label}
                        onChange={(e) => onUpdate('label', e.target.value)}
                        placeholder="e.g. Saltiness"
                        className="w-full bg-surface border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold dark:text-white focus:ring-4 focus:ring-primary/5 transition-all shadow-sm"
                    />
                </div>
                <div className="col-span-3 space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-ink-subtle px-1">Scale Type</label>
                    <select
                        value={attr.scale_type}
                        onChange={(e) => onUpdate('scale_type', e.target.value)}
                        className="w-full bg-surface border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold dark:text-white focus:ring-4 focus:ring-primary/5 transition-all appearance-none shadow-sm"
                    >
                        {SCALE_OPTIONS.map(opt => <option key={opt.value} value={opt.value} className="dark:bg-slate-900">{opt.label}</option>)}
                    </select>
                </div>
                <div className="col-span-2 space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-ink-subtle px-1">Group</label>
                    <select
                        value={attr.diagnostic_group}
                        onChange={(e) => onUpdate('diagnostic_group', e.target.value)}
                        className="w-full bg-surface border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold dark:text-white focus:ring-4 focus:ring-primary/5 transition-all appearance-none shadow-sm"
                    >
                        {DIAGNOSTIC_GROUPS.map(opt => <option key={opt.value} value={opt.value} className="dark:bg-slate-900">{opt.label}</option>)}
                    </select>
                </div>
                <div className="col-span-1 flex items-center justify-end">
                    <button
                        onClick={onDelete}
                        className="w-10 h-10 rounded-xl bg-surface border border-slate-100 dark:border-slate-700 flex items-center justify-center text-slate-300 hover:text-accent-soft hover:bg-accent/5 transition-all shadow-sm"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

function EmptyState({ message }: { message: string }) {
    return (
        <div className="py-12 border border-line/80 dark:border-line/10 border-dashed rounded-[2rem] flex flex-col items-center justify-center text-ink-subtle italic font-medium text-sm transition-colors">
            <AlertCircle className="w-6 h-6 mb-2 opacity-30" />
            {message}
        </div>
    );
}
