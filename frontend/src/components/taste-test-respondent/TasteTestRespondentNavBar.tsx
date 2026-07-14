import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

interface TasteTestRespondentNavBarProps {
    language: 'en' | 'ar';
    loading?: boolean;
    canGoBack: boolean;
    continueLabel: string;
    onBack: () => void;
}

/**
 * Taste-test respondent navigation bar — mirrors product-test Previous/Continue layout.
 * Brand-level back only; validation runs on Continue (form submit), never on Previous.
 */
export default function TasteTestRespondentNavBar({
    language,
    loading = false,
    canGoBack,
    continueLabel,
    onBack,
}: TasteTestRespondentNavBarProps) {
    const isArabic = language === 'ar';

    return (
        <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-800/50">
            <div className="flex flex-col-reverse md:flex-row items-stretch md:items-center gap-4">
                <button
                    type="button"
                    disabled={loading || !canGoBack}
                    onClick={onBack}
                    className={`btn-secondary px-8 py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 disabled:opacity-0 ${canGoBack ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                >
                    <ChevronLeft className="w-5 h-5" />
                    {isArabic ? 'السابق' : 'Previous'}
                </button>

                <button
                    type="submit"
                    disabled={loading}
                    className="btn-premium flex-1 py-5 rounded-2xl text-white font-black text-xs uppercase tracking-[0.3em] shadow-premium-blue flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <>
                            {continueLabel}
                            <ChevronRight className="w-5 h-5" />
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
