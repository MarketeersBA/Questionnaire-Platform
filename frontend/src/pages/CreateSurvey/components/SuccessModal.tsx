import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, Copy, ExternalLink, Download } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getSurveyBaseUrl, getMasterLink } from '../../../utils/surveyLinks';

interface SuccessModalProps {
    successData: any;
}

export function SuccessModal({ successData }: SuccessModalProps) {
    const navigate = useNavigate();

    if (!successData) return null;

    // Every consumer below needs the id; slicing it unguarded used to throw and
    // blank the whole modal when the API response shape shifted.
    const surveyId: string = successData._id ?? '';
    const shortId = surveyId ? surveyId.slice(-8).toUpperCase() : '—';
    const masterLink = getMasterLink(surveyId);

    /** Copy with a fallback for non-secure contexts, where clipboard is unavailable. */
    const copyText = (text: string, successMessage: string) => {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard
                .writeText(text)
                .then(() => toast.success(successMessage))
                .catch(() => toast.error('Copy failed'));
            return;
        }

        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            toast.success(successMessage);
        } catch {
            toast.error('Copy failed');
        }
        document.body.removeChild(textArea);
    };

    /**
     * Save the QR as a PNG.
     *
     * qrcode.react renders SVG, so this rasterises it through a canvas rather
     * than shipping a second canvas-based QR just for downloads.
     */
    const downloadQr = () => {
        const svg = document.getElementById('survey-master-qr');
        if (!svg) return;

        const source = new XMLSerializer().serializeToString(svg);
        const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        const image = new Image();
        image.onload = () => {
            // 3x for a crisp print/scan resolution.
            const scale = 3;
            const canvas = document.createElement('canvas');
            canvas.width = image.width * scale;
            canvas.height = image.height * scale;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                URL.revokeObjectURL(url);
                return;
            }
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);

            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = `survey-${shortId}-qr.png`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success('QR code downloaded');
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            toast.error('Could not export the QR code');
        };
        image.src = url;
    };

    return createPortal(
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-md"
        >
            <div className="bg-surface w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-[3rem] border border-line/80 dark:border-line/10 flex flex-col shadow-2xl transition-colors">
                <div className="p-10 border-b border-line/80 dark:border-line/10 flex items-center justify-between shrink-0 bg-primary/5 dark:bg-primary/10">
                    <div className="space-y-1 text-left">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">
                            <ShieldCheck className="w-4 h-4" />
                            Survey Ready
                        </div>
                        <h2 className="text-3xl font-display font-black text-ink">Survey <span className="text-primary-soft">Links</span></h2>
                    </div>
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="px-6 py-2 rounded-full bg-surface-sunken hover:bg-slate-200 dark:hover:bg-slate-700 text-[10px] font-black uppercase tracking-widest transition-all text-ink-muted shadow-sm"
                    >
                        Go to Dashboard
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar text-left">
                    <div className="flex items-center justify-center">
                        <div className="inline-flex items-center gap-4 px-6 py-4 rounded-2xl bg-surface-raised border border-line/70 dark:border-line/15">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-subtle">
                                Survey ID
                            </span>
                            <span className="text-2xl font-black text-ink tracking-wider tabular-nums">
                                {shortId}
                            </span>
                            <button
                                onClick={() => copyText(surveyId, 'Survey ID copied')}
                                className="p-2 rounded-lg text-ink-subtle hover:text-primary hover:bg-primary/10 transition-colors"
                                aria-label="Copy survey ID"
                            >
                                <Copy className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4 max-w-2xl mx-auto mt-4">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-ink-subtle">Master Distribution Link</h4>
                        </div>
                        
                        <div className="group relative p-8 rounded-3xl bg-surface-raised/50 border border-line/80 dark:border-line/10 hover:border-primary/30 transition-all overflow-hidden shadow-sm">
                            {/* Decorative Background */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none group-hover:bg-primary/10 transition-colors" />
                            
                            <div className="relative z-10 flex flex-col items-center text-center gap-6">
                                {/* A real, scannable QR of the master link — this
                                    was previously a decorative lucide glyph that
                                    encoded nothing. Rendered on a white plate
                                    because scanners need light-on-dark contrast
                                    regardless of the app theme. */}
                                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-md">
                                    <QRCodeSVG
                                        id="survey-master-qr"
                                        value={masterLink}
                                        size={168}
                                        level="M"
                                        marginSize={0}
                                        bgColor="#FFFFFF"
                                        fgColor="#255E91"
                                    />
                                </div>
                                <button
                                    onClick={downloadQr}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-xs font-black hover:bg-primary/20 transition-colors"
                                >
                                    <Download className="w-3.5 h-3.5" /> Download QR
                                </button>
                                
                                <div>
                                    <h3 className="text-lg font-black text-ink mb-2">Unique Survey Master Link</h3>
                                    <p className="text-xs font-medium text-slate-500 max-w-sm mx-auto">
                                        Distribute this single link to all respondents. The system will automatically handle individual tracking and prevent duplicates.
                                    </p>
                                </div>

                                <div className="w-full flex items-center p-2 rounded-2xl bg-surface border border-line/80 dark:border-line/10 shadow-inner">
                                    <div className="flex-1 px-4 overflow-x-auto no-scrollbar">
                                        <p className="text-sm font-mono text-ink-muted whitespace-nowrap">
                                            {`${getSurveyBaseUrl()}/m/${successData._id}`}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 pl-2 border-l border-line/80 dark:border-line/10">
                                        <button
                                            onClick={() => {
                                                const url = `${getSurveyBaseUrl()}/m/${successData._id}`;
                                                const fallbackCopy = (text: string) => {
                                                    const textArea = document.createElement("textarea");
                                                    textArea.value = text;
                                                    textArea.style.position = "fixed";
                                                    document.body.appendChild(textArea);
                                                    textArea.focus();
                                                    textArea.select();
                                                    try {
                                                        document.execCommand('copy');
                                                        toast.success('Master Link copied');
                                                    } catch (err) {
                                                        toast.error('Copy failed');
                                                    }
                                                    document.body.removeChild(textArea);
                                                };
                                                if (navigator.clipboard && window.isSecureContext) {
                                                    navigator.clipboard.writeText(url)
                                                        .then(() => toast.success('Master Link copied'))
                                                        .catch(() => fallbackCopy(url));
                                                } else {
                                                    fallbackCopy(url);
                                                }
                                            }}
                                            className="p-3 rounded-xl bg-primary text-white hover:bg-primary-hover hover:-translate-y-0.5 active:scale-95 transition-all shadow-md shadow-primary/20 flex items-center gap-2"
                                        >
                                            <Copy className="w-4 h-4" />
                                            <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Copy</span>
                                        </button>
                                        <a 
                                            href={`${getSurveyBaseUrl()}/m/${successData._id}`}
                                            target="_blank" 
                                            rel="noreferrer" 
                                            className="p-3 rounded-xl bg-surface-sunken text-slate-500 hover:text-primary-soft hover:bg-white dark:hover:bg-slate-700 active:scale-95 hover:-translate-y-0.5 transition-all shadow-sm flex items-center"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-8 bg-surface-raised/50 border-t border-line/80 dark:border-line/10 flex items-center justify-center gap-4 transition-colors">
                    <p className="text-[10px] font-black text-ink-subtle uppercase tracking-widest transition-colors">Survey is ready for distribution.</p>
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-sm" />
                </div>
            </div>
        </motion.div>,
        document.body
    );
}
