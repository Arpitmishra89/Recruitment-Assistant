from app.services.llm_service import llm_service
from app.schemas.resume_schema import ResumeAnalysis


SYSTEM_PROMPT = """
You are a resume analysis assistant.

Extract relevant candidate information from the supplied resume text.
Return a valid JSON object with exactly these fields:
- candidate_name: string or null
- skills: list of explicitly stated technical and relevant professional skills
- experience: list of work experience descriptions
- projects: list of project descriptions

Rules:
- Do not invent candidate details or qualifications.
- Extract technical skills explicitly listed in the resume.
- Also identify relevant skills demonstrated in work experience
  and project descriptions.
- Do not treat a skill as demonstrated solely because it appears
  in an unrelated job description or recommendation.
- For experience, capture role, responsibilities, technologies,
  and notable achievements when available.
- For projects, capture project purpose, technologies used,
  and relevant implementation details when available.
- Avoid duplicating the same information unnecessarily.
- Keep the extracted information concise and factual.
- If a field has no relevant information, return an empty list.
- Return only valid JSON without markdown or additional commentary.
"""


class CVAgent:
    def analyze(self, resume_text: str) -> ResumeAnalysis:
        if not resume_text.strip():
            raise ValueError("Resume text cannot be empty.")

        data = llm_service.generate_json(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=resume_text
        )

        return ResumeAnalysis.model_validate(data)


cv_agent = CVAgent()
