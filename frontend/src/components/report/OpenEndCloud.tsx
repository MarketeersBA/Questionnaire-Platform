import ReactWordcloud from 'react-wordcloud';

export function OpenEndCloud({ data }: { data: any }) {
    const words = data?.words || [];

    if (!words.length) return <div className="text-slate-500 text-center py-20">No word data available</div>;

    return (
        <div className="w-full flex flex-col items-center justify-center p-4">
            <div style={{ width: '100%', height: 400 }}>
                <ReactWordcloud
                    words={words}
                    options={{
                        colors: ['#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#e2e8f0', '#94a3b8'],
                        enableTooltip: true,
                        deterministic: true,
                        fontFamily: 'Inter, sans-serif',
                        fontSizes: [14, 72],
                        fontStyle: 'normal',
                        fontWeight: '700',
                        padding: 2,
                        rotations: 2,
                        rotationAngles: [0, 90],
                        scale: 'sqrt',
                        spiral: 'archimedean'
                    }}
                />
            </div>
        </div>
    );
}
