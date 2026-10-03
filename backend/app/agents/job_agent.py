from app.services.llm_service import llm_service
from app.schemas.job_schema import JobAnalysis


SYSTEM_PROMPT = """
You are a job description analysis assistant.

Extract information from the supplied job description.
Return a valid JSON object with these fields:
- job_title: string
- company: string or null
- required_skills: list of explicitly required skills
- preferred_skills: list of preferred or optional skills
- responsibilities: list of job responsibilities
- qualifications: list of education or experience requirements

Rules:
- Do not invent information absent from the description.
- Do not classify a skill as required unless the description indicates it is mandatory.
- Keep skills concise and use common technical names.
- If the job title or company is unavailable, use "Not specified" or null.
"""


class JobAgent:
    def analyze(self, job_description: str) -> JobAnalysis:
        if not job_description.strip():
            raise ValueError("Job description cannot be empty.")

        data = llm_service.generate_json(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=job_description
        )

        return JobAnalysis.model_validate(data)


job_agent = JobAgent()