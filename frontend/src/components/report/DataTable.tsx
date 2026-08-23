export function DataTable({ data }: { data: any }) {
    if (!data || !data.columns || !data.rows) {
        return (
            <div className="py-12 text-center text-slate-500 font-bold uppercase tracking-widest bg-white/5 rounded-3xl border border-dashed border-white/10">
                Strategic Dataset Not Found
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-3xl border border-white/10 shadow-2xl bg-slate-950/20 backdrop-blur-md">
            <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                    <thead className="bg-primary/5 border-b border-white/10">
                        <tr>
                            {data.columns.map((col: string, i: number) => (
                                <th key={i} className="px-8 py-5 text-left text-[10px] font-black text-primary-soft uppercase tracking-[0.3em] whitespace-nowrap">
                                    {col}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {data.rows.map((row: any[], i: number) => (
                            <tr key={i} className="hover:bg-primary/5 transition-all group">
                                {row.map((cell: any, j: number) => (
                                    <td key={j} className="px-8 py-5 whitespace-nowrap text-sm font-bold text-slate-300 group-hover:text-white transition-colors">
                                        <span className="tabular-nums">
                                            {typeof cell === 'number' ?
                                                (cell % 1 === 0 ? cell : cell.toFixed(1))
                                                : String(cell)}
                                        </span>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
