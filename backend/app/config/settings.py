from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    GROQ_WHISPER_MODEL: str = "whisper-large-v3-turbo"
    KOKORO_MODEL_PATH: str = "models/kokoro/kokoro-v1.0.onnx"
    KOKORO_VOICES_PATH: str = "models/kokoro/voices-v1.0.bin"
    KOKORO_VOICE: str = "af_heart"
    KOKORO_SPEED: float = 1.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()