import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js';
import { Copy, Check, Terminal } from 'lucide-react';
import { normalizeEscapedMarkdown } from './markdownUtils';

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Copy failed:', err);
    }
  };

  const highlightedHtml = useMemo(() => {
    try {
      if (language && hljs.getLanguage(language)) {
        return hljs.highlight(code, { language, ignoreIllegals: true }).value;
      }
      return hljs.highlightAuto(code).value;
    } catch {
      return code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
  }, [code, language]);

  const displayLang = (language || 'CODE').toUpperCase();

  return (
    <div
      style={{
        margin: '14px 0',
        borderRadius: 4,
        border: '1px solid rgba(0, 255, 65, 0.22)',
        background: 'rgba(0, 7, 2, 0.95)',
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4), inset 0 0 20px rgba(0, 255, 65, 0.02)',
      }}
    >
      {/* Code header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '7px 12px',
          background: 'rgba(0, 20, 5, 0.7)',
          borderBottom: '1px solid rgba(0, 255, 65, 0.12)',
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Terminal size={12} color="#00ff41" />
          <span
            style={{
              color: '#00cc33',
              fontWeight: 600,
              letterSpacing: 1,
              fontSize: 10,
            }}
          >
            {displayLang}
          </span>
        </div>

        <button
          onClick={handleCopy}
          type="button"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 8px',
            background: copied ? 'rgba(0, 255, 65, 0.15)' : 'rgba(0, 255, 65, 0.04)',
            border: `1px solid ${copied ? 'rgba(0, 255, 65, 0.5)' : 'rgba(0, 255, 65, 0.2)'}`,
            borderRadius: 3,
            color: copied ? '#00ff41' : '#00aa28',
            fontSize: 10,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: 0.5,
          }}
          onMouseEnter={e => {
            if (!copied) {
              e.currentTarget.style.borderColor = 'rgba(0, 255, 65, 0.45)';
              e.currentTarget.style.color = '#00ff41';
              e.currentTarget.style.background = 'rgba(0, 255, 65, 0.08)';
            }
          }}
          onMouseLeave={e => {
            if (!copied) {
              e.currentTarget.style.borderColor = 'rgba(0, 255, 65, 0.2)';
              e.currentTarget.style.color = '#00aa28';
              e.currentTarget.style.background = 'rgba(0, 255, 65, 0.04)';
            }
          }}
        >
          {copied ? (
            <>
              <Check size={11} color="#00ff41" strokeWidth={2.5} />
              <span>COPIED</span>
            </>
          ) : (
            <>
              <Copy size={11} strokeWidth={2} />
              <span>COPY</span>
            </>
          )}
        </button>
      </div>

      {/* Code body */}
      <pre
        style={{
          margin: 0,
          padding: '12px 14px',
          overflowX: 'auto',
          fontSize: 12.5,
          lineHeight: 1.65,
          fontFamily: "'JetBrains Mono', monospace",
          color: '#d4ffd8',
        }}
      >
        <code
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          style={{ fontFamily: 'inherit' }}
        />
      </pre>
    </div>
  );
}

export default function MarkdownContent({ content }) {
  const normalized = useMemo(() => normalizeEscapedMarkdown(content), [content]);

  if (!content) return null;

  return (
    <div className="contrib-markdown-body" style={{ color: '#00dd33', lineHeight: 1.75, fontSize: 13 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1({ children }) {
            return (
              <h1
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: '#00ff41',
                  letterSpacing: -0.3,
                  marginTop: 18,
                  marginBottom: 12,
                  paddingBottom: 6,
                  borderBottom: '1px solid rgba(0, 255, 65, 0.25)',
                  textShadow: '0 0 12px rgba(0, 255, 65, 0.2)',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {children}
              </h1>
            );
          },
          h2({ children }) {
            return (
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#00ff41',
                  marginTop: 16,
                  marginBottom: 10,
                  paddingBottom: 4,
                  borderBottom: '1px dashed rgba(0, 255, 65, 0.18)',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {children}
              </h2>
            );
          },
          h3({ children }) {
            return (
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#00cc33',
                  marginTop: 14,
                  marginBottom: 8,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {children}
              </h3>
            );
          },
          h4({ children }) {
            return (
              <h4
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#00b432',
                  marginTop: 12,
                  marginBottom: 6,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {children}
              </h4>
            );
          },
          p({ children }) {
            return (
              <p
                style={{
                  marginBottom: 12,
                  lineHeight: 1.75,
                  color: '#00dd33',
                  wordBreak: 'break-word',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {children}
              </p>
            );
          },
          strong({ children }) {
            return (
              <strong style={{ color: '#00ff41', fontWeight: 700 }}>
                {children}
              </strong>
            );
          },
          em({ children }) {
            return (
              <em style={{ color: '#86efac', fontStyle: 'italic' }}>
                {children}
              </em>
            );
          },
          ul({ children }) {
            return (
              <ul
                style={{
                  paddingLeft: 18,
                  marginBottom: 12,
                  listStyleType: 'disc',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {children}
              </ul>
            );
          },
          ol({ children }) {
            return (
              <ol
                style={{
                  paddingLeft: 18,
                  marginBottom: 12,
                  listStyleType: 'decimal',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {children}
              </ol>
            );
          },
          li({ children }) {
            return (
              <li
                style={{
                  marginBottom: 5,
                  lineHeight: 1.7,
                  color: '#00dd33',
                }}
              >
                {children}
              </li>
            );
          },
          blockquote({ children }) {
            return (
              <blockquote
                style={{
                  margin: '12px 0',
                  padding: '8px 14px',
                  background: 'rgba(0, 255, 65, 0.04)',
                  borderLeft: '3px solid rgba(0, 255, 65, 0.45)',
                  borderRadius: '0 4px 4px 0',
                  color: '#00ee3b',
                  fontStyle: 'italic',
                }}
              >
                {children}
              </blockquote>
            );
          },
          table({ children }) {
            return (
              <div style={{ overflowX: 'auto', margin: '14px 0' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    border: '1px solid rgba(0, 255, 65, 0.2)',
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            return (
              <thead
                style={{
                  background: 'rgba(0, 255, 65, 0.08)',
                  borderBottom: '1px solid rgba(0, 255, 65, 0.25)',
                }}
              >
                {children}
              </thead>
            );
          },
          th({ children }) {
            return (
              <th
                style={{
                  padding: '8px 12px',
                  textAlign: 'left',
                  color: '#00ff41',
                  fontWeight: 600,
                  borderBottom: '1px solid rgba(0, 255, 65, 0.2)',
                }}
              >
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td
                style={{
                  padding: '7px 12px',
                  borderBottom: '1px solid rgba(0, 255, 65, 0.1)',
                  color: '#00dd33',
                }}
              >
                {children}
              </td>
            );
          },
          hr() {
            return (
              <hr
                style={{
                  border: 'none',
                  borderTop: '1px solid rgba(0, 255, 65, 0.18)',
                  margin: '18px 0',
                }}
              />
            );
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#00ff41',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                {children}
              </a>
            );
          },
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children || '').replace(/\n$/, '');
            const hasNewlines = codeString.includes('\n');

            // If it has language tag or newlines, render as fenced CodeBlock
            if (match || hasNewlines) {
              return (
                <CodeBlock
                  language={match ? match[1] : ''}
                  code={codeString}
                />
              );
            }

            // Inline code
            return (
              <code
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                  background: 'rgba(0, 255, 65, 0.08)',
                  border: '1px solid rgba(0, 255, 65, 0.25)',
                  padding: '1px 5px',
                  borderRadius: 3,
                  color: '#00ff41',
                  wordBreak: 'break-word',
                }}
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
