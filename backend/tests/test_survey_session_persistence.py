"""Survey session persistence includes aiInsights and product test state."""

from backend.models import SurveySessionBase, SurveySessionUpdate


def test_survey_session_defaults_include_ai_insights_dict():
    session = SurveySessionBase(token="TOK123")
    assert session.aiInsights == {}
    assert isinstance(session.aiInsights, dict)
    assert session.productTestAnswers == {}
    assert session.productTestPhaseIndex == 0


def test_survey_session_update_accepts_product_test_and_ai_insights():
    payload = SurveySessionUpdate(
        aiInsights={"q1": ["insight"]},
        productTestAnswers={"pt_q1": {"text": "liked it"}},
        productTestPhaseIndex=1,
        productTestSectionIndex=2,
        productTestWizardMode="section",
    )
    dumped = payload.model_dump(exclude_none=True)
    assert dumped["aiInsights"] == {"q1": ["insight"]}
    assert dumped["productTestAnswers"]["pt_q1"]["text"] == "liked it"
    assert dumped["productTestPhaseIndex"] == 1
    assert dumped["productTestWizardMode"] == "section"


def test_survey_session_defaults_product_test_wizard_mode():
    session = SurveySessionBase(token="TOK456")
    assert session.productTestWizardMode == "intro"
