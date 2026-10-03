from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from app.agents.job_agent import job_agent
from app.agents.cv_agent import cv_agent
from app.services.pdf_parser import extract_text_from_pdf
from app.services.matching_engine import calculate_match

router = APIRouter(prefix="/api/v1/matching", tags=["Matching"])


@router.post("/analyze")
async def analyze_match(
    job_description: str = Form(...),
    resume: UploadFile = File(...)
):
    if not job_description.strip():
        raise HTTPException(
            status_code=400,
            detail="Job description cannot be empty."
        )

    if resume.content_type != "application/pdf":
        raise HTTPException(
            status_code=400,
            detail="Please upload a PDF resume."
        )

    try:
        file_bytes = await resume.read()

        resume_text = extract_text_from_pdf(file_bytes)

        job_analysis = job_agent.analyze(job_description)
        cv_analysis = cv_agent.analyze(resume_text)

        match_result = calculate_match(job_analysis, cv_analysis)

        return {
            "job_analysis": job_analysis.model_dump(),
            "resume_analysis": cv_analysis.model_dump(),
            "matching_result": match_result.model_dump()
        }

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Analysis failed: {str(exc)}"
        )