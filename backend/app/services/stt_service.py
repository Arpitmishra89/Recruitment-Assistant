import logging
import time
from groq import Groq, RateLimitError, APIConnectionError, InternalServerError

from app.config.settings import settings

logger = logging.getLogger(__name__)


class STTService:
    def __init__(self):
        self.client = Groq(api_key=settings.GROQ_API_KEY)
        self.model = settings.GROQ_WHISPER_MODEL

    def transcribe_audio(
        self,
        audio_bytes: bytes,
        filename: str = "audio.webm",
        mime_type: str = "audio/webm",
        max_retries: int = 3
    ) -> str:
        if not audio_bytes:
            raise ValueError("Audio payload cannot be empty.")

        last_error = None
        # Groq file payload tuple format: (filename, bytes, content_type)
        file_payload = (filename, audio_bytes, mime_type)

        for attempt in range(max_retries):
            try:
                transcription = self.client.audio.transcriptions.create(
                    model=self.model,
                    file=file_payload,
                    response_format="json",
                    temperature=0.0
                )

                text = transcription.text if hasattr(transcription, "text") else str(transcription)
                return text.strip()

            except (RateLimitError, APIConnectionError, InternalServerError) as exc:
                last_error = exc
                if attempt < max_retries - 1:
                    sleep_time = (2 ** attempt) * 1.0
                    logger.warning(
                        "Groq Whisper transcription failed (attempt %d/%d): %s. Retrying in %.1fs...",
                        attempt + 1, max_retries, str(exc), sleep_time
                    )
                    time.sleep(sleep_time)
                else:
                    logger.error("Groq Whisper failed after %d attempts: %s", max_retries, str(exc))

            except Exception as exc:
                logger.error("Unexpected error during speech transcription: %s", str(exc))
                raise

        raise last_error or RuntimeError("Failed to transcribe audio after retries.")


stt_service = STTService()
