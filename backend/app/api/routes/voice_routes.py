import asyncio
import logging
from fastapi import APIRouter, HTTPException, UploadFile, File, Response
from pydantic import BaseModel, Field
from app.services.llm_service import llm_service
from app.services.stt_service import stt_service
from app.services.tts_service import tts_service

logger = logging.getLogger(__name__)

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
    audio_base64: str | None = None


class SynthesizeRequest(BaseModel):
    text: str
    voice: str | None = None
    speed: float | None = None


class SynthesizeResponse(BaseModel):
    audio_base64: str


class TranscribeResponse(BaseModel):
    transcript: str


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

        audio_b64 = None
        if tts_service.is_available():
            try:
                audio_b64 = await asyncio.to_thread(tts_service.synthesize_base64, cleaned_reply)
            except Exception as tts_err:
                logger.warning("Voice greeting TTS synthesis failed: %s", str(tts_err))

        return VoiceResponse(reply=cleaned_reply, audio_base64=audio_b64)

    except Exception as exc:
        logger.warning("Voice greeting generation encountered error: %s. Using graceful fallback greeting.", str(exc))
        name = req.candidate_name or "there"
        company_phrase = f"at {req.company}" if req.company else ""
        skills_phrase = f", with strong skills in {', '.join(req.matched_skills[:3])}" if req.matched_skills else ""
        fallback_reply = (
            f"Hi {name}, welcome! You're a {req.match_score:.1f}% match for the {req.job_title} role {company_phrase}"
            f"{skills_phrase}. Feel free to ask any questions or practice interview scenarios with me."
        )
        audio_b64 = None
        if tts_service.is_available():
            try:
                audio_b64 = await asyncio.to_thread(tts_service.synthesize_base64, fallback_reply)
            except Exception as tts_err:
                logger.warning("Fallback greeting TTS synthesis failed: %s", str(tts_err))

        return VoiceResponse(reply=fallback_reply, audio_base64=audio_b64)


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

        audio_b64 = None
        if tts_service.is_available():
            try:
                audio_b64 = await asyncio.to_thread(tts_service.synthesize_base64, cleaned_reply)
            except Exception as tts_err:
                logger.warning("Voice chat TTS synthesis failed: %s", str(tts_err))

        return VoiceResponse(reply=cleaned_reply, audio_base64=audio_b64)

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Voice chat failed: {str(exc)}"
        )


@router.post("/synthesize", response_model=SynthesizeResponse)
async def synthesize_speech_route(req: SynthesizeRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    try:
        audio_b64 = await asyncio.to_thread(
            tts_service.synthesize_base64,
            req.text,
            req.voice,
            req.speed
        )
        return SynthesizeResponse(audio_base64=audio_b64)

    except Exception as exc:
        logger.error("Speech synthesis failed: %s", str(exc))
        raise HTTPException(
            status_code=500,
            detail=f"Speech synthesis failed: {str(exc)}"
        )


@router.post("/synthesize/stream")
async def synthesize_speech_stream(req: SynthesizeRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    try:
        wav_bytes = await asyncio.to_thread(
            tts_service.synthesize_wav,
            req.text,
            req.voice,
            req.speed
        )
        return Response(content=wav_bytes, media_type="audio/wav")

    except Exception as exc:
        logger.error("Speech audio streaming failed: %s", str(exc))
        raise HTTPException(
            status_code=500,
            detail=f"Speech audio streaming failed: {str(exc)}"
        )


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio_file(
    audio_file: UploadFile = File(..., description="Audio recording file (webm, wav, m4a, mp3, ogg)")
):
    if not audio_file:
        raise HTTPException(status_code=400, detail="No audio file uploaded.")

    try:
        audio_bytes = await audio_file.read()
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Uploaded audio file is empty.")

        filename = audio_file.filename or "recording.webm"
        content_type = audio_file.content_type or "audio/webm"

        transcript = await asyncio.to_thread(
            stt_service.transcribe_audio,
            audio_bytes,
            filename,
            content_type
        )

        return TranscribeResponse(transcript=transcript)

    except HTTPException:
        raise

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    except Exception as exc:
        logger.error("Audio transcription failed: %s", str(exc))
        raise HTTPException(
            status_code=502,
            detail=f"Speech transcription failed: {str(exc)}"
        )
