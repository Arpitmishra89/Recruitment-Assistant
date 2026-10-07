import React from 'react';

export default function MatchReport({ result, onStartVoice }) {
  if (!result) return null;

  const {
    candidate_name,
    job_title,
    company,
    match_score = 0,
    required_skill_score = 0,
    preferred_skill_score = 0,
    matched_skills = [],
    missing_skills = [],
    recommendations = [],
  } = result;

  const getScoreColor = (score) => {
    if (score >= 75) return 'var(--accent-emerald)';
    if (score >= 50) return 'var(--accent-amber)';
    return 'var(--accent-rose)';
  };

  const scoreColor = getScoreColor(match_score);

  return (
    <section className="results-container" id="match-results-section">
      {/* Hero Overview Card */}
      <div className="match-hero-card">
        <div
          className="score-gauge"
          style={{
            '--gauge-pct': match_score,
            '--gauge-color': scoreColor,
          }}
        >
          <div className="score-inner">
            <span className="score-number">{match_score}%</span>
            <span className="score-label">Alignment</span>
          </div>
        </div>

        <div className="match-meta">
          <h2 className="match-meta-title">{job_title || 'Position Match'}</h2>
          <div className="match-meta-details">
            {candidate_name && (
              <span className="meta-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                Candidate: <strong>{candidate_name}</strong>
              </span>
            )}
            {company && (
              <span className="meta-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                </svg>
                Company: <strong>{company}</strong>
              </span>
            )}
          </div>

          <div className="breakdown-row">
            <div className="bar-box">
              <div className="bar-labels">
                <span className="bar-title">Required Skills</span>
                <span className="bar-score">{required_skill_score}%</span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill required"
                  style={{ width: `${Math.min(100, Math.max(0, required_skill_score))}%` }}
                />
              </div>
            </div>

            <div className="bar-box">
              <div className="bar-labels">
                <span className="bar-title">Preferred Skills</span>
                <span className="bar-score">{preferred_skill_score}%</span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill preferred"
                  style={{ width: `${Math.min(100, Math.max(0, preferred_skill_score))}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Glowing Voice Agent CTA Banner */}
      <div className="voice-cta-banner">
        <div className="voice-cta-glow"></div>
        <div className="voice-cta-left">
          <div className="voice-cta-badge">
            <span className="pulse-dot"></span>
            Interactive Voice AI
          </div>
          <h3 className="voice-cta-title">Interact with the AI Recruiter Voice Agent</h3>
          <p className="voice-cta-desc">
            Clear your doubts, discuss skill gaps, or do a live mock interview with the agent in real time.
          </p>
        </div>
        <button
          className="btn-launch-voice"
          onClick={onStartVoice}
          id="launch-voice-agent-btn"
          type="button"
        >
          <span className="voice-btn-orb">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          </span>
          <span>Talk with Voice Agent</span>
        </button>
      </div>

      {/* Skills Comparison */}
      <div className="skills-comparison-grid">
        {/* Matched Skills */}
        <div className="skill-card">
          <div className="skill-card-header">
            <div className="title-group">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>Matched Skills</span>
            </div>
            <span className="badge-count matched">{matched_skills.length}</span>
          </div>

          {matched_skills.length > 0 ? (
            <div className="skill-tags">
              {matched_skills.map((skill, idx) => (
                <span key={idx} className="skill-tag matched">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  {skill}
                </span>
              ))}
            </div>
          ) : (
            <p className="empty-state-text">No matched skills identified.</p>
          )}
        </div>

        {/* Missing Skills */}
        <div className="skill-card">
          <div className="skill-card-header">
            <div className="title-group">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-amber)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span>Missing / Gap Skills</span>
            </div>
            <span className="badge-count missing">{missing_skills.length}</span>
          </div>

          {missing_skills.length > 0 ? (
            <div className="skill-tags">
              {missing_skills.map((skill, idx) => (
                <span key={idx} className="skill-tag missing">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  {skill}
                </span>
              ))}
            </div>
          ) : (
            <p className="empty-state-text">All required and preferred skills matched!</p>
          )}
        </div>
      </div>

      {/* Recommendations */}
      {recommendations && recommendations.length > 0 && (
        <div className="recommendations-card">
          <h3 className="card-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-violet)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4"></path>
              <path d="M12 18v4"></path>
              <path d="M4.93 4.93l2.83 2.83"></path>
              <path d="M16.24 16.24l2.83 2.83"></path>
              <path d="M2 12h4"></path>
              <path d="M18 12h4"></path>
              <path d="M4.93 19.07l2.83-2.83"></path>
              <path d="M16.24 7.76l2.83-2.83"></path>
            </svg>
            Actionable Recommendations
          </h3>
          <div className="rec-list">
            {recommendations.map((rec, idx) => (
              <div key={idx} className="rec-item">
                <span className="rec-bullet">✦</span>
                <span>{rec}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
