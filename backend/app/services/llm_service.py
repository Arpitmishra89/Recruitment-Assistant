import json
import logging
import time
from groq import Groq, RateLimitError, APIConnectionError, InternalServerError

from app.config.settings import settings

logger = logging.getLogger(__name__)


class LLMService:
    def __init__(self):
        self.client = Groq(api_key=settings.GROQ_API_KEY)
        self.model = settings.GROQ_MODEL

    def generate_json(self, system_prompt: str, user_prompt: str, max_retries: int = 3) -> dict:
        last_error = None
        for attempt in range(max_retries):
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1
                )

                content = response.choices[0].message.content

                if not content:
                    raise ValueError("The LLM returned an empty response.")

                return json.loads(content)

            except (RateLimitError, APIConnectionError, InternalServerError, ValueError, json.JSONDecodeError) as exc:
                last_error = exc
                if attempt < max_retries - 1:
                    sleep_time = (2 ** attempt) * 1.5
                    logger.warning(
                        "Groq API call failed (attempt %d/%d): %s. Retrying in %.1fs...",
                        attempt + 1, max_retries, str(exc), sleep_time
                    )
                    time.sleep(sleep_time)
                else:
                    logger.error("Groq API call failed after %d attempts: %s", max_retries, str(exc))

        raise last_error or RuntimeError("Failed to generate JSON after retries.")

    def chat_completion(
        self,
        system_prompt: str,
        messages: list[dict],
        temperature: float = 0.6,
        max_tokens: int = 2048,
        max_retries: int = 3
    ) -> str:
        all_messages = [{"role": "system", "content": system_prompt}] + messages
        last_error = None

        for attempt in range(max_retries):
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=all_messages,
                    temperature=temperature,
                    max_tokens=max_tokens
                )

                choice = response.choices[0]
                content = choice.message.content

                # Check if model populated content
                if content and content.strip():
                    return content.strip()

                # If content is empty because reasoning consumed tokens or finish_reason is length
                if choice.finish_reason == "length":
                    logger.warning(
                        "Model reached max_tokens (%d) during reasoning. Increasing token limit...",
                        max_tokens
                    )
                    max_tokens += 1024

                raise ValueError("The LLM returned an empty response.")

            except (RateLimitError, APIConnectionError, InternalServerError, ValueError) as exc:
                last_error = exc
                if attempt < max_retries - 1:
                    sleep_time = (2 ** attempt) * 1.5
                    logger.warning(
                        "Groq chat completion failed (attempt %d/%d): %s. Retrying in %.1fs...",
                        attempt + 1, max_retries, str(exc), sleep_time
                    )
                    time.sleep(sleep_time)
                else:
                    logger.error("Groq chat completion failed after %d attempts: %s", max_retries, str(exc))

        raise last_error or RuntimeError("Failed to generate chat completion after retries.")


llm_service = LLMService()