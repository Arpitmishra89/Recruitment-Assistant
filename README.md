# AI Recruitment Assistant

An AI-powered recruitment assistant that analyzes resumes and job descriptions, evaluates candidate-job alignment, identifies skill gaps, and eventually supports voice-based recruitment interactions and assisted job application automation.

## 1. Project Objective

Build a modular AI recruitment system that reduces manual effort in resume screening and job matching.

The system will:

* Accept resumes and job descriptions as document uploads.
* Extract relevant information using PDF parsing and LLM-based structured extraction.
* Identify technical skills, work experience, projects, and job requirements.
* Calculate a transparent resume-to-job alignment score.
* Identify matching skills, missing skills, and areas for improvement.
* Generate actionable recommendations for candidates.
* Maintain reusable candidate profiles to avoid repeated LLM processing.
* Eventually support conversational recruitment through a voice agent.
* Eventually assist with job applications through browser automation, subject to user review and explicit approval.

**Important:** The matching score represents resume alignment with a job description. It is not a hiring probability or a prediction of candidate performance.

---

## 2. Technology Stack

| Component          | Technology                                  | Purpose                                                 |
| ------------------ | ------------------------------------------- | ------------------------------------------------------- |
| Frontend           | React, Vite                                 | User interface                                          |
| Backend            | Python, FastAPI                             | REST API and application logic                          |
| Server             | Uvicorn                                     | ASGI server                                             |
| LLM                | Groq API                                    | Structured information extraction and reasoning         |
| LLM model          | Configurable Groq model                     | Resume and job description analysis                     |
| Validation         | Pydantic                                    | Data validation and structured schemas                  |
| PDF parsing        | PyMuPDF                                     | Extract text from PDF documents                         |
| Matching engine    | Python                                      | Deterministic skill matching and scoring                |
| Database           | PostgreSQL (planned)                        | Candidate profiles, job descriptions, and match history |
| ORM                | SQLAlchemy (planned)                        | Database interaction                                    |
| Voice AI           | LiveKit Agents (planned)                    | Real-time conversational recruitment                    |
| Speech-to-text     | Deepgram or configurable provider (planned) | Voice transcription                                     |
| Text-to-speech     | Configurable provider (planned)             | Spoken responses                                        |
| Browser automation | Playwright (planned)                        | Assisted job application workflows                      |
| Version control    | Git, GitHub                                 | Source control and collaboration                        |
| Deployment         | AWS (planned)                               | Application hosting                                     |

Keep external services configurable so that providers can be replaced without rewriting the core business logic.

---

## 3. High-Level Architecture

```text
                         React + Vite
                              |
                              | REST API
                              v
                       FastAPI Backend
                              |
               +--------------+--------------+
               |                             |
               v                             v
       Resume Upload                  Job Description Upload
               |                             |
               v                             v
       PyMuPDF Parser                  PyMuPDF Parser
               |                             |
               v                             v
          CV Agent                       Job Agent
               |                             |
               v                             v
       Resume Analysis                 Job Analysis
               |                             |
               +--------------+--------------+
                              |
                              v
                       Matching Engine
                              |
                              v
                    Match Score and Analysis
                              |
                              v
                       API Response
                              |
                              v
                       React Dashboard
```

### Core design principles

1. **Separation of concerns:** Document parsing, LLM extraction, validation, matching, storage, and API handling must remain separate components.
2. **Cost optimization:** Avoid sending unnecessary document content to the LLM and reuse previously extracted information wherever possible.
3. **Deterministic scoring:** Use Python for the initial scoring calculation rather than asking the LLM to assign an arbitrary match score.
4. **Structured outputs:** Validate every LLM response with Pydantic before using it.
5. **Modularity:** Keep LLM providers, parsing logic, scoring rules, and API routes replaceable.
6. **Incremental development:** Complete and test each batch before proceeding to the next.
7. **Privacy:** Avoid collecting or storing personal information that is not needed for the current functionality.
8. **Human oversight:** Any external job application submission must require explicit user approval.

---

# 4. Final Feature Scope

## Phase 1: Document-Based Resume and Job Matching

### Input

* Resume PDF
* Job description PDF

### Resume extraction

Extract the following:

* Technical and relevant professional skills
* Work experience
* Project descriptions
* Candidate name, only if needed for displaying a profile

Education, contact information, and unrelated personal details are excluded from the current matching scope.

### Job description extraction

Extract:

* Job title
* Company name, if available
* Required skills
* Preferred skills
* Responsibilities
* Qualifications and experience requirements, where relevant

### Matching output

* Overall resume alignment score
* Required skill coverage
* Preferred skill coverage
* Matched skills
* Missing required skills
* Missing preferred skills
* Evidence from projects and experience
* Recommendations for improving resume alignment

## Phase 2: Resume and Job Profile Reuse

* Store structured resume profiles.
* Reuse a previously extracted profile across multiple job descriptions.
* Cache job description extraction when the same job is analyzed repeatedly.
* Add document fingerprints or hashes to detect duplicate uploads.
* Allow users to replace or delete stored profiles.
* Track extraction versions to support future schema changes.

## Phase 3: Improved Matching and Evidence Analysis

* Normalize technical skill names and aliases.
* Identify skills mentioned in different resume sections.
* Distinguish explicitly listed skills from skills demonstrated through projects or experience.
* Support experience requirements and qualification matching.
* Introduce configurable scoring weights.
* Provide evidence-based explanations for matched and missing requirements.
* Handle ambiguous and partially matching skill names.
* Evaluate extraction and matching quality using a test dataset.

## Phase 4: User Dashboard

* Resume upload interface
* Job description upload interface
* Candidate profile view
* Job match history
* Match score visualization
* Skill gap analysis
* Recommendations
* Document and profile management

## Phase 5: Voice-Based Recruitment Assistant

* Integrate LiveKit Agents.
* Add real-time voice conversations.
* Use configurable speech-to-text, LLM, and text-to-speech providers.
* Support interview preparation and candidate queries.
* Add conversation context and session management.
* Provide transcript visibility and appropriate user controls.

The voice agent must remain a separate module and must not interfere with the core matching pipeline.

## Phase 6: Assisted Job Application Automation

* Discover and open supported job application pages.
* Extract application form fields.
* Use stored candidate information to prepare form responses.
* Allow the user to review and edit all generated responses.
* Require explicit approval before submitting any application.
* Record application status and relevant activity.
* Handle unsupported pages and automation failures safely.

Do not implement automatic submission without user review and confirmation.

---

# 5. Backend Project Structure

Use the existing project structure wherever possible. Extend it only when a new requirement justifies doing so.

```text
backend/
│
├── app/
│   ├── main.py
│   │
│   ├── config/
│   │   └── settings.py
│   │
│   ├── schemas/
│   │   ├── resume_schema.py
│   │   ├── job_schema.py
│   │   └── matching_schema.py
│   │
│   ├── services/
│   │   ├── llm_service.py
│   │   ├── pdf_parser.py
│   │   ├── skill_normalizer.py
│   │   └── matching_engine.py
│   │
│   ├── agents/
│   │   ├── cv_agent.py
│   │   └── job_agent.py
│   │
│   ├── routes/
│   │   ├── matching.py
│   │   ├── resume.py
│   │   └── jobs.py
│   │
│   ├── database/              # Planned
│   │   ├── connection.py
│   │   ├── models.py
│   │   └── repositories.py
│   │
│   └── utils/
│       └── file_validation.py # Planned
│
├── tests/                     # Planned
│   ├── test_pdf_parser.py
│   ├── test_cv_agent.py
│   ├── test_job_agent.py
│   ├── test_matching_engine.py
│   └── test_matching_api.py
│
├── .env
├── .env.example
├── .gitignore
└── requirements.txt
```

The frontend will be maintained separately:

```text
frontend/
├── src/
│   ├── components/
│   ├── pages/
│   ├── services/
│   ├── hooks/
│   ├── App.jsx
│   └── main.jsx
├── package.json
└── vite.config.js
```

---

# 6. Implementation Plan: Batch-Wise Development

Complete each batch in order. Do not ask the coding agent to implement all batches in a single request.

## Batch 0: Environment and Project Setup

**Objective:** Establish a working development environment.

Tasks:

* Verify the Python virtual environment.
* Verify all required backend dependencies.
* Configure environment variables.
* Verify the Groq API connection.
* Initialize Git and create the first project commit.
* Confirm that FastAPI starts successfully.

Expected result:

* FastAPI server starts without errors.
* `/health` endpoint returns a successful response.
* API credentials are loaded from `.env`.

Acceptance criteria:

* No hardcoded API keys.
* `.env` is excluded from Git.
* Dependencies are documented in `requirements.txt`.

## Batch 1: Configuration and Pydantic Schemas

**Objective:** Establish validated data contracts for the application.

Files:

* `config/settings.py`
* `schemas/resume_schema.py`
* `schemas/job_schema.py`
* `schemas/matching_schema.py`

Resume schema:

```python
from pydantic import BaseModel, Field


class ResumeAnalysis(BaseModel):
    candidate_name: str | None = None
    skills: list[str] = Field(default_factory=list)
    experience: list[str] = Field(default_factory=list)
    projects: list[str] = Field(default_factory=list)
```

Job schema should include:

* `job_title`
* `company`
* `required_skills`
* `preferred_skills`
* `responsibilities`
* `qualifications`

Matching schema should include:

* `match_score`
* `required_skill_score`
* `preferred_skill_score`
* `matched_skills`
* `missing_required_skills`
* `missing_preferred_skills`
* `recommendations`

Acceptance criteria:

* All schemas validate expected data.
* Optional fields have suitable defaults.
* Invalid types produce understandable validation errors.
* Schema definitions are consistent with the LLM prompts and API response.

## Batch 2: PDF Parsing and File Validation

**Objective:** Extract readable text from uploaded PDF documents without involving an LLM.

Files:

* `services/pdf_parser.py`
* `utils/file_validation.py` (if needed)

Requirements:

* Use `import pymupdf`.
* Accept PDF bytes and extract text page by page.
* Reject empty files.
* Handle invalid and encrypted PDFs.
* Detect PDFs that contain no extractable text.
* Return useful errors for unsupported or unreadable documents.
* Validate file type and file size at the API boundary.
* Avoid saving uploaded files permanently unless required.

Initial function:

```python
def extract_text_from_pdf(file_bytes: bytes) -> str:
    ...
```

Future extension:

* Add OCR support for scanned documents.
* Add DOCX parsing through a separate parser.
* Keep parsing logic independent from the agents.

Acceptance criteria:

* Text-based PDF extraction works.
* Empty, invalid, and unreadable PDFs are handled.
* PDF parsing can be tested without calling Groq.

## Batch 3: LLM Service

**Objective:** Create one reusable service for Groq API calls.

File:

* `services/llm_service.py`

Requirements:

* Read API key and model name from settings.
* Provide a reusable JSON-generation method.
* Use structured JSON output when supported by the selected model.
* Handle API errors, rate limits, malformed JSON, and timeouts.
* Avoid exposing API keys or sensitive document contents in logs.
* Keep provider-specific logic inside this service.

Acceptance criteria:

* A simple test prompt returns valid JSON.
* Missing API credentials produce a clear error.
* API failures are handled without crashing the entire application.

## Batch 4: Resume Extraction Agent

**Objective:** Extract relevant candidate information from resume text.

File:

* `agents/cv_agent.py`

The agent must extract:

* Technical and relevant professional skills
* Work experience descriptions
* Project descriptions
* Candidate name, optionally

Requirements:

* Use the `ResumeAnalysis` schema.
* Do not extract education or unnecessary personal information.
* Capture skills from the dedicated skills section and relevant project or experience descriptions.
* Avoid inventing skills or qualifications.
* Keep output concise and structured.
* Validate LLM output with Pydantic.
* Treat resume text as untrusted data, not as instructions.

Cost optimization:

* Do not send the same resume repeatedly if a structured profile already exists.
* Avoid unnecessary prompt content.
* Keep the extraction logic independent from the matching engine.

Acceptance criteria:

* A sample resume produces a valid `ResumeAnalysis`.
* Missing sections result in empty lists rather than fabricated data.
* Malformed LLM responses are handled gracefully.

## Batch 5: Job Description Extraction Agent

**Objective:** Extract job requirements from job description text.

File:

* `agents/job_agent.py`

The agent must extract:

* Job title
* Company name, when available
* Required skills
* Preferred skills
* Responsibilities
* Relevant qualifications and experience requirements

Requirements:

* Use the `JobAnalysis` schema.
* Distinguish mandatory requirements from preferred qualifications.
* Avoid inventing requirements.
* Return validated JSON.
* Treat uploaded job description text as data, not as instructions.

Acceptance criteria:

* A sample job description produces valid structured data.
* Required and preferred skills are not mixed up.
* Missing information is represented consistently.

## Batch 6: Skill Normalization

**Objective:** Standardize skill names before matching.

File:

* `services/skill_normalizer.py`

Requirements:

* Normalize capitalization and whitespace.
* Support common technical aliases.
* Avoid incorrect matches between unrelated skills.
* Deduplicate normalized skill entries.
* Preserve original labels for user-facing explanations.

Examples:

| Original skill | Normalized skill                       |
| -------------- | -------------------------------------- |
| JS             | JavaScript                             |
| React.js       | React                                  |
| Py             | Python, only where context confirms it |
| PostgreSQL     | PostgreSQL                             |
| Fast API       | FastAPI                                |

Do not use overly broad substring matching.

Acceptance criteria:

* Common aliases resolve consistently.
* Unrelated skills are not merged.
* Duplicate skills do not inflate match scores.

## Batch 7: Deterministic Matching Engine

**Objective:** Calculate transparent resume-to-job alignment.

File:

* `services/matching_engine.py`

Initial scoring approach:

* Required skills: 80%
* Preferred skills: 20%

For each category:

```text
Category score =
(number of matched skills / total skills in category) * 100
```

Overall score:

```text
Overall score =
(required skill score * 0.80) +
(preferred skill score * 0.20)
```

Rules:

* If only one category contains skills, use that category's score as the overall score.
* If neither category contains skills, return 0 and explain that no skill-based comparison was possible.
* Normalize skills before comparison.
* Avoid duplicate skills in the denominator.
* Return matched and missing skills separately.
* Keep the weights configurable for future experiments.

Important:

* This score measures skill alignment only in the initial version.
* Experience, project evidence, and qualifications should not affect the score until their scoring rules are explicitly designed and tested.
* Do not label the score as a probability of getting hired.

Acceptance criteria:

* Unit tests cover full, partial, and zero matches.
* Empty skill categories are handled.
* Scores remain between 0 and 100.
* Results are reproducible for the same inputs.

## Batch 8: Document-Based Matching API

**Objective:** Connect both document uploads to the extraction and matching pipeline.

File:

* `routes/matching.py`

Endpoint:

```text
POST /api/v1/matching/analyze
```

Inputs:

* `resume_file`: PDF upload
* `jd_file`: PDF upload

Processing flow:

1. Validate both uploaded documents.
2. Extract resume text using PyMuPDF.
3. Extract job description text using PyMuPDF.
4. Run the CV agent on the resume text.
5. Run the job agent on the job description text.
6. Pass validated data to the matching engine.
7. Return a structured matching response.

Requirements:

* Use FastAPI `UploadFile` and `File`.
* Validate file type and size.
* Handle parsing, LLM, and validation errors separately.
* Avoid returning internal stack traces or sensitive exception details.
* Use suitable HTTP status codes.
* Avoid blocking the event loop with synchronous LLM calls.
* Keep endpoint logic thin and delegate processing to services.

Acceptance criteria:

* Both PDFs can be uploaded through Swagger UI.
* The endpoint returns a structured match result.
* Invalid files return understandable errors.
* The same request produces consistent scoring for equivalent extracted data.

## Batch 9: Backend Testing and Quality Checks

**Objective:** Verify each component independently and test the full pipeline.

Test:

* PDF parsing
* File validation
* Resume extraction
* Job description extraction
* Skill normalization
* Matching calculations
* API response validation
* Error handling

Requirements:

* Use pytest.
* Mock Groq API calls in unit tests.
* Keep a small collection of representative test documents.
* Include resumes with missing sections and different layouts.
* Include job descriptions with required and preferred skills.
* Test duplicate skills and aliases.
* Test malformed and scanned PDFs.

Acceptance criteria:

* Core unit tests pass without requiring a live Groq API call.
* Integration tests verify the full upload flow.
* Failures are reproducible and documented.

## Batch 10: Frontend Development

**Objective:** Build a usable interface for document-based matching.

Requirements:

* React and Vite.
* Resume PDF upload.
* Job description PDF upload.
* Upload progress and validation feedback.
* Analyze button.
* Loading state.
* Match score display.
* Matched and missing skill sections.
* Recommendations section.
* Error and retry handling.

Frontend services:

* Keep API requests in a dedicated service module.
* Avoid embedding backend URLs throughout components.
* Configure the API base URL using environment variables.

Acceptance criteria:

* Both files can be uploaded.
* The UI displays the API result clearly.
* Errors are understandable.
* The interface works at common desktop and mobile widths.

## Batch 11: Candidate Profiles, Database, and Caching

**Objective:** Avoid repeated document processing and support multiple job analyses.

Planned components:

* PostgreSQL
* SQLAlchemy
* Candidate profile model
* Job description model
* Match history model
* Repository layer

Requirements:

* Store structured extraction results rather than raw documents by default.
* Use document hashes to detect unchanged uploads.
* Reuse extraction results when the source document and extraction version are unchanged.
* Track timestamps and extraction versions.
* Allow users to update or delete their profiles.
* Apply access controls before exposing stored candidate information.

Acceptance criteria:

* A previously processed resume can be reused.
* A changed resume triggers re-extraction.
* Multiple job descriptions can be analyzed against one profile.
* Stored data can be deleted through the supported API.

## Batch 12: Evidence-Based Matching Improvements

**Objective:** Expand matching beyond simple skill overlap.

Potential improvements:

* Identify skill evidence in projects and experience.
* Compare required years of experience where the resume provides sufficient information.
* Distinguish explicit mentions from demonstrated usage.
* Explain why a requirement was considered matched.
* Identify uncertain or ambiguous evidence.
* Evaluate matching quality using human-reviewed examples.

Requirements:

* Define scoring rules before implementation.
* Keep evidence extraction separate from score calculation.
* Do not infer proficiency solely from a skill's presence.
* Avoid treating missing resume evidence as proof that a candidate lacks a skill.
* Make score explanations transparent.

Acceptance criteria:

* Evidence can be traced to source resume sections.
* Scoring changes are covered by tests.
* Evaluation results are documented.

## Batch 13: Voice Agent Integration

**Objective:** Add a conversational recruitment assistant without coupling it to the matching engine.

Planned architecture:

* React voice interface
* LiveKit room
* Python LiveKit agent
* Speech-to-text provider
* LLM service
* Text-to-speech provider
* Backend APIs for candidate and job information

Requirements:

* Real-time audio interaction.
* Conversation transcripts.
* Session context.
* Interruption handling and voice activity detection.
* Clear error handling for audio and provider failures.
* Appropriate consent and privacy controls.

Acceptance criteria:

* Users can start and end voice sessions.
* The agent can answer questions using authorized profile and job data.
* Voice features remain independently testable.

## Batch 14: Assisted Application Automation

**Objective:** Help users prepare job applications while preserving human control.

Planned technology:

* Playwright
* Application workflow service
* Candidate profile integration

Requirements:

* Support a defined set of application websites first.
* Identify application form fields.
* Populate fields using approved profile data.
* Generate draft answers where needed.
* Show a review screen before submission.
* Require explicit user approval before any final submission.
* Handle authentication, CAPTCHA, and unsupported pages without attempting unsafe bypasses.
* Log application status and errors without unnecessarily storing sensitive data.

Acceptance criteria:

* A user can review all prepared form values.
* No application is submitted without explicit confirmation.
* Failed automation does not silently discard user data.

---

# 7. API Design

Initial endpoints:

| Method | Endpoint                   | Purpose                                           |
| ------ | -------------------------- | ------------------------------------------------- |
| GET    | `/`                        | Basic API information                             |
| GET    | `/health`                  | Health check                                      |
| POST   | `/api/v1/matching/analyze` | Upload resume and JD PDFs and calculate alignment |
| POST   | `/api/v1/resumes/extract`  | Extract a resume profile                          |
| POST   | `/api/v1/jobs/extract`     | Extract job requirements                          |

Future endpoints:

| Method | Endpoint                           | Purpose                        |
| ------ | ---------------------------------- | ------------------------------ |
| GET    | `/api/v1/resumes/{id}`             | Retrieve a candidate profile   |
| DELETE | `/api/v1/resumes/{id}`             | Delete a candidate profile     |
| GET    | `/api/v1/matches/{id}`             | Retrieve a previous match      |
| GET    | `/api/v1/matches`                  | List match history             |
| POST   | `/api/v1/applications/prepare`     | Prepare an application         |
| POST   | `/api/v1/applications/{id}/submit` | Submit after explicit approval |

All API responses should use consistent schemas and meaningful error messages.

---

# 8. LLM Cost Optimization Strategy

Cost control is a core design requirement.

1. **Parse locally first:** Use PyMuPDF to extract document text without an LLM call.
2. **Filter relevant sections:** Identify skills, experience, projects, responsibilities, and requirements before sending content to the model.
3. **Avoid repeated extraction:** Save and reuse structured profiles.
4. **Cache job descriptions:** Reuse extracted requirements for unchanged job documents.
5. **Keep prompts concise:** Avoid unnecessary instructions and duplicated document content.
6. **Use deterministic code where possible:** Skill normalization and scoring should not require LLM calls.
7. **Choose model size based on evaluation:** Compare extraction quality, latency, and token costs before selecting a production model.
8. **Track usage:** Record token usage and extraction latency without logging sensitive document text.
9. **Handle long documents:** Apply sensible limits and section-aware chunking when necessary.
10. **Version extraction logic:** Reprocess cached profiles only when required by meaningful schema or prompt changes.

The initial system should extract a resume profile once and reuse it for multiple job matches.

---

# 9. Security, Privacy, and Reliability

* Store API keys in environment variables.
* Never commit `.env`.
* Validate uploaded file size and content.
* Do not trust MIME type alone.
* Avoid retaining original documents unless necessary.
* Restrict access to stored profiles and match results.
* Do not log complete resumes or personal contact details.
* Treat uploaded text as untrusted input.
* Handle prompt injection attempts in uploaded documents.
* Add API timeouts and sensible retry policies.
* Avoid exposing stack traces and provider secrets in API responses.
* Require user approval for external application submission.
* Document data retention and deletion behavior.

---

# 10. Development Workflow for the Coding Agent

The coding agent must follow these instructions throughout development.

### Working rules

1. Read the existing project files before making changes.
2. Implement only the batch explicitly requested by the user.
3. Do not rewrite working components without a clear reason.
4. Do not create duplicate files or competing implementations.
5. Preserve the agreed architecture and naming conventions.
6. Check how existing functions are called before changing signatures.
7. Update imports and dependent code whenever a schema or function changes.
8. Do not introduce new dependencies without explaining why they are required.
9. Add or update tests for each meaningful change.
10. Run relevant tests and report actual results.
11. Do not claim a feature works unless it has been tested.
12. Explain any assumptions or unresolved decisions.
13. Update this README when a batch is completed.
14. Do not proceed to the next batch without user approval.

### Required response after every batch

The coding agent should report:

* **Files created or modified**
* **What was implemented**
* **Important design decisions**
* **Commands to run**
* **Tests performed and their actual results**
* **Known issues or limitations**
* **Recommended next batch**

### Batch execution prompt

Use the following prompt whenever starting a batch:

> Read the project's README and inspect the existing codebase before making any changes.
>
> Implement only the batch I specify. Follow the documented architecture, existing naming conventions, and data schemas.
>
> Do not restructure unrelated components or implement future batches.
>
> Before modifying a function or schema, inspect its existing callers and dependent components. Keep all changes consistent across the application.
>
> Add or update appropriate tests, run them, and report the actual results. If a required design decision is missing, ask before making a potentially breaking change.
>
> At the end, summarize modified files, implementation details, commands to run, test results, limitations, and the next recommended batch.
>
> Do not proceed beyond the requested batch without my approval.

---

# 11. Current Development Status

Update this table as work progresses.

| Batch | Component                   | Status                                     |
| ----- | --------------------------- | ------------------------------------------ |
| 0     | Environment and setup       | Completed                                  |
| 1     | Configuration and schemas   | Completed                                  |
| 2     | PDF parsing                 | Completed                                  |
| 3     | LLM service                 | Completed                                  |
| 4     | Resume extraction agent     | Completed                                  |
| 5     | Job extraction agent        | Completed                                  |
| 6     | Skill normalization         | Completed                                  |
| 7     | Matching engine             | Completed                                  |
| 8     | Document-based matching API | Completed                                  |
| 9     | Backend testing             | Completed (20 tests passing)               |
| 10    | Frontend                    | In progress                                |
| 11    | Database and caching        | Pending                                    |
| 12    | Evidence-based matching     | Pending                                    |
| 13    | Voice agent                 | Planned                                    |
| 14    | Application automation      | Planned                                    |

**Status definitions:**

* Pending: Not started.
* In progress: Currently being implemented.
* Implemented, needs verification: Code exists but has not passed the required tests.
* Completed: Acceptance criteria have been verified.

Only mark a batch completed after its acceptance criteria have been tested.

---

# 12. Immediate Next Steps

The current priority is to complete the document-based matching pipeline.

1. Verify the updated `ResumeAnalysis` schema and `CVAgent`.
2. Test resume extraction using a representative PDF.
3. Verify job extraction and its schema.
4. Review the current matching engine's function signature and scoring behavior.
5. Update the matching API to accept both `resume_file` and `jd_file` as PDF uploads.
6. Ensure both documents pass through the shared PDF parser.
7. Test the full pipeline using Swagger UI.
8. Fix validation, parsing, and API errors before starting frontend development.
9. Add automated tests for the completed backend flow.
10. Update the README status table based on verified results.

**Immediate implementation target:**

```text
Resume PDF + Job Description PDF
                 |
                 v
         File Validation
                 |
                 v
          PDF Text Parsing
                 |
          +------+------+
          |             |
          v             v
       CV Agent      Job Agent
          |             |
          v             v
    Resume Schema   Job Schema
          |             |
          +------+------+
                 |
                 v
         Matching Engine
                 |
                 v
       Structured Match Result
```

The first complete milestone is a working backend endpoint that accepts two PDF documents and returns a validated, reproducible skill-alignment result.
