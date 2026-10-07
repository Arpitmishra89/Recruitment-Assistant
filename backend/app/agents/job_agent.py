from app.services.llm_service import llm_service
from app.schemas.job_schema import JobAnalysis


SYSTEM_PROMPT = """
You are a job description analysis assistant.

Extract information from the supplied job description.
Return a valid JSON object with these fields:
- job_title: string
- company: string or null
- required_skills: list of explicitly required technical skills
- preferred_skills: list of preferred or optional technical skills
- responsibilities: list of job responsibilities
- qualifications: list of education, experience, and general requirements

Rules for Skills Extraction:
- In 'required_skills' and 'preferred_skills', include ONLY concrete technical skills, programming languages, frameworks, libraries, databases, and developer tools (e.g., 'Python', 'React', 'SQL', 'TypeScript', 'Docker', 'Next.js', 'Node.js', 'Git').
- NEVER extract vague phrases, soft skills, or generic competencies (such as 'strong programming fundamentals', 'good problem solver', 'excellent communication', 'quick learner', 'team player', 'attention to detail') as skills. Put these under 'qualifications' or 'responsibilities'.
- Keep skill names concise, using canonical technical names (e.g. 'Node.js', 'PostgreSQL', 'React').
- Do not invent information absent from the description.
- Do not classify a skill as required unless the description indicates it is mandatory.
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