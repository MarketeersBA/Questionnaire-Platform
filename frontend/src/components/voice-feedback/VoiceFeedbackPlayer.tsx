import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Download, Volume2, Loader2, AlertCircle } from 'lucide-react';
import { voice } from '../../services/api';

interface VoiceFeedbackPlayerProps {
    feedbackId: string;
    showControls?: boolean;
}

export default function VoiceFeedbackPlayer({ feedbackId, showControls = true }: VoiceFeedbackPlayerProps) {
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [playing, setPlaying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        let isMounted = true;
        const fetchAudio = async () => {
            try {
                setLoading(true);
                const blob = await voice.getAudio(feedbackId);
                const url = URL.createObjectURL(blob);
                if (isMounted) {
                    setAudioUrl(url);
                    setLoading(false);
                }
            } catch (err) {
                console.error('Failed to load audio:', err);
                if (isMounted) {
                    setError('Failed to load audio');
                    setLoading(false);
                }
            }
        };

        fetchAudio();

        return () => {
            isMounted = false;
            if (audioUrl) {
                URL.revokeObjectURL(audioUrl);
            }
        };
    }, [feedbackId]);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (playing) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setPlaying(!playing);
    };

    const handleDownload = () => {
        if (!audioUrl) return;
        const link = document.createElement('a');
        link.href = audioUrl;
        link.download = `voice_${feedbackId}.mp3`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) {
        return (
            <div className="flex items-center gap-2 px-4 py-2 bg-surface-sunken rounded-xl animate-pulse w-fit">
                <Loader2 size={14} className="animate-spin text-slate-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Loading Audio...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center gap-2 px-4 py-2 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl w-fit">
                <AlertCircle size={14} className="text-rose-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-rose-600">{error}</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-3 bg-surface border border-line/80 dark:border-line/10 p-2 pl-3 pr-4 rounded-2xl shadow-sm hover:shadow-md transition-all group">
            <audio
                ref={audioRef}
                src={audioUrl!}
                onEnded={() => setPlaying(false)}
                onPause={() => setPlaying(false)}
                onPlay={() => setPlaying(true)}
                className="hidden"
            />

            <button
                onClick={togglePlay}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${playing
                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                    : 'bg-primary/10 text-primary-soft hover:bg-primary/20'
                    }`}
            >
                {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} className="ml-0.5" fill="currentColor" />}
            </button>

            <div className="flex flex-col min-w-[80px]">
                <div className="flex items-center gap-1.5">
                    <Volume2 size={12} className={playing ? 'text-primary-soft animate-pulse' : 'text-slate-400'} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
                        {feedbackId.slice(-6).toUpperCase()}
                    </span>
                </div>
                <div className="h-1 bg-surface-sunken rounded-full mt-1.5 relative overflow-hidden w-full">
                    {playing && (
                        <div className="absolute inset-0 bg-primary/30 animate-pulse" />
                    )}
                </div>
            </div>

            {showControls && (
                <button
                    onClick={handleDownload}
                    className="p-2 text-slate-400 hover:text-primary-soft hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors ml-auto opacity-0 group-hover:opacity-100"
                    title="Download Audio"
                >
                    <Download size={14} />
                </button>
            )}
        </div>
    );
}
