from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app
from app.services.tts_service import clean_text_for_tts, tts_service

client = TestClient(app)


def test_clean_text_for_tts():
    raw = "**Hello!** [Click here](https://example.com) to practice *React* and `FastAPI`."
    cleaned = clean_text_for_tts(raw)
    assert cleaned == "Hello! Click here to practice React and FastAPI."
    assert "http" not in cleaned
    assert "*" not in cleaned
    assert "[" not in cleaned


def test_clean_text_empty():
    assert clean_text_for_tts("") == ""
    assert clean_text_for_tts(None) == ""


def test_tts_service_is_available():
    assert tts_service.is_available() is True


@patch("app.api.routes.voice_routes.tts_service.synthesize_base64")
def test_synthesize_endpoint_success(mock_synth):
    mock_synth.return_value = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
    response = client.post(
        "/api/v1/voice/synthesize",
        json={"text": "Welcome to your interview practice."}
    )
    assert response.status_code == 200
    data = response.json()
    assert "audio_base64" in data
    assert data["audio_base64"].startswith("UklGR")


def test_synthesize_endpoint_empty_text():
    response = client.post(
        "/api/v1/voice/synthesize",
        json={"text": "   "}
    )
    assert response.status_code == 400
    assert "cannot be empty" in response.json()["detail"]


@patch("app.api.routes.voice_routes.tts_service.synthesize_wav")
def test_synthesize_stream_endpoint(mock_synth_wav):
    mock_synth_wav.return_value = b"RIFF....WAVEfmt ...."
    response = client.post(
        "/api/v1/voice/synthesize/stream",
        json={"text": "Stream this speech audio."}
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.content == b"RIFF....WAVEfmt ...."
