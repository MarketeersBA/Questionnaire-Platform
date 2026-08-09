import OpenEndAnswerInput from './OpenEndAnswerInput';
import FollowUpConversationThread from './FollowUpConversationThread';
import {
  commitOpenEndPrimaryEdit,
  projectOpenEndPrimaryOnly,
  splitFollowUpAnswerText,
} from '../../utils/followUpAnswerPersistence';
import { normalizeOpenEndAnswer, type OpenEndAnswer } from '../../utils/voiceQuestions';

interface Props {
  value: unknown;
  onChange: (next: OpenEndAnswer) => void;
  publicToken?: string;
  questionId: string;
  brandName?: string;
  questionText?: string;
  language?: 'en' | 'ar';
  showVoice: boolean;
  onBlur?: (primaryText: string) => void;
}

export default function OpenEndAnswerWithFollowUpThread({
  value,
  onChange,
  publicToken,
  questionId,
  brandName,
  questionText,
  language = 'en',
  showVoice,
  onBlur,
}: Props) {
  const storedText = normalizeOpenEndAnswer(value).text || '';
  const { exchanges } = splitFollowUpAnswerText(storedText);
  const displayValue = projectOpenEndPrimaryOnly(value);

  return (
    <>
      <OpenEndAnswerInput
        value={displayValue}
        showVoice={showVoice}
        publicToken={publicToken}
        questionId={questionId}
        brandName={brandName}
        questionText={questionText}
        language={language}
        onChange={(next) => onChange(commitOpenEndPrimaryEdit(value, next))}
        onBlur={onBlur}
      />
      <FollowUpConversationThread exchanges={exchanges} language={language} />
    </>
  );
}
