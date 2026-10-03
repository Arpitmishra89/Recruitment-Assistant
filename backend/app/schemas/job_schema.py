from pydantic import BaseModel, Field


class JobAnalysis(BaseModel):
    job_title: str = "Not specified"
    company: str | None = None
    required_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    responsibilities: list[str] = Field(default_factory=list)
    qualifications: list[str] = Field(default_factory=list)