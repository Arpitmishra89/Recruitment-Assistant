SKILL_ALIASES = {
    "js": "javascript",
    "javascript": "javascript",
    "ts": "typescript",
    "py": "python",
    "postgres": "postgresql",
    "postgresql": "postgresql",
    "node": "node.js",
    "nodejs": "node.js",
    "reactjs": "react",
    "react.js": "react",
    "ml": "machine learning",
    "ai": "artificial intelligence",
    "aws": "amazon web services",
    "gcp": "google cloud platform",
    "ms excel": "microsoft excel",
}


def normalize_skill(skill: str) -> str:
    cleaned = " ".join(skill.lower().strip().split())
    return SKILL_ALIASES.get(cleaned, cleaned)


def normalize_skills(skills: list[str]) -> set[str]:
    return {
        normalize_skill(skill)
        for skill in skills
        if skill and skill.strip()
    }