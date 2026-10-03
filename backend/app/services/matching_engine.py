from app.schemas.job_schema import JobAnalysis
from app.schemas.resume_schema import ResumeAnalysis
from app.schemas.matching_schema import MatchingResult
from app.services.skill_normalizer import normalize_skill


REQUIRED_WEIGHT = 0.80
PREFERRED_WEIGHT = 0.20


def calculate_coverage(
    job_skills: list[str],
    resume_skills: list[str]
) -> tuple[float, list[str], list[str]]:
    normalized_resume = {
        normalize_skill(skill)
        for skill in resume_skills
        if skill and skill.strip()
    }

    matched = []
    missing = []

    for skill in job_skills:
        if normalize_skill(skill) in normalized_resume:
            matched.append(skill)
        else:
            missing.append(skill)

    if not job_skills:
        return 0.0, matched, missing

    score = len(matched) / len(job_skills) * 100
    return round(score, 2), matched, missing


def generate_recommendations(
    missing_required: list[str],
    missing_preferred: list[str]
) -> list[str]:
    recommendations = []

    if missing_required:
        recommendations.append(
            "Review and address these missing required skills: "
            + ", ".join(missing_required)
        )

    if missing_preferred:
        recommendations.append(
            "Consider developing or highlighting these preferred skills: "
            + ", ".join(missing_preferred)
        )

    if not recommendations:
        recommendations.append(
            "All listed required and preferred skills were found in the resume."
        )

    return recommendations


def calculate_match(
    job: JobAnalysis,
    resume: ResumeAnalysis
) -> MatchingResult:
    required_score, matched_required, missing_required = calculate_coverage(
        job.required_skills,
        resume.skills
    )

    preferred_score, matched_preferred, missing_preferred = calculate_coverage(
        job.preferred_skills,
        resume.skills
    )

    has_required = bool(job.required_skills)
    has_preferred = bool(job.preferred_skills)

    if has_required and has_preferred:
        final_score = (
            required_score * REQUIRED_WEIGHT
            + preferred_score * PREFERRED_WEIGHT
        )
    elif has_required:
        final_score = required_score
    elif has_preferred:
        final_score = preferred_score
    else:
        final_score = 0.0

    return MatchingResult(
        match_score=round(final_score, 2),
        required_skill_score=required_score,
        preferred_skill_score=preferred_score,
        matched_required_skills=matched_required,
        missing_required_skills=missing_required,
        matched_preferred_skills=matched_preferred,
        missing_preferred_skills=missing_preferred,
        recommendations=generate_recommendations(
            missing_required,
            missing_preferred
        )
    )