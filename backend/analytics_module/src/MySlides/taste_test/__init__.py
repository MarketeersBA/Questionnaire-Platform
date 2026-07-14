"""
Taste Test dynamic slides: preference, importance, purchase_intent, nps, sub_features,
overall_features, open-end (likes/dislikes/improvements).
Each slide runs once per comparator; comparators loop is handled in run.py (outer loop).
"""
from backend.analytics_module.src.MySlides.taste_test.importance import TasteTestImportanceSlide
from backend.analytics_module.src.MySlides.taste_test.nps import TasteTestNpsSlide
from backend.analytics_module.src.MySlides.taste_test.open_end import (
    TasteTestDislikesSlide,
    TasteTestImprovementsSlide,
    TasteTestLikesSlide,
)
from backend.analytics_module.src.MySlides.taste_test.overall_features import TasteTestOverallFeaturesSlide
from backend.analytics_module.src.MySlides.taste_test.preference import TasteTestPreferenceSlide
from backend.analytics_module.src.MySlides.taste_test.purchase_intent import TasteTestPurchaseIntentSlide
from backend.analytics_module.src.MySlides.taste_test.sub_features import TasteTestSubFeaturesSlide

__all__ = [
    "TasteTestPreferenceSlide",
    "TasteTestImportanceSlide",
    "TasteTestPurchaseIntentSlide",
    "TasteTestNpsSlide",
    "TasteTestSubFeaturesSlide",
    "TasteTestOverallFeaturesSlide",
    "TasteTestLikesSlide",
    "TasteTestDislikesSlide",
    "TasteTestImprovementsSlide",
]
