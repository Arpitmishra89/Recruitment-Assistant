from pydantic import BaseModel, Field


class ResumeAnalysis(BaseModel):
    candidate_name: str | None = None
    skills: list[str] = Field(default_factory=list)
    experience: list[str] = Field(default_factory=list)
    projects: list[str] = Field(default_factory=list)