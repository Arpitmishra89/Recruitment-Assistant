import asyncio
import hashlib
from fastapi import APIRouter, UploadFile, File, HTTPException

from app.agents.job_agent import job_agent
from app.agents.cv_agent import cv_agent
from app.services.pdf_parser import extract_text_from_pdf
from app.services.matching_engine import calculate_match
from app.schemas.matching_schema import AnalysisSummaryResponse
from app.schemas.resume_schema import ResumeAnalysis
from app.schemas.job_schema import JobAnalysis

router = APIRouter(prefix="/api/v1/matching", tags=["Matching"])

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB limit

# Document fingerprint caches for deterministic results and fast reuse
_cv_cache: dict[str, ResumeAnalysis] = {}
_job_cache: dict[str, JobAnalysis] = {}


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