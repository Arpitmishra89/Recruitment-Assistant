import pytest
from app.schemas.job_schema import JobAnalysis
from app.schemas.resume_schema import ResumeAnalysis
from app.services.skill_normalizer import normalize_skill, normalize_skills
from app.services.matching_engine import calculate_match, calculate_coverage, generate_recommendations


class TestSkillNormalizer:
    def test_normalize_skill_aliases(self):
        assert normalize_skill("JS") == "javascript"
        assert normalize_skill("  React.js  ") == "react"
        assert normalize_skill("py") == "python"
        assert normalize_skill("Postgres") == "postgresql"
        assert normalize_skill("AWS") == "amazon web services"

    def test_normalize_skill_unlisted(self):
        assert normalize_skill("Docker") == "docker"
        assert normalize_skill("FastAPI") == "fastapi"

    def test_normalize_skills_deduplication(self):
        skills = ["js", "JavaScript", "JS  ", "react.js", "React"]
        normalized = normalize_skills(skills)
        assert normalized == {"javascript", "react"}


class TestMatchingEngine:
    def test_perfect_match(self):
        job = JobAnalysis(
            job_title="Backend Engineer",
            required_skills=["Python", "FastAPI"],
            preferred_skills=["Docker"]
        )
        resume = ResumeAnalysis(
            candidate_name="Alice",
            skills=["python", "fastapi", "docker"]
        )
        result = calculate_match(job, resume)
        assert result.match_score == 100.0
        assert result.required_skill_score == 100.0
        assert result.preferred_skill_score == 100.0
        assert set(result.matched_required_skills) == {"Python", "FastAPI"}
        assert result.missing_required_skills == []
        assert result.matched_preferred_skills == ["Docker"]
        assert result.missing_preferred_skills == []

    def test_partial_match(self):
        job = JobAnalysis(
            job_title="Backend Engineer",
            required_skills=["Python", "FastAPI"],
            preferred_skills=["Docker", "Kubernetes"]
        )
        # Required: 2/2 = 100%, Preferred: 1/2 = 50%
        # Overall: 100 * 0.8 + 50 * 0.2 = 80 + 10 = 90.0
        resume = ResumeAnalysis(
            skills=["python", "fastapi", "docker"]
        )
        result = calculate_match(job, resume)
        assert result.match_score == 90.0
        assert result.required_skill_score == 100.0
        assert result.preferred_skill_score == 50.0
        assert result.missing_preferred_skills == ["Kubernetes"]
        assert len(result.recommendations) > 0

    def test_zero_match(self):
        job = JobAnalysis(
            required_skills=["Rust", "C++"],
            preferred_skills=["Assembly"]
        )
        resume = ResumeAnalysis(
            skills=["Python", "JavaScript"]
        )
        result = calculate_match(job, resume)
        assert result.match_score == 0.0
        assert result.required_skill_score == 0.0
        assert result.preferred_skill_score == 0.0
        assert len(result.missing_required_skills) == 2
        assert len(result.missing_preferred_skills) == 1

    def test_only_required_skills(self):
        job = JobAnalysis(
            required_skills=["Python", "SQL"],
            preferred_skills=[]
        )
        resume = ResumeAnalysis(skills=["python"])
        result = calculate_match(job, resume)
        assert result.required_skill_score == 50.0
        assert result.preferred_skill_score == 0.0
        assert result.match_score == 50.0

    def test_only_preferred_skills(self):
        job = JobAnalysis(
            required_skills=[],
            preferred_skills=["Docker", "AWS"]
        )
        resume = ResumeAnalysis(skills=["docker", "aws"])
        result = calculate_match(job, resume)
        assert result.match_score == 100.0

    def test_no_skills_in_job(self):
        job = JobAnalysis(required_skills=[], preferred_skills=[])
        resume = ResumeAnalysis(skills=["Python"])
        result = calculate_match(job, resume)
        assert result.match_score == 0.0
