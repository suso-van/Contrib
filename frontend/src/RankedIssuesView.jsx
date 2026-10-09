import React, { useState } from 'react';
import {
  ListOrdered,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Brain,
  FileCode,
  Tag,
  ChevronDown,
  ChevronRight,
  Clock,
  User,
  MessageSquare,
} from 'lucide-react';
import MarkdownContent from './MarkdownContent';

function Badge({ label, color = 'green' }) {
  const colors = {
    green:  { bg: 'rgba(0,180,50,0.12)', border: 'rgba(0,180,50,0.35)', text: '#00ff41' },
    yellow: { bg: 'rgba(200,160,0,0.12)', border: 'rgba(200,160,0,0.35)', text: '#eab308' },
    red:    { bg: 'rgba(200,60,60,0.12)', border: 'rgba(200,60,60,0.35)', text: '#f87171' },
    blue:   { bg: 'rgba(40,120,200,0.12)', border: 'rgba(40,120,200,0.35)', text: '#38bdf8' },
    purple: { bg: 'rgba(140,50,200,0.12)', border: 'rgba(140,50,200,0.35)', text: '#c084fc' },
    muted:  { bg: 'rgba(0,100,30,0.10)', border: 'rgba(0,100,30,0.25)', text: '#006618' },
  };
  const c = colors[color] || colors.muted;
  return (
    <span
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
        borderRadius: 2,
        padding: '2px 7px',
        fontSize: 10,
        letterSpacing: 0.8,
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 600,
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {label}
    </span>
  );
}

function IssueCard({ issue, rank }) {
  const [expanded, setExpanded] = useState(false);

  const diff = issue.difficulty || {};
  const level = (diff.level || 'medium').toLowerCase();
  const difficultyColor = level === 'easy' ? 'green' : level === 'medium' ? 'yellow' : 'red';
  const hasDeepAnalysis = Boolean(issue.summary || (diff.reasons && diff.reasons.length > 0));

  return (
    <div
      style={{
        background: 'rgba(0, 14, 4, 0.75)',
        border: '1px solid rgba(0, 255, 65, 0.15)',
        borderRadius: 4,
        padding: '14px 16px',
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(0, 255, 65, 0.35)';
        e.currentTarget.style.boxShadow = '0 0 15px rgba(0, 255, 65, 0.08)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'rgba(0, 255, 65, 0.15)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Top Header Row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#00ff41',
              background: 'rgba(0, 255, 65, 0.1)',
              border: '1px solid rgba(0, 255, 65, 0.3)',
              padding: '2px 6px',
              borderRadius: 3,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            #{rank}
          </span>

          <a
            href={issue.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#00ff41',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              fontFamily: "'JetBrains Mono', monospace",
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              wordBreak: 'break-word',
            }}
            onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
            onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
          >
            <span>#{issue.number} {issue.title}</span>
            <ExternalLink size={12} color="#00cc33" style={{ flexShrink: 0 }} />
          </a>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge
            label={`${level.toUpperCase()}${diff.ease_score !== undefined ? ` (SCORE: ${diff.ease_score})` : ''}`}
            color={difficultyColor}
          />
          {diff.good_first_issue && (
            <Badge label="GOOD FIRST ISSUE ✓" color="green" />
          )}
          {issue.likely_claimed ? (
            <Badge label={`CLAIMED${issue.claimed_reason ? `: ${issue.claimed_reason}` : ''}`} color="blue" />
          ) : (
            <Badge label="UNCLAIMED" color="muted" />
          )}
        </div>
      </div>

      {/* Meta Row: Author, Comments, Created */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 10, color: '#008822', flexWrap: 'wrap' }}>
        {issue.author && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <User size={11} /> @{issue.author}
          </span>
        )}
        {issue.comments !== undefined && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <MessageSquare size={11} /> {issue.comments} comments
          </span>
        )}
        {issue.created_at && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={11} /> {new Date(issue.created_at).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Labels */}
      {issue.labels && issue.labels.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <Tag size={11} color="#005015" />
          {issue.labels.map((l, i) => (
            <span
              key={i}
              style={{
                fontSize: 10,
                color: '#00aa28',
                background: 'rgba(0, 80, 20, 0.15)',
                border: '1px solid rgba(0, 80, 20, 0.25)',
                padding: '1px 5px',
                borderRadius: 2,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {l}
            </span>
          ))}
        </div>
      )}

      {/* Likely Files */}
      {issue.likely_files && issue.likely_files.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: '#006618' }}>AFFECTED FILES:</span>
          {issue.likely_files.map((fp, i) => (
            <span
              key={i}
              style={{
                fontSize: 10,
                color: '#00dd33',
                background: 'rgba(0, 100, 30, 0.1)',
                border: '1px solid rgba(0, 100, 30, 0.2)',
                padding: '1px 6px',
                borderRadius: 2,
                fontFamily: "'JetBrains Mono', monospace",
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <FileCode size={10} color="#00aa28" />
              {fp}
            </span>
          ))}
        </div>
      )}

      {/* Deep Analysis Accordion (if returned for top issues) */}
      {hasDeepAnalysis && (
        <div
          style={{
            border: '1px solid rgba(0, 255, 65, 0.12)',
            borderRadius: 3,
            overflow: 'hidden',
            marginTop: 4,
          }}
        >
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              background: expanded ? 'rgba(0, 150, 40, 0.12)' : 'rgba(0, 255, 65, 0.03)',
              border: 'none',
              cursor: 'pointer',
              color: '#00ff41',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              textAlign: 'left',
              transition: 'background 0.15s ease',
            }}
          >
            <Brain size={12} color="#00ff41" />
            <span style={{ flex: 1, letterSpacing: 0.5 }}>
              AI DEEP ANALYSIS & APPROACHABILITY NOTES
            </span>
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>

          {expanded && (
            <div
              style={{
                padding: '12px 14px',
                background: 'rgba(0, 10, 3, 0.85)',
                borderTop: '1px solid rgba(0, 255, 65, 0.08)',
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              {issue.summary && (
                <div style={{ marginBottom: diff.reasons?.length ? 10 : 0 }}>
                  <div style={{ fontSize: 10, color: '#006618', letterSpacing: 1, marginBottom: 4 }}>
                    ISSUE SUMMARY:
                  </div>
                  <MarkdownContent content={issue.summary} />
                </div>
              )}

              {diff.reasons && diff.reasons.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: '#006618', letterSpacing: 1, marginBottom: 4 }}>
                    APPROACHABILITY FACTORS:
                  </div>
                  <ul style={{ paddingLeft: 16, margin: 0, color: '#00cc33' }}>
                    {diff.reasons.map((r, i) => (
                      <li key={i} style={{ marginBottom: 3 }}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RankedIssuesView({
  data,
  loadingPhase, // null | 'loading_repo' | 'ranking_issues'
  error,
  onRefresh,
  limit = 50,
  onLimitChange,
  deepTopN = 5,
  onDeepTopNChange,
  repoName = 'Repository',
  repoUrl = '',
}) {
  const counts = data?.counts || {};
  const issues = Array.isArray(data?.issues) ? data.issues : [];
  const returnedCount = data?.returned ?? issues.length;
  const totalOpenCount = data?.total_open ?? returnedCount;
  const isCapped = returnedCount < totalOpenCount;
  const rateLimit = data?.rate_limit || {};

  return (
    <div
      style={{
        background: 'rgba(0, 10, 3, 0.88)',
        border: '1px solid rgba(0, 255, 65, 0.18)',
        borderRadius: 4,
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        width: '100%',
      }}
    >
      {/* Top Banner */}
      <div
        style={{
          padding: '12px 18px',
          borderBottom: '1px solid rgba(0, 255, 65, 0.12)',
          background: 'rgba(0, 20, 5, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ListOrdered size={14} color="#00ff41" />
          <span
            style={{
              fontSize: 11,
              color: '#00ff41',
              letterSpacing: 1.5,
              fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            RANKED REPOSITORY ISSUES
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {rateLimit.limit !== undefined && (
            <span style={{ fontSize: 10, color: '#006618', fontFamily: "'JetBrains Mono', monospace" }}>
              API: {rateLimit.remaining}/{rateLimit.limit}
            </span>
          )}
          <span style={{ color: '#006618', fontSize: 10, letterSpacing: 1 }}>TARGET:</span>
          <span
            style={{
              color: '#00dd33',
              fontWeight: 600,
              background: 'rgba(0, 255, 65, 0.06)',
              border: '1px solid rgba(0, 255, 65, 0.2)',
              padding: '2px 7px',
              borderRadius: 2,
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {repoName}
          </span>
        </div>
      </div>

      {/* Controls Bar */}
      <div
        style={{
          padding: '10px 18px',
          background: 'rgba(0, 15, 4, 0.4)',
          borderBottom: '1px solid rgba(0, 255, 65, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {/* Limit selector */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#00aa28' }}>
            <span>Limit:</span>
            <select
              value={limit}
              disabled={Boolean(loadingPhase)}
              onChange={e => onLimitChange && onLimitChange(Number(e.target.value))}
              style={{
                background: 'rgba(0, 20, 5, 0.8)',
                border: '1px solid rgba(0, 255, 65, 0.2)',
                color: '#00ff41',
                padding: '3px 8px',
                borderRadius: 2,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                cursor: loadingPhase ? 'not-allowed' : 'pointer',
              }}
            >
              <option value={25}>25 issues</option>
              <option value={50}>50 issues</option>
              <option value={100}>100 issues</option>
            </select>
          </label>

          {/* Deep Top N selector */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#00aa28' }}>
            <span>Deep Analysis:</span>
            <select
              value={deepTopN}
              disabled={Boolean(loadingPhase)}
              onChange={e => onDeepTopNChange && onDeepTopNChange(Number(e.target.value))}
              style={{
                background: 'rgba(0, 20, 5, 0.8)',
                border: '1px solid rgba(0, 255, 65, 0.2)',
                color: '#00ff41',
                padding: '3px 8px',
                borderRadius: 2,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                cursor: loadingPhase ? 'not-allowed' : 'pointer',
              }}
            >
              <option value={3}>Top 3</option>
              <option value={5}>Top 5</option>
              <option value={10}>Top 10</option>
            </select>
          </label>
        </div>

        {/* Reload / Refresh Button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={Boolean(loadingPhase)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(0, 180, 50, 0.15)',
            border: '1px solid rgba(0, 255, 65, 0.3)',
            color: '#00ff41',
            padding: '5px 12px',
            borderRadius: 3,
            fontSize: 11,
            cursor: loadingPhase ? 'not-allowed' : 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            if (!loadingPhase) e.currentTarget.style.background = 'rgba(0, 200, 50, 0.25)';
          }}
          onMouseLeave={e => {
            if (!loadingPhase) e.currentTarget.style.background = 'rgba(0, 180, 50, 0.15)';
          }}
        >
          <RefreshCw size={11} className={loadingPhase ? 'spin' : ''} />
          <span>{loadingPhase ? 'LOADING...' : 'REFRESH ISSUES'}</span>
        </button>
      </div>

      {/* Loading Progress State */}
      {loadingPhase && (
        <div style={{ padding: '24px 20px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#00ff41',
                boxShadow: '0 0 8px #00ff41',
                display: 'inline-block',
                animation: 'blink 1.2s infinite',
              }}
            />
            <span style={{ fontSize: 13, color: '#00ff41', fontWeight: 600, letterSpacing: 1 }}>
              {loadingPhase === 'loading_repo'
                ? '[1/2] PREPARING REPOSITORY (CLONING & INDEXING)...'
                : '[2/2] RANKING ISSUES & RUNNING DEEP ANALYSIS...'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#00701a' }}>
            {loadingPhase === 'loading_repo'
              ? 'Ensuring codebase is indexed on backend before fetching issues...'
              : 'Scoring issue approachability, checking PR claims, and enriching top candidates...'}
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && !loadingPhase && (
        <div
          style={{
            margin: '16px 20px',
            padding: '14px 16px',
            background: 'rgba(200, 50, 50, 0.1)',
            border: '1px solid rgba(200, 50, 50, 0.35)',
            borderRadius: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={15} color="#f87171" />
            <span style={{ color: '#f87171', fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>
              FAILED TO RETRIEVE RANKED ISSUES
            </span>
          </div>
          <p style={{ color: '#fca5a5', fontSize: 11, margin: 0, lineHeight: 1.5 }}>
            {error}
          </p>
          {error.includes('rate limit') && (
            <div style={{ fontSize: 10, color: '#f87171', opacity: 0.9 }}>
              Note: GitHub unauthenticated rate limits allow 60 requests/hr. The remote backend environment may need a configured token or wait for the rate-limit reset window.
            </div>
          )}
          <div>
            <button
              type="button"
              onClick={onRefresh}
              style={{
                background: 'rgba(200, 60, 60, 0.2)',
                border: '1px solid rgba(200, 60, 60, 0.4)',
                color: '#fca5a5',
                padding: '4px 12px',
                borderRadius: 2,
                cursor: 'pointer',
                fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              [RETRY]
            </button>
          </div>
        </div>
      )}

      {/* Ready / Not yet fetched state */}
      {!loadingPhase && !error && !data && (
        <div style={{ padding: '36px 20px', textAlign: 'center' }}>
          <div style={{ color: '#00dd33', fontSize: 13, marginBottom: 8, fontWeight: 600 }}>
            RANKED REPOSITORY ISSUES
          </div>
          <p style={{ color: '#008822', fontSize: 11, maxWidth: 460, margin: '0 auto 16px', lineHeight: 1.5 }}>
            Retrieve and rank GitHub issues for <span style={{ color: '#00ff41' }}>{repoUrl || 'selected repository'}</span> by difficulty and approachability.
          </p>
          <button
            type="button"
            onClick={onRefresh}
            style={{
              background: 'rgba(0, 180, 50, 0.15)',
              border: '1px solid #00ff41',
              color: '#00ff41',
              padding: '6px 16px',
              borderRadius: 3,
              cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            [LOAD RANKED ISSUES]
          </button>
        </div>
      )}

      {/* Content Area (when data is loaded) */}
      {!loadingPhase && !error && data && (
        <div style={{ padding: '16px 20px' }}>
          {/* Summary Metrics Row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 10,
              marginBottom: 16,
            }}
          >
            <div style={{ background: 'rgba(0, 180, 50, 0.08)', border: '1px solid rgba(0, 180, 50, 0.25)', padding: '10px 14px', borderRadius: 3 }}>
              <div style={{ fontSize: 10, color: '#008822', letterSpacing: 1, marginBottom: 2 }}>EASY ISSUES</div>
              <div style={{ fontSize: 20, color: '#00ff41', fontWeight: 700 }}>{counts.easy ?? 0}</div>
            </div>

            <div style={{ background: 'rgba(200, 160, 0, 0.08)', border: '1px solid rgba(200, 160, 0, 0.25)', padding: '10px 14px', borderRadius: 3 }}>
              <div style={{ fontSize: 10, color: '#856404', letterSpacing: 1, marginBottom: 2 }}>MEDIUM ISSUES</div>
              <div style={{ fontSize: 20, color: '#eab308', fontWeight: 700 }}>{counts.medium ?? 0}</div>
            </div>

            <div style={{ background: 'rgba(200, 60, 60, 0.08)', border: '1px solid rgba(200, 60, 60, 0.25)', padding: '10px 14px', borderRadius: 3 }}>
              <div style={{ fontSize: 10, color: '#721c24', letterSpacing: 1, marginBottom: 2 }}>HARD ISSUES</div>
              <div style={{ fontSize: 20, color: '#f87171', fontWeight: 700 }}>{counts.hard ?? 0}</div>
            </div>

            <div style={{ background: 'rgba(40, 120, 200, 0.08)', border: '1px solid rgba(40, 120, 200, 0.25)', padding: '10px 14px', borderRadius: 3 }}>
              <div style={{ fontSize: 10, color: '#155724', letterSpacing: 1, marginBottom: 2 }}>CLAIMED</div>
              <div style={{ fontSize: 20, color: '#38bdf8', fontWeight: 700 }}>{counts.claimed ?? 0}</div>
            </div>

            <div style={{ background: 'rgba(0, 40, 10, 0.2)', border: '1px solid rgba(0, 255, 65, 0.15)', padding: '10px 14px', borderRadius: 3 }}>
              <div style={{ fontSize: 10, color: '#006618', letterSpacing: 1, marginBottom: 2 }}>RETURNED / TOTAL</div>
              <div style={{ fontSize: 16, color: '#00dd33', fontWeight: 600 }}>
                {returnedCount} <span style={{ fontSize: 12, color: '#00701a' }}>/ {totalOpenCount}</span>
              </div>
            </div>
          </div>

          {/* Capped Warning */}
          {isCapped && (
            <div style={{ fontSize: 10, color: '#eab308', marginBottom: 14 }}>
              * Displaying top {returnedCount} ranked issues (capped by requested limit {limit}). Total open issues in repo: {totalOpenCount}.
            </div>
          )}

          {/* Issue List */}
          {issues.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {issues.map((issue, idx) => (
                <IssueCard key={issue.number || idx} issue={issue} rank={idx + 1} />
              ))}
            </div>
          ) : (
            <div style={{ padding: '24px', textAlign: 'center', color: '#00701a', fontStyle: 'italic', fontSize: 12 }}>
              No open issues returned for this repository.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
