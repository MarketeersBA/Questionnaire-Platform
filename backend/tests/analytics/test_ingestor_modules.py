"""Phase 9 — ingestor parsing for new pf_q* and legacy aw_/pb_ responses."""

from backend.analytics_module.ingestor import DirectIngestor


def _survey_meta():
    return {
        "module_snapshots": {
            "purchase_funnel": {
                "sections": [
                    {
                        "questions": [
                            {"question_id": "pf_q1", "analytical_role": "tom"},
                            {"question_id": "pf_q4", "analytical_role": "consideration"},
                        ]
                    }
                ]
            }
        },
        "purchase_funnel": {"is_enabled": True},
    }


def test_ingestor_legacy_pf_keys_normalized():
    responses = [
        {
            "_id": "r1",
            "token": "T1",
            "answers": {
                "aw_q1": "Nike",
                "pb_q1": ["Nike", "Adidas"],
                "__structured": {
                    "module_answers": {
                        "brand_usage": {"us_q1": "today"},
                        "brand_pricing_behavior": {"cb_q1": "less_than_100_egp"},
                    },
                    "flat_evaluations": [],
                },
            },
        }
    ]
    data = DirectIngestor._parse_responses(
        responses, "survey1", survey_meta=_survey_meta()
    )

    pf_questions = set(data.purchase_funnel["question"].tolist())
    assert "pf_q1" in pf_questions or "aw_q1" in pf_questions

    usage = data.module_usage
    assert not usage.empty
    assert usage.iloc[0]["question"] == "us_q1"
    assert usage.iloc[0]["value"] == "today"

    pricing = data.module_pricing
    assert not pricing.empty
    assert pricing.iloc[0]["question"] == "cb_q1"


def test_ingestor_canonical_pf_q_keys():
    responses = [
        {
            "_id": "r2",
            "token": "T2",
            "answers": {
                "__structured": {
                    "module_answers": {
                        "purchase_funnel": {"pf_q1": "Adidas", "pf_q4": ["Adidas"]},
                        "brand_usage": {
                            "us_q3": {"value": "as_needed", "otherText": "Post-workout"},
                        },
                    },
                    "flat_evaluations": [],
                },
            },
        }
    ]
    data = DirectIngestor._parse_responses(
        responses, "survey1", survey_meta=_survey_meta()
    )
    pf_rows = data.purchase_funnel[data.purchase_funnel["question"] == "pf_q1"]
    assert not pf_rows.empty
    assert pf_rows.iloc[0]["value"] == "Adidas"

    usage_rows = data.module_usage[data.module_usage["question"] == "us_q3"]
    assert not usage_rows.empty
    assert usage_rows.iloc[0]["value"]["otherText"] == "Post-workout"
