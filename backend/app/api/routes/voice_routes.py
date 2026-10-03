from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.services.llm_service import llm_service

router = APIRouter(prefix="/api/v1/voice", tags=["Voice"])


class VoiceContext(BaseModel):
    candidate_name: str | None = None
    job_title: str
    company: str | None = None
    match_score: float = Field(ge=0, le=100)
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)


class VoiceGreetingRequest(VoiceContext):
    pass


class VoiceChatRequest(VoiceContext):
    user_message: str
    conversation_history: list[dict] = Field(default_factory=list)


class VoiceResponse(BaseModel):
    reply: str


def _build_system_prompt(ctx: VoiceContext) -> str:
    name_str = ctx.candidate_name or "Candidate"
    company_str = f"at {ctx.company}" if ctx.company else ""
    matched_sample = ", ".join(ctx.matched_skills[:4]) if ctx.matched_skills else "none noted yet"
    missing_sample = ", ".join(ctx.missing_skills[:4]) if ctx.missing_skills else "no major gaps"

    return f"""You are an expert AI Technical Recruiter and Career Coach having a real-time voice conversation with {name_str}.
Target Role: {ctx.job_title} {company_str}
Match Score: {ctx.match_score}%
Matched Skills: {matched_sample}
Missing / Gap Skills: {missing_sample}

CRITICAL RULES FOR VOICE CONVERSATION:
1. Your response will be spoken aloud to the candidate via Text-to-Speech.
2. Keep your answer brief and conversational: strictly 1 to 3 sentences (maximum 45 words).
3. Do NOT use markdown symbols, asterisks, bullet points, numbered lists, or URLs.
4. Speak warmly, naturally, and professionally like an experienced mentor.
5. Provide actionable guidance on their alignment, interview questions, or how to address skill gaps."""


@router.post("/greeting", response_model=VoiceResponse)
async def generate_voice_greeting(req: VoiceGreetingRequest):
    try:
        name = req.candidate_name or "there"
        company_phrase = f"at {req.company}" if req.company else ""
        system_prompt = _build_system_prompt(req)

        user_prompt = (
            f"Generate a warm, natural 2-sentence voice greeting welcoming {name}. "
            f"Mention their {req.match_score}% match score for the {req.job_title} position {company_phrase}, "
            f"acknowledge their strong skills and key gaps, and invite them to ask any questions or practice interview questions."
        )

        reply = llm_service.chat_completion(
            system_prompt=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
            temperature=0.7
        )

        # Clean any accidental quotes
        cleaned_reply = reply.strip().strip('"').strip("'")
        return VoiceResponse(reply=cleaned_reply)

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to generate voice greeting: {str(exc)}"
        )


@router.post("/chat", response_model=VoiceResponse)
async def voice_chat(req: VoiceChatRequest):
    if not req.user_message.strip():
        raise HTTPException(status_code=400, detail="User message cannot be empty.")

    try:
        system_prompt = _build_system_prompt(req)

        messages = []
        # Include last few conversational turns for context
        for turn in req.conversation_history[-6:]:
            role = turn.get("role", "user")
            content = turn.get("content", "")
            if role in ["user", "assistant"] and content:
                messages.append({"role": role, "content": content})

        messages.append({"role": "user", "content": req.user_message})

        reply = llm_service.chat_completion(
            system_prompt=system_prompt,
            messages=messages,
            temperature=0.6
        )

        cleaned_reply = reply.strip().strip('"').strip("'")
        return VoiceResponse(reply=cleaned_reply)

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Voice chat failed: {str(exc)}"
        )
