import pytest
import datetime
from unittest.mock import AsyncMock, patch, MagicMock
from backend.models import SurveyReport
from backend.analytics_module.report_orchestrator import ReportOrchestrator

@pytest.fixture
def mock_db():
    db = AsyncMock()
    # Mock survey_reports collection
    db.survey_reports = AsyncMock()
    return db

@pytest.fixture
def mock_config():
    return MagicMock()

@pytest.mark.asyncio
class TestReportOrchestrator:
    async def test_get_or_generate_existing_ready(self, mock_db, mock_config):
        # Scenario: Report is already generated and ready
        orchestrator = ReportOrchestrator(mock_db, mock_config)
        
        mock_db.survey_reports.find_one.return_value = {
            "survey_id": "s123",
            "status": "ready",
            "project_name": "Test Project",
            "total_responses": 100
        }
        
        report = await orchestrator.get_or_generate(
            "s123", {}, None, None, None, None, None
        )
        
        assert report.status == "ready"
        assert report.survey_id == "s123"
        # Since it's ready, it should not have called update_one to regenerate
        mock_db.survey_reports.update_one.assert_not_called()

    async def test_get_or_generate_existing_generating(self, mock_db, mock_config):
        # Scenario: Report is currently building
        orchestrator = ReportOrchestrator(mock_db, mock_config)
        
        mock_db.survey_reports.find_one.return_value = {
            "survey_id": "s123",
            "status": "generating",
            "project_name": "Test Project",
            "total_responses": 100
        }
        
        report = await orchestrator.get_or_generate(
            "s123", {}, None, None, None, None, None
        )
        
        assert report.status == "generating"
        mock_db.survey_reports.update_one.assert_not_called()

    @patch("backend.analytics_module.report_orchestrator.SurveyAnalyzer")
    @patch("backend.analytics_module.src.ai.api_cost.get_summary")
    async def test_get_or_generate_new(self, mock_cost_summary, mock_analyzer_cls, mock_db, mock_config):
        # Scenario: First time generation
        orchestrator = ReportOrchestrator(mock_db, mock_config)
        mock_cost_summary.return_value = {"total_cost": 0.1}
        
        # 1. find_one returns nothing initially
        # 2. find_one returns the full document at the end
        mock_db.survey_reports.find_one.side_effect = [
            None, # Initial check
            {
                "survey_id": "s123",
                "status": "ready",
                "project_name": "New Project",
                "total_responses": 50,
                "sections": []
            }
        ]
        
        mock_analyzer = mock_analyzer_cls.return_value
        mock_analyzer.run.return_value = {
            "report_path": "/path/to/report.pptx",
            "output_dir": "/path/to/out",
            "slide_entries": [],
            "raw_payloads": {},
            "audit_report": {},
            "telemetry": {}
        }
        
        report = await orchestrator.get_or_generate(
            "s123", {"project_name": "New Project"}, ["fake_df"], None, None, None, None
        )
        
        assert report.status == "ready"
        assert mock_db.survey_reports.update_one.call_count >= 2
        
        # Check that it set status to generating first
        first_call_args = mock_db.survey_reports.update_one.call_args_list[0][0]
        assert first_call_args[0] == {"survey_id": "s123"}
        assert "$set" in first_call_args[1]
        assert first_call_args[1]["$set"]["status"] == "generating"

        # Check it finalized to ready
        ready_call = None
        for call in mock_db.survey_reports.update_one.call_args_list:
            if "$set" in call[0][1] and call[0][1]["$set"].get("status") == "ready":
                ready_call = call
                break
        assert ready_call is not None

    @patch("backend.analytics_module.report_orchestrator.SurveyAnalyzer")
    async def test_get_or_generate_error_handling(self, mock_analyzer_cls, mock_db, mock_config):
        # Scenario: Analysis pipeline crashes
        orchestrator = ReportOrchestrator(mock_db, mock_config)
        
        mock_db.survey_reports.find_one.side_effect = [
            None, # initial
            {
                "survey_id": "s123",
                "status": "failed",
                "error_message": "Pipeline crash!"
            }
        ]
        
        mock_analyzer = mock_analyzer_cls.return_value
        mock_analyzer.run.side_effect = Exception("Pipeline crash!")
        
        report = await orchestrator.get_or_generate(
            "s123", {}, None, None, None, None, None
        )
        
        assert report.status == "failed"
        assert report.error_message == "Pipeline crash!"
        
        # Check that it finalized to failed
        failed_call = None
        for call in mock_db.survey_reports.update_one.call_args_list:
            if "$set" in call[0][1] and call[0][1]["$set"].get("status") == "failed":
                failed_call = call
                break
        assert failed_call is not None
        assert failed_call[0][1]["$set"]["error_message"] == "Pipeline crash!"
