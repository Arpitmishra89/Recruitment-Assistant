from unittest.mock import patch
import pytest
from app.agents.job_agent import JobAgent
from app.schemas.job_schema import JobAnalysis


class TestJobAgent:
    @patch("app.agents.job_agent.llm_service.generate_json")
    def test_analyze_valid_job(self, mock_generate_json):
        mock_generate_json.return_value = {
            "job_title": "Full Stack Developer",
            "company": "Tech Corp",
            "required_skills": ["Python", "FastAPI"],
            "preferred_skills": ["Docker", "Kubernetes"],
            "responsibilities": ["Build web applications", "Maintain backend services"],
            "qualifications": ["3+ years experience"]
        }

        agent = JobAgent()
        result = agent.analyze("Job description text")

        assert isinstance(result, JobAnalysis)
        assert result.job_title == "Full Stack Developer"
        assert result.company == "Tech Corp"
        assert "FastAPI" in result.required_skills
        assert "Kubernetes" in result.preferred_skills
        assert len(result.responsibilities) == 2

    def test_analyze_empty_text_raises_error(self):
        agent = JobAgent()
        with pytest.raises(ValueError, match="Job description cannot be empty"):
            agent.analyze("   ")

    @patch("app.agents.job_agent.llm_service.generate_json")
    def test_analyze_defaults_on_missing(self, mock_generate_json):
        mock_generate_json.return_value = {
            "job_title": "Software Engineer",
            "company": None,
            "required_skills": ["Python"],
            "preferred_skills": [],
            "responsibilities": [],
            "qualifications": []
        }

        agent = JobAgent()
        result = agent.analyze("Minimal job description")
        assert result.job_title == "Software Engineer"
        assert result.company is None
        assert result.required_skills == ["Python"]
        assert result.preferred_skills == []
