const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1';

export async function analyzeMatch(resumeFile, jdFile) {
  const formData = new FormData();
  formData.append('resume_file', resumeFile);
  formData.append('jd_file', jdFile);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/matching/analyze`, {
      method: 'POST',
      body: formData,
    });
  } catch (err) {
    throw new Error('Unable to connect to backend server. Make sure FastAPI server is running on port 8000.');
  }

  if (!response.ok) {
    let errorDetail = 'Failed to analyze documents.';
    try {
      const errorData = await response.json();
      errorDetail = errorData.detail || errorDetail;
    } catch {
      errorDetail = `Server returned an error (${response.status}: ${response.statusText})`;
    }
    throw new Error(errorDetail);
  }

  return await response.json();
}

export async function fetchVoiceGreeting(context = {}) {
  const response = await fetch(`${API_BASE_URL}/voice/greeting`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(context || {}),
  });

  if (!response.ok) {
    let detail = 'Failed to load voice greeting.';
    try {
      const err = await response.json();
      detail = err.detail || detail;
    } catch {}
    throw new Error(detail);
  }

  const data = await response.json();
  return data;
}

export async function sendVoiceMessage(context = {}, userMessage, conversationHistory = []) {
  const response = await fetch(`${API_BASE_URL}/voice/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(context || {}),
      user_message: userMessage,
      conversation_history: conversationHistory,
    }),
  });

  if (!response.ok) {
    let detail = 'Failed to process voice query.';
    try {
      const err = await response.json();
      detail = err.detail || detail;
    } catch {}
    throw new Error(detail);
  }

  const data = await response.json();
  return data;
}

export async function synthesizeVoiceSpeech(text, voice = null, speed = null) {
  const response = await fetch(`${API_BASE_URL}/voice/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice, speed }),
  });

  if (!response.ok) {
    let detail = 'Failed to synthesize speech.';
    try {
      const err = await response.json();
      detail = err.detail || detail;
    } catch {}
    throw new Error(detail);
  }

  const data = await response.json();
  return data.audio_base64;
}

export async function transcribeVoiceAudio(audioBlob) {
  const formData = new FormData();
  formData.append('audio_file', audioBlob, 'recording.webm');

  const response = await fetch(`${API_BASE_URL}/voice/transcribe`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let detail = 'Failed to transcribe audio.';
    try {
      const err = await response.json();
      detail = err.detail || detail;
    } catch {}
    throw new Error(detail);
  }

  const data = await response.json();
  return data.transcript;
}

export async function crawlJobPosting(url) {
  const response = await fetch(`${API_BASE_URL}/jobs/crawl`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    let detail = 'Failed to crawl job link.';
    try {
      const err = await response.json();
      detail = err.detail || detail;
    } catch {}
    throw new Error(detail);
  }

  return await response.json();
}

export async function evaluateCrawledMatch(resumeFile, jobData) {
  const formData = new FormData();
  formData.append('resume_file', resumeFile);
  formData.append('job_data_json', JSON.stringify(jobData));

  const response = await fetch(`${API_BASE_URL}/matching/evaluate-crawled`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let detail = 'Failed to evaluate resume alignment.';
    try {
      const err = await response.json();
      detail = err.detail || detail;
    } catch {}
    throw new Error(detail);
  }

  return await response.json();
}

