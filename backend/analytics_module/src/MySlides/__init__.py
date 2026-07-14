"""
dynamic_slides — expandable slide concept classes.

Public API
----------
DynamicSlideConcept   Base class; import to type-hint concept instances.
BrandCardSlide        One slide per focus brand (PF + why-MOU chart).
CrossTabsSlide        One slide per (metric × segmentation group).
HabitsOpinionsSlide   One slide per question group (sc/mc combinations).
BrandAnalyzerSlide    One slide per analyzer view (Combined/Performance/Imagery).
BrandAwarenessSlide   Single Brand Awareness chart slide (one chart, no loop).
PurchaseFunnelChartSlide   Single Purchase Funnel chart slide.
PurchaseFunnelTableSlide   Single Purchase Funnel table slide (pf_table).
RecommendationSlide   Four 4-Ps slides; used when w_recommendations (not a section name).
TasteTestPreferenceSlide, TasteTestImportanceSlide, TasteTestPurchaseIntentSlide,
TasteTestNpsSlide, TasteTestSubFeaturesSlide, TasteTestOverallFeaturesSlide,
TasteTestLikesSlide, TasteTestDislikesSlide, TasteTestImprovementsSlide — Taste Test slides (one per comparator).

run_dynamic_slides    Runner: concepts + insights (phase 1–2); phase 3 if w_recommendations.
build_concepts_from_sections  Resolve concept classes from section names.
get_concept_for_section       Look up concept classes for a section (list; multiple per section supported).
"""

__all__ = [
    "DynamicSlideConcept",
    "BrandCardSlide",
    "CrossTabsSlide",
    "HabitsOpinionsSlide",
    "BrandAnalyzerSlide",
    "BrandAwarenessSlide",
    "PurchaseFunnelChartSlide",
    "PurchaseFunnelTableSlide",
    "RecommendationSlide",
    "TasteTestPreferenceSlide",
    "TasteTestImportanceSlide",
    "TasteTestPurchaseIntentSlide",
    "TasteTestNpsSlide",
    "TasteTestSubFeaturesSlide",
    "TasteTestOverallFeaturesSlide",
    "TasteTestLikesSlide",
    "TasteTestDislikesSlide",
    "TasteTestImprovementsSlide",
    "run_dynamic_slides",
    "build_concepts_from_sections",
    "get_concept_for_section",
]

from backend.analytics_module.src.MySlides.base import DynamicSlideConcept
from backend.analytics_module.src.MySlides.brand_analyzer import BrandAnalyzerSlide
from backend.analytics_module.src.MySlides.brand_awareness import BrandAwarenessSlide
from backend.analytics_module.src.MySlides.brand_cards import BrandCardSlide
from backend.analytics_module.src.MySlides.cross_tabs import CrossTabsSlide
from backend.analytics_module.src.MySlides.habits_opinions import HabitsOpinionsSlide
from backend.analytics_module.src.MySlides.purchase_funnel import PurchaseFunnelChartSlide, PurchaseFunnelTableSlide
from backend.analytics_module.src.MySlides.recommendation import RecommendationSlide
from backend.analytics_module.src.MySlides.run import get_concept_for_section, build_concepts_from_sections, run_dynamic_slides
from backend.analytics_module.src.MySlides.taste_test.importance import TasteTestImportanceSlide
from backend.analytics_module.src.MySlides.taste_test.nps import TasteTestNpsSlide
from backend.analytics_module.src.MySlides.taste_test.open_end import TasteTestImprovementsSlide, TasteTestDislikesSlide, TasteTestLikesSlide
from backend.analytics_module.src.MySlides.taste_test.overall_features import TasteTestOverallFeaturesSlide
from backend.analytics_module.src.MySlides.taste_test.preference import TasteTestPreferenceSlide
from backend.analytics_module.src.MySlides.taste_test.purchase_intent import TasteTestPurchaseIntentSlide
from backend.analytics_module.src.MySlides.taste_test.sub_features import TasteTestSubFeaturesSlide
