import base64
import io
import logging
import re
import threading
from pathlib import Path

import onnxruntime as ort
import soundfile as sf
from kokoro_onnx import Kokoro

from app.config.settings import settings

logger = logging.getLogger(__name__)

# Prevent harmless Windows ctypes teardown warning in phonemizer on Python 3.13 exit
try:
    from phonemizer.backend.espeak.api import EspeakAPI
    _orig_delete_win32 = getattr(EspeakAPI, "_delete_win32", None)
    if _orig_delete_win32:
        def _safe_delete_win32(self):
            try:
                if getattr(self, "_library", None) is not None and getattr(self._library, "_handle", None) is not None:
                    _orig_delete_win32(self)
            except Exception:
                pass
        EspeakAPI._delete_win32 = _safe_delete_win32
except Exception:
    pass


def clean_text_for_tts(text: str) -> str:
    """Clean text by removing markdown symbols, URLs, asterisks, and excessive whitespace."""
    if not text:
        return ""
    # Remove markdown links [label](url) -> label
    cleaned = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    # Remove markdown formatting characters (*, _, `, #, ~, >, etc.)
    cleaned = re.sub(r"[*_`#~>]", "", cleaned)
    # Remove URLs
    cleaned = re.sub(r"https?://\S+", "", cleaned)
    # Remove extra quotes surrounding entire text
    cleaned = cleaned.strip().strip('"').strip("'")
    # Normalize whitespace
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


class TTSService:
    """
    Local neural Text-To-Speech engine using Kokoro-82M ONNX.
    Produces high-fidelity, human-like voice synthesis with zero cloud cost.
    """

    def __init__(self):
        self._kokoro: Kokoro | None = None
        self._lock = threading.Lock()

    def _resolve_path(self, path_str: str) -> Path:
        """Resolve a path relative to backend root or absolute."""
        p = Path(path_str)
        if p.is_absolute():
            return p
        backend_root = Path(__file__).resolve().parent.parent.parent
        return (backend_root / p).resolve()

    def _load_model(self) -> Kokoro:
        if self._kokoro is not None:
            return self._kokoro

        with self._lock:
            if self._kokoro is not None:
                return self._kokoro

            model_path = self._resolve_path(settings.KOKORO_MODEL_PATH)
            voices_path = self._resolve_path(settings.KOKORO_VOICES_PATH)

            if not model_path.exists():
                raise FileNotFoundError(
                    f"Kokoro model not found at {model_path}. Please ensure model files are downloaded."
                )
            if not voices_path.exists():
                raise FileNotFoundError(
                    f"Kokoro voices file not found at {voices_path}. Please ensure voices file exists."
                )

            logger.info("Initializing Kokoro-82M ONNX session from %s...", model_path)
            # Use CPUExecutionProvider for universal compatibility and rock-solid stability
            session = ort.InferenceSession(
                str(model_path),
                providers=["CPUExecutionProvider"]
            )
            self._kokoro = Kokoro.from_session(session, str(voices_path))
            logger.info("Kokoro-82M TTS engine successfully loaded and ready.")
            return self._kokoro

    def is_available(self) -> bool:
        """Check if Kokoro model and voice files exist on disk."""
        try:
            model_path = self._resolve_path(settings.KOKORO_MODEL_PATH)
            voices_path = self._resolve_path(settings.KOKORO_VOICES_PATH)
            return model_path.exists() and voices_path.exists()
        except Exception:
            return False

    def synthesize_wav(
        self,
        text: str,
        voice: str | None = None,
        speed: float | None = None
    ) -> bytes:
        """
        Synthesize text into standard 24kHz 16-bit PCM WAV audio bytes.
        """
        clean_text = clean_text_for_tts(text)
        if not clean_text:
            raise ValueError("Text cannot be empty for speech synthesis.")

        voice_name = voice or settings.KOKORO_VOICE
        speed_val = speed or settings.KOKORO_SPEED

        engine = self._load_model()
        samples, sample_rate = engine.create(
            clean_text,
            voice=voice_name,
            speed=speed_val,
            lang="en-us"
        )

        buffer = io.BytesIO()
        sf.write(buffer, samples, sample_rate, format="WAV", subtype="PCM_16")
        buffer.seek(0)
        return buffer.read()

    def synthesize_base64(
        self,
        text: str,
        voice: str | None = None,
        speed: float | None = None
    ) -> str:
        """
        Synthesize text and return base64-encoded WAV audio string.
        """
        wav_bytes = self.synthesize_wav(text, voice=voice, speed=speed)
        return base64.b64encode(wav_bytes).decode("utf-8")


tts_service = TTSService()
