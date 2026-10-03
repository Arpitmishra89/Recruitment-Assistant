import asyncio
from fastapi import APIRouter, UploadFile, File, HTTPException

from app.agents.job_agent import job_agent
from app.agents.cv_agent import cv_agent
from app.services.pdf_parser import extract_text_from_pdf
from app.services.matching_engine import calculate_match

router = APIRouter(prefix="/api/v1/matching", tags=["Matching"])

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB limit


def _validate_pdf_file(file: UploadFile, field_label: str) -> None:
    filename = file.filename or ""
    is_pdf_content_type = file.content_type in ["application/pdf", "application/x-pdf", "binary/octet-stream"]
    is_pdf_extension = filename.lower().endswith(".pdf")

    if not (is_pdf_content_type or is_pdf_extension):
        raise HTTPException(
            status_code=400,
            detail=f"Please upload a valid PDF document for {field_label}."
        )


@router.post("/analyze")
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

        cv_analysis, job_analysis = await asyncio.gather(
            asyncio.to_thread(cv_agent.analyze, resume_text),
            asyncio.to_thread(job_agent.analyze, jd_text)
        )

        match_result = calculate_match(job_analysis, cv_analysis)

        return {
            "job_analysis": job_analysis.model_dump(),
            "resume_analysis": cv_analysis.model_dump(),
            "matching_result": match_result.model_dump()
        }

    except HTTPException:
        raise

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Analysis failed: {str(exc)}"
        )