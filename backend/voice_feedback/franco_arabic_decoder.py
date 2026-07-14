import re
import logging
from typing import Optional
from openai import OpenAI
from backend.config import settings

logger = logging.getLogger(__name__)

class FrancoArabicDecoder:
    """
    Translates Arabizi (Franco-Arabic) to Arabic script.
    Uses rule-based character mapping for simple words and LLM for complex context.
    """
    
    # Character mapping: Franco -> Arabic
    MAPPING = {
        '2': 'ء',
        '3': 'ع',
        '3\'': 'غ',
        '4': 'ش',
        '5': 'خ',
        '6': 'ط',
        '6\'': 'ظ',
        '7': 'ح',
        '8': 'غ',
        '8\'': 'ق', # Alternative mapping
        '9': 'ص',
        '9\'': 'ض',
    }

    # Common word dictionary (Franco -> Arabic)
    COMMON_WORDS = {
        "7elw": "حلو",
        "gedan": "جدا",
        "ya3ny": "يعني",
        "mashy": "ماشي",
        "shokran": "شكرا",
        "ezayak": "ازيك",
        "ezayek": "ازيك",
        "el": "ال",
        "la2": "لأ",
        "ishta": "قشطة",
        "tamam": "تمام",
        "ana": "انا",
        "5ayef": "خايف",
        "mnk": "منك",
        "9ba7": "صباح",
        "5er": "خير",
        "ya": "يا",
        "3amy": "عمي",
        "msh": "مش",
        "kda": "كده",
        "enta": "انت",
        "enti": "انتي",
        "kolo": "كله",
        "mabrouk": "مبروك",
        "alf": "ألف",
        "ya3ni": "يعني"
    }

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.OPENAI_API_KEY
        self.client = OpenAI(api_key=self.api_key)

    def decode_word(self, word: str) -> str:
        """Rule-based single word decoding."""
        # Check dictionary first
        low_word = word.lower()
        if low_word in self.COMMON_WORDS:
            return self.COMMON_WORDS[low_word]
        
        # Simple replacement (heuristic)
        decoded = word
        for franco, arabic in self.MAPPING.items():
            decoded = decoded.replace(franco, arabic)
        
        return decoded

    async def decode_sentence_llm(self, text: str) -> str:
        """
        Use LLM to decode Franco-Arabic which is highly contextual and non-standard.
        """
        # Only use LLM if we detect Franco characters (numbers used as letters)
        if not re.search(r'[2356789]', text):
            return text

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a linguist specializing in Middle Eastern dialects. Convert the following Franco-Arabic (Arabizi) text into standard Arabic script. Maintain the dialectal nuances but use Arabic characters. Output only the Arabic text."},
                    {"role": "user", "content": text}
                ],
                temperature=0,
                max_tokens=len(text) * 2
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"LLM Franco decoding failed: {e}")
            return text # Fallback to original

    def is_franco(self, text: str) -> bool:
        """Check if text contains Franco-Arabic characteristics."""
        # Heuristic: Latin characters mixed with numbers 2, 3, 5, 7, etc. or words starting with these numbers
        return bool(re.search(r'[a-zA-Z]*[23456789][a-zA-Z0-9]*', text))

decoder = FrancoArabicDecoder()
