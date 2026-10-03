from pydantic import BaseModel, Field


class MatchingResult(BaseModel):
    match_score: float = Field(ge=0, le=100)
    required_skill_score: float = Field(ge=0, le=100)
    preferred_skill_score: float = Field(ge=0, le=100)

    matched_required_skills: list[str]
    missing_required_skills: list[str]
    matched_preferred_skills: list[str]
    missing_preferred_skills: list[str]

    recommendations: list[str]


class AnalysisSummaryResponse(BaseModel):
    candidate_name: str | None = None
    job_title: str
    company: str | None = None
    match_score: float = Field(ge=0, le=100)
    required_skill_score: float = Field(ge=0, le=100)
    preferred_skill_score: float = Field(ge=0, le=100)
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)