import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Send, ChevronDown, ChevronRight, FileCode, Brain,
  Search, AlertTriangle, 
  Zap, BookOpen, GitCommit, Wrench, MessageSquare, GitBranch,
  FolderTree, ListOrdered
} from "lucide-react";
import MarkdownContent from "./MarkdownContent";
import ProjectFileTree from "./ProjectFileTree";
import SourcesList from "./SourcesList";
import RankedIssuesView from "./RankedIssuesView";
import { ensureRepoLoaded, fetchRankedIssues } from "./apiService";


function Badge({ label, color = "green" }) {
  const colors = {
    green:  { bg: "rgba(0,180,50,0.12)", border: "rgba(0,180,50,0.35)", text: "#00b432" },
    yellow: { bg: "rgba(200,160,0,0.12)", border: "rgba(200,160,0,0.35)", text: "#c8a000" },
    red:    { bg: "rgba(200,60,60,0.12)", border: "rgba(200,60,60,0.35)", text: "#c83c3c" },
    blue:   { bg: "rgba(40,120,200,0.12)", border: "rgba(40,120,200,0.35)", text: "#2878c8" },
    muted:  { bg: "rgba(0,100,30,0.10)", border: "rgba(0,100,30,0.25)", text: "#006618" },
  };
  const c = colors[color] || colors.muted;
  return (
    <span style={{
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      borderRadius: 2, padding: "2px 7px", fontSize: 10, letterSpacing: 1,
      fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
      whiteSpace: "nowrap",
    }}>
      {label.toUpperCase()}
    </span>
  );
}

function Accordion({ title, icon: Icon, children, defaultOpen = false, accent = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      border: `1px solid ${accent ? "rgba(0,180,50,0.3)" : "rgba(0,255,65,0.1)"}`,
      borderRadius: 3,
      overflow: "hidden",
      marginBottom: 8,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", background: accent ? "rgba(0,150,40,0.08)" : "rgba(0,255,65,0.03)",
          border: "none", cursor: "pointer", color: accent ? "#00ff41" : "#02ee39",
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 1,
          textAlign: "left", transition: "background 0.15s",
        }}
        onMouseEnter={e => e.currentTarget.style.background = "rgba(0,200,50,0.15)"}
        onMouseLeave={e => e.currentTarget.style.background = accent ? "rgba(0,180,50,0.1)" : "rgba(0,255,65,0.05)"}
      >
        {Icon && <Icon size={13} />}
        <span style={{ flex: 1 }}>{title}</span>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      {open && (
        <div style={{ padding: "12px 14px", background: "rgba(0,8,2,0.6)", borderTop: "1px solid rgba(0,255,65,0.08)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function MetaRow({ label, value, children }) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 7, alignItems: "flex-start" }}>
      <span style={{ color: "#00b432", fontSize: 11, minWidth: 120, letterSpacing: 0.5, flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ color: "#05eb3e", fontSize: 11, lineHeight: 1.5 }}>
        {children || value}
      </span>
    </div>
  );
}

function FileCard({ file }) {
  const [open, setOpen] = useState(false);
  const relevanceColor = file.relevance === "high" ? "green" : file.relevance === "medium" ? "yellow" : "muted";
  const methodColor = file.method === "bm25" ? "blue" : "muted";

  return (
    <div style={{
      border: "1px solid rgba(0,255,65,0.1)", borderRadius: 3, marginBottom: 6,
      overflow: "hidden",
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "9px 12px", background: "rgba(0,255,65,0.02)", border: "none",
          cursor: "pointer", textAlign: "left", transition: "background 0.15s",
        }}
        onMouseEnter={e => e.currentTarget.style.background = "rgba(0,255,65,0.05)"}
        onMouseLeave={e => e.currentTarget.style.background = "rgba(0,255,65,0.02)"}
      >
        <FileCode size={12} color="#006618" />
        <span style={{ flex: 1, color: "#04ed3e", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
          {file.path}
        </span>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <Badge label={file.relevance} color={relevanceColor} />
          <Badge label={file.method} color={methodColor} />
          <span style={{ color: "#004010", fontSize: 10 }}>{file.score?.toFixed(2)}</span>
          {open ? <ChevronDown size={11} color="#004010" /> : <ChevronRight size={11} color="#004010" />}
        </div>
      </button>
      {open && (
        <div style={{ padding: "10px 12px", background: "rgba(0,5,1,0.8)", borderTop: "1px solid rgba(0,255,65,0.06)" }}>
          <p style={{ color: "#00dd33", fontSize: 11, lineHeight: 1.6, marginBottom: 8 }}>{file.reason}</p>
          {file.functions?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {file.functions.map(fn => (
                <span key={fn} style={{
                  background: "rgba(0,100,30,0.12)", border: "1px solid rgba(0,100,30,0.2)",
                  color: "#00882288", borderRadius: 2, padding: "1px 6px", fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  fn:{fn}()
                </span>
              ))}
              {file.classes?.map(cls => (
                <span key={cls} style={{
                  background: "rgba(40,100,0,0.12)", border: "1px solid rgba(40,100,0,0.2)",
                  color: "#4a8800", borderRadius: 2, padding: "1px 6px", fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  cls:{cls}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IssueAnalysisCard({ data }) {
  const { issue, analysis, retrieval, reasoning } = data;
  const difficultyColor = { beginner: "green", intermediate: "yellow", advanced: "red" }[analysis.difficulty] || "muted";

  return (
    <div style={{
      background: "rgba(0,10,3,0.85)",
      border: "1px solid rgba(0,180,50,0.25)",
      borderRadius: 4,
      overflow: "hidden",
      boxShadow: "0 0 0 1px rgba(0,180,50,0.08), inset 0 0 40px rgba(0,0,0,0.3)",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 18px",
        borderBottom: "1px solid rgba(0,255,65,0.1)",
        background: "rgba(0,20,5,0.6)",
        display: "flex", alignItems: "flex-start", gap: 10,
      }}>
        <Brain size={16} color="#00b432" style={{ marginTop: 2, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: "#005015", letterSpacing: 2, marginBottom: 4 }}>
            ISSUE ANALYSIS
          </div>
          <div style={{ color: "#009922", fontSize: 13, fontWeight: 600, lineHeight: 1.4, marginBottom: 8 }}>
            {issue.title}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Badge label={analysis.issue_type} color="muted" />
            <Badge label={`difficulty: ${analysis.difficulty}`} color={difficultyColor} />
            {analysis.good_first_issue && <Badge label="good first issue ✓" color="green" />}
            <Badge label={`~${analysis.estimated_hours}h`} color="muted" />
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "14px 16px" }}>

        {/* Analysis */}
        <Accordion title="ANALYSIS" icon={Zap} defaultOpen={true} accent={true}>
          <MetaRow label="Root cause">{analysis.root_cause_hypothesis}</MetaRow>
          <MetaRow label="Difficulty why">{analysis.difficulty_reason}</MetaRow>
          <MetaRow label="Skills needed">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {analysis.required_skills?.map(s => <Badge key={s} label={s} color="muted" />)}
            </div>
          </MetaRow>
          <MetaRow label="Affected areas">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {analysis.affected_areas?.map(a => <Badge key={a} label={a} color="muted" />)}
            </div>
          </MetaRow>
        </Accordion>

        {/* Relevant Files */}
        <Accordion title={`RELEVANT FILES (${retrieval.relevant_files?.length || 0})`} icon={Search}>
          {retrieval.relevant_files?.map((f, i) => <FileCard key={i} file={f} />)}
          {retrieval.key_functions?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, color: "#005015", letterSpacing: 1, marginBottom: 6 }}>KEY FUNCTIONS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {retrieval.key_functions.map(fn => (
                  <span key={fn} style={{
                    background: "rgba(0,80,20,0.15)", border: "1px solid rgba(0,80,20,0.25)",
                    color: "#006618", borderRadius: 2, padding: "2px 7px", fontSize: 10,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {fn}()
                  </span>
                ))}
              </div>
            </div>
          )}
        </Accordion>

        {/* Contribution Path */}
        <Accordion title="CONTRIBUTION PATH" icon={GitCommit} accent={true}>
          <MetaRow label="Start here">{reasoning.where_to_start}</MetaRow>
          {reasoning.what_to_read_first?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: "#005015", letterSpacing: 1, marginBottom: 6 }}>READ FIRST</div>
              {reasoning.what_to_read_first.map((item, i) => (
                <div key={i} style={{
                  padding: "6px 10px", borderLeft: "2px solid rgba(0,255,65,0.4)",
                  marginBottom: 5, color: "#00dd33", fontSize: 11, lineHeight: 1.5,
                }}>
                  {item}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: "#005015", letterSpacing: 1, marginBottom: 8 }}>STEPS</div>
            {reasoning.contribution_path?.map((step) => (
              <div key={step.step} style={{
                display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start",
              }}>
                <div style={{
                  width: 20, height: 20, border: "1px solid rgba(0,180,50,0.3)",
                  borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, fontSize: 10, color: "#009922", background: "rgba(0,80,20,0.12)",
                }}>
                  {step.step}
                </div>
                <div>
                  <div style={{ color: "#00ff41", fontSize: 11, fontWeight: 600, marginBottom: 3 }}>{step.title}</div>
                  <div style={{ color: "#00dd33", fontSize: 11, lineHeight: 1.5 }}>{step.description}</div>
                  {step.files_involved?.length > 0 && (
                    <div style={{ marginTop: 5, display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {step.files_involved.map(f => (
                        <span key={f} style={{
                          background: "rgba(0,60,15,0.2)", border: "1px solid rgba(0,60,15,0.3)",
                          color: "#005015", borderRadius: 2, padding: "1px 6px", fontSize: 10,
                          fontFamily: "'JetBrains Mono', monospace",
                        }}>
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Accordion>

        {/* Logic Trace */}
        {reasoning.logic_trace?.length > 0 && (
          <Accordion title="LOGIC TRACE" icon={BookOpen}>
            {reasoning.logic_trace.map((step, i) => (
              <div key={i} style={{
                padding: "5px 0 5px 10px", borderLeft: "1px solid rgba(0,255,65,0.4)",
                marginBottom: 4, color: "#00dd33", fontSize: 11, lineHeight: 1.5,
              }}>
                {step}
              </div>
            ))}
          </Accordion>
        )}

        {/* Common Mistakes */}
        {reasoning.common_mistakes?.length > 0 && (
          <Accordion title="COMMON MISTAKES" icon={AlertTriangle}>
            {reasoning.common_mistakes.map((m, i) => (
              <div key={i} style={{
                display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 5,
                color: "#cf9202", fontSize: 11, lineHeight: 1.5,
              }}>
                <span style={{ color: "#daaf03", flexShrink: 0 }}>!</span>
                {m}
              </div>
            ))}
          </Accordion>
        )}

        {/* Low Confidence Warning */}

        {reasoning.localisation_confidence?.low_confidence && (
          <div style={{ 
            display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10,
            background: "rgba(200,60,60,0.1)", border: "1px solid rgba(200,60,60,0.3)", 
            padding: "10px 14px", borderRadius: 3 
          }}>
            <AlertTriangle size={14} color="#c83c3c" style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ color: "#c83c3c", fontSize: 11, lineHeight: 1.5 }}>
              <strong style={{ letterSpacing: 1 }}>LOW CONFIDENCE:</strong> {retrieval.reranker?.explanation || "The AI is unsure if these are the correct files."}
            </span>
          </div>
        )}

        {/* Patch (Fixed!) */}
        {reasoning.suggested_patch && reasoning.suggested_patch.diff && (
          <Accordion 
            title={`SUGGESTED PATCH (${reasoning.suggested_patch.file_path})`} 
            icon={Wrench} 
            accent={true}
          >
            <pre style={{
              color: "#00b432", fontSize: 10, lineHeight: 1.6, overflowX: "auto",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {reasoning.suggested_patch.diff}
            </pre>
          </Accordion>
        )}
      </div>
    </div>
  );
}

      

function sanitizeRepoName(name, fallbackUrl) {
  if (
    !name ||
    typeof name !== "string" ||
    name.includes("tmp") ||
    name.includes("cloned_repo") ||
    name.includes("var/folders") ||
    name.includes("AppData") ||
    name.includes("/") ||
    name.includes("\\")
  ) {
    if (fallbackUrl && typeof fallbackUrl === "string") {
      const clean = fallbackUrl.replace(/\/+$/, "").replace(/\.git$/, "");
      const parts = clean.split("/");
      const last = parts[parts.length - 1];
      if (last && !last.includes("tmp")) return last;
    }
    return "Repository";
  }
  return name;
}

function QAAnswerCard({ data, repoUrl, repoName }) {
  const resolvedRepoUrl = repoUrl || data?.repo_url || "";
  const resolvedRepoName = sanitizeRepoName(data?.repo_name || repoName, resolvedRepoUrl);
  const relevantFiles = Array.isArray(data?.relevant_files) ? data.relevant_files : [];
  const projectStructure = Array.isArray(data?.project_structure) ? data.project_structure : [];
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const citations = Array.isArray(data?.citations) ? data.citations : [];
  const isTruncated = Boolean(data?.truncated);
  const retrievalMode = data?.retrieval_mode || null;
  
  const hasFiles = relevantFiles.length > 0;
  const hasTree = projectStructure.length > 0;
  
  // Use project_structure if available, otherwise fallback to reconstructing from relevant_files
  const treeFiles = hasTree ? projectStructure : relevantFiles;
  const isPartialTree = !hasTree || isTruncated;
  
  // Count actual leaf file nodes by traversing the tree, counting each distinct path once
  const countFiles = (items) => {
    let count = 0;
    const seen = new Set();
    const traverse = (nodes) => {
      if (!Array.isArray(nodes)) return;
      for (const item of nodes) {
        if (typeof item === 'string') {
          if (!seen.has(item)) {
            seen.add(item);
            count++;
          }
        } else if (item && typeof item === 'object') {
          const isFile = item.type === 'file' || item.isDirectory === false;
          if (isFile) {
            const p = item.path || item.name;
            if (p && !seen.has(p)) {
              seen.add(p);
              count++;
            } else if (!p) {
              count++;
            }
          } else if (Array.isArray(item.children)) {
            traverse(item.children);
          }
        }
      }
    };
    traverse(items);
    return count;
  };
  const fileCount = countFiles(treeFiles);

  const hasAnswer = Boolean(data?.answer && data.answer.trim().length > 0);
  const citationsCount = citations.length;

  return (
    <div
      style={{
        background: "rgba(0,10,3,0.88)",
        border: "1px solid rgba(0,255,65,0.18)",
        borderRadius: 4,
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(0,0,0,0.5), inset 0 0 30px rgba(0,255,65,0.02)",
        width: "100%",
      }}
    >
      {/* Header Banner */}
      <div
        style={{
          padding: "12px 18px",
          borderBottom: "1px solid rgba(0,255,65,0.12)",
          background: "rgba(0,20,5,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <MessageSquare size={13} color="#00ff41" />
          <span
            style={{
              fontSize: 11,
              color: "#00ff41",
              letterSpacing: 1.5,
              fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            REPOSITORY ANALYSIS
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {retrievalMode && (
            <Badge label={`RETRIEVAL: ${retrievalMode}`} color="muted" />
          )}
          <span style={{ color: "#006618", letterSpacing: 1 }}>TARGET:</span>
          <span
            style={{
              color: "#00dd33",
              fontWeight: 600,
              background: "rgba(0,255,65,0.06)",
              border: "1px solid rgba(0,255,65,0.2)",
              padding: "2px 7px",
              borderRadius: 2,
            }}
          >
            {resolvedRepoName}
          </span>
        </div>
      </div>

      {/* 1. Main Answer with formatted Markdown */}
      <div style={{ padding: "18px 22px" }}>
        {hasAnswer ? (
          <MarkdownContent content={data.answer} />
        ) : sections.length > 0 ? (
          /* Fallback when answer is missing: render sections cleanly */
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {sections.map((sec, idx) => (
              <div key={idx} style={{ padding: "12px 14px", background: "rgba(0,255,65,0.04)", borderLeft: "2px solid #00ff41", borderRadius: "0 3px 3px 0" }}>
                <h4 style={{ color: "#00ff41", marginBottom: 8, fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>{sec.title}</h4>
                <MarkdownContent content={sec.content} />
                {sec.references && sec.references.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {sec.references.map((ref, rIdx) => (
                      <span key={rIdx} style={{
                        background: "rgba(0,100,30,0.12)", border: "1px solid rgba(0,100,30,0.2)",
                        color: "#00dd33", borderRadius: 2, padding: "1px 6px", fontSize: 10,
                        fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        {ref}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: "#00aa28", fontSize: 12, margin: 0 }}>No analysis content available.</p>
        )}

        {isTruncated && (
          <div style={{ color: "#ffcc00", fontSize: 11, marginTop: 12, display: "flex", gap: 6, alignItems: "center" }}>
            <span>⚠</span>
            <span>[NOTICE] Context was truncated by the server due to repository size limits.</span>
          </div>
        )}
      </div>

      {/* 1.5 Categorized Finding References (associated relationships without duplicating answer text) */}
      {hasAnswer && sections.some(s => Array.isArray(s.references) && s.references.length > 0) && (
        <div style={{ padding: "0 22px 16px" }}>
          <div style={{
            background: "rgba(0,20,5,0.35)",
            border: "1px solid rgba(0,255,65,0.12)",
            borderRadius: 3,
            padding: "10px 14px",
          }}>
            <div style={{ fontSize: 10, color: "#006618", letterSpacing: 1.5, marginBottom: 8, fontWeight: 700 }}>
              REFERENCED FILES BY CATEGORY
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sections.map((sec, idx) => (
                sec.references && sec.references.length > 0 ? (
                  <div key={idx} style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: "#00cc2e", fontWeight: 600, minWidth: 140 }}>
                      {sec.title}:
                    </span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {sec.references.map((ref, rIdx) => (
                        <span
                          key={rIdx}
                          style={{
                            background: "rgba(0,100,30,0.12)",
                            border: "1px solid rgba(0,100,30,0.25)",
                            color: "#00ff41",
                            borderRadius: 2,
                            padding: "1px 6px",
                            fontSize: 10,
                            fontFamily: "'JetBrains Mono', monospace",
                          }}
                        >
                          {ref}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. Project Structure & 3. Sources & References */}
      {(hasFiles || hasTree) && (
        <div
          style={{
            borderTop: "1px solid rgba(0,255,65,0.12)",
            background: "rgba(0,7,2,0.5)",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Section 2: Expandable Project File Tree */}
          {fileCount > 0 && (
            <Accordion
              title={`${isPartialTree ? "PARTIAL PROJECT STRUCTURE" : "PROJECT STRUCTURE"} (${fileCount} ${fileCount === 1 ? "FILE" : "FILES"})`}
              icon={FolderTree}
              defaultOpen={true}
              accent={true}
            >
              <ProjectFileTree 
                 files={treeFiles} 
                 repoName={resolvedRepoName} 
                 isPartial={isPartialTree}
                 highlightPaths={relevantFiles}
              />
            </Accordion>
          )}

          {/* Section 3: Sources & References */}
          {(citationsCount > 0 || hasFiles) && (
            <Accordion
              title={citationsCount > 0
                ? `SOURCES & REFERENCES (${citationsCount} ${citationsCount === 1 ? "CITATION" : "CITATIONS"})`
                : `RELEVANT FILES (${relevantFiles.length})`
              }
              icon={FileCode}
              defaultOpen={true}
              accent={false}
            >
              {citationsCount > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: (hasFiles ? 14 : 0) }}>
                  {citations.map((cit, idx) => (
                    <div key={idx} style={{ background: "rgba(0,20,5,0.4)", border: "1px solid rgba(0,255,65,0.12)", padding: 10, borderRadius: 3 }}>
                      <div style={{ fontSize: 11, color: "#00ff41", marginBottom: 5, fontFamily: "'JetBrains Mono', monospace", display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontWeight: 600 }}>{cit.file}</span>
                        {(cit.start_line !== undefined && cit.end_line !== undefined) && (
                          <span style={{ color: "#008822", fontSize: 10 }}>
                            (Lines {cit.start_line}–{cit.end_line})
                          </span>
                        )}
                      </div>
                      {cit.snippet && (
                        <pre style={{ fontSize: 10, color: "#00cc2e", margin: 0, whiteSpace: "pre-wrap", fontFamily: "'JetBrains Mono', monospace", background: "rgba(0,10,2,0.6)", padding: "6px 8px", borderRadius: 2 }}>{cit.snippet}</pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {hasFiles && (
                <div>
                  {citationsCount > 0 && (
                    <div style={{ fontSize: 10, color: "#005015", letterSpacing: 1, marginBottom: 6 }}>
                      RELEVANT REPOSITORY FILES:
                    </div>
                  )}
                  <SourcesList files={relevantFiles} repoUrl={resolvedRepoUrl} />
                </div>
              )}
            </Accordion>
          )}
        </div>
      )}
    </div>
  );
}

// ─── WORKFLOW SELECTOR BAR ───────────────────────────────────────────────────

function WorkflowSelector({ activeWorkflow, onSelectWorkflow, generatePatch, onTogglePatch }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "7px 12px",
        background: "rgba(0,14,4,0.75)",
        border: "1px solid rgba(0,255,65,0.14)",
        borderRadius: 4,
        marginBottom: 8,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => onSelectWorkflow("issue")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 12px",
            background: activeWorkflow === "issue" ? "rgba(0,180,50,0.2)" : "transparent",
            border: `1px solid ${activeWorkflow === "issue" ? "#00ff41" : "rgba(0,255,65,0.15)"}`,
            borderRadius: 3,
            color: activeWorkflow === "issue" ? "#00ff41" : "#00701a",
            cursor: "pointer",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            fontWeight: activeWorkflow === "issue" ? 700 : 500,
            letterSpacing: 0.5,
            transition: "all 0.15s ease",
            boxShadow: activeWorkflow === "issue" ? "0 0 10px rgba(0,255,65,0.15)" : "none",
          }}
        >
          <Zap size={12} color={activeWorkflow === "issue" ? "#00ff41" : "#00701a"} />
          <span>ASK ABOUT AN ISSUE</span>
          {activeWorkflow === "issue" && (
            <span style={{ fontSize: 8, opacity: 0.9 }}>●</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onSelectWorkflow("repo")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 12px",
            background: activeWorkflow === "repo" ? "rgba(0,180,50,0.2)" : "transparent",
            border: `1px solid ${activeWorkflow === "repo" ? "#00ff41" : "rgba(0,255,65,0.15)"}`,
            borderRadius: 3,
            color: activeWorkflow === "repo" ? "#00ff41" : "#00701a",
            cursor: "pointer",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            fontWeight: activeWorkflow === "repo" ? 700 : 500,
            letterSpacing: 0.5,
            transition: "all 0.15s ease",
            boxShadow: activeWorkflow === "repo" ? "0 0 10px rgba(0,255,65,0.15)" : "none",
          }}
        >
          <FolderTree size={12} color={activeWorkflow === "repo" ? "#00ff41" : "#00701a"} />
          <span>ANALYZE REPOSITORY</span>
          {activeWorkflow === "repo" && (
            <span style={{ fontSize: 8, opacity: 0.9 }}>●</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onSelectWorkflow("ranked_issues")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 12px",
            background: activeWorkflow === "ranked_issues" ? "rgba(0,180,50,0.2)" : "transparent",
            border: `1px solid ${activeWorkflow === "ranked_issues" ? "#00ff41" : "rgba(0,255,65,0.15)"}`,
            borderRadius: 3,
            color: activeWorkflow === "ranked_issues" ? "#00ff41" : "#00701a",
            cursor: "pointer",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            fontWeight: activeWorkflow === "ranked_issues" ? 700 : 500,
            letterSpacing: 0.5,
            transition: "all 0.15s ease",
            boxShadow: activeWorkflow === "ranked_issues" ? "0 0 10px rgba(0,255,65,0.15)" : "none",
          }}
        >
          <ListOrdered size={12} color={activeWorkflow === "ranked_issues" ? "#00ff41" : "#00701a"} />
          <span>RANKED ISSUES</span>
          {activeWorkflow === "ranked_issues" && (
            <span style={{ fontSize: 8, opacity: 0.9 }}>●</span>
          )}
        </button>
      </div>

      {activeWorkflow === "issue" && (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            fontSize: 10,
            color: generatePatch ? "#00ff41" : "#00701a",
            fontFamily: "'JetBrains Mono', monospace",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={generatePatch}
            onChange={(e) => onTogglePatch(e.target.checked)}
            style={{
              accentColor: "#00ff41",
              cursor: "pointer",
              width: 12,
              height: 12,
            }}
          />
          <span>Generate unified patch diff (opt-in)</span>
        </label>
      )}
    </div>
  );
}

// ─── WELCOME PANEL COMPONENT ─────────────────────────────────────────────────

function WelcomePanel({ repoName, activeWorkflow, onSelectWorkflow }) {
  return (
    <div
      style={{
        border: "1px solid rgba(0,255,65,0.2)",
        borderRadius: 4,
        background: "rgba(0,12,3,0.7)",
        padding: "18px 20px",
        marginBottom: 8,
        boxShadow: "inset 0 0 40px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Brain size={16} color="#00ff41" />
          <span style={{ fontSize: 13, color: "#00ff41", fontWeight: 700, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace" }}>
            CONTRIB REPOSITORY INTELLIGENCE
          </span>
        </div>
        <Badge label={`INDEXED: ${repoName}`} color="green" />
      </div>

      <p style={{ fontSize: 12, color: "#00cc2e", lineHeight: 1.6, marginBottom: 16 }}>
        Welcome to Contrib. Choose a workflow below to investigate individual issues, conduct a holistic codebase audit, or explore ranked approachable repository issues.
      </p>

      {/* Selectable Workflow Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 14 }}>
        {/* Card A */}
        <div
          onClick={() => onSelectWorkflow("issue")}
          style={{
            border: `1px solid ${activeWorkflow === "issue" ? "#00ff41" : "rgba(0,255,65,0.15)"}`,
            borderRadius: 4,
            padding: "14px 16px",
            background: activeWorkflow === "issue" ? "rgba(0,180,50,0.12)" : "rgba(0,10,2,0.5)",
            cursor: "pointer",
            transition: "all 0.2s ease",
            boxShadow: activeWorkflow === "issue" ? "0 0 15px rgba(0,255,65,0.12)" : "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Zap size={14} color={activeWorkflow === "issue" ? "#00ff41" : "#00701a"} />
              <span style={{ fontSize: 11, fontWeight: 700, color: activeWorkflow === "issue" ? "#00ff41" : "#00cc2e", letterSpacing: 1 }}>
                ASK ABOUT AN ISSUE
              </span>
            </div>
            {activeWorkflow === "issue" ? <Badge label="ACTIVE" color="green" /> : <span style={{ fontSize: 10, color: "#005015" }}>[SELECT]</span>}
          </div>
          <p style={{ fontSize: 11, color: "#00aa28", lineHeight: 1.5, margin: 0 }}>
            Investigate a specific bug, error traceback, or GitHub issue URL. Analyzes root causes, affected files, and optionally crafts a fix patch.
          </p>
        </div>

        {/* Card B */}
        <div
          onClick={() => onSelectWorkflow("repo")}
          style={{
            border: `1px solid ${activeWorkflow === "repo" ? "#00ff41" : "rgba(0,255,65,0.15)"}`,
            borderRadius: 4,
            padding: "14px 16px",
            background: activeWorkflow === "repo" ? "rgba(0,180,50,0.12)" : "rgba(0,10,2,0.5)",
            cursor: "pointer",
            transition: "all 0.2s ease",
            boxShadow: activeWorkflow === "repo" ? "0 0 15px rgba(0,255,65,0.12)" : "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <FolderTree size={14} color={activeWorkflow === "repo" ? "#00ff41" : "#00701a"} />
              <span style={{ fontSize: 11, fontWeight: 700, color: activeWorkflow === "repo" ? "#00ff41" : "#00cc2e", letterSpacing: 1 }}>
                ANALYZE REPOSITORY
              </span>
            </div>
            {activeWorkflow === "repo" ? <Badge label="ACTIVE" color="green" /> : <span style={{ fontSize: 10, color: "#005015" }}>[SELECT]</span>}
          </div>
          <p style={{ fontSize: 11, color: "#00aa28", lineHeight: 1.5, margin: 0 }}>
            Review architecture, code quality, dependency health, and reliability risks across the repository with structured audit reports.
          </p>
        </div>

        {/* Card C */}
        <div
          onClick={() => onSelectWorkflow("ranked_issues")}
          style={{
            border: `1px solid ${activeWorkflow === "ranked_issues" ? "#00ff41" : "rgba(0,255,65,0.15)"}`,
            borderRadius: 4,
            padding: "14px 16px",
            background: activeWorkflow === "ranked_issues" ? "rgba(0,180,50,0.12)" : "rgba(0,10,2,0.5)",
            cursor: "pointer",
            transition: "all 0.2s ease",
            boxShadow: activeWorkflow === "ranked_issues" ? "0 0 15px rgba(0,255,65,0.12)" : "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <ListOrdered size={14} color={activeWorkflow === "ranked_issues" ? "#00ff41" : "#00701a"} />
              <span style={{ fontSize: 11, fontWeight: 700, color: activeWorkflow === "ranked_issues" ? "#00ff41" : "#00cc2e", letterSpacing: 1 }}>
                RANKED ISSUES
              </span>
            </div>
            {activeWorkflow === "ranked_issues" ? <Badge label="ACTIVE" color="green" /> : <span style={{ fontSize: 10, color: "#005015" }}>[SELECT]</span>}
          </div>
          <p style={{ fontSize: 11, color: "#00aa28", lineHeight: 1.5, margin: 0 }}>
            Browse open GitHub issues ranked by difficulty, beginner approachability, and claimed status with deeper AI analysis.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN CHATBOX COMPONENT ──────────────────────────────────────────────────

export default function ChatBox({ repoUrl, repoName, onReset }) {
  const cleanRepoName = sanitizeRepoName(repoName, repoUrl);
  const [activeWorkflow, setActiveWorkflow] = useState("issue"); // "issue" | "repo" | "ranked_issues"
  const [generatePatch, setGeneratePatch] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      type: "welcome_init",
      content: `Repository [${cleanRepoName}] indexed successfully. Select a workflow below to begin analysis.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const currentRequestIdRef = useRef(0);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  // Ranked issues workflow state
  const [rankedIssuesData, setRankedIssuesData] = useState(null);
  const [rankedIssuesLoadingPhase, setRankedIssuesLoadingPhase] = useState(null); // null | 'loading_repo' | 'ranking_issues'
  const [rankedIssuesError, setRankedIssuesError] = useState(null);
  const [issuesLimit, setIssuesLimit] = useState(50);
  const [deepTopN, setDeepTopN] = useState(5);

  // Reset ranked issues if repoUrl changes to prevent displaying stale results
  const [prevRepoUrl, setPrevRepoUrl] = useState(repoUrl);
  if (prevRepoUrl !== repoUrl) {
    setPrevRepoUrl(repoUrl);
    setRankedIssuesData(null);
    setRankedIssuesError(null);
    setRankedIssuesLoadingPhase(null);
  }

  // Two-step fetch sequence: Step A (load repo) -> Step B (retrieve ranked issues)
  const handleFetchRankedIssues = useCallback(async (optLimit = issuesLimit, optDeepTopN = deepTopN) => {
    if (rankedIssuesLoadingPhase) return;
    setRankedIssuesError(null);
    setRankedIssuesLoadingPhase('loading_repo');

    try {
      // Step A: Load and index repository
      await ensureRepoLoaded(repoUrl, () => {});

      // Step B: Retrieve ranked issues from POST /api/repo-issues
      setRankedIssuesLoadingPhase('ranking_issues');
      const data = await fetchRankedIssues(repoUrl, {
        limit: optLimit,
        deepTopN: optDeepTopN,
      });

      setRankedIssuesData(data);
    } catch (err) {
      setRankedIssuesError(err.message || 'Failed to retrieve repository issues.');
    } finally {
      setRankedIssuesLoadingPhase(null);
    }
  }, [deepTopN, issuesLimit, rankedIssuesLoadingPhase, repoUrl]);

  // Auto-fetch on switching to ranked_issues if not already loaded
  useEffect(() => {
    if (activeWorkflow === 'ranked_issues' && !rankedIssuesData && !rankedIssuesLoadingPhase && !rankedIssuesError && repoUrl) {
      const timer = setTimeout(() => {
        handleFetchRankedIssues(issuesLimit, deepTopN);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeWorkflow, deepTopN, handleFetchRankedIssues, issuesLimit, rankedIssuesData, rankedIssuesError, rankedIssuesLoadingPhase, repoUrl]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping, rankedIssuesData, rankedIssuesLoadingPhase]);

  const prompts = activeWorkflow === "issue"
    ? [
        "Why does the webcam stream fail to initialize?",
        "Explain this Python traceback and root cause.",
        "Investigate this GitHub issue",
      ]
    : activeWorkflow === "repo"
    ? [
        "What are the biggest issues in this repository?",
        "Review the architecture and identify reliability risks.",
        "What should we fix first to improve maintainability?",
      ]
    : [
        "Refresh ranked issues",
        "Fetch top 25 approachable issues",
        "Fetch top 100 open issues",
      ];

  const composerPlaceholder = activeWorkflow === "issue"
    ? "Describe a bug, paste an error, or enter a GitHub issue URL..."
    : activeWorkflow === "repo"
    ? "Ask for an architecture review, code-quality audit, or prioritized findings..."
    : "Enter a limit or click to refresh and rank repository issues...";

  const handleSelectPrompt = (promptText) => {
    if (activeWorkflow === "ranked_issues") {
      if (promptText.includes("25")) {
        setIssuesLimit(25);
        handleFetchRankedIssues(25, deepTopN);
      } else if (promptText.includes("100")) {
        setIssuesLimit(100);
        handleFetchRankedIssues(100, deepTopN);
      } else {
        handleFetchRankedIssues(issuesLimit, deepTopN);
      }
      return;
    }
    setInput(promptText);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleSendMessage = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    if (activeWorkflow === "ranked_issues") {
      const trimmed = input.trim();
      setInput("");
      const num = parseInt(trimmed.replace(/\D/g, ''), 10);
      const newLimit = (num && num >= 1 && num <= 100) ? num : issuesLimit;
      if (num && num !== issuesLimit) {
        setIssuesLimit(newLimit);
      }
      await handleFetchRankedIssues(newLimit, deepTopN);
      return;
    }

    if (!input.trim() || isTyping) return;

    const userMsg = input.trim();
    const requestId = ++currentRequestIdRef.current;
    setIsTyping(true);
    setInput("");

    setMessages(prev => [
      ...prev,
      {
        role: "user",
        type: "text",
        content: userMsg,
        workflow: activeWorkflow,
        patchRequested: activeWorkflow === "issue" && generatePatch,
      }
    ]);

    const baseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

    try {
      if (activeWorkflow === "issue") {
        const isUrl = userMsg.includes("github.com") && userMsg.includes("/issues/");
        const payload = isUrl
          ? { repo_url: repoUrl, issue_url: userMsg }
          : { repo_url: repoUrl, issue_text: userMsg, issue_title: userMsg.slice(0, 80) };

        const res = await fetch(`${baseUrl}/api/analyze-issue?generate_patch=${generatePatch}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `Server error (${res.status})`);
        }

        const data = await res.json();
        // Discard response if a newer request has already been issued
        if (requestId !== currentRequestIdRef.current) return;
        setMessages(prev => [...prev, { role: "assistant", type: "issue_analysis", data }]);

      } else {
        // activeWorkflow === "repo"
        // Codebase analysis & questions call POST /api/ask
        const res = await fetch(`${baseUrl}/api/ask`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
          },
          body: JSON.stringify({ repo_url: repoUrl, question: userMsg }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `Server error (${res.status})`);
        }

        const data = await res.json();
        // Discard response if a newer request has already been issued
        if (requestId !== currentRequestIdRef.current) return;
        setMessages(prev => [...prev, { role: "assistant", type: "qa_answer", data }]);
      }
    } catch (err) {
      if (requestId !== currentRequestIdRef.current) return;
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          type: "text",
          content: `[ERROR] ${err.message || "Failed to reach backend. Check your connection."}`,
        }
      ]);
    } finally {
      if (requestId === currentRequestIdRef.current) {
        setIsTyping(false);
      }
    }
  };

  return (
    <motion.div
      key="chat"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        width: "100vw", height: "100vh",
        display: "flex", flexDirection: "column",
        position: "relative", zIndex: 2,
        background: "rgba(0,5,1,0.93)",
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "13px 28px",
        borderBottom: "1px solid rgba(0,255,65,0.1)",
        background: "rgba(0,12,3,0.9)",
        backdropFilter: "blur(10px)",
        flexShrink: 0,
        zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            border: "1px solid rgba(0,180,50,0.35)", borderRadius: 3,
            padding: "5px 10px", display: "flex", alignItems: "center", gap: 6,
            background: "rgba(0,180,50,0.06)",
          }}>
            <GitBranch size={15} color="#00ff41" />
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, color: "#00cc2e" }}>
              {cleanRepoName.toUpperCase()}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "#00b432",
              boxShadow: "0 0 6px #00b432",
              display: "inline-block",
              animation: "blink 2s step-end infinite",
            }} />
            <span style={{ fontSize: 10, color: "#005015", letterSpacing: 2 }}>INDEX ACTIVE</span>
          </div>
        </div>
        <button
          onClick={onReset}
          style={{
            background: "transparent", border: "1px solid rgba(0,255,65,0.15)",
            borderRadius: 3, padding: "6px 14px", color: "#005015",
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            cursor: "pointer", letterSpacing: 1, transition: "all 0.2s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#00b432"; e.currentTarget.style.color = "#00cc2e"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.15)"; e.currentTarget.style.color = "#005015"; }}
        >
          [SWITCH REPO]
        </button>
      </div>

      {/* Messages */}
      <div
        className="chat-scroll"
        style={{
          flex: 1, padding: "24px 28px 16px",
          display: "flex", flexDirection: "column", gap: 20,
          overflowX: "hidden",
        }}
      >
        {/* Welcome screen visible at top */}
        <WelcomePanel
          repoName={cleanRepoName}
          activeWorkflow={activeWorkflow}
          onSelectWorkflow={setActiveWorkflow}
          onSelectPrompt={handleSelectPrompt}
        />

        {activeWorkflow === "ranked_issues" && (
          <div style={{ width: "100%", marginBottom: 12 }}>
            <RankedIssuesView
              data={rankedIssuesData}
              loadingPhase={rankedIssuesLoadingPhase}
              error={rankedIssuesError}
              onRefresh={() => handleFetchRankedIssues(issuesLimit, deepTopN)}
              limit={issuesLimit}
              onLimitChange={(newLimit) => {
                setIssuesLimit(newLimit);
                handleFetchRankedIssues(newLimit, deepTopN);
              }}
              deepTopN={deepTopN}
              onDeepTopNChange={(newTopN) => {
                setDeepTopN(newTopN);
                handleFetchRankedIssues(issuesLimit, newTopN);
              }}
              repoName={cleanRepoName}
              repoUrl={repoUrl}
            />
          </div>
        )}

        {messages.map((msg, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            {msg.role === "assistant" && (
              <div style={{ display: "flex", flexDirection: "column", width: (msg.type === "text" || msg.type === "welcome_init") ? "auto" : "100%", maxWidth: (msg.type === "text" || msg.type === "welcome_init") ? "80%" : "100%", gap: 4 }}>
                <span style={{ fontSize: 10, color: "#005015", letterSpacing: 2, paddingLeft: 2 }}>
                  MENTOR@CONTRIB $
                </span>
                {(msg.type === "text" || msg.type === "welcome_init") && (
                  <div style={{
                    background: "rgba(0,10,2,0.6)",
                    border: "1px solid rgba(0,200,50,0.12)",
                    borderRadius: "0 5px 5px 5px",
                    padding: "13px 17px",
                    boxShadow: "inset 0 0 30px rgba(0,0,0,0.4)",
                    position:"relative",
                    overflow:"hidden"
                  }}>
                    <div className="scanline-fast" />
                    <div style={{
                      position: "relative",
                      zIndex: 1,
                      lineHeight: 1.8,
                      fontSize: 13,
                    }}>
                      <MarkdownContent content={msg.content} />
                    </div>
                  </div>
                )}
                {msg.type === "issue_analysis" && <IssueAnalysisCard data={msg.data} />}
                {msg.type === "qa_answer" && (
                  <QAAnswerCard
                    data={msg.data}
                    repoUrl={repoUrl}
                    repoName={cleanRepoName}
                  />
                )}
              </div>
            )}

            {msg.role === "user" && (
              <div style={{ display: "flex", flexDirection: "column", maxWidth: "68%", gap: 4, alignItems: "flex-end" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {msg.patchRequested && <Badge label="PATCH REQUESTED" color="yellow" />}
                  <Badge label={msg.workflow === "issue" ? "ISSUE MODE" : "REPO MODE"} color="muted" />
                  <span style={{ fontSize: 10, color: "#004010", letterSpacing: 2 }}>
                    YOU $
                  </span>
                </div>
                <div style={{
                  background: "transparent",
                  border: "1px solid rgba(0,160,45,0.35)",
                  borderRadius: "5px 0 5px 5px",
                  padding: "11px 15px",
                }}>
                  <p style={{
                    whiteSpace: "pre-wrap", lineHeight: 1.7,
                    fontSize: 13, color: "#31a400",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {msg.content}
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        ))}

        {isTyping && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex" }}>
            <div style={{
              border: "1px solid rgba(0,255,65,0.1)", borderRadius: "0 5px 5px 5px",
              padding: "13px 17px", display: "flex", alignItems: "center", gap: 5,
              background: "rgba(0,15,4,0.7)",
            }}>
              {[0, 150, 300].map((delay, i) => (
                <motion.span
                  key={i}
                  animate={{ opacity: [0.2, 1, 0.2], scaleY: [0.4, 1, 0.4] }}
                  transition={{ repeat: Infinity, duration: 0.9, delay: delay / 1000 }}
                  style={{
                    display: "inline-block", width: 3, height: 13,
                    background: "#00b432", boxShadow: "0 0 5px #00b432", borderRadius: 1,
                  }}
                />
              ))}
              <span style={{ fontSize: 11, color: "#026e1f", marginLeft: 8, letterSpacing: 1 }}>
                processing request...
              </span>
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer Area */}
      <div style={{
        padding: "14px 28px 18px",
        borderTop: "1px solid rgba(0,255,65,0.1)",
        background: "rgba(0,8,2,0.95)",
        flexShrink: 0,
      }}>
        {/* Workflow Selector Bar */}
        <WorkflowSelector
          activeWorkflow={activeWorkflow}
          onSelectWorkflow={setActiveWorkflow}
          generatePatch={generatePatch}
          onTogglePatch={setGeneratePatch}
        />

        {/* Suggestion Chips */}
        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "#005015", letterSpacing: 1 }}>SUGGESTIONS:</span>
          {prompts.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelectPrompt(p)}
              disabled={isTyping}
              style={{
                background: "rgba(0,255,65,0.03)",
                border: "1px solid rgba(0,255,65,0.12)",
                borderRadius: 2,
                color: "#00aa28",
                fontSize: 11,
                padding: "3px 8px",
                cursor: isTyping ? "not-allowed" : "pointer",
                fontFamily: "'JetBrains Mono', monospace",
                transition: "all 0.15s ease",
                textAlign: "left",
              }}
              onMouseEnter={e => {
                if (!isTyping) {
                  e.currentTarget.style.borderColor = "rgba(0,255,65,0.4)";
                  e.currentTarget.style.color = "#00ff41";
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "rgba(0,255,65,0.12)";
                e.currentTarget.style.color = "#00aa28";
              }}
            >
              {p}
            </button>
          ))}
        </div>

        <form onSubmit={handleSendMessage}>
          <div style={{
            display: "flex", alignItems: "flex-end",
            border: "1px solid rgba(0,180,50,0.28)",
            borderRadius: 4,
            background: "rgba(0,15,4,0.6)",
            padding: "11px 13px", gap: 11,
            transition: "box-shadow 0.2s, border-color 0.2s",
          }}
            onFocusCapture={e => {
              e.currentTarget.style.borderColor = "rgba(0,180,50,0.5)";
              e.currentTarget.style.boxShadow = "0 0 0 1px rgba(0,150,40,0.1), inset 0 0 20px rgba(0,0,0,0.3)";
            }}
            onBlurCapture={e => {
              e.currentTarget.style.borderColor = "rgba(0,180,50,0.28)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <span style={{ color: "#005a15", fontSize: 13, paddingBottom: 1, flexShrink: 0 }}>▶</span>
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              disabled={isTyping}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
              placeholder={composerPlaceholder}
              className="terminal-input"
              style={{ fontSize: 13, lineHeight: 1.5, flex: 1 }}
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              style={{
                background: input.trim() && !isTyping ? "rgba(0,180,50,0.85)" : "transparent",
                border: `1px solid ${input.trim() && !isTyping ? "rgba(0,180,50,0.6)" : "rgba(0,255,65,0.12)"}`,
                borderRadius: 3, width: 34, height: 34,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: input.trim() && !isTyping ? "pointer" : "not-allowed",
                flexShrink: 0, transition: "all 0.2s",
                boxShadow: input.trim() && !isTyping ? "0 0 10px rgba(0,150,40,0.25)" : "none",
              }}
            >
              <Send size={14} color={input.trim() && !isTyping ? "#000" : "#004010"} strokeWidth={2.5} />
            </button>
          </div>
          <div style={{ marginTop: 7, fontSize: 10, color: "#004010", letterSpacing: 0.5, paddingLeft: 2 }}>
            ENTER to send · SHIFT+ENTER for newline · {activeWorkflow === "issue" ? "Describe a bug, paste an error, or enter a GitHub issue URL" : "Ask architecture & quality questions, or run a full repo audit"}
          </div>
        </form>
      </div>
    </motion.div>
  );
}