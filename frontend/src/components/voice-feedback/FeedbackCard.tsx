import React, { useState } from 'react';
import { Play, Pause, MessageSquare, Tag, Globe, ChevronDown, ChevronUp } from 'lucide-react';

interface FeedbackProps {
    feedback: any;
}

const FeedbackCard: React.FC<FeedbackProps> = ({ feedback }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const audioUrl = `/api/voice-feedback/audio/${feedback.audio_grid_id}`;

    const togglePlay = () => {
        const audio = document.getElementById(`audio-${feedback.id}`) as HTMLAudioElement;
        if (isPlaying) {
            audio.pause();
        } else {
            audio.play();
        }
        setIsPlaying(!isPlaying);
    };

    const getSentimentColor = (s: string) => {
        switch (s) {
            case 'positive': return 'bg-green-50 text-green-700 border-green-200';
            case 'negative': return 'bg-red-50 text-red-700 border-red-200';
            default: return 'bg-gray-50 text-gray-700 border-gray-200';
        }
    };

    return (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                    <button
                        onClick={togglePlay}
                        className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 transition-colors"
                    >
                        {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-1" />}
                    </button>
                    <audio
                        id={`audio-${feedback.id}`}
                        src={audioUrl}
                        onEnded={() => setIsPlaying(false)}
                        className="hidden"
                    />
                    <div>
                        <div className="flex items-center space-x-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getSentimentColor(feedback.nlp_result?.sentiment)}`}>
                                {feedback.nlp_result?.sentiment}
                            </span>
                            <span className="text-xs text-gray-400">
                                {new Date(feedback.created_at).toLocaleDateString()}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center space-x-2">
                    {feedback.is_franco && (
                        <span className="flex items-center space-x-1 text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-100">
                            <Globe size={10} />
                            <span>Franco</span>
                        </span>
                    )}
                    <span className="text-xs font-semibold text-gray-500 uppercase">
                        {feedback.nlp_result?.intent}
                    </span>
                </div>
            </div>

            <p className={`text-gray-800 text-sm leading-relaxed ${!isExpanded && 'line-clamp-2'}`}>
                {feedback.normalized_text || feedback.transcript}
            </p>

            {isExpanded && (
                <div className="mt-4 pt-4 border-t border-gray-50 animate-in fade-in slide-in-from-top-2">
                    <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                            <h4 className="text-[10px] font-bold text-gray-400 mb-2 uppercase flex items-center">
                                <Tag size={10} className="mr-1" /> Key Aspects
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {feedback.nlp_result?.aspects?.map((a: any, i: number) => (
                                    <span key={i} className="text-[10px] px-2 py-0.5 bg-gray-100 rounded text-gray-600">
                                        {a.aspect} ({a.sentiment})
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h4 className="text-[10px] font-bold text-gray-400 mb-2 uppercase flex items-center">
                                <MessageSquare size={10} className="mr-1" /> Original Transcript
                            </h4>
                            <p className="text-[10px] text-gray-500 italic font-arabic">
                                {feedback.transcript}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="mt-3 w-full flex items-center justify-center py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            >
                {isExpanded ? (
                    <>
                        <span className="mr-1">Show Less</span>
                        <ChevronUp size={14} />
                    </>
                ) : (
                    <>
                        <span className="mr-1">Show Analysis & Original</span>
                        <ChevronDown size={14} />
                    </>
                )}
            </button>
        </div>
    );
};

export default FeedbackCard;
