import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2, RotateCcw, Play, Pause } from 'lucide-react';

interface VoiceNoteRecorderProps {
    language: 'en' | 'ar';
    onRecorded: (blob: Blob | null) => void;
}

export default function VoiceNoteRecorder({ language, onRecorded }: VoiceNoteRecorderProps) {
    const isArabic = language === 'ar';
    const [state, setState] = useState<'idle' | 'recording' | 'recorded'>('idle');
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [timeLeft, setTimeLeft] = useState(30);
    const [isPlaying, setIsPlaying] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const timerRef = useRef<number | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Stop recording automatically if unmounted
    useEffect(() => {
        return () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
            if (timerRef.current) clearInterval(timerRef.current);
            if (audioUrl) URL.revokeObjectURL(audioUrl);
        };
    }, [audioUrl]);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                const url = URL.createObjectURL(blob);
                setAudioUrl(url);
                setState('recorded');
                onRecorded(blob);
                stream.getTracks().forEach((track) => track.stop());
            };

            mediaRecorder.start();
            setState('recording');
            setTimeLeft(30);

            timerRef.current = window.setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev <= 1) {
                        mediaRecorder.stop();
                        if (timerRef.current) clearInterval(timerRef.current);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } catch (err) {
            console.error('Mic access denied', err);
            alert(isArabic ? 'لم نتمكن من الوصول للميكروفون' : 'Could not access microphone');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        if (timerRef.current) clearInterval(timerRef.current);
    };

    const clearRecording = () => {
        setState('idle');
        setAudioUrl(null);
        chunksRef.current = [];
        onRecorded(null);
        setIsPlaying(false);
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
    };

    const togglePlayback = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    return (
        <div className="flex flex-col gap-2 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 transition-all">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={state === 'idle' ? startRecording : state === 'recording' ? stopRecording : togglePlayback}
                        className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 ${state === 'idle'
                                ? 'bg-brand-blue text-white hover:scale-105 active:scale-95'
                                : state === 'recording'
                                    ? 'bg-rose-500 text-white animate-pulse'
                                    : 'bg-emerald-500 text-white hover:scale-105 active:scale-95'
                            }`}
                    >
                        {state === 'idle' && <Mic className="w-5 h-5" />}
                        {state === 'recording' && <Square className="w-4 h-4 fill-white" />}
                        {state === 'recorded' && (
                            isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-1" />
                        )}
                    </button>
                    <div>
                        <p className="text-xs font-black text-slate-900 dark:text-white">
                            {state === 'idle'
                                ? (isArabic ? 'سجل ملاحظتك الصوتية' : 'Record Voice Note')
                                : state === 'recording'
                                    ? (isArabic ? 'جاري التسجيل...' : 'Recording...')
                                    : (isArabic ? 'تم التسجيل' : 'Recorded')}
                        </p>
                        {state === 'recording' && (
                            <p className="text-[10px] font-bold text-rose-500 mt-0.5">
                                0:{timeLeft.toString().padStart(2, '0')}
                            </p>
                        )}
                    </div>
                </div>

                {state === 'recorded' && (
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={clearRecording}
                            className="p-1.5 rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                            aria-label="Delete recording"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                clearRecording();
                                startRecording();
                            }}
                            className="p-1.5 rounded-full text-slate-400 hover:text-brand-blue hover:bg-blue-50 dark:hover:bg-brand-blue/10 transition-colors"
                            aria-label="Re-record"
                        >
                            <RotateCcw className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>

            {state === 'recording' && (
                <div className="flex justify-center items-center gap-1 h-6 px-12 opacity-80">
                    {[...Array(6)].map((_, i) => (
                        <div
                            key={i}
                            className="w-1.5 bg-rose-400 rounded-full animate-bounce"
                            style={{
                                height: `${Math.random() * 60 + 20}%`,
                                animationDelay: `${i * 0.1}s`,
                                animationDuration: '0.6s'
                            }}
                        />
                    ))}
                </div>
            )}

            {audioUrl && (
                <audio
                    ref={audioRef}
                    src={audioUrl}
                    onEnded={() => setIsPlaying(false)}
                    className="hidden"
                />
            )}
        </div>
    );
}
