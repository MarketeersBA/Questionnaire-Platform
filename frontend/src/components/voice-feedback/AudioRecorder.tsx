import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Loader2, Trash2 } from 'lucide-react';

interface Props {
    onUploadSuccess: (feedbackId: string) => void;
    surveyId?: string;
    questionId: string;
    /** Public survey token — enables respondent upload without staff login */
    publicToken?: string;
    brandName?: string;
    questionText?: string;
    language?: 'en' | 'ar';
    compact?: boolean;
}

/** Ignore accidental taps shorter than this (ms). */
const MIN_HOLD_MS = 400;

const AudioRecorder: React.FC<Props> = ({
    onUploadSuccess,
    surveyId,
    questionId,
    publicToken,
    brandName,
    questionText,
    language = 'en',
    compact = false,
}) => {
    const [isRecording, setIsRecording] = useState(false);
    const [timer, setTimer] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [lastError, setLastError] = useState<string | null>(null);

    const mediaRecorder = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
    const holdActiveRef = useRef(false);
    const recordingStartedAtRef = useRef(0);
    const startInFlightRef = useRef(false);
    const isAr = language === 'ar';

    const clearTimer = useCallback(() => {
        if (timerInterval.current) {
            clearInterval(timerInterval.current);
            timerInterval.current = null;
        }
    }, []);

    const stopStream = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    }, []);

    useEffect(() => {
        return () => {
            clearTimer();
            holdActiveRef.current = false;
            if (mediaRecorder.current?.state === 'recording') {
                mediaRecorder.current.stop();
            }
            stopStream();
        };
    }, [clearTimer, stopStream]);

    const uploadBlob = useCallback(async (audioBlob: Blob) => {
        setIsUploading(true);
        setLastError(null);
        const formData = new FormData();
        formData.append('file', audioBlob, 'feedback.webm');
        formData.append('question_id', questionId);
        if (brandName) formData.append('brand_name', brandName);
        if (questionText) formData.append('question_text', questionText);

        try {
            let response: Response;

            if (publicToken) {
                response = await fetch(`/api/s/${publicToken}/voice-upload`, {
                    method: 'POST',
                    body: formData,
                });
            } else if (surveyId) {
                response = await fetch(
                    `/api/voice-feedback/${surveyId}/upload?question_id=${encodeURIComponent(questionId)}&token=admin-test`,
                    {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${localStorage.getItem('token')}`,
                        },
                        body: formData,
                    },
                );
            } else {
                throw new Error('Missing upload context');
            }

            if (response.ok) {
                const data = await response.json();
                onUploadSuccess(data.feedback_id || data.id);
            } else {
                setLastError(isAr ? 'فشل رفع التسجيل. اضغط مطولاً للمحاولة مرة أخرى.' : 'Upload failed. Hold to try again.');
            }
        } catch (err) {
            console.error('Upload error:', err);
            setLastError(isAr ? 'خطأ في الشبكة. اضغط مطولاً للمحاولة مرة أخرى.' : 'Network error. Hold to try again.');
        } finally {
            setIsUploading(false);
        }
    }, [brandName, isAr, onUploadSuccess, publicToken, questionId, questionText, surveyId]);

    const finishRecording = useCallback(() => {
        const recorder = mediaRecorder.current;
        if (!recorder || recorder.state !== 'recording') {
            setIsRecording(false);
            clearTimer();
            stopStream();
            return;
        }

        const heldMs = Date.now() - recordingStartedAtRef.current;
        recorder.onstop = () => {
            stopStream();
            const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
            chunksRef.current = [];
            mediaRecorder.current = null;

            if (heldMs < MIN_HOLD_MS || audioBlob.size < 100) {
                setLastError(isAr ? 'اضغط مطولاً للتسجيل' : 'Hold longer to record');
                return;
            }

            void uploadBlob(audioBlob);
        };

        recorder.stop();
        setIsRecording(false);
        clearTimer();
    }, [clearTimer, isAr, stopStream, uploadBlob]);

    const startRecording = useCallback(async () => {
        if (startInFlightRef.current || isUploading) return;
        startInFlightRef.current = true;
        setLastError(null);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Released before mic permission / start finished — discard.
            if (!holdActiveRef.current) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }

            streamRef.current = stream;
            chunksRef.current = [];
            const recorder = new MediaRecorder(stream);
            mediaRecorder.current = recorder;

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.start();
            recordingStartedAtRef.current = Date.now();
            setIsRecording(true);
            setTimer(0);
            clearTimer();
            timerInterval.current = setInterval(() => setTimer((t) => t + 1), 1000);

            // Released while starting — stop immediately.
            if (!holdActiveRef.current) {
                finishRecording();
            }
        } catch (err) {
            console.error('Failed to access microphone:', err);
            holdActiveRef.current = false;
            setIsRecording(false);
            setLastError(
                isAr
                    ? 'يرجى السماح بالوصول إلى الميكروفون لتسجيل إجابتك.'
                    : 'Please allow microphone access to record your answer.',
            );
        } finally {
            startInFlightRef.current = false;
        }
    }, [clearTimer, finishRecording, isAr, isUploading]);

    const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (isUploading) return;
        // Only primary button / touch / pen
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        holdActiveRef.current = true;
        void startRecording();
    };

    const onPointerUpOrCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!holdActiveRef.current && !isRecording) return;
        holdActiveRef.current = false;
        try {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
            }
        } catch {
            /* already released */
        }
        finishRecording();
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const wrapperClass = compact
        ? 'space-y-3'
        : 'bg-gradient-to-br from-brand-blue/5 to-white dark:from-brand-blue/10 dark:to-slate-900 p-6 rounded-2xl border border-brand-blue/20 border-dashed space-y-4';

    return (
        <div className={wrapperClass}>
            {isUploading ? (
                <div className="flex flex-col items-center py-4">
                    <Loader2 className="animate-spin text-brand-blue mb-2" size={28} />
                    <p className="text-sm font-medium text-slate-500">
                        {isAr ? 'جاري حفظ التسجيل...' : 'Saving your recording...'}
                    </p>
                </div>
            ) : (
                <button
                    type="button"
                    onPointerDown={onPointerDown}
                    onPointerUp={onPointerUpOrCancel}
                    onPointerCancel={onPointerUpOrCancel}
                    onContextMenu={(e) => e.preventDefault()}
                    disabled={isUploading}
                    aria-label={isAr ? 'اضغط مطولاً للتسجيل' : 'Hold to record'}
                    className={`w-full select-none touch-none flex flex-col items-center justify-center py-5 rounded-2xl transition-all ${
                        isRecording
                            ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                            : 'bg-brand-blue text-white hover:bg-brand-blue/90 shadow-lg shadow-brand-blue/20'
                    }`}
                >
                    {isRecording ? (
                        <>
                            <div className="text-2xl font-mono font-bold animate-pulse mb-2">
                                {formatTime(timer)}
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-widest opacity-90">
                                {isAr ? 'اترك للإرسال' : 'Release to send'}
                            </p>
                        </>
                    ) : (
                        <span className="flex items-center font-bold">
                            <Mic size={22} className={isAr ? 'ml-2' : 'mr-2'} />
                            {isAr ? 'اضغط مطولاً للتسجيل' : 'Hold to Record'}
                        </span>
                    )}
                </button>
            )}

            {lastError && !isRecording && !isUploading && (
                <p className="text-xs font-bold text-rose-500 text-center flex items-center justify-center gap-1.5">
                    <Trash2 size={12} className="opacity-70" />
                    {lastError}
                </p>
            )}
        </div>
    );
};

export default AudioRecorder;
