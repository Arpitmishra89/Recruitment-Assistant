import React, { useState } from 'react';
import VoiceHeroAgent from './components/VoiceHeroAgent';
import ResumeUpload from './components/ResumeUpload';
import JobInput from './components/JobInput';
import MatchReport from './components/MatchReport';
import { analyzeMatch } from './services/api';

export default function App() {
  const [showManualMatcher, setShowManualMatcher] = useState(false);
  const [resumeFile, setResumeFile] = useState(null);
  const [jdFile, setJdFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [matchResult, setMatchResult] = useState(null);
  const [activeVoiceContext, setActiveVoiceContext] = useState(null);

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
      setActiveVoiceContext(data);
      setTimeout(() => {
        document.getElementById('match-results-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      setError(err.message || 'An unexpected error occurred while analyzing the documents.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetManualMatcher = () => {
    setResumeFile(null);
    setJdFile(null);
    setMatchResult(null);
    setError(null);
  };

  return (
    <main className="app-container">
      {/* Primary Hero: Autonomous Voice Career Agent */}
      <VoiceHeroAgent
        initialContext={activeVoiceContext}
        onJobLinkDetected={(url) => {
          console.log('Detected job posting link:', url);
        }}
        onRequestResumeUpload={() => {
          setShowManualMatcher(true);
        }}
      />

      {/* Secondary Section Toggle: Direct PDF Alignment Analyzer */}
      <div className="secondary-section-toggle">
        <button
          type="button"
          className="btn-toggle-secondary"
          onClick={() => setShowManualMatcher(!showManualMatcher)}
          id="toggle-pdf-matcher-btn"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <span>
            {showManualMatcher ? 'Hide Manual PDF Matcher' : 'Or use Direct PDF Upload & Matcher'}
          </span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: showManualMatcher ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>

      {/* Manual PDF Upload Zone */}
      {showManualMatcher && (
        <section className="manual-matcher-panel" aria-label="Manual Document Upload Section">
          <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '0.35rem' }}>
              Direct Document Comparison
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Upload candidate resume and job description PDFs to compute quantitative skill alignment scores.
            </p>
          </div>

          <section className="upload-grid" aria-label="Document Upload Grid">
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

          {/* Action Button */}
          {!isLoading && (
            <div className="actions-row">
              <button
                className="analyze-button"
                onClick={handleAnalyze}
                disabled={!resumeFile || !jdFile}
                id="analyze-match-btn"
              >
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
              </button>
            </div>
          )}

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
                Extracting document text with PyMuPDF and evaluating skill requirements via Groq LLM...
              </p>
            </div>
          )}

          {/* Match Results */}
          {matchResult && (
            <MatchReport
              result={matchResult}
              onStartVoice={() => {
                setActiveVoiceContext(matchResult);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}
        </section>
      )}
    </main>
  );
}
