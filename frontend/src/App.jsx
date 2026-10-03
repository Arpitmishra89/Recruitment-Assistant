import React, { useState } from 'react';
import ResumeUpload from './components/ResumeUpload';
import JobInput from './components/JobInput';
import MatchReport from './components/MatchReport';
import { analyzeMatch } from './services/api';

export default function App() {
  const [resumeFile, setResumeFile] = useState(null);
  const [jdFile, setJdFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [error, setError] = useState(null);
  const [matchResult, setMatchResult] = useState(null);

  const handleAnalyze = async () => {
    if (!resumeFile || !jdFile) {
      setError('Please upload both candidate resume and job description PDFs.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setMatchResult(null);

    try {
      const data = await analyzeMatch(resumeFile, jdFile);
      setMatchResult(data);
      // Scroll to results smoothly
      setTimeout(() => {
        document.getElementById('match-results-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      setError(err.message || 'An unexpected error occurred while analyzing the documents.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadSamples = async () => {
    setLoadingSample(true);
    setError(null);
    try {
      const [resumeRes, jdRes] = await Promise.all([
        fetch('/sample_documents/sample_resume.pdf'),
        fetch('/sample_documents/sample_jd.pdf'),
      ]);

      if (!resumeRes.ok || !jdRes.ok) {
        throw new Error('Sample files could not be loaded.');
      }

      const [resumeBlob, jdBlob] = await Promise.all([
        resumeRes.blob(),
        jdRes.blob(),
      ]);

      const sampleResume = new File([resumeBlob], 'sample_resume.pdf', { type: 'application/pdf' });
      const sampleJD = new File([jdBlob], 'sample_jd.pdf', { type: 'application/pdf' });

      setResumeFile(sampleResume);
      setJdFile(sampleJD);
    } catch (err) {
      setError('Unable to load sample documents: ' + err.message);
    } finally {
      setLoadingSample(false);
    }
  };

  const handleReset = () => {
    setResumeFile(null);
    setJdFile(null);
    setMatchResult(null);
    setError(null);
  };

  return (
    <main className="app-container">
      {/* Header */}
      <header className="app-header">
        <h1 className="main-title">
          Resume & Job <span className="gradient-text">Alignment Analyzer</span>
        </h1>
        <p className="subtitle">
          Upload a candidate resume and job description PDF to evaluate skill alignment, pinpoint gaps, and generate actionable recommendations in seconds.
        </p>
      </header>

      {/* Upload Zone */}
      <section className="upload-grid" aria-label="Document Upload Section">
        <ResumeUpload
          file={resumeFile}
          onFileChange={(file) => {
            setResumeFile(file);
            setError(null);
          }}
          onRemoveFile={() => setResumeFile(null)}
        />
        <JobInput
          file={jdFile}
          onFileChange={(file) => {
            setJdFile(file);
            setError(null);
          }}
          onRemoveFile={() => setJdFile(null)}
        />
      </section>

      {/* Actions */}
      <div className="actions-row">
        <button
          className="analyze-button"
          onClick={handleAnalyze}
          disabled={!resumeFile || !jdFile || isLoading}
          id="analyze-match-btn"
        >
          {isLoading ? (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="spinner-icon">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
              Analyzing Alignment...
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4"></path>
                <path d="M12 18v4"></path>
                <path d="M4.93 4.93l2.83 2.83"></path>
                <path d="M16.24 16.24l2.83 2.83"></path>
                <path d="M2 12h4"></path>
                <path d="M18 12h4"></path>
                <path d="M4.93 19.07l2.83-2.83"></path>
                <path d="M16.24 7.76l2.83-2.83"></path>
              </svg>
              Analyze Alignment
            </>
          )}
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="alert-error" role="alert" id="error-banner">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <div>{error}</div>
        </div>
      )}

      {/* Loading Box */}
      {isLoading && (
        <div className="loading-box" aria-live="polite">
          <div className="spinner"></div>
          <div className="loading-text">Analyzing Candidate Alignment</div>
          <p className="loading-subtext">
            Extracting document text with PyMuPDF and querying Groq LLM for skill & requirement extraction...
          </p>
        </div>
      )}

      {/* Match Results */}
      {matchResult && <MatchReport result={matchResult} />}
    </main>
  );
}
