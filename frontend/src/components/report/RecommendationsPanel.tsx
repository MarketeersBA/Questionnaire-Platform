import { ShoppingCart, Megaphone, Palette, Banknote } from 'lucide-react';

const ICON_MAP: Record<string, any> = {
    product: Palette,
    price: Banknote,
    place: ShoppingCart,
    promotion: Megaphone,
};

export function RecommendationsPanel({ recommendations }: { recommendations?: Record<string, string> }) {
    if (!recommendations || Object.keys(recommendations).length === 0) return null;

    const recArray = Object.entries(recommendations).map(([category, advice]) => ({
        category: category as any,
        advice
    }));

    return (
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-8">Strategic Recommendations (4Ps)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {recArray.map((rec, i) => {
                    const Icon = ICON_MAP[rec.category] || Palette;
                    return (
                        <div key={i} className="flex flex-col gap-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${rec.category === 'product' ? 'bg-blue-100 text-blue-600' :
                                rec.category === 'price' ? 'bg-emerald-100 text-emerald-600' :
                                    rec.category === 'place' ? 'bg-amber-100 text-amber-600' :
                                        'bg-purple-100 text-purple-600'
                                }`}>
                                <Icon className="h-6 w-6" />
                            </div>
                            <h4 className="text-lg font-bold text-slate-800 dark:text-white capitalize">{rec.category}</h4>
                            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                {rec.advice}
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
