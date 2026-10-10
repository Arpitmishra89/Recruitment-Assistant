import React, { useState, useEffect, useRef } from 'react';
import { fetchVoiceGreeting, sendVoiceMessage, transcribeVoiceAudio } from '../services/api';

const QUICK_PROMPTS = [
  "I want to apply for a job",
  "How do I learn Next.js?",
  "Analyze my resume against a job",
  "How does automated application filling work?",
  "What projects should I build to stand out?",
];

export default function VoiceHeroAgent({ initialContext = null, onJobLinkDetected = null, onRequestResumeUpload = null }) {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('idle'); // 'idle' | 'initializing' | 'speaking' | 'listening' | 'thinking'
  const [inputText, setInputText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const vadIntervalRef = useRef(null);
  const currentAudioRef = useRef(null);
  const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis || null : null);
  const chatBottomRef = useRef(null);
  const isComponentMounted = useRef(true);

  // Auto-scroll chat stream
  useEffect(() => {
    if (isSessionActive) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, status, isSessionActive]);

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

        // Voice Activity Detection (VAD) via AudioContext
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

  const handleSendMessage = async (textToSend) => {
    if (!textToSend || !textToSend.trim()) return;

    stopSpeaking();
    stopListening();
    setErrorMsg(null);

    const userMsg = { role: 'user', content: textToSend.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputText('');
    setStatus('thinking');

    // Check if user pasted a link to a job posting
    const urlMatch = textToSend.match(/https?:\/\/[^\s]+/i);
    if (urlMatch && onJobLinkDetected) {
      onJobLinkDetected(urlMatch[0]);
    }

    try {
      const result = await sendVoiceMessage(
        initialContext || {},
        textToSend.trim(),
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

  const handleResetSession = () => {
    stopSpeaking();
    stopListening();
    setMessages([]);
    setIsSessionActive(false);
    setStatus('idle');
    setErrorMsg(null);
  };

  const toggleMute = () => {
    if (!isMuted) {
      stopSpeaking();
      setIsMuted(true);
    } else {
      setIsMuted(false);
    }
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

          <div className="mic-click-prompt">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
            <span>Tap the mic to start your voice consultation</span>
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
              <span className="voice-status-pill neural">
                Kokoro Neural Voice
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
                onClick={handleResetSession}
                title="Restart conversation"
              >
                🔄 Reset
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
              </div>
            ))}
            {errorMsg && <div className="voice-error-toast">{errorMsg}</div>}
            <div ref={chatBottomRef} />
          </div>

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
                placeholder="Ask anything or say 'I want to apply for a job'..."
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
          </div>
        </div>
      )}
    </section>
  );
}
