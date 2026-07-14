export function ImportanceMatrix({ data }: { data: any }) {
    const matrix = data?.matrix || [];
    if (matrix.length === 0) return <div>No Importance Data found</div>;

    const brands = Object.keys(matrix[0]).filter(k => k !== 'feature' && k !== 'importance');

    // A helper to map values onto a color gradient (green to red or similar)
    const getPerformanceColor = (val: number) => {
        if (typeof val !== 'number') return 'transparent';
        if (val >= 8) return 'rgba(34, 197, 94, 0.2)';   // Emerald-500 lightly
        if (val >= 6) return 'rgba(234, 179, 8, 0.2)';   // Yellow-500 lightly
        if (val > 0) return 'rgba(239, 68, 68, 0.2)';    // Red-500 lightly
        return 'transparent';
    };

    const getImportanceColor = (val: number) => {
        if (typeof val !== 'number') return 'transparent';
        if (val > 0.6) return 'rgba(56, 189, 248, 0.3)'; // Sky-400 lightly
        if (val > 0.3) return 'rgba(56, 189, 248, 0.15)'; // Sky-400 super lightly
        return 'transparent';
    }

    return (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider sticky left-0 bg-slate-50 dark:bg-slate-800 z-10 w-1/3">
                            Feature
                        </th>
                        <th className="px-6 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider border-r border-slate-200 dark:border-slate-700">
                            Derived Importance (R)
                        </th>
                        {brands.map(brand => (
                            <th key={brand} className="px-6 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                                {brand} Perf.
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-700">
                    {matrix.map((row: any, i: number) => (
                        <tr key={i} className="group">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white sticky left-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors z-10 w-1/3">
                                {row.feature}
                            </td>
                            <td
                                className="px-6 py-4 whitespace-nowrap text-sm text-center border-r border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                                style={{ backgroundColor: getImportanceColor(row.importance) }}
                            >
                                {typeof row.importance === 'number' ? row.importance.toFixed(2) : 'N/A'}
                            </td>
                            {brands.map(brand => (
                                <td
                                    key={brand}
                                    className="px-6 py-4 whitespace-nowrap text-sm text-center font-semibold text-slate-800 dark:text-slate-200"
                                    style={{ backgroundColor: getPerformanceColor(row[brand]) }}
                                >
                                    {typeof row[brand] === 'number' ? row[brand].toFixed(1) : '-'}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
