"""Phase 9 — aggregator uses pf_q* stage roles from ingestor context."""

from unittest.mock import patch

import pandas as pd

from backend.analytics_module.aggregator import ReportAggregator
from backend.analytics_module.ingestor import SurveyData


def _survey_data_with_pf():
    pf = pd.DataFrame(
        [
            {"response_id": "r1", "token": "T1", "question": "pf_q1", "value": "Nike"},
            {"response_id": "r1", "token": "T1", "question": "pf_q2", "value": []},
            {"response_id": "r1", "token": "T1", "question": "pf_q3", "value": ["Nike"]},
            {"response_id": "r1", "token": "T1", "question": "pf_q4", "value": ["Nike"]},
            {"response_id": "r1", "token": "T1", "question": "pf_q5", "value": ["Nike"]},
            {"response_id": "r1", "token": "T1", "question": "pf_q6", "value": ["Nike"]},
            {"response_id": "r1", "token": "T1", "question": "pf_q7", "value": "Nike"},
        ]
    )
    evals = pd.DataFrame(
        [{"response_id": "r1", "token": "T1", "brand": "Nike", "value": 8}]
    )
    return SurveyData(
        evaluations=evals,
        demographics=pd.DataFrame(),
        purchase_funnel=pf,
        preferences=pd.DataFrame(),
        open_ends=pd.DataFrame(),
        question_map={},
        response_count=1,
        brands=["Nike"],
        brand_master_list=["Nike"],
        brand_alias_map={},
        awareness_keys={"tom": "pf_q1", "other_unaided": "pf_q2", "aided": "pf_q3"},
        stage_roles={
            "consideration": "pf_q4",
            "bought_12m": "pf_q5",
            "bought_3m": "pf_q6",
            "mou": "pf_q7",
        },
        legacy_id_aliases={"aw_q1": "pf_q1", "pb_q1": "pf_q4"},
        module_usage=pd.DataFrame(),
        module_pricing=pd.DataFrame(),
        purchase_funnel_brands=["Nike"],
        survey_id="s1",
        own_brand="Nike",
        category="Snacks",
    )


def test_aggregator_purchase_funnel_chart_with_pf_q_roles():
    agg = ReportAggregator(_survey_data_with_pf(), my_brand="Nike")
    mock_base = {
        "rows": [
            {
                "brand": "Nike",
                "stages": {
                    "total_awareness": 1.0,
                    "consideration": 0.5,
                    "bought_12m": 0.5,
                    "bought_3m": 0.5,
                    "mou": 0.5,
                },
            }
        ],
        "base_n": 1,
        "metadata": {"stage_roles": agg._stage_roles()},
    }
    with patch.object(agg, "_build_purchase_funnel_stage_base", return_value=mock_base):
        chart = agg.purchase_funnel_chart()
    assert chart.get("chart_id") == "purchase_funnel"
    datasets = chart.get("data", {}).get("datasets", [])
    assert len(datasets) >= 1
    nike = next((d for d in datasets if d.get("brand") == "Nike"), None)
    assert nike is not None
    assert len(nike["data"]) == 5


def test_aggregator_stage_role_resolution():
    agg = ReportAggregator(_survey_data_with_pf(), my_brand="Nike")
    assert agg._question_ids_for_stage("consideration") == ["pf_q4", "pb_q1"]
