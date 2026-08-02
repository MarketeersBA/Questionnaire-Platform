import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2, Send, Loader2 } from 'lucide-react';

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
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [blob, setBlob] = useState<Blob | null>(null);
    const [timer, setTimer] = useState(0);
    const [isUploading, setIsUploading] = useState(false);

    const mediaRecorder = useRef<MediaRecorder | null>(null);
    const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
    const isAr = language === 'ar';

    useEffect(() => {
        return () => {
            if (timerInterval.current) clearInterval(timerInterval.current);
        };
    }, []);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder.current = new MediaRecorder(stream);
            const chunks: BlobPart[] = [];

            mediaRecorder.current.ondataavailable = (e) => chunks.push(e.data);
            mediaRecorder.current.onstop = () => {
                stream.getTracks().forEach((track) => track.stop());
                const audioBlob = new Blob(chunks, { type: 'audio/webm' });
                setBlob(audioBlob);
                setAudioUrl(URL.createObjectURL(audioBlob));
            };

            mediaRecorder.current.start();
            setIsRecording(true);
            setTimer(0);
            timerInterval.current = setInterval(() => setTimer((t) => t + 1), 1000);
        } catch (err) {
            console.error('Failed to access microphone:', err);
            alert(isAr ? 'يرجى السماح بالوصول إلى الميكروفون لتسجيل إجابتك.' : 'Please allow microphone access to record your answer.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorder.current && isRecording) {
            mediaRecorder.current.stop();
            setIsRecording(false);
            if (timerInterval.current) clearInterval(timerInterval.current);
        }
    };

    const resetRecording = () => {
        setAudioUrl(null);
        setBlob(null);
        setTimer(0);
    };

    const uploadAudio = async () => {
        if (!blob) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', blob, 'feedback.webm');
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
                    }
                );
            } else {
                throw new Error('Missing upload context');
            }

            if (response.ok) {
                const data = await response.json();
                onUploadSuccess(data.feedback_id || data.id);
                resetRecording();
            } else {
                alert(isAr ? 'فشل رفع التسجيل. يرجى المحاولة مرة أخرى.' : 'Upload failed. Please try again.');
            }
        } catch (err) {
            console.error('Upload error:', err);
            alert(isAr ? 'خطأ في الشبكة. يرجى المحاولة مرة أخرى.' : 'Network error. Please try again.');
        } finally {
            setIsUploading(false);
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const wrapperClass = compact
        ? 'space-y-4'
        : 'bg-gradient-to-br from-brand-blue/5 to-white dark:from-brand-blue/10 dark:to-slate-900 p-6 rounded-2xl border border-brand-blue/20 border-dashed space-y-4';

    return (
        <div className={wrapperClass}>

            {!audioUrl && !isRecording && (
                <button
                    type="button"
                    onClick={startRecording}
                    className="w-full flex items-center justify-center py-4 bg-brand-blue text-white rounded-2xl hover:bg-brand-blue/90 transition-all shadow-lg shadow-brand-blue/20"
                >
                    <Mic size={22} className={isAr ? 'ml-2' : 'mr-2'} />
                    <span className="font-bold">{isAr ? 'بدء التسجيل' : 'Tap to Record'}</span>
                </button>
            )}

            {isRecording && (
                <div className="flex flex-col items-center py-2">
                    <div className="text-3xl font-mono font-bold text-rose-500 mb-4 animate-pulse">
                        {formatTime(timer)}
                    </div>
                    <button
                        type="button"
                        onClick={stopRecording}
                        className="w-20 h-20 rounded-full bg-rose-600 text-white flex items-center justify-center hover:bg-rose-700 transition-all"
                    >
                        <Square size={28} />
                    </button>
                    <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        {isAr ? 'جاري التسجيل...' : 'Recording...'}
                    </p>
                </div>
            )}

            {audioUrl && !isUploading && (
                <div>
                    <audio src={audioUrl} controls className="w-full mb-4 h-10" />
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={resetRecording}
                            className="flex-1 flex items-center justify-center py-3 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 transition-colors"
                        >
                            <Trash2 size={18} className={isAr ? 'ml-2' : 'mr-2'} />
                            {isAr ? 'إعادة' : 'Re-record'}
                        </button>
                        <button
                            type="button"
                            onClick={uploadAudio}
                            className="flex-1 flex items-center justify-center py-3 bg-brand-blue text-white rounded-xl hover:bg-brand-blue/90 transition-all"
                        >
                            <Send size={18} className={isAr ? 'ml-2' : 'mr-2'} />
                            {isAr ? 'حفظ' : 'Save Recording'}
                        </button>
                    </div>
                </div>
            )}

            {isUploading && (
                <div className="flex flex-col items-center py-4">
                    <Loader2 className="animate-spin text-brand-blue mb-2" size={28} />
                    <p className="text-sm font-medium text-slate-500">
                        {isAr ? 'جاري حفظ التسجيل...' : 'Saving your recording...'}
                    </p>
                </div>
            )}
        </div>
    );
};

export default AudioRecorder;
