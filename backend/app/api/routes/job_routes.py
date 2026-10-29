import asyncio
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.job_crawler import job_crawler
from app.services.tts_service import tts_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/jobs", tags=["Jobs"])


class JobCrawlRequest(BaseModel):
    url: str = Field(..., description="Public job posting URL to crawl")


class JobCrawlResponse(BaseModel):
    url: str
    job_title: str
    company: str | None = None
    required_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    responsibilities: list[str] = Field(default_factory=list)
    qualifications: list[str] = Field(default_factory=list)
    verbal_summary: str
    audio_base64: str | None = None


@router.post("/crawl", response_model=JobCrawlResponse)
async def crawl_job_posting(req: JobCrawlRequest):
    if not req.url or not req.url.strip():
        raise HTTPException(status_code=400, detail="Job URL cannot be empty.")

    try:
        analysis = await job_crawler.crawl_and_analyze(req.url.strip())
        summary = job_crawler.generate_verbal_summary(analysis)

        audio_b64 = None
        if tts_service.is_available():
            try:
                audio_b64 = await asyncio.to_thread(tts_service.synthesize_base64, summary)
            except Exception as tts_err:
                logger.warning("Spoken audio synthesis for job crawl failed: %s", str(tts_err))

        return JobCrawlResponse(
            url=req.url.strip(),
            job_title=analysis.job_title,
            company=analysis.company,
            required_skills=analysis.required_skills,
            preferred_skills=analysis.preferred_skills,
            responsibilities=analysis.responsibilities,
            qualifications=analysis.qualifications,
            verbal_summary=summary,
            audio_base64=audio_b64
        )

    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        logger.error("Job crawling failed for %s: %s", req.url, str(exc))
        raise HTTPException(
            status_code=502,
            detail=f"Unable to crawl job posting: {str(exc)}"
        )
