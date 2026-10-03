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
