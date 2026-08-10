import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Trash2, RotateCcw, Play, Pause } from 'lucide-react';

interface VoiceNoteRecorderProps {
    language: 'en' | 'ar';
    onRecorded: (blob: Blob | null) => void;
}

/** Ignore accidental taps shorter than this (ms). */
const MIN_HOLD_MS = 400;

export default function VoiceNoteRecorder({ language, onRecorded }: VoiceNoteRecorderProps) {
    const isArabic = language === 'ar';
    const [state, setState] = useState<'idle' | 'recording' | 'recorded'>('idle');
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [elapsed, setElapsed] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const timerRef = useRef<number | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const holdActiveRef = useRef(false);
    const recordingStartedAtRef = useRef(0);
    const startInFlightRef = useRef(false);
    const maxSeconds = 30;

    const clearTimer = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const stopStream = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    }, []);

    useEffect(() => {
        return () => {
            holdActiveRef.current = false;
            clearTimer();
            if (mediaRecorderRef.current?.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
            stopStream();
            if (audioUrl) URL.revokeObjectURL(audioUrl);
        };
    }, [audioUrl, clearTimer, stopStream]);

    const finalizeBlob = useCallback((blob: Blob, heldMs: number) => {
        stopStream();
        mediaRecorderRef.current = null;
        chunksRef.current = [];

        if (heldMs < MIN_HOLD_MS || blob.size < 100) {
            setState('idle');
            return;
        }

        const url = URL.createObjectURL(blob);
        setAudioUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
        });
        setState('recorded');
        onRecorded(blob);
    }, [onRecorded, stopStream]);

    const stopRecording = useCallback(() => {
        const recorder = mediaRecorderRef.current;
        clearTimer();

        if (!recorder || recorder.state !== 'recording') {
            setState((s) => (s === 'recording' ? 'idle' : s));
            stopStream();
            return;
        }

        const heldMs = Date.now() - recordingStartedAtRef.current;
        recorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
            finalizeBlob(blob, heldMs);
        };
        recorder.stop();
    }, [clearTimer, finalizeBlob, stopStream]);

    const startRecording = useCallback(async () => {
        if (startInFlightRef.current || state === 'recording') return;
        startInFlightRef.current = true;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (!holdActiveRef.current) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }

            streamRef.current = stream;
            chunksRef.current = [];
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorder.start();
            recordingStartedAtRef.current = Date.now();
            setState('recording');
            setElapsed(0);

            clearTimer();
            timerRef.current = window.setInterval(() => {
                setElapsed((prev) => {
                    const next = prev + 1;
                    if (next >= maxSeconds) {
                        holdActiveRef.current = false;
                        stopRecording();
                        return maxSeconds;
                    }
                    return next;
                });
            }, 1000);

            if (!holdActiveRef.current) {
                stopRecording();
            }
        } catch (err) {
            console.error('Mic access denied', err);
            holdActiveRef.current = false;
            setState('idle');
            alert(isArabic ? 'لم نتمكن من الوصول للميكروفون' : 'Could not access microphone');
        } finally {
            startInFlightRef.current = false;
        }
    }, [clearTimer, isArabic, maxSeconds, state, stopRecording]);

    const clearRecording = () => {
        setState('idle');
        setAudioUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
        });
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
            void audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (state === 'recorded') {
            togglePlayback();
            return;
        }
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        holdActiveRef.current = true;
        void startRecording();
    };

    const onPointerUpOrCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (state === 'recorded') return;
        if (!holdActiveRef.current && state !== 'recording') return;
        holdActiveRef.current = false;
        try {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
            }
        } catch {
            /* already released */
        }
        stopRecording();
    };

    const formatTime = (seconds: number) => {
        const remaining = Math.max(0, maxSeconds - seconds);
        return `0:${remaining.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex flex-col gap-2 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 transition-all">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onPointerDown={onPointerDown}
                        onPointerUp={onPointerUpOrCancel}
                        onPointerCancel={onPointerUpOrCancel}
                        onContextMenu={(e) => e.preventDefault()}
                        className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm transition-all select-none touch-none focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                            state === 'idle'
                                ? 'bg-brand-blue text-white hover:scale-105 active:scale-95'
                                : state === 'recording'
                                    ? 'bg-rose-500 text-white animate-pulse scale-110'
                                    : 'bg-emerald-500 text-white hover:scale-105 active:scale-95'
                        }`}
                        aria-label={
                            state === 'idle'
                                ? (isArabic ? 'اضغط مطولاً للتسجيل' : 'Hold to record')
                                : state === 'recording'
                                    ? (isArabic ? 'اترك للإرسال' : 'Release to send')
                                    : (isArabic ? 'تشغيل' : 'Play')
                        }
                    >
                        {state === 'idle' && <Mic className="w-5 h-5" />}
                        {state === 'recording' && <Mic className="w-5 h-5" />}
                        {state === 'recorded' && (
                            isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-1" />
                        )}
                    </button>
                    <div>
                        <p className="text-xs font-black text-slate-900 dark:text-white">
                            {state === 'idle'
                                ? (isArabic ? 'اضغط مطولاً للتسجيل' : 'Hold to Record')
                                : state === 'recording'
                                    ? (isArabic ? 'اترك للإرسال' : 'Release to send')
                                    : (isArabic ? 'تم التسجيل' : 'Recorded')}
                        </p>
                        {state === 'recording' && (
                            <p className="text-[10px] font-bold text-rose-500 mt-0.5">
                                {formatTime(elapsed)}
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
                            onPointerDown={(e) => {
                                e.preventDefault();
                                clearRecording();
                                e.currentTarget.setPointerCapture(e.pointerId);
                                holdActiveRef.current = true;
                                void startRecording();
                            }}
                            onPointerUp={onPointerUpOrCancel}
                            onPointerCancel={onPointerUpOrCancel}
                            onContextMenu={(e) => e.preventDefault()}
                            className="p-1.5 rounded-full text-slate-400 hover:text-brand-blue hover:bg-blue-50 dark:hover:bg-brand-blue/10 transition-colors select-none touch-none"
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
                                height: `${20 + (i % 3) * 20}%`,
                                animationDelay: `${i * 0.1}s`,
                                animationDuration: '0.6s',
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
