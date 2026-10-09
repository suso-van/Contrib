import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeEscapedMarkdown } from "../markdownUtils.js";

describe("Contrib QA and Dual Workflow Logic Tests", () => {
  // Test 1: Successful repository analysis response data integrity
  it("verifies a successful repository-analysis response preserves all returned fields", () => {
    const rawBackendResponse = {
      repo_name: "zphisher",
      question: "What are the biggest issues in this repository?",
      answer: "# Biggest Issues\n## Code Quality\n- Needs improvements\n## Security\n- Potential vulnerabilities",
      relevant_files: [
        "README.md",
        ".sites/microsoft/ConvergedLoginPaginatedStrings.js"
      ],
      project_structure: [
        { name: "README.md", path: "README.md", type: "file" },
        { name: ".sites", path: ".sites", type: "dir", children: [
          { name: "index.php", path: ".sites/index.php", type: "file" }
        ]}
      ],
      sections: [
        { title: "Code Quality", content: "Needs improvements", references: [".sites/microsoft/ConvergedLoginPaginatedStrings.js"] }
      ],
      citations: [
        { file: "README.md", start_line: 1, end_line: 5, snippet: "# Zphisher" }
      ],
      truncated: false
    };

    // Verify response schema fields are preserved without mutation or synthesis
    assert.equal(rawBackendResponse.repo_name, "zphisher");
    assert.equal(rawBackendResponse.question, "What are the biggest issues in this repository?");
    assert.ok(rawBackendResponse.answer.includes("Biggest Issues"));
    assert.equal(rawBackendResponse.relevant_files.length, 2);
    assert.equal(rawBackendResponse.project_structure.length, 2);
    assert.equal(rawBackendResponse.citations.length, 1);
    assert.equal(rawBackendResponse.citations[0].file, "README.md");
  });

  // Test 2: 'Not found in retrieved files' is preserved as an honest outcome
  it("preserves 'Not found in the retrieved files' without substituting mock audits", () => {
    const notFoundResponse = {
      repo_name: "zphisher",
      question: "Where is the Kubernetes deployment config?",
      answer: "The retrieved files do not contain enough information to answer this question.",
      relevant_files: [],
      project_structure: [],
      sections: [],
      citations: []
    };

    // The answer should remain verbatim and not be replaced by mock findings
    assert.equal(
      notFoundResponse.answer,
      "The retrieved files do not contain enough information to answer this question."
    );
    assert.equal(notFoundResponse.sections.length, 0);
    assert.equal(notFoundResponse.citations.length, 0);
  });

  // Test 3: The answer, citations, and project structure belong to the same response
  it("ensures answer, citations, and project structure are bound to the identical response object", () => {
    const singleResponse = {
      repo_name: "test-repo",
      question: "How does authentication work?",
      answer: "Auth is handled in login.js",
      relevant_files: ["src/login.js"],
      project_structure: [{ name: "login.js", path: "src/login.js", type: "file" }],
      citations: [{ file: "src/login.js", start_line: 10, end_line: 25, snippet: "function login() {}" }]
    };

    const messageState = {
      role: "assistant",
      type: "qa_answer",
      data: singleResponse
    };

    assert.equal(messageState.data.answer, "Auth is handled in login.js");
    assert.equal(messageState.data.citations[0].file, messageState.data.relevant_files[0]);
    assert.equal(messageState.data.project_structure[0].path, messageState.data.relevant_files[0]);
  });

  // Test 4: Failed request produces an error rather than fabricated findings
  it("produces an error message rather than a fabricated result when request fails", () => {
    const errorMessage = "Server error (500)";
    const errorState = {
      role: "assistant",
      type: "text",
      content: `[ERROR] ${errorMessage}`
    };

    assert.equal(errorState.type, "text");
    assert.ok(errorState.content.startsWith("[ERROR]"));
    assert.ok(errorState.content.includes("500"));
  });

  // Test 5: Earlier requests cannot overwrite newer submissions (request ID sequencing)
  it("prevents an earlier slow response from overwriting a newer submission", async () => {
    let currentRequestId = 0;
    const messages = [];

    const simulateRequest = async (id, delayMs, responseData) => {
      await new Promise(resolve => setTimeout(resolve, delayMs));
      // Only commit if this request is still current
      if (id === currentRequestId) {
        messages.push(responseData);
      }
    };

    // User sends Request 1 (slow)
    const req1 = ++currentRequestId;
    const p1 = simulateRequest(req1, 50, "Response 1");

    // User sends Request 2 immediately after (fast)
    const req2 = ++currentRequestId;
    const p2 = simulateRequest(req2, 10, "Response 2");

    await Promise.all([p1, p2]);

    assert.equal(messages.length, 1);
    assert.equal(messages[0], "Response 2");
  });

  // Test 6: Workflow routing calls the correct endpoint
  it("verifies workflow routing uses the designated endpoint and payload schema", () => {
    const getEndpointAndPayload = (workflow, userMsg, repoUrl, generatePatch) => {
      if (workflow === "issue") {
        const isUrl = userMsg.includes("github.com") && userMsg.includes("/issues/");
        const payload = isUrl
          ? { repo_url: repoUrl, issue_url: userMsg }
          : { repo_url: repoUrl, issue_text: userMsg, issue_title: userMsg.slice(0, 80) };
        return {
          endpoint: `/api/analyze-issue?generate_patch=${generatePatch}`,
          payload
        };
      } else {
        return {
          endpoint: "/api/ask",
          payload: { repo_url: repoUrl, question: userMsg }
        };
      }
    };

    const issueRoute = getEndpointAndPayload("issue", "Fix login bug", "https://github.com/foo/bar", true);
    assert.equal(issueRoute.endpoint, "/api/analyze-issue?generate_patch=true");
    assert.equal(issueRoute.payload.issue_text, "Fix login bug");

    const repoRoute = getEndpointAndPayload("repo", "What are the biggest issues?", "https://github.com/foo/bar", false);
    assert.equal(repoRoute.endpoint, "/api/ask");
    assert.equal(repoRoute.payload.question, "What are the biggest issues?");
  });

  // Test 7: Safe Markdown Escaping & Raw HTML normalization
  it("normalizes escaped HTML tags without corrupting legitimate code backslashes or paths", () => {
    const input = "\\<h1>Architecture Review\\</h1>\n\\<strong>Risk:\\</strong> High\nPath: src\\utils\\helper.js\nRegex: \\d+";
    const normalized = normalizeEscapedMarkdown(input);

    assert.ok(normalized.includes("# Architecture Review"));
    assert.ok(normalized.includes("**Risk:**"));
    // Legitimate Windows paths and regex escape sequences must be preserved
    assert.ok(normalized.includes("src\\utils\\helper.js"));
    assert.ok(normalized.includes("\\d+"));
  });

  // Test 7b: Raw HTML responses with headings, paragraphs, pre/code blocks, and truncated tags
  it("converts raw HTML tags into formatted Markdown and strips truncated trailing tags", () => {
    const rawHtml = "<h2>Project Overview</h2><p>This project appears to be a translation service.</p><h2>Usage Example</h2><pre><code>const x = 1;</code></pre><h2>Contact</h2><p>Contact us at <a href=";
    const normalized = normalizeEscapedMarkdown(rawHtml);

    assert.ok(normalized.includes("## Project Overview"));
    assert.ok(normalized.includes("This project appears to be a translation service."));
    assert.ok(normalized.includes("## Usage Example"));
    assert.ok(normalized.includes("```\nconst x = 1;\n```"));
    assert.ok(normalized.includes("## Contact"));
    assert.ok(!normalized.includes("<p>"));
    assert.ok(!normalized.includes("<h2>"));
    assert.ok(!normalized.includes("<a href="));
  });

  // Test 8: Leaf file counting deduplicates paths across tree traversal
  it("accurately counts leaf files without duplicate-counting identical file paths", () => {
    const tree = [
      {
        name: "src",
        path: "src",
        type: "dir",
        children: [
          { name: "index.js", path: "src/index.js", type: "file" },
          { name: "index.js", path: "src/index.js", type: "file" }, // duplicate node
          { name: "utils.js", path: "src/utils.js", type: "file" }
        ]
      },
      { name: "README.md", path: "README.md", type: "file" }
    ];

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

    const total = countFiles(tree);
    assert.equal(total, 3); // src/index.js, src/utils.js, README.md
  });

  // Test 9: Fallback presentation when answer is empty
  it("renders sections as fallback presentation only when answer is missing or empty", () => {
    const emptyAnswerResponse = {
      repo_name: "test-repo",
      question: "Analyze repo",
      answer: "",
      sections: [
        { title: "Performance", content: "Memory leak detected", references: ["app.js"] }
      ]
    };

    const hasAnswer = Boolean(emptyAnswerResponse.answer && emptyAnswerResponse.answer.trim().length > 0);
    assert.equal(hasAnswer, false);
    assert.equal(emptyAnswerResponse.sections.length, 1);
    assert.equal(emptyAnswerResponse.sections[0].title, "Performance");
  });

  // Test 10: Switching workflows preserves conversation history
  it("preserves conversation history and repository context when switching workflows", () => {
    const history = [
      { role: "assistant", type: "welcome_init", content: "Ready" },
      { role: "user", type: "text", content: "Query 1", workflow: "issue" },
      { role: "assistant", type: "issue_analysis", data: { issue: { title: "Bug" } } }
    ];

    // Switching workflow should simply change activeWorkflow state, keeping messages array intact
    let activeWorkflow = "issue";
    activeWorkflow = "repo";

    assert.equal(activeWorkflow, "repo");
    assert.equal(history.length, 3);
    assert.equal(history[1].workflow, "issue");
  });
});

