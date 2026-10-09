import React, { useState, useEffect, useRef, Component } from "react";
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Terminal, AlertTriangle } from 'lucide-react';
import ChatBox from './Chatbox';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Contrib ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 24,
          background: '#050f05',
          border: '1px solid #f87171',
          color: '#f87171',
          fontFamily: "'JetBrains Mono', monospace",
          margin: 20,
          borderRadius: 4,
          maxWidth: 600,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 8, fontSize: 13 }}>
            <AlertTriangle size={16} color="#f87171" />
            <span>[RUNTIME ERROR DETECTED]</span>
          </div>
          <div style={{ fontSize: 11, color: '#fca5a5', marginBottom: 16, lineHeight: 1.5 }}>
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </div>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              if (this.props.onReset) this.props.onReset();
            }}
            style={{
              background: 'rgba(200, 60, 60, 0.2)',
              border: '1px solid #f87171',
              color: '#f87171',
              padding: '6px 14px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              cursor: 'pointer',
              borderRadius: 2,
            }}
          >
            [RECOVER / RETURN TO LANDING]
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Import JetBrains Mono from Google Fonts via a style tag
const fontLink = document.createElement('link');
fontLink.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Share+Tech+Mono&display=swap';
fontLink.rel = 'stylesheet';
document.head.appendChild(fontLink);

const globalStyles = `
  :root {
    --green: #00ff41;
    --green-dim: #00cc33;
    --green-muted: #00882288;
    --green-bg: #00ff4108;
    --black: #000000;
    --surface: #050f05;
    --surface-2: #0a1a0a;
    --border: #00ff4122;
    --border-active: #00ff4166;
    --text-primary: #00ff41;
    --text-secondary: #00bb2f;
    --text-muted: #006618;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--black);
    color: var(--green);
    font-family: 'JetBrains Mono', 'Share Tech Mono', monospace;
    overflow: hidden;
  }

  /* Scanline overlay */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0, 255, 65, 0.015) 2px,
      rgba(0, 255, 65, 0.015) 4px
    );
    pointer-events: none;
    z-index: 9999;
  }

  /* CRT vignette */
  body::after {
    content: '';
    position: fixed;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 75%, rgba(0,0,0,0.4) 100%);
    pointer-events: none;
    z-index: 9998;
  }

  /* Custom scrollbar - glued to rightmost edge */
  .chat-scroll {
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--green-dim) transparent;
    /* Extend scroll area to screen edge */
    margin-right: -24px;
    padding-right: 24px;
  }

  .chat-scroll::-webkit-scrollbar {
    width: 3px;
  }
  .chat-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .chat-scroll::-webkit-scrollbar-thumb {
    background: var(--green-dim);
    border-radius: 0;
    box-shadow: 0 0 6px var(--green);
  }

  .terminal-input {
    background: transparent;
    border: none;
    outline: none;
    color: var(--green);
    font-family: 'JetBrains Mono', monospace;
    caret-color: var(--green);
    resize: none;
    width: 100%;
  }

  .terminal-input::placeholder {
    color: var(--text-muted);
  }

  .glow-text {
    text-shadow: 0 0 10px var(--green), 0 0 20px var(--green-dim);
  }

  .glow-border {
    box-shadow: 0 0 0 1px var(--border-active), 0 0 15px var(--green-muted);
  }

  .glow-border-subtle {
    box-shadow: 0 0 0 1px var(--border), inset 0 0 20px rgba(0,255,65,0.02);
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  @keyframes flicker {
    0%, 100% { opacity: 1; }
    92% { opacity: 1; }
    93% { opacity: 0.8; }
    94% { opacity: 1; }
    96% { opacity: 0.9; }
    97% { opacity: 1; }
  }

  @keyframes matrixRain {
    0% { transform: translateY(-100%); opacity: 1; }
    100% { transform: translateY(100vh); opacity: 0; }
  }

  .cursor-blink::after {
    content: '█';
    animation: blink 1s step-end infinite;
    color: var(--green);
  }

  .boot-text {
    animation: flicker 8s infinite;
  }

  .scanline-fast {
    position: absolute;
    inset: 0;
    background: linear-gradient(transparent 50%, rgba(0,255,65,0.01) 50%);
    background-size: 100% 4px;
    pointer-events: none;
    border-radius: inherit;
  }

  /* Typing animation for assistant messages */
  @keyframes typeIn {
    from { width: 0; }
    to { width: 100%; }
  }
    .glitch-wrapper {
    position: relative;
    display: inline-block;
  }
  
  .glitch-wrapper {
    position: relative;
    display: inline-block;
    animation: cyber-glitch 4s infinite;
  }

  /* RGB split and skew that flashes every 4 seconds */
  @keyframes cyber-glitch {
    0%, 94%, 100% { transform: none; text-shadow: 0 0 20px var(--green-dim); }
    95% { transform: skewX(-15deg); text-shadow: -4px 0 #ff00ff, 4px 0 #00ffff; }
    97% { transform: skewX(15deg); text-shadow: 4px 0 #ff00ff, -4px 0 #00ffff; }
    99% { transform: none; text-shadow: -2px 2px #ff00ff, 2px -2px #00ffff; }
  }

  /* Highlight.js Terminal Matrix Theme */
  .hljs-keyword, .hljs-selector-tag, .hljs-subst { color: #5eead4; font-weight: 600; }
  .hljs-string, .hljs-regexp { color: #a7f3d0; }
  .hljs-number, .hljs-literal { color: #facc15; }
  .hljs-title, .hljs-title.function_, .hljs-section { color: #38bdf8; font-weight: 600; }
  .hljs-comment, .hljs-quote { color: #00882288; font-style: italic; }
  .hljs-variable, .hljs-attr, .hljs-template-variable { color: #34d399; }
  .hljs-property { color: #86efac; }
  .hljs-params { color: #cbd5e1; }
  .hljs-type, .hljs-class .hljs-title { color: #67e8f9; }
  .hljs-built_in, .hljs-symbol { color: #4ade80; }
  .hljs-meta { color: #f472b6; }
  .hljs-deletion { color: #f87171; }
  .hljs-addition { color: #4ade80; }
  .hljs-emphasis { font-style: italic; }
  .hljs-strong { font-weight: bold; }
`;

const StyleTag = () => (
  <style dangerouslySetInnerHTML={{ __html: globalStyles }} />
);

// Matrix rain background component
function MatrixBg() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const fontSize = 13;
    const cols = Math.floor(canvas.width / fontSize);
    const drops = Array(cols).fill(1);
    const chars = '01アイウエオカキクケコABCDEF{}[]<>/\\|=+-*&^%$#@!?'.split('');

    let animId;
    const draw = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fontSize}px JetBrains Mono, monospace`;

      drops.forEach((y, i) => {
        const char = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize;
        // Leading char is bright
        ctx.fillStyle = `rgba(0, 255, 65, ${Math.random() > 0.98 ? 1 : 0.15})`;
        ctx.fillText(char, x, y * fontSize);

        if (y * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      });
      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animId);
  }, []);

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, opacity: 0.35, zIndex: 0, pointerEvents: 'none' }} />;
}

function GlitchText({ text, className = '' }) {
  return (
    <span className={`glitch-wrapper ${className}`}>
      {text}
    </span>
  );
}

function BootSequence({ onDone }) {
  const lines = [
    '> INITIALIZING CONTRIB MENTOR v2.4.1',
    '> LOADING NEURAL CODEBASE ENGINE...',
    '> CONNECTING TO GITHUB API...',
    '> READY.',
  ];
  const [shown, setShown] = useState([]);

  useEffect(() => {
    lines.forEach((line, i) => {
      setTimeout(() => {
        setShown(prev => [...prev, line]);
        if (i === lines.length - 1) setTimeout(onDone, 600);
      }, i * 400);
    });
  }, []);

  return (
    <div style={{ fontFamily: 'JetBrains Mono', color: 'var(--green)', padding: '8px 0', fontSize: 12 }}>
      {shown.map((l, i) => (
        <div key={i} style={{ marginBottom: 4, opacity: 0.7 }}>{l}</div>
      ))}
    </div>
  );
}

export default function App() {
  const [appState, setAppState] = useState('landing');
  const [repoUrl, setRepoUrl] = useState('');
  const [repoName, setRepoName] = useState('');
  const [booted, setBooted] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');

  const handleLoadRepo = async (e) => {
    e.preventDefault();
    if (!repoUrl) return;
    
    setAppState('loading');
    setLoadingStatus('connecting...'); 

    try {
      const baseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/api/load-repo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ repo_url: repoUrl }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Server error');
      }

      // FIX: Check if the backend returned a standard JSON object (Cached Repo)
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        setLoadingStatus(data.status);
        if (data.status === 'cached' || data.status === 'done' || data.status === 'loaded' || data.status === 'ready') {
          const raw = data.repo_name || data.result?.repo_name || '';
          const clean = (!raw || raw.includes('tmp') || raw.includes('cloned_repo') || raw.includes('var/folders'))
            ? (repoUrl.replace(/\/+$/, '').replace(/\.git$/, '').split('/').pop() || 'Repository')
            : raw;
          setRepoName(clean);
          setTimeout(() => setAppState('chat'), 600);
        } else {
          alert('Failed to load repo: ' + (data.detail || 'Unknown error'));
          setAppState('landing');
        }
        return; // Exit early since it's not a stream
      }

      // OTHERWISE: Handle the NDJSON stream (New Repo Indexing)
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
      
        buffer = lines.pop(); // Keep the last incomplete chunk

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line);
            setLoadingStatus(data.status); 

            if (data.status === 'cached' || data.status === 'done' || data.status === 'loaded' || data.status === 'ready') {
              const raw = data.repo_name || data.result?.repo_name || '';
              const clean = (!raw || raw.includes('tmp') || raw.includes('cloned_repo') || raw.includes('var/folders'))
                ? (repoUrl.replace(/\/+$/, '').replace(/\.git$/, '').split('/').pop() || 'Repository')
                : raw;
              setRepoName(clean);
              setTimeout(() => setAppState('chat'), 600);
              return; 
            } else if (data.status === 'error') {
              alert('Failed to load repo: ' + data.detail);
              setAppState('landing');
              return;
            }
          } catch (err) {
            console.warn("Failed to parse stream chunk", line);
          }
        }
      }
    } catch (error) {
      console.error(error);
      alert('Connection error: ' + error.message);
      setAppState('landing');
    }
  };

  return (
    <>
      <StyleTag />
      <MatrixBg />
      <div style={{
        minHeight: '100vh',
        background: 'var(--surface)',
        color: 'var(--green)',
        fontFamily: "'JetBrains Mono', monospace",
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        zIndex: 1,
        overflow: 'hidden',
      }}>
        <AnimatePresence mode="wait">

          {/* VIEW 1: LANDING */}
          {appState === 'landing' && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              style={{ width: '100%', maxWidth: 520, padding: '0 24px', position: 'relative', zIndex: 2 }}
            >
              {/* Terminal window frame */}
              <div style={{
                border: '1px solid var(--border-active)',
                borderRadius: 4,
                background: 'rgba(0,10,0,0.95)',
                boxShadow: '0 0 40px rgba(0,255,65,0.1), 0 0 80px rgba(0,255,65,0.05)',
                overflow: 'hidden',
              }}>
                {/* Terminal title bar */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--border)',
                  background: 'rgba(0,255,65,0.03)',
                }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57', boxShadow: '0 0 6px #ff5f57' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e', boxShadow: '0 0 6px #febc2e' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840', boxShadow: '0 0 6px #28c840' }} />
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 2 }}>
                   <h1 style={{
                          fontSize: 26,
                          fontWeight: 700,
                          letterSpacing: -0.5,
                          color: 'var(--green)',
                          textShadow: '0 0 20px var(--green-dim)',
                          lineHeight: 1.2,
                          marginBottom: 8,
                        }}>
                          <GlitchText text="CONTRIB_MENTOR" /><span style={{ color: 'var(--text-muted)' }}></span>
                    </h1>
                  </span>
                </div>

                <div style={{ padding: '28px 28px 32px' }}>
                  {!booted ? (
                    <BootSequence onDone={() => setBooted(true)} />
                  ) : (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
                      {/* Header */}
                      <div style={{ marginBottom: 28 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <Terminal size={18} color="var(--green)" />
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 3 }}>
                            SYSTEM READY
                          </span>
                        </div>
                        <h1 style={{
                          fontSize: 26,
                          fontWeight: 700,
                          letterSpacing: -0.5,
                          color: 'var(--green)',
                          textShadow: '0 0 20px var(--green-dim)',
                          lineHeight: 1.2,
                          marginBottom: 8,
                        }}>
                          CONTRIB<span style={{ color: 'var(--text-muted)' }}>_</span>MENTOR
                        </h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6, letterSpacing: 0.5 }}>
                          // Paste a GitHub repository URL to begin codebase ingestion.
                        </p>
                      </div>

                      {/* Input */}
                      <form onSubmit={handleLoadRepo}>
                        <div style={{ marginBottom: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                          $ repo_url=
                        </div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          border: '1px solid var(--border-active)',
                          borderRadius: 3,
                          background: 'rgba(0,255,65,0.04)',
                          padding: '12px 14px',
                          gap: 10,
                          transition: 'box-shadow 0.2s',
                        }}
                          onFocus={() => { }}
                        >
                          <span style={{ color: 'var(--green-dim)', fontSize: 13 }}>▶</span>
                          <input
                            type="url"
                            placeholder="https://github.com/owner/repo"
                            value={repoUrl}
                            onChange={(e) => setRepoUrl(e.target.value)}
                            required
                            style={{
                              flex: 1,
                              background: 'transparent',
                              border: 'none',
                              outline: 'none',
                              color: 'var(--green)',
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: 13,
                              caretColor: 'var(--green)',
                            }}
                          />
                          <button
                            type="submit"
                            style={{
                              background: 'var(--green)',
                              border: 'none',
                              borderRadius: 2,
                              width: 32,
                              height: 32,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              flexShrink: 0,
                              boxShadow: '0 0 12px var(--green)',
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 20px var(--green)'}
                            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 0 12px var(--green)'}
                          >
                            <ArrowRight size={16} color="#000" strokeWidth={3} />
                          </button>
                        </div>
                      </form>

                      <div style={{ marginTop: 20, fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1 }}>
                        {'>'} SUPPORTED: public github repositories only
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* VIEW 2: LOADING */}
          {appState === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, zIndex: 2 }}
            >
              <div style={{ position: 'relative' }}>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                  style={{
                    width: 56, height: 56,
                    border: '2px solid var(--border)',
                    borderTop: '2px solid var(--green)',
                    borderRadius: '50%',
                    boxShadow: '0 0 20px var(--green-muted)',
                  }}
                />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--green)', letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase' }}>
                  {loadingStatus === 'cloning' ? 'CLONING REPOSITORY' :
                   loadingStatus === 'cached' ? 'LOADING FROM CACHE' :
                   loadingStatus === 'done' ? 'INDEXING COMPLETE' :
                   'INDEXING CODEBASE'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1 }}>
                  status: {loadingStatus}... please wait
                </div>
              </div>
              {/* Progress bar */}
              <div style={{ width: 200, height: 2, background: 'var(--border)', borderRadius: 2 }}>
                <motion.div
                  animate={{ 
                    width: 
                      loadingStatus === 'connecting...' ? '15%' :
                      loadingStatus === 'cloning' ? '40%' :
                      (loadingStatus === 'done' || loadingStatus === 'cached' || loadingStatus === 'loaded') ? '100%' : '75%'
                  }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  style={{ height: '100%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)', borderRadius: 2 }}
                />
              </div>
            </motion.div>
          )}

          {/* VIEW 3: CHAT */}
          {appState === 'chat' && (
            <ErrorBoundary
              onReset={() => {
                setAppState('landing');
                setRepoUrl('');
                setRepoName('');
                setLoadingStatus('');
              }}
            >
              <ChatBox
                key="chat"
                repoUrl={repoUrl}
                repoName={repoName}
                onReset={() => { 
                  setAppState('landing');
                  setRepoUrl('');
                  setRepoName('');
                  setLoadingStatus('');
                }}
              />
            </ErrorBoundary>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

