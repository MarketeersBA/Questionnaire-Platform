import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
    BarChart3,
    MessageSquare,
    TrendingUp,
    ThumbsDown,
    ThumbsUp,
    RefreshCw,
    Search
} from 'lucide-react';

import SentimentTrendChart from '../components/voice-feedback/SentimentTrendChart';
import FeedbackCard from '../components/voice-feedback/FeedbackCard';
import AudioRecorder from '../components/voice-feedback/AudioRecorder';

const VoiceFeedbackDashboard: React.FC = () => {
    const { surveyId } = useParams<{ surveyId: string }>();
    const [summary, setSummary] = useState<any>(null);
    const [trends, setTrends] = useState<any[]>([]);
    const [feedbacks, setFeedbacks] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterSentiment, setFilterSentiment] = useState<string>('');

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const headers = { 'Authorization': `Bearer ${localStorage.getItem('token')}` };

            const [sumRes, trendRes, feedRes] = await Promise.all([
                fetch(`/api/voice-dashboard/${surveyId}/summary`, { headers }),
                fetch(`/api/voice-dashboard/${surveyId}/sentiment-trend`, { headers }),
                fetch(`/api/voice-dashboard/${surveyId}/feedbacks?sentiment=${filterSentiment}`, { headers })
            ]);

            setSummary(await sumRes.json());
            setTrends(await trendRes.json());
            const feedData = await feedRes.json();
            setFeedbacks(feedData.items);
        } catch (err) {
            console.error("Dashboard data fetch error:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [surveyId, filterSentiment]);

    if (isLoading && !summary) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-50">
                <RefreshCw className="animate-spin text-indigo-600" size={32} />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50/50 p-8 font-sans">
            {/* Header */}
            <div className="flex justify-between items-center mb-10">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Voice Insights</h1>
                    <p className="text-gray-500 mt-1 font-medium">Real-time dialectal multi-stage analysis dashboard</p>
                </div>
                <div className="flex items-center space-x-3">
                    <button
                        onClick={fetchData}
                        className="flex items-center px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
                    >
                        <RefreshCw size={16} className={`mr-2 ${isLoading && 'animate-spin'}`} />
                        Sync Data
                    </button>
                </div>
            </div>

            {/* KPI Section */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
                <StatCard
                    label="Total Responses"
                    value={summary?.total_feedbacks}
                    icon={<MessageSquare className="text-blue-600" />}
                    color="bg-blue-50"
                />
                <StatCard
                    label="Analysis Coverage"
                    value={`${summary?.processing_rate}%`}
                    icon={<BarChart3 className="text-purple-600" />}
                    color="bg-purple-50"
                />
                <StatCard
                    label="Positive Sentiment"
                    value={summary?.sentiment_distribution?.positive || 0}
                    icon={<ThumbsUp className="text-green-600" />}
                    color="bg-green-50"
                />
                <StatCard
                    label="Critical Complaints"
                    value={summary?.sentiment_distribution?.negative || 0}
                    icon={<ThumbsDown className="text-red-600" />}
                    color="bg-red-50"
                />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Left Column: Visualizations */}
                <div className="xl:col-span-2 space-y-8">
                    <SentimentTrendChart data={trends} />

                    <div className="grid grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <h3 className="text-xs font-bold text-gray-400 mb-6 uppercase tracking-wider">Dialect Breakdown</h3>
                            {/* Simplified breakdown for visual placeholder */}
                            <div className="space-y-4">
                                <ProgressRow label="Standard Arabic" value={45} color="bg-indigo-500" />
                                <ProgressRow label="Egyptian / Levantine" value={35} color="bg-orange-500" />
                                <ProgressRow label="Franco (Arabizi)" value={20} color="bg-purple-500" />
                            </div>
                        </div>

                        <AudioRecorder
                            surveyId={surveyId!}
                            questionId="test-voice-q"
                            onUploadSuccess={() => fetchData()}
                        />
                    </div>
                </div>

                {/* Right Column: Timeline */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden flex flex-col h-[800px]">
                    <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                        <h3 className="font-bold text-gray-900 flex items-center">
                            <TrendingUp size={18} className="mr-2 text-indigo-600" />
                            Live Feedback Feed
                        </h3>
                        <div className="flex items-center space-x-2">
                            <select
                                value={filterSentiment}
                                onChange={(e) => setFilterSentiment(e.target.value)}
                                className="text-xs border-none bg-gray-50 rounded-lg focus:ring-0 font-semibold"
                            >
                                <option value="">All Sentiment</option>
                                <option value="positive">Positive</option>
                                <option value="negative">Negative</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/30">
                        {feedbacks.length > 0 ? (
                            feedbacks.map((f) => <FeedbackCard key={f.id} feedback={f} />)
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                <Search size={48} className="mb-2 opacity-20" />
                                <p className="text-sm font-medium">No results found for current filters</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const StatCard = ({ label, value, icon, color }: any) => (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center space-x-4">
        <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center`}>
            {icon}
        </div>
        <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-black text-gray-900">{value}</p>
        </div>
    </div>
);

const ProgressRow = ({ label, value, color }: any) => (
    <div>
        <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase mb-1">
            <span>{label}</span>
            <span>{value}%</span>
        </div>
        <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
            <div className={`${color} h-full rounded-full`} style={{ width: `${value}%` }} />
        </div>
    </div>
);

export default VoiceFeedbackDashboard;
