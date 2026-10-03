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