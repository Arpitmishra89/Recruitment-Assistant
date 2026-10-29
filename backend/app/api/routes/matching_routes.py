import asyncio
import hashlib
import json
import logging
from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from app.agents.job_agent import job_agent
from app.agents.cv_agent import cv_agent
from app.services.pdf_parser import extract_text_from_pdf
from app.services.matching_engine import calculate_match
from app.services.tts_service import tts_service
from app.services.llm_service import llm_service
from app.schemas.matching_schema import AnalysisSummaryResponse
from app.schemas.resume_schema import ResumeAnalysis
from app.schemas.job_schema import JobAnalysis

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/matching", tags=["Matching"])

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB limit

# Document fingerprint caches for deterministic results and fast reuse
_cv_cache: dict[str, ResumeAnalysis] = {}
_job_cache: dict[str, JobAnalysis] = {}


class CrawledMatchResponse(AnalysisSummaryResponse):
    verbal_summary: str
    audio_base64: str | None = None


def _validate_pdf_file(file: UploadFile, field_label: str) -> None:
    filename = file.filename or ""
    is_pdf_content_type = file.content_type in ["application/pdf", "application/x-pdf", "binary/octet-stream"]
    is_pdf_extension = filename.lower().endswith(".pdf")

    if not (is_pdf_content_type or is_pdf_extension):
        raise HTTPException(
            status_code=400,
            detail=f"Please upload a valid PDF document for {field_label}."
        )


@router.post("/analyze", response_model=AnalysisSummaryResponse)
async def analyze_match(
    resume_file: UploadFile = File(..., description="Candidate Resume PDF"),
    jd_file: UploadFile = File(..., description="Job Description PDF")
):
    _validate_pdf_file(resume_file, "resume_file")
    _validate_pdf_file(jd_file, "jd_file")

    try:
        resume_bytes = await resume_file.read()
        jd_bytes = await jd_file.read()

        if len(resume_bytes) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail="Resume PDF exceeds maximum allowed size (10 MB)."
            )

        if len(jd_bytes) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail="Job description PDF exceeds maximum allowed size (10 MB)."
            )

        resume_text = extract_text_from_pdf(resume_bytes)
        jd_text = extract_text_from_pdf(jd_bytes)

        # Hash text to ensure 100% deterministic re-use for identical documents
        resume_hash = hashlib.sha256(resume_text.strip().encode("utf-8")).hexdigest()
        jd_hash = hashlib.sha256(jd_text.strip().encode("utf-8")).hexdigest()

        if resume_hash in _cv_cache:
            cv_analysis = _cv_cache[resume_hash]
        else:
            cv_analysis = await asyncio.to_thread(cv_agent.analyze, resume_text)
            _cv_cache[resume_hash] = cv_analysis

        if jd_hash in _job_cache:
            job_analysis = _job_cache[jd_hash]
        else:
            job_analysis = await asyncio.to_thread(job_agent.analyze, jd_text)
            _job_cache[jd_hash] = job_analysis

        match_result = calculate_match(job_analysis, cv_analysis)

        return AnalysisSummaryResponse(
            candidate_name=cv_analysis.candidate_name,
            job_title=job_analysis.job_title,
            company=job_analysis.company,
            match_score=match_result.match_score,
            required_skill_score=match_result.required_skill_score,
            preferred_skill_score=match_result.preferred_skill_score,
            matched_skills=match_result.matched_required_skills + match_result.matched_preferred_skills,
            missing_skills=match_result.missing_required_skills + match_result.missing_preferred_skills,
            recommendations=match_result.recommendations
        )

    except HTTPException:
        raise

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Analysis failed: {str(exc)}"
        )


@router.post("/evaluate-crawled", response_model=CrawledMatchResponse)
async def evaluate_crawled_job(
    resume_file: UploadFile = File(..., description="Candidate Resume PDF"),
    job_data_json: str = Form(..., description="Crawled JobAnalysis JSON string")
):
    _validate_pdf_file(resume_file, "resume_file")

    try:
        resume_bytes = await resume_file.read()
        if len(resume_bytes) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail="Resume PDF exceeds maximum allowed size (10 MB)."
            )

        resume_text = extract_text_from_pdf(resume_bytes)
        cv_hash = hashlib.sha256(resume_bytes).hexdigest()

        if cv_hash in _cv_cache:
            cv_analysis = _cv_cache[cv_hash]
        else:
            cv_analysis = cv_agent.analyze(resume_text)
            _cv_cache[cv_hash] = cv_analysis

        try:
            job_dict = json.loads(job_data_json)
            job_analysis = JobAnalysis.model_validate(job_dict)
        except Exception as parse_err:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid job analysis data: {str(parse_err)}"
            )

        match_result = calculate_match(job_analysis, cv_analysis)
        matched_skills = match_result.matched_required_skills + match_result.matched_preferred_skills
        missing_skills = match_result.missing_required_skills + match_result.missing_preferred_skills

        # Generate verbal summary highlighting what the candidate is missing
        candidate_name = cv_analysis.candidate_name or "there"
        missing_sample = ", ".join(missing_skills[:3]) if missing_skills else "no critical gaps"
        matched_sample = ", ".join(matched_skills[:3]) if matched_skills else "solid foundation"

        spoken_prompt = (
            f"You are an encouraging AI Recruiter. Generate a 2-sentence conversational voice summary for {candidate_name}. "
            f"State their {match_result.match_score:.1f}% match for the {job_analysis.job_title} role. "
            f"Acknowledge their strong skills in {matched_sample}, and clearly state what skills they are missing: {missing_sample}. "
            f"End with an encouraging sentence inviting them to ask how to learn those missing skills or for interview preparation."
        )

        try:
            spoken_text = llm_service.chat_completion(
                system_prompt="You are an expert AI Career Coach. Keep replies brief, natural, and strictly 2 sentences (under 45 words). No markdown, no bullet points.",
                messages=[{"role": "user", "content": spoken_prompt}],
                temperature=0.7
            )
            spoken_text = spoken_text.strip().strip('"').strip("'")
        except Exception:
            spoken_text = (
                f"You have a {match_result.match_score:.1f}% match for {job_analysis.job_title}. "
                f"You have great skills in {matched_sample}, but you are currently missing {missing_sample}. "
                f"Feel free to ask me how to learn these skills or prepare for interviews!"
            )

        audio_b64 = None
        if tts_service.is_available():
            try:
                audio_b64 = await asyncio.to_thread(tts_service.synthesize_base64, spoken_text)
            except Exception as tts_err:
                logger.warning("Spoken audio synthesis for gap evaluation failed: %s", str(tts_err))

        return CrawledMatchResponse(
            candidate_name=cv_analysis.candidate_name,
            job_title=job_analysis.job_title,
            company=job_analysis.company,
            match_score=match_result.match_score,
            required_skill_score=match_result.required_skill_score,
            preferred_skill_score=match_result.preferred_skill_score,
            matched_skills=matched_skills,
            missing_skills=missing_skills,
            recommendations=match_result.recommendations,
            verbal_summary=spoken_text,
            audio_base64=audio_b64
        )

    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Crawled job matching failed: %s", str(exc))
        raise HTTPException(status_code=502, detail=f"Analysis failed: {str(exc)}")