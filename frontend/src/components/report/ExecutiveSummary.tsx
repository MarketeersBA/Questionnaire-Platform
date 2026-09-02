import { InsightsActionsSection } from './InsightsActionsSection';
import { StrategicCommandSection } from './StrategicCommandSection';

interface Finding {
    label: string;
    finding: string;
    impact: 'positive' | 'negative' | 'neutral';
}

interface OpportunityAction {
    action: string;
    category: string;
    index: number;
}

interface OpportunityInsight {
    title: string;
    insight: string;
    strategic_category: string;
    impact: string;
    effort: string;
    priority_level: number;
    actions: OpportunityAction[];
    score: number;
    gap_magnitude: number;
    confidence: number;
    attribute: string;
}

/** Tokens worth highlighting: figures and comparative verdicts. */
const EMPHASIS_SOURCE =
    String.raw`\d[\d.,]*\s?%|\d[\d.,]*\s?(?:points?|pts?|bps)|N\s?=\s?\d+|` +
    String.raw`(?:outperform\w*|underperform\w*|leads?|trails?|gap|risk|critical|absence|highest|lowest)`;

/**
 * Render a narrative sentence with the decision-relevant tokens picked out in
 * the brand accent, so the Key Finding is scannable without the author having
 * to mark anything up.
 *
 * Two regexes are used deliberately: a global one to split, and a non-global
 * one to classify. Reusing one global regex for `.test()` would carry
 * `lastIndex` between calls and mis-classify alternating tokens.
 */
function EmphasisedText({ text, className = '' }: { text?: string | null; className?: string }) {
    const raw = String(text || '').trim();
    if (!raw) return null;

    const splitter = new RegExp(`(${EMPHASIS_SOURCE})`, 'gi');
    const classifier = new RegExp(`^(?:${EMPHASIS_SOURCE})$`, 'i');

    const parts = raw.split(splitter).filter((p) => p);
    return (
        <p className={className}>
            {parts.map((part, i) =>
                classifier.test(part) ? (
                    <span key={i} className="text-accent-soft font-black">{part}</span>
                ) : (
                    <span key={i}>{part}</span>
                ),
            )}
        </p>
    );
}

export function ExecutiveSummary({
    summary,
    findings,
    opportunity_insights,
    surveyId,
    editable = false,
    report,
}: {
    summary?: string,
    findings?: Finding[],
    opportunity_insights?: OpportunityInsight[],
    surveyId?: string,
    editable?: boolean,
    report?: any,
}) {
    return (
        <div className="space-y-6">
            {summary && (
                <div className="card-brand p-8 rounded-2xl relative overflow-hidden">
                    {/* Brand spine: blue at the top resolving to red */}
                    <div
                        className="absolute top-0 left-0 w-1.5 h-full"
                        style={{ background: 'linear-gradient(180deg, rgb(var(--c-primary)), rgb(var(--c-accent)))' }}
                    />
                    <div className="relative z-10 pl-3">
                        <div className="flex items-center gap-2.5 mb-3">
                            <h2 className="text-[20px] font-black text-primary-soft uppercase tracking-[0.18em]">
                                Key Finding
                            </h2>
                            <span className="h-px flex-1 bg-primary/15" />
                        </div>
                        {/* Strip Arabic shape labels like (مثلث) and (مربع) which are already
                            shown in the chart legend — they clutter the prose sentence. */}
                        <EmphasisedText
                            text={summary?.replace(/\s*\([\u0600-\u06FF\s]+\)/g, '').trim()}
                            className="text-[15px] md:text-[16px] leading-[1.65] font-medium text-ink tracking-normal mt-1"
                        />
                    </div>
                </div>
            )}

            <InsightsActionsSection
                findings={findings}
                opportunityInsights={opportunity_insights}
                report={report}
            />

            {opportunity_insights && opportunity_insights.length > 0 && (
                <StrategicCommandSection insights={opportunity_insights} surveyId={surveyId} editable={editable} />
            )}
        </div>
    );
}
