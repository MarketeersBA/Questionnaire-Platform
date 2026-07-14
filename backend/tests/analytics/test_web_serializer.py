import pytest
import pandas as pd
from backend.models import ChartPayload
from backend.analytics_module.web_serializer import WebReportSerializer
from backend.analytics_module.src.MySlides import (
    TasteTestPreferenceSlide,
    TasteTestNpsSlide,
    TasteTestLikesSlide,
)

class TestWebSerializer:
    def test_serialize_preference_chart(self):
        concept = TasteTestPreferenceSlide()
        concept.template_slide_title = "Test Preference"
        concept.comparator = ["Brand A", "Brand B"]
        
        # Mock DataFrame: Index = Targets (Overall, Taste, etc.), Columns = Brands
        df = pd.DataFrame({
            "Brand A": [0.6, 0.7],
            "Brand B": [0.4, 0.3]
        }, index=["Overall Preference", "Taste Preference"])
        
        payloads = WebReportSerializer.serialize_slide(concept, df)
        
        assert len(payloads) == 1
        payload = payloads[0]
        assert isinstance(payload, ChartPayload)
        assert payload.chart_type == "grouped_bar"
        assert payload.title == "Test Preference"
        
        data = payload.data
        assert data["labels"] == ["Overall Preference", "Taste Preference"]
        assert len(data["datasets"]) == 2
        assert data["datasets"][0]["label"] == "Brand A"
        assert data["datasets"][0]["data"] == [0.6, 0.7]

    def test_serialize_nps_gauge(self):
        concept = TasteTestNpsSlide()
        concept.template_slide_title = "NPS"
        
        df = pd.DataFrame({
            "Brand A": {"NPS_Score": 45, "Promoters_Pct": 0.6, "Passives_Pct": 0.25, "Detractors_Pct": 0.15},
            "Brand B": {"NPS_Score": -10, "Promoters_Pct": 0.2, "Passives_Pct": 0.5, "Detractors_Pct": 0.3}
        })
        
        payloads = WebReportSerializer.serialize_slide(concept, df)
        
        assert len(payloads) == 2
        payload_a = payloads[0]
        assert payload_a.chart_type == "gauge"
        assert payload_a.data["nps"] == 45
        assert payload_a.data["brand"] == "Brand A"
        assert payload_a.title == "Brand A NPS"
        
        payload_b = payloads[1]
        assert payload_b.data["nps"] == -10
        assert payload_b.data["brand"] == "Brand B"

    def test_serialize_wordcloud(self):
        concept = TasteTestLikesSlide()
        concept.template_slide_title = "What did you like?"
        
        # Test Series format (single brand/overall)
        series = pd.Series({"Sweet": 15, "Crunchy": 10, "Fresh": 5})
        
        payloads = WebReportSerializer.serialize_slide(concept, series)
        assert len(payloads) == 1
        assert payloads[0].chart_type == "wordcloud"
        
        words = payloads[0].data["words"]
        assert len(words) == 3
        assert words[0] == {"text": "Sweet", "value": 15}
        
    def test_serialize_wordcloud_multi_brand(self):
        concept = TasteTestLikesSlide()
        concept.template_slide_title = "What did you like?"
        
        df = pd.DataFrame({
            "Brand A": {"Sweet": 15, "Crunchy": 10},
            "Brand B": {"Salty": 20, "Dry": 5}
        })
        
        payloads = WebReportSerializer.serialize_slide(concept, df)
        assert len(payloads) == 2
        assert payloads[0].chart_type == "wordcloud"
        assert payloads[0].data["brand"] == "Brand A"
        assert payloads[0].data["words"][0]["text"] == "Sweet"
        
        assert payloads[1].chart_type == "wordcloud"
        assert payloads[1].data["brand"] == "Brand B"
