export function ReportSkeleton() {
    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12 animate-pulse">
            {/* Header Skeleton */}
            <div className="bg-surface p-8 rounded-2xl h-32 w-full shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-4"></div>
                <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded w-1/4"></div>
            </div>

            {/* Summary Skeleton */}
            <div className="bg-surface p-8 rounded-2xl h-48 w-full shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/4 mb-4"></div>
                <div className="space-y-3">
                    <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded w-full"></div>
                    <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded w-5/6"></div>
                    <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded w-4/6"></div>
                </div>
            </div>

            {/* Sections Skeleton */}
            {[1, 2].map((i) => (
                <div key={i} className="space-y-6">
                    <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded w-1/4 mx-auto"></div>
                    <div className="bg-surface p-8 rounded-2xl h-[400px] w-full shadow-sm border border-slate-200 dark:border-slate-700">
                    </div>
                </div>
            ))}
        </div>
    );
}
