import { motion } from 'framer-motion';
import { MessageCircle, Sparkles } from 'lucide-react';
import type { FollowUpExchangeBlock } from '../../utils/followUpAnswerPersistence';
import { FOLLOWUP_VOICE_REPLY_PLACEHOLDER } from '../../utils/followUpAnswerPersistence';

export interface FollowUpConversationThreadProps {
  exchanges: FollowUpExchangeBlock[];
  language: 'en' | 'ar';
}

const COPY = {
  en: {
    title: 'Conversation',
    ai: 'AI Researcher',
    you: 'You',
    voiceReply: 'Voice answer recorded',
  },
  ar: {
    title: 'المحادثة',
    ai: 'الباحث الذكي',
    you: 'أنت',
    voiceReply: 'تم تسجيل إجابة صوتية',
  },
} as const;

function formatRespondentDisplay(text: string, voiceLabel: string): string {
  if (text.trim() === FOLLOWUP_VOICE_REPLY_PLACEHOLDER) return voiceLabel;
  return text;
}

export default function FollowUpConversationThread({
  exchanges,
  language,
}: FollowUpConversationThreadProps) {
  if (!exchanges.length) return null;

  const isAr = language === 'ar';
  const copy = COPY[language];

  return (
    <div className="mt-4 space-y-3" dir={isAr ? 'rtl' : 'ltr'}>
      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
        {copy.title}
      </p>
      <div className="space-y-3">
        {exchanges.map((exchange, index) => (
          <motion.div
            key={`${index}-${exchange.prompt.slice(0, 24)}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: Math.min(index * 0.04, 0.2) }}
            className="space-y-2"
          >
            <div className="flex gap-2.5 items-start">
              <div className="mt-0.5 w-7 h-7 rounded-full bg-primary/10 text-primary-soft flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary-soft mb-1">
                  {copy.ai}
                </p>
                <p className="text-sm font-semibold text-ink-muted leading-relaxed">
                  {exchange.prompt}
                </p>
              </div>
            </div>
            <div className="flex gap-2.5 items-start">
              <div className="mt-0.5 w-7 h-7 rounded-full bg-slate-200/80 dark:bg-slate-700 text-slate-500 dark:text-slate-300 flex items-center justify-center shrink-0">
                <MessageCircle className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  {copy.you}
                </p>
                <p className="text-sm font-bold text-ink leading-relaxed">
                  {formatRespondentDisplay(exchange.respondent, copy.voiceReply)}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
