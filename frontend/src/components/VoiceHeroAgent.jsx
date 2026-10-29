import React, { useState, useEffect, useRef } from 'react';
import {
  fetchVoiceGreeting,
  sendVoiceMessage,
  transcribeVoiceAudio,
  crawlJobPosting,
  evaluateCrawledMatch,
} from '../services/api';

const QUICK_PROMPTS = [
  "I want to apply for a job",
  "How do I learn Next.js?",
  "Analyze my resume against a job",
  "What projects should I build to stand out?",
  "How does automated application filling work?",
];

export default function VoiceHeroAgent({ initialContext = null, onJobLinkDetected = null, onRequestResumeUpload = null }) {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('idle'); // 'idle' | 'initializing' | 'speaking' | 'listening' | 'thinking'
  const [inputText, setInputText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Phase 2 state
  const [crawledJob, setCrawledJob] = useState(null);
  const [gapResult, setGapResult] = useState(null);
  const [showJobLinkInput, setShowJobLinkInput] = useState(false);
  const [jobUrlInput, setJobUrlInput] = useState('');
  const [showResumeDropzone, setShowResumeDropzone] = useState(false);
  const [isUploadingResume, setIsUploadingResume] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const vadIntervalRef = useRef(null);
  const currentAudioRef = useRef(null);
  const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis || null : null);
  const chatBottomRef = useRef(null);
  const isComponentMounted = useRef(true);
  const fileInputRef = useRef(null);

  // Auto-scroll chat stream
  useEffect(() => {
    if (isSessionActive) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, status, isSessionActive, showJobLinkInput, showResumeDropzone]);

  // Cleanup on unmount
  useEffect(() => {
    isComponentMounted.current = true;
    return () => {
      isComponentMounted.current = false;
      cleanupVAD();
      stopSpeaking();
      stopListening();
    };
  }, []);

  const cleanupVAD = () => {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (err) { }
      audioContextRef.current = null;
    }
  };

  const stopSpeaking = () => {
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current.src = '';
      } catch (err) { }
      currentAudioRef.current = null;
    }
    if (synthRef.current) {
      synthRef.current.cancel();
    }
  };

  const playKokoroAudio = (audioBase64, text) => {
    if (isMuted) {
      setStatus('idle');
      return;
    }

    stopSpeaking();

    try {
      const audioUrl = `data:audio/wav;base64,${audioBase64}`;
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      audio.onplay = () => {
        if (isComponentMounted.current) {
          setStatus('speaking');
        }
      };

      audio.onended = () => {
        if (isComponentMounted.current) {
          currentAudioRef.current = null;
          setStatus('idle');
          if (!isMuted) {
            setTimeout(() => {
              if (isComponentMounted.current) {
                startListening();
              }
            }, 350);
          }
        }
      };

      audio.onerror = (err) => {
        console.warn('Kokoro audio error, falling back to browser speech:', err);
        currentAudioRef.current = null;
        speakWithBrowserSpeech(text);
      };

      audio.play().catch((playErr) => {
        console.warn('Kokoro autoplay prevented, falling back to browser speech:', playErr);
        speakWithBrowserSpeech(text);
      });
    } catch (err) {
      console.warn('Kokoro Audio setup failed:', err);
      speakWithBrowserSpeech(text);
    }
  };

  const speakWithBrowserSpeech = (text) => {
    if (!synthRef.current || isMuted) {
      setStatus('idle');
      return;
    }

    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = synthRef.current.getVoices();
    const naturalVoice = voices.find(
      (v) => (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Jenny')) && v.lang.startsWith('en')
    ) || voices.find((v) => v.lang.startsWith('en'));

    if (naturalVoice) {
      utterance.voice = naturalVoice;
    }

    utterance.onstart = () => {
      if (isComponentMounted.current) {
        setStatus('speaking');
      }
    };

    utterance.onend = () => {
      if (isComponentMounted.current) {
        setStatus('idle');
        if (!isMuted) {
          setTimeout(() => {
            if (isComponentMounted.current) {
              startListening();
            }
          }, 350);
        }
      }
    };

    utterance.onerror = () => {
      if (isComponentMounted.current) {
        setStatus('idle');
      }
    };

    synthRef.current.speak(utterance);
  };

  const speakText = (text, audioBase64 = null) => {
    if (audioBase64) {
      playKokoroAudio(audioBase64, text);
    } else {
      speakWithBrowserSpeech(text);
    }
  };

  const stopListening = () => {
    cleanupVAD();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) { }
    }
  };

  const startListening = async () => {
    stopSpeaking();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      stopListening();
      return;
    }

    cleanupVAD();

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMsg('Microphone access is not supported by your browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg');

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstart = () => {
        if (isComponentMounted.current) {
          setStatus('listening');
        }

        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) {
            const audioCtx = new AudioContextClass();
            audioContextRef.current = audioCtx;
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.1;
            source.connect(analyser);

            const bufferLength = analyser.fftSize;
            const dataArray = new Uint8Array(bufferLength);

            let userHasSpoken = false;
            let silenceStartTime = null;
            const SPEECH_THRESHOLD = 4.5;
            const SILENCE_TIMEOUT_MS = 1000;

            vadIntervalRef.current = setInterval(() => {
              if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
                cleanupVAD();
                return;
              }

              analyser.getByteTimeDomainData(dataArray);
              let deviationSum = 0;
              for (let i = 0; i < bufferLength; i++) {
                deviationSum += Math.abs(dataArray[i] - 128);
              }
              const currentAmplitude = deviationSum / bufferLength;

              if (currentAmplitude > SPEECH_THRESHOLD) {
                userHasSpoken = true;
                silenceStartTime = null;
              } else if (userHasSpoken) {
                if (silenceStartTime === null) {
                  silenceStartTime = Date.now();
                } else if (Date.now() - silenceStartTime >= SILENCE_TIMEOUT_MS) {
                  cleanupVAD();
                  stopListening();
                }
              }
            }, 60);
          }
        } catch (vadErr) {
          console.warn('VAD AudioContext warning:', vadErr);
        }
      };

      mediaRecorder.onstop = async () => {
        cleanupVAD();
        stream.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
        mediaRecorderRef.current = null;

        if (!isComponentMounted.current) return;

        const chunks = audioChunksRef.current;
        if (!chunks || chunks.length === 0) {
          setStatus('idle');
          return;
        }

        const audioBlob = new Blob(chunks, { type: mimeType });
        if (audioBlob.size < 800) {
          setStatus('idle');
          return;
        }

        setStatus('thinking');
        try {
          const transcript = await transcribeVoiceAudio(audioBlob);
          if (!isComponentMounted.current) return;

          if (transcript && transcript.trim()) {
            handleSendMessage(transcript.trim());
          } else {
            setStatus('idle');
          }
        } catch (err) {
          console.warn('Voice transcription error:', err);
          if (isComponentMounted.current) {
            setErrorMsg('Transcription note: ' + err.message);
            setStatus('idle');
          }
        }
      };

      mediaRecorder.start();
    } catch (err) {
      console.warn('Microphone capture error:', err);
      if (isComponentMounted.current) {
        setErrorMsg('Microphone access denied or unavailable: ' + err.message);
        setStatus('idle');
      }
    }
  };

  const handleActivateVoiceSession = async () => {
    setIsSessionActive(true);
    setStatus('thinking');
    setErrorMsg(null);

    try {
      const result = await fetchVoiceGreeting(initialContext || {});
      if (!isComponentMounted.current) return;

      const greetingText = typeof result === 'string' ? result : (result.reply || '');
      const audioBase64 = typeof result === 'object' ? result.audio_base64 : null;

      const welcomeMsg = { role: 'assistant', content: greetingText };
      setMessages([welcomeMsg]);
      speakText(greetingText, audioBase64);
    } catch (err) {
      console.warn('Voice greeting error, falling back to default:', err);
      if (isComponentMounted.current) {
        const fallbackText = "Hello! I am your AI career assistant. I'm here to clear all your job-related doubts, analyze your resume against job requirements, and help you fill out job applications automatically. Feel free to ask me anything!";
        setMessages([{ role: 'assistant', content: fallbackText }]);
        speakText(fallbackText, null);
      }
    }
  };

  // Phase 2: Execute Job Crawl
  const executeCrawlJob = async (url) => {
    if (!url || !url.trim()) return;

    stopSpeaking();
    stopListening();
    setErrorMsg(null);

    const userUrlMsg = { role: 'user', content: `Please scan this job posting: ${url.trim()}` };
    const updatedMessages = [...messages, userUrlMsg];
    setMessages(updatedMessages);
    setShowJobLinkInput(false);
    setJobUrlInput('');
    setStatus('thinking');

    try {
      const jobData = await crawlJobPosting(url.trim());
      if (!isComponentMounted.current) return;

      setCrawledJob(jobData);
      setShowResumeDropzone(true);

      const jobMsg = {
        role: 'assistant',
        content: jobData.verbal_summary,
        type: 'crawled_job',
        jobData: jobData,
      };

      setMessages([...updatedMessages, jobMsg]);
      speakText(jobData.verbal_summary, jobData.audio_base64);
    } catch (err) {
      if (isComponentMounted.current) {
        setErrorMsg('Unable to crawl job posting: ' + err.message);
        const errorReply = {
          role: 'assistant',
          content: `I could not scan that link (${err.message}). Could you share another link or use the sample role button?`
        };
        setMessages([...updatedMessages, errorReply]);
        setStatus('idle');
      }
    }
  };

  // Phase 2: Execute Resume Alignment Evaluation
  const executeResumeEvaluation = async (file) => {
    if (!file || !crawledJob) return;

    stopSpeaking();
    stopListening();
    setErrorMsg(null);
    setIsUploadingResume(true);

    const userUploadMsg = { role: 'user', content: `Uploaded candidate resume: ${file.name}` };
    const updatedMessages = [...messages, userUploadMsg];
    setMessages(updatedMessages);
    setShowResumeDropzone(false);
    setStatus('thinking');

    try {
      const matchData = await evaluateCrawledMatch(file, crawledJob);
      if (!isComponentMounted.current) return;

      setGapResult(matchData);
      setIsUploadingResume(false);

      const gapMsg = {
        role: 'assistant',
        content: matchData.verbal_summary,
        type: 'gap_analysis',
        gapData: matchData,
      };

      setMessages([...updatedMessages, gapMsg]);
      speakText(matchData.verbal_summary, matchData.audio_base64);
    } catch (err) {
      if (isComponentMounted.current) {
        setIsUploadingResume(false);
        setErrorMsg('Failed to analyze resume alignment: ' + err.message);
        setStatus('idle');
      }
    }
  };

  const handleUseSampleResume = async () => {
    try {
      setIsUploadingResume(true);
      const res = await fetch('/sample_documents/sample_resume.pdf');
      if (!res.ok) throw new Error('Sample resume file not found in public folder.');
      const blob = await res.blob();
      const sampleFile = new File([blob], 'sample_resume.pdf', { type: 'application/pdf' });
      await executeResumeEvaluation(sampleFile);
    } catch (err) {
      setErrorMsg('Could not load sample resume: ' + err.message);
      setIsUploadingResume(false);
    }
  };

  const handleSendMessage = async (textToSend) => {
    if (!textToSend || !textToSend.trim()) return;

    stopSpeaking();
    stopListening();
    setErrorMsg(null);

    const trimmed = textToSend.trim();

    // Check if user provided a URL
    const urlMatch = trimmed.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      await executeCrawlJob(urlMatch[0]);
      return;
    }

    // Check if user expresses intent to apply or share a job link
    const lower = trimmed.toLowerCase();
    if (lower.includes('apply for a job') || lower.includes('apply to a job') || lower.includes('job link') || lower.includes('job posting')) {
      setShowJobLinkInput(true);
      const userMsg = { role: 'user', content: trimmed };
      const assistantPromptMsg = {
        role: 'assistant',
        content: "Great! Please paste the link to the job posting below, and I'll crawl the page to extract all roles and responsibilities for you."
      };
      setMessages([...messages, userMsg, assistantPromptMsg]);
      setInputText('');
      speakText(assistantPromptMsg.content, null);
      return;
    }

    const userMsg = { role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputText('');
    setStatus('thinking');

    // Context including crawled job and gap results if available
    const activeContext = {
      ...(initialContext || {}),
      ...(crawledJob ? { job_title: crawledJob.job_title, company: crawledJob.company } : {}),
      ...(gapResult ? {
        match_score: gapResult.match_score,
        matched_skills: gapResult.matched_skills,
        missing_skills: gapResult.missing_skills
      } : {})
    };

    try {
      const result = await sendVoiceMessage(
        activeContext,
        trimmed,
        updatedMessages
      );

      if (!isComponentMounted.current) return;

      const replyText = typeof result === 'string' ? result : (result.reply || '');
      const audioBase64 = typeof result === 'object' ? result.audio_base64 : null;

      const assistantMsg = { role: 'assistant', content: replyText };
      setMessages([...updatedMessages, assistantMsg]);
      speakText(replyText, audioBase64);
    } catch (err) {
      if (isComponentMounted.current) {
        setErrorMsg('Could not process voice query: ' + err.message);
        setStatus('idle');
      }
    }
  };

  const handleEndSession = () => {
    stopSpeaking();
    stopListening();
    cleanupVAD();
    setMessages([]);
    setIsSessionActive(false);
    setStatus('idle');
    setErrorMsg(null);
    setCrawledJob(null);
    setGapResult(null);
    setShowJobLinkInput(false);
    setShowResumeDropzone(false);
  };

  const handleRestartSession = () => {
    stopSpeaking();
    stopListening();
    cleanupVAD();
    setMessages([]);
    setCrawledJob(null);
    setGapResult(null);
    setShowJobLinkInput(false);
    setShowResumeDropzone(false);
    handleActivateVoiceSession();
  };

  const toggleMute = () => {
    if (!isMuted) {
      stopSpeaking();
      setIsMuted(true);
    } else {
      setIsMuted(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 75) return '#10b981';
    if (score >= 50) return '#f59e0b';
    return '#f43f5e';
  };

  return (
    <section className="hero-voice-section" aria-label="AI Voice Career Assistant Hero">
      {/* Brand Tag */}
      <div className="brand-badge">
        <span className="pulse-dot"></span>
        Autonomous AI Career & Recruitment Assistant
      </div>

      {/* Main Hero Title */}
      <h1 className="hero-main-title">
        Clear all your <span className="gradient-text">job related doubts</span> here
      </h1>

      <p className="hero-main-subtitle">
        Your voice-first career companion to clarify technical questions, evaluate your resume against job requirements, and automate online job applications hands-free.
      </p>

      {/* State 1: Hero Landing with Pulsating Mic (When not active) */}
      {!isSessionActive && (
        <div className="hero-landing-mic-box">
          <div
            className="pulsating-mic-wrapper"
            onClick={handleActivateVoiceSession}
            role="button"
            tabIndex={0}
            aria-label="Click microphone to start voice conversation"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleActivateVoiceSession();
              }
            }}
          >
            <div className="pulse-ring ring-1"></div>
            <div className="pulse-ring ring-2"></div>
            <div className="pulse-ring ring-3"></div>
            <button
              className="pulsating-mic-btn"
              id="hero-pulsating-mic-btn"
              title="Click to talk with your AI career assistant"
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            </button>
          </div>

          <div className="hero-features-row">
            <div className="hero-feature-chip">
              <span>🎙️</span> Natural Voice Dialogue
            </div>
            <div className="hero-feature-chip">
              <span>📄</span> Resume & Requirements Alignment
            </div>
            <div className="hero-feature-chip">
              <span>⚡</span> Automated Application Form Filling
            </div>
            <div className="hero-feature-chip">
              <span>💡</span> Interview Prep & Tech Roadmaps
            </div>
          </div>
        </div>
      )}

      {/* State 2: Active Voice & Chat Console (When active) */}
      {isSessionActive && (
        <div className="active-voice-console" id="voice-agent-active-console">
          {/* Header Bar */}
          <div className="active-voice-header">
            <div className="active-voice-header-left">
              <span className="voice-status-pill live">
                <span className="pulse-dot"></span> Live Voice Session
              </span>
            </div>
            <div className="active-voice-header-actions">
              <button
                type="button"
                className={`btn-session-action ${isMuted ? 'danger' : ''}`}
                onClick={toggleMute}
                title={isMuted ? 'Unmute voice audio' : 'Mute voice audio'}
              >
                {isMuted ? '🔇 Muted' : '🔊 Audio On'}
              </button>
              <button
                type="button"
                className="btn-session-action"
                onClick={handleRestartSession}
                title="Restart conversation"
              >
                🔄 Restart
              </button>
              <button
                type="button"
                className="btn-session-action btn-end-session"
                onClick={handleEndSession}
                title="End Voice Agent session and return to home"
                id="end-voice-session-btn"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.86 19.86 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path>
                  <line x1="23" y1="1" x2="1" y2="23"></line>
                </svg>
                <span>End Voice Agent</span>
              </button>
            </div>
          </div>

          {/* Visualizer Orb & Dynamic Status */}
          <div className="voice-visualizer-container">
            <div className={`voice-orb ${status}`}>
              <div className="orb-core">
                {status === 'speaking' && (
                  <div className="sound-waves">
                    <span></span><span></span><span></span><span></span>
                  </div>
                )}
                {status === 'listening' && (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  </svg>
                )}
                {status === 'thinking' && <div className="orb-spinner"></div>}
                {status === 'idle' && (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                  </svg>
                )}
              </div>
            </div>

            <div className="status-label">
              {status === 'initializing' && 'Connecting with AI Assistant...'}
              {status === 'speaking' && 'AI Assistant is speaking aloud...'}
              {status === 'listening' && 'Listening to you... (Speak naturally, auto-sends on pause)'}
              {status === 'thinking' && 'Analyzing and formulating response...'}
              {status === 'idle' && 'Click Push to Talk or choose a question below'}
            </div>
          </div>

          {/* Live Conversation Stream */}
          <div className="voice-messages-stream" aria-live="polite">
            {messages.map((msg, index) => (
              <div key={index} className={`voice-bubble ${msg.role}`}>
                <div className="bubble-speaker">
                  {msg.role === 'assistant' ? 'AI Career Agent' : 'You'}
                </div>
                <div className="bubble-text">{msg.content}</div>

                {/* Crawled Job Card Attachment */}
                {msg.type === 'crawled_job' && msg.jobData && (
                  <div className="crawled-job-card">
                    <div className="crawled-job-header">
                      <div>
                        <div className="crawled-job-title">{msg.jobData.job_title}</div>
                        <div className="crawled-job-company">🏢 {msg.jobData.company || 'Company'}</div>
                      </div>
                      <span className="badge-crawled-live">Scanned Live</span>
                    </div>

                    {msg.jobData.required_skills?.length > 0 && (
                      <div>
                        <div className="crawled-section-label">Required Skills</div>
                        <div className="crawled-skills-row">
                          {msg.jobData.required_skills.map((skill, i) => (
                            <span key={i} className="crawled-skill-tag required">✓ {skill}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {msg.jobData.preferred_skills?.length > 0 && (
                      <div>
                        <div className="crawled-section-label">Preferred Skills</div>
                        <div className="crawled-skills-row">
                          {msg.jobData.preferred_skills.map((skill, i) => (
                            <span key={i} className="crawled-skill-tag preferred">+ {skill}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {msg.jobData.responsibilities?.length > 0 && (
                      <div>
                        <div className="crawled-section-label">Key Responsibilities</div>
                        <ul style={{ paddingLeft: '1.2rem', fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                          {msg.jobData.responsibilities.slice(0, 3).map((resp, i) => (
                            <li key={i} style={{ marginBottom: '0.2rem' }}>{resp}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Gap Analysis Scorecard Attachment */}
                {msg.type === 'gap_analysis' && msg.gapData && (
                  <div className="chat-gap-scorecard">
                    <div className="gap-score-header">
                      <div
                        className="gap-score-circle"
                        style={{
                          borderColor: getScoreColor(msg.gapData.match_score),
                          color: getScoreColor(msg.gapData.match_score)
                        }}
                      >
                        {msg.gapData.match_score}%
                      </div>
                      <div className="gap-score-meta">
                        <h3>Candidate Alignment for {msg.gapData.job_title}</h3>
                        <p>Evaluated against live extracted job requirements</p>
                      </div>
                    </div>

                    <div className="gap-skills-columns">
                      {/* Matched Skills */}
                      <div className="gap-column matched">
                        <div className="gap-column-title">
                          <span>✓</span> Matched Skills ({msg.gapData.matched_skills?.length || 0})
                        </div>
                        <div className="gap-tags-list">
                          {msg.gapData.matched_skills?.map((s, i) => (
                            <span key={i} className="gap-tag matched">{s}</span>
                          ))}
                          {(!msg.gapData.matched_skills || msg.gapData.matched_skills.length === 0) && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>None detected</span>
                          )}
                        </div>
                      </div>

                      {/* Missing Skills */}
                      <div className="gap-column missing">
                        <div className="gap-column-title">
                          <span>⚠️</span> Missing Skills ({msg.gapData.missing_skills?.length || 0})
                        </div>
                        <div className="gap-tags-list">
                          {msg.gapData.missing_skills?.map((s, i) => (
                            <span key={i} className="gap-tag missing">✗ {s}</span>
                          ))}
                          {(!msg.gapData.missing_skills || msg.gapData.missing_skills.length === 0) && (
                            <span style={{ fontSize: '0.75rem', color: '#34d399' }}>No major skill gaps!</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {msg.gapData.recommendations?.length > 0 && (
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.65rem' }}>
                        <div className="crawled-section-label">Next Actionable Steps</div>
                        <ul style={{ paddingLeft: '1.2rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {msg.gapData.recommendations.map((rec, i) => (
                            <li key={i} style={{ marginBottom: '0.2rem' }}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Inline Resume Upload Dropzone when agent asks for resume */}
            {showResumeDropzone && (
              <div className="inline-resume-box">
                <input
                  type="file"
                  accept=".pdf"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      executeResumeEvaluation(e.target.files[0]);
                    }
                  }}
                />
                <div className="inline-resume-title">📄 Upload Your Resume to Compare</div>
                <p className="inline-resume-desc">
                  Upload your candidate resume PDF to evaluate alignment against <strong>{crawledJob?.job_title || 'this role'}</strong> and hear what skills you're missing.
                </p>
                <div className="inline-resume-actions">
                  <button
                    type="button"
                    className="btn-upload-resume"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingResume}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="17 8 12 3 7 8"></polyline>
                      <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    <span>{isUploadingResume ? 'Analyzing Resume...' : 'Select Resume PDF'}</span>
                  </button>

                  <button
                    type="button"
                    className="btn-use-sample-resume"
                    onClick={handleUseSampleResume}
                    disabled={isUploadingResume}
                  >
                    Use Sample Resume
                  </button>
                </div>
              </div>
            )}

            {errorMsg && <div className="voice-error-toast">{errorMsg}</div>}
            <div ref={chatBottomRef} />
          </div>

          {/* Interactive Job URL Input Bar (When active) */}
          {showJobLinkInput && (
            <div className="job-link-input-bar">
              <form
                className="job-link-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  executeCrawlJob(jobUrlInput);
                }}
              >
                <input
                  type="url"
                  className="job-url-input"
                  placeholder="Paste job posting link (e.g. https://careers.example.com/job/123)..."
                  value={jobUrlInput}
                  onChange={(e) => setJobUrlInput(e.target.value)}
                  disabled={status === 'thinking'}
                  autoFocus
                />
                <button
                  type="submit"
                  className="btn-crawl-submit"
                  disabled={!jobUrlInput.trim() || status === 'thinking'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  <span>Scan Job</span>
                </button>
              </form>

              <div className="sample-link-chips">
                <span>Or test demo role:</span>
                <button
                  type="button"
                  className="btn-sample-chip"
                  onClick={() => {
                    executeCrawlJob("https://careers.google.com/jobs/results/sample-frontend-engineer");
                  }}
                >
                  Frontend Engineer Demo Link
                </button>
              </div>
            </div>
          )}

          {/* Quick Suggestion Chips */}
          <div className="quick-prompts-bar">
            {QUICK_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                className="btn-quick-prompt"
                onClick={() => handleSendMessage(prompt)}
                disabled={status === 'speaking' || status === 'thinking'}
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Bottom Controls Bar */}
          <div className="voice-controls-bar">
            <button
              type="button"
              className={`btn-mic-toggle ${status === 'listening' ? 'active' : ''}`}
              onClick={status === 'listening' ? stopListening : startListening}
              title={status === 'listening' ? 'Stop recording and send' : 'Speak with Microphone'}
              id="voice-active-mic-btn"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
              <span>{status === 'listening' ? 'Listening...' : 'Push to Talk'}</span>
            </button>

            <form
              className="voice-input-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage(inputText);
              }}
            >
              <input
                type="text"
                className="voice-text-input"
                placeholder="Ask anything or paste job link / ask how to learn..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={status === 'thinking'}
                id="voice-text-input"
              />
              <button
                type="submit"
                className="btn-send-text"
                disabled={!inputText.trim() || status === 'thinking'}
                aria-label="Send message"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </form>

            <button
              type="button"
              className={`btn-mute-toggle ${isMuted ? 'muted' : ''}`}
              onClick={toggleMute}
              title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            >
              {isMuted ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
              )}
            </button>

            <button
              type="button"
              className="btn-bottom-end"
              onClick={handleEndSession}
              title="End Voice Agent session"
              id="bottom-end-session-btn"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.86 19.86 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path>
                <line x1="23" y1="1" x2="1" y2="23"></line>
              </svg>
              <span>End Agent</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
