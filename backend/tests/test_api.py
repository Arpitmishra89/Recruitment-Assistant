import io
from unittest.mock import patch
import pymupdf
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.resume_schema import ResumeAnalysis
from app.schemas.job_schema import JobAnalysis

client = TestClient(app)


def _create_sample_pdf(text: str) -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 50), text)
    content = doc.tobytes()
    doc.close()
    return content


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_home():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "running"


def test_analyze_invalid_content_type():
    response = client.post(
        "/api/v1/matching/analyze",
        files={
            "resume_file": ("resume.txt", io.BytesIO(b"sample text"), "text/plain"),
            "jd_file": ("jd.pdf", io.BytesIO(b"%PDF-1.4 sample"), "application/pdf")
        }
    )
    assert response.status_code == 400
    assert "Please upload a valid PDF document" in response.json()["detail"]


def test_analyze_empty_pdf():
    response = client.post(
        "/api/v1/matching/analyze",
        files={
            "resume_file": ("resume.pdf", io.BytesIO(b""), "application/pdf"),
            "jd_file": ("jd.pdf", io.BytesIO(b"%PDF-1.4 sample"), "application/pdf")
        }
    )
    assert response.status_code == 400
    assert "The uploaded PDF is empty" in response.json()["detail"]


@patch("app.api.routes.matching_routes.cv_agent.analyze")
@patch("app.api.routes.matching_routes.job_agent.analyze")
def test_analyze_success(mock_job_analyze, mock_cv_analyze):
    mock_cv_analyze.return_value = ResumeAnalysis(
        candidate_name="Alex Mercer",
        skills=["Python", "FastAPI", "Docker", "PostgreSQL"],
        experience=["Senior Backend Engineer at Tech Corp"],
        projects=["AI recruitment platform"]
    )
    mock_job_analyze.return_value = JobAnalysis(
        job_title="Senior Backend Engineer",
        company="Acme Corp",
        required_skills=["Python", "FastAPI", "PostgreSQL"],
        preferred_skills=["Docker", "AWS"],
        responsibilities=["Build scalable APIs"],
        qualifications=["3+ years experience"]
    )

    resume_bytes = _create_sample_pdf("Alex Mercer - Senior Backend Engineer with Python, FastAPI, Docker, PostgreSQL")
    jd_bytes = _create_sample_pdf("Senior Backend Engineer at Acme Corp. Requires Python, FastAPI, PostgreSQL.")

    response = client.post(
        "/api/v1/matching/analyze",
        files={
            "resume_file": ("resume.pdf", io.BytesIO(resume_bytes), "application/pdf"),
            "jd_file": ("jd.pdf", io.BytesIO(jd_bytes), "application/pdf")
        }
    )

    assert response.status_code == 200
    data = response.json()
    assert data["candidate_name"] == "Alex Mercer"
    assert data["job_title"] == "Senior Backend Engineer"
    assert data["company"] == "Acme Corp"
    assert data["match_score"] == 90.0
    assert data["required_skill_score"] == 100.0
    assert data["preferred_skill_score"] == 50.0
    assert "Python" in data["matched_skills"]
    assert "Docker" in data["matched_skills"]
    assert "AWS" in data["missing_skills"]
    assert len(data["recommendations"]) > 0


@patch("app.api.routes.voice_routes.llm_service.chat_completion")
def test_voice_greeting(mock_chat):
    mock_chat.return_value = "Hello Alex! Welcome. You have a 90% alignment for the Senior Backend Engineer role."
    response = client.post(
        "/api/v1/voice/greeting",
        json={
            "candidate_name": "Alex Mercer",
            "job_title": "Senior Backend Engineer",
            "company": "Acme Corp",
            "match_score": 90.0,
            "matched_skills": ["Python", "FastAPI"],
            "missing_skills": ["AWS"],
            "recommendations": []
        }
    )
    assert response.status_code == 200
    assert "90%" in response.json()["reply"]


@patch("app.api.routes.voice_routes.llm_service.chat_completion")
def test_voice_greeting_fallback_on_llm_failure(mock_chat):
    mock_chat.side_effect = ValueError("The LLM returned an empty response.")
    response = client.post(
        "/api/v1/voice/greeting",
        json={
            "candidate_name": "Alex Mercer",
            "job_title": "Senior Backend Engineer",
            "company": "Acme Corp",
            "match_score": 90.0,
            "matched_skills": ["Python", "FastAPI"],
            "missing_skills": ["AWS"],
            "recommendations": []
        }
    )
    assert response.status_code == 200
    reply = response.json()["reply"]
    assert "Alex Mercer" in reply
    assert "90.0%" in reply
    assert "Senior Backend Engineer" in reply


@patch("app.api.routes.voice_routes.llm_service.chat_completion")
def test_voice_chat(mock_chat):
    mock_chat.return_value = "You can highlight your Docker and cloud deployment experience to bridge the AWS gap."
    response = client.post(
        "/api/v1/voice/chat",
        json={
            "candidate_name": "Alex Mercer",
            "job_title": "Senior Backend Engineer",
            "company": "Acme Corp",
            "match_score": 90.0,
            "matched_skills": ["Python"],
            "missing_skills": ["AWS"],
            "recommendations": [],
            "user_message": "How do I address the AWS gap?"
        }
    )
    assert response.status_code == 200
    assert "AWS" in response.json()["reply"]


@patch("app.api.routes.voice_routes.stt_service.transcribe_audio")
def test_voice_transcribe(mock_transcribe):
    mock_transcribe.return_value = "Hello, what skills am I missing?"
    dummy_audio = io.BytesIO(b"RIFF....WAVEfmt ....data....")
    response = client.post(
        "/api/v1/voice/transcribe",
        files={"audio_file": ("test.wav", dummy_audio, "audio/wav")}
    )
    assert response.status_code == 200
    assert response.json()["transcript"] == "Hello, what skills am I missing?"


@patch("app.api.routes.voice_routes.llm_service.chat_completion")
def test_voice_initial_landing_greeting(mock_chat):
    mock_chat.return_value = (
        "Hello! I am your AI career assistant. I'm here to clear all your job-related doubts, "
        "analyze your resume against job requirements, and help you fill out job applications automatically. Feel free to ask me anything!"
    )
    response = client.post(
        "/api/v1/voice/greeting",
        json={}
    )
    assert response.status_code == 200
    data = response.json()
    assert "clear all your job-related doubts" in data["reply"].lower()
    assert "feel free to ask" in data["reply"].lower()


@patch("app.api.routes.voice_routes.llm_service.chat_completion")
def test_voice_general_career_chat(mock_chat):
    mock_chat.return_value = "To learn Next.js, start by building a small project using the App Router and Server Components."
    response = client.post(
        "/api/v1/voice/chat",
        json={
            "user_message": "How do I learn Next.js?"
        }
    )
    assert response.status_code == 200
    assert "Next.js" in response.json()["reply"]


