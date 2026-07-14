import re
import json
import os
import logging
from typing import List, Dict, Any, Optional
from backend.voice_feedback.franco_arabic_decoder import decoder
from backend.analytics_module.src.ai import api_cost

logger = logging.getLogger(__name__)

class TextNormalizer:
    def __init__(self, slang_dict_path: str = "backend/voice_feedback/slang_dictionary.json"):
        self.slang_dict = self._load_slang_dict(slang_dict_path)
        
        # Noise/Filler words (Arabic and English)
        self.fillers = {
            "يعني", "اممم", "أهه", "بقى", "زي ما تقول", "يعني زي", 
            "عارف", "إيه", "أصلاً", "أنا", "بص", "كده", "اه", "ام", "أه",
            "um", "uh", "like", "you know", "actually", "basically"
        }

    def _load_slang_dict(self, path: str) -> Dict[str, Dict[str, str]]:
        if not os.path.exists(path):
            logger.warning(f"Slang dictionary not found at {path}")
            return {}
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load slang dictionary: {e}")
            return {}

    def strip_diacritics(self, text: str) -> str:
        """Remove harakat (fathah, dammah, etc.)."""
        # Arabic diacritics regex range: \u064B-\u0652
        return re.sub(r'[\u064B-\u0652]', '', text)

    def normalize_arabic_letters(self, text: str) -> str:
        """Standardize letter variants: Alif, Yaa, Taa Marbuta."""
        text = re.sub(f'[أإآ]', 'ا', text)
        text = re.sub(f'ى', 'ي', text)
        text = re.sub(f'ة', 'ه', text)
        return text

    def remove_elongation(self, text: str) -> str:
        """Reduce repeated letters (e.g., حلووووو -> حلو)."""
        # Arabic characters usually elongation (tatweel) is \u0640
        text = re.sub(r'\u0640', '', text)
        # Repeated character reduction (more than 2)
        return re.sub(r'(.)\1{2,}', r'\1', text)

    def remove_noise(self, text: str) -> str:
        """Remove filler words and disfluencies."""
        words = text.split()
        cleaned_words = [w for w in words if w not in self.fillers]
        return " ".join(cleaned_words)

    def apply_slang_mapping(self, text: str) -> str:
        """
        Replace dialectal slang with more formal equivalents from the dictionary.
        Uses regex word boundaries for precision.
        """
        flat_dict = {}
        for region in self.slang_dict.values():
            flat_dict.update(region)
        
        # Sort by length descending to match longest phrases first
        phrases = sorted(flat_dict.keys(), key=len, reverse=True)
        
        for phrase in phrases:
            # For Arabic, word boundaries are tricky with \b, so we use lookarounds
            # or spaces. Modern regex \b works reasonably with UTF-8 if compiled correctly,
            # but explicit lookarounds or space checks are safer for mixed scripts.
            pattern = rf'(?<!\w){re.escape(phrase)}(?!\w)'
            text = re.sub(pattern, flat_dict[phrase], text)
            
        return text

    async def normalize(self, text: str, skip_llm: bool = False) -> Dict[str, Any]:
        """
        Execute the full normalization pipeline.
        Returns a dict with original, normalized text, and flags.
        """
        original = text
        current = text
        
        # 1. Franco-Arabic Decoding (if detected)
        is_franco = decoder.is_franco(current)
        if is_franco:
            if not skip_llm:
                current = await decoder.decode_sentence_llm(current)
            else:
                # Advanced rule-based fallback for deterministic tests
                words = current.split()
                current = " ".join([decoder.decode_word(w) for w in words])
        
        # 2. Arabic-specific stripping & Elongation removal
        current = self.strip_diacritics(current)
        current = self.normalize_arabic_letters(current)
        current = self.remove_elongation(current)
        
        # 3. Noise/Filler removal (Run AFTER elongation removal so 'امممم' -> 'ام' is caught)
        current = self.remove_noise(current)
        
        # 4. Slang mapping
        current = self.apply_slang_mapping(current)
        
        # 5. Clean up whitespace
        current = re.sub(r'\s+', ' ', current).strip()
        
        # 6. Basic Code-switching detection
        has_arabic = bool(re.search(r'[\u0600-\u06FF]', current))
        has_english = bool(re.search(r'[a-zA-Z]', current))
        
        return {
            "original": original,
            "normalized": current,
            "is_franco": is_franco,
            "code_switched": has_arabic and has_english,
            "primary_language": "ar" if has_arabic else "en"
        }

# Global instance
normalizer = TextNormalizer()
