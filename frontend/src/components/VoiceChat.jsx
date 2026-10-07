import React, { useState, useEffect, useRef } from 'react';
import { fetchVoiceGreeting, sendVoiceMessage, transcribeVoiceAudio } from '../services/api';

export default function VoiceChat({ context, onClose }) {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('initializing'); // 'initializing' | 'speaking' | 'listening' | 'thinking' | 'idle'
  const [inputText, setInputText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioStreamRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis || null);
  const chatBottomRef = useRef(null);
  const isComponentMounted = useRef(true);
  const hasFetchedGreetingRef = useRef(false);

  // Auto-scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  // Initialize Greeting and Cleanup
  useEffect(() => {
    isComponentMounted.current = true;

    // Load initial personalized greeting
    if (!hasFetchedGreetingRef.current) {
      loadInitialGreeting();
    }

    return () => {
      isComponentMounted.current = false;
      stopSpeaking();
      stopListening();
    };
  }, []);

  const loadInitialGreeting = async () => {
    if (hasFetchedGreetingRef.current) return;
    hasFetchedGreetingRef.current = true;
    setStatus('thinking');
    setErrorMsg(null);
    try {
      const greeting = await fetchVoiceGreeting(context);
      if (!isComponentMounted.current) return;

      const welcomeMsg = { role: 'assistant', content: greeting };
      setMessages([welcomeMsg]);
      speakText(greeting);
    } catch (err) {
      if (isComponentMounted.current) {
        // Do not display error if greeting message is already present
        if (messages.length === 0) {
          setErrorMsg('Failed to load greeting: ' + err.message);
        }
        setStatus('idle');
      }
    }
  };

  const speakText = (text) => {
    if (!synthRef.current || isMuted) {
      setStatus('idle');
      return;
    }

    synthRef.current.cancel(); // Stop any ongoing speech

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Pick best English voice if available
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
        // Auto-listen after speech completes if unmuted
        if (!isMuted) {
          setTimeout(() => {
            if (isComponentMounted.current) {
              startListening();
            }
          }, 300);
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

  const stopSpeaking = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {}
    }
  };

  const startListening = async () => {
    stopSpeaking();

    // If already recording, stop and transcribe
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      stopListening();
      return;
    }

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
      };

      mediaRecorder.onstop = async () => {
        // Cleanly release hardware mic tracks
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
          // Accidental quick click
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
          console.warn('Transcription error:', err);
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
        setErrorMsg('Microphone access denied. Please allow microphone permissions.');
        setStatus('idle');
      }
    }
  };

  const handleSendMessage = async (textToSend) => {
    const text = textToSend || inputText;
    if (!text || !text.trim()) return;

    stopSpeaking();
    stopListening();

    const userMessage = { role: 'user', content: text.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputText('');
    setStatus('thinking');
    setErrorMsg(null);

    try {
      const reply = await sendVoiceMessage(context, text.trim(), updatedMessages);
      if (!isComponentMounted.current) return;

      const assistantMessage = { role: 'assistant', content: reply };
      setMessages((prev) => [...prev, assistantMessage]);
      speakText(reply);
    } catch (err) {
      if (isComponentMounted.current) {
        setErrorMsg('Error: ' + err.message);
        setStatus('idle');
      }
    }
  };

  const toggleMute = () => {
    if (!isMuted) {
      stopSpeaking();
      stopListening();
    }
    setIsMuted(!isMuted);
  };

  const quickPrompts = [
    'How can I improve my match score?',
    'Give me a mock interview question for this role',
    'How should I explain my missing skills?',
  ];

  return (
    <div className="voice-modal-overlay">
      <div className="voice-modal-card" id="voice-assistant-panel">
        {/* Header */}
        <div className="voice-modal-header">
          <div className="voice-header-info">
            <span className="pulse-dot"></span>
            <div>
              <h2 className="voice-header-title">AI Recruiter & Career Coach</h2>
              <span className="voice-header-sub">
                Target: {context.job_title} • {context.match_score}% Match
              </span>
            </div>
          </div>
          <button className="btn-close-voice" onClick={onClose} title="Close Voice Session">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Visualizer Orb */}
        <div className="voice-visualizer-container">
          <div className={`voice-orb ${status}`}>
            <div className="orb-core">
              {status === 'speaking' && (
                <div className="sound-waves">
                  <span></span><span></span><span></span><span></span>
                </div>
              )}
              {status === 'listening' && (
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
              )}
              {status === 'thinking' && <div className="orb-spinner"></div>}
              {status === 'idle' && (
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
              )}
            </div>
          </div>
          <div className="status-label">
            {status === 'initializing' && 'Connecting with AI Recruiter...'}
            {status === 'speaking' && 'AI Recruiter is speaking aloud...'}
            {status === 'listening' && 'Listening to you... Speak now'}
            {status === 'thinking' && 'Analyzing and formulating response...'}
            {status === 'idle' && 'Click mic to speak or choose a question below'}
          </div>
        </div>

        {/* Live Conversation Stream */}
        <div className="voice-messages-stream">
          {messages.map((msg, index) => (
            <div key={index} className={`voice-bubble ${msg.role}`}>
              <div className="bubble-speaker">
                {msg.role === 'assistant' ? 'AI Recruiter' : 'You'}
              </div>
              <div className="bubble-text">{msg.content}</div>
            </div>
          ))}
          {errorMsg && <div className="voice-error-toast">{errorMsg}</div>}
          <div ref={chatBottomRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="quick-prompts-bar">
          {quickPrompts.map((prompt, idx) => (
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

        {/* Controls & Input */}
        <div className="voice-controls-bar">
          <button
            type="button"
            className={`btn-mic-toggle ${status === 'listening' ? 'active' : ''}`}
            onClick={status === 'listening' ? stopListening : startListening}
            title={status === 'listening' ? 'Stop recording and send to recruiter' : 'Speak with Microphone'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
            <span>{status === 'listening' ? 'Stop & Send' : 'Push to Talk'}</span>
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
              placeholder="Or type a question for the recruiter..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={status === 'thinking'}
            />
            <button
              type="submit"
              className="btn-send-text"
              disabled={!inputText.trim() || status === 'thinking'}
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
    </div>
  );
}
