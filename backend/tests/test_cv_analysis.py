from unittest.mock import patch
import pytest
from app.agents.cv_agent import CVAgent
from app.schemas.resume_schema import ResumeAnalysis


class TestCVAgent:
    @patch("app.agents.cv_agent.llm_service.generate_json")
    def test_analyze_valid_resume(self, mock_generate_json):
        mock_generate_json.return_value = {
            "candidate_name": "Jane Smith",
            "skills": ["Python", "FastAPI", "PostgreSQL"],
            "experience": ["Senior Backend Developer at Acme Corp (2020-Present)"],
            "projects": ["Built real-time analytics engine"]
        }

        agent = CVAgent()
        result = agent.analyze("Resume text with experience and skills")

        assert isinstance(result, ResumeAnalysis)
        assert result.candidate_name == "Jane Smith"
        assert "FastAPI" in result.skills
        assert len(result.experience) == 1
        assert len(result.projects) == 1

    def test_analyze_empty_text_raises_error(self):
        agent = CVAgent()
        with pytest.raises(ValueError, match="Resume text cannot be empty"):
            agent.analyze("   ")

    @patch("app.agents.cv_agent.llm_service.generate_json")
    def test_analyze_minimal_fields(self, mock_generate_json):
        mock_generate_json.return_value = {
            "candidate_name": None,
            "skills": [],
            "experience": [],
            "projects": []
        }

        agent = CVAgent()
        result = agent.analyze("Minimal CV")
        assert result.candidate_name is None
        assert result.skills == []
        assert result.experience == []
        assert result.projects == []
