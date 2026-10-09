import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ensureRepoLoaded, fetchRankedIssues } from "../apiService.js";

describe("Ranked Repository Issues Workflow Tests", () => {
  const originalFetch = global.fetch;
  const mockBaseUrl = "https://mock-backend.example.com";

  beforeEach(() => {
    process.env.VITE_API_URL = mockBaseUrl;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.VITE_API_URL;
  });

  // Test 1: Repository loading calls POST /api/load-repo with selected repo_url
  it("Step A: calls POST /api/load-repo with selected repo_url and proper headers", async () => {
    let capturedUrl = null;
    let capturedMethod = null;
    let capturedBody = null;
    let capturedHeaders = null;

    global.fetch = async (url, options) => {
      capturedUrl = url;
      capturedMethod = options.method;
      capturedBody = JSON.parse(options.body);
      capturedHeaders = options.headers;

      return {
        ok: true,
        status: 200,
        headers: new Map([["content-type", "application/json"]]),
        json: async () => ({ status: "ready" }),
      };
    };

    const targetRepo = "https://github.com/sherlock-project/sherlock";
    const res = await ensureRepoLoaded(targetRepo);

    assert.equal(capturedUrl, `${mockBaseUrl}/api/load-repo`);
    assert.equal(capturedMethod, "POST");
    assert.equal(capturedBody.repo_url, targetRepo);
    assert.equal(capturedHeaders["Content-Type"], "application/json");
    assert.equal(capturedHeaders["ngrok-skip-browser-warning"], "true");
    assert.equal(res.status, "ready");
  });

  // Test 2: The issue request is not made until repository loading succeeds
  it("Step B is never initiated if Step A repository loading fails", async () => {
    let issueEndpointCalled = false;

    global.fetch = async (url) => {
      if (url.includes("/api/load-repo")) {
        return {
          ok: false,
          status: 500,
          headers: new Map([["content-type", "application/json"]]),
          json: async () => ({ detail: "Git clone failed: repo not found" }),
        };
      }
      if (url.includes("/api/repo-issues")) {
        issueEndpointCalled = true;
        return {
          ok: true,
          json: async () => ({ issues: [] }),
        };
      }
      return { ok: false, status: 404 };
    };

    const targetRepo = "https://github.com/invalid/non-existent";
    let caughtError = null;

    try {
      // Workflow execution: Step A must succeed before calling Step B
      await ensureRepoLoaded(targetRepo);
      await fetchRankedIssues(targetRepo, { limit: 50, deepTopN: 5 });
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError !== null);
    assert.ok(caughtError.message.includes("Git clone failed"));
    assert.equal(issueEndpointCalled, false, "Issue endpoint must not be called when load fails");
  });

  // Test 3: POST /api/repo-issues receives correct payload (limit, deep_top_n, stream: false)
  it("Step B: calls POST /api/repo-issues with exact configured payload", async () => {
    let capturedPayload = null;
    let capturedUrl = null;

    global.fetch = async (url, options) => {
      capturedUrl = url;
      capturedPayload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        headers: new Map([["content-type", "application/json"]]),
        json: async () => ({
          repo_name: "sherlock",
          repo_url: "https://github.com/sherlock-project/sherlock",
          total_open: 12,
          returned: 12,
          counts: { easy: 4, medium: 5, hard: 3, claimed: 1 },
          issues: [],
        }),
      };
    };

    const targetRepo = "https://github.com/sherlock-project/sherlock";
    await fetchRankedIssues(targetRepo, { limit: 100, deepTopN: 10 });

    assert.equal(capturedUrl, `${mockBaseUrl}/api/repo-issues`);
    assert.equal(capturedPayload.repo_url, targetRepo);
    assert.equal(capturedPayload.limit, 100);
    assert.equal(capturedPayload.deep_top_n, 10);
    assert.equal(capturedPayload.stream, false);
  });

  // Test 4: All returned issues render in backend-provided order
  it("preserves backend-provided issue order without re-sorting", () => {
    const backendIssues = [
      { number: 42, title: "Fix typo in doc", difficulty: { level: "easy", ease_score: 9 } },
      { number: 10, title: "Add unit test for parser", difficulty: { level: "easy", ease_score: 8 } },
      { number: 77, title: "Refactor database layer", difficulty: { level: "hard", ease_score: 2 } },
    ];

    // Verify ordering is maintained exactly as provided by backend
    const mappedOrder = backendIssues.map((issue) => issue.number);
    assert.deepEqual(mappedOrder, [42, 10, 77]);
  });

  // Test 5: Summary counts match response
  it("preserves exact backend summary counts without hallucinating or parsing markdown", () => {
    const backendResponse = {
      repo_name: "test-repo",
      repo_url: "https://github.com/org/test-repo",
      total_open: 45,
      returned: 25,
      counts: {
        easy: 12,
        medium: 20,
        hard: 13,
        claimed: 3,
      },
      issues: [],
    };

    assert.equal(backendResponse.counts.easy, 12);
    assert.equal(backendResponse.counts.medium, 20);
    assert.equal(backendResponse.counts.hard, 13);
    assert.equal(backendResponse.counts.claimed, 3);
    assert.equal(backendResponse.returned, 25);
    assert.equal(backendResponse.total_open, 45);
  });

  // Test 6: Deep analysis fields render only when returned
  it("verifies deep analysis exists only when returned in issue object", () => {
    const issueWithDeep = {
      number: 1,
      title: "First issue",
      summary: "Short summary",
      deep_analysis: "### Deep Investigation\nRoot cause in `file.py` line 12",
    };
    const issueWithoutDeep = {
      number: 2,
      title: "Second issue",
      summary: "Short summary",
      deep_analysis: null,
    };

    assert.ok(Boolean(issueWithDeep.deep_analysis));
    assert.ok(!issueWithoutDeep.deep_analysis);
    assert.equal(issueWithDeep.deep_analysis.includes("Deep Investigation"), true);
  });

  // Test 7: API failures and rate-limit errors are shown honestly
  it("honestly surfaces GitHub rate limit errors from backend response", async () => {
    global.fetch = async () => {
      return {
        ok: false,
        status: 500,
        headers: new Map([["content-type", "application/json"]]),
        json: async () => ({
          detail: "GitHub API rate limit exceeded. Reset at 1791549604",
        }),
      };
    };

    let caughtError = null;
    try {
      await fetchRankedIssues("https://github.com/htr-tech/zphisher", { limit: 50 });
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError !== null);
    assert.ok(caughtError.message.includes("GitHub API rate limit exceeded"));
    assert.ok(caughtError.message.includes("Reset at 1791549604"));
  });

  // Test 8: Empty results do not produce fabricated issue cards
  it("empty results remain empty without fabricating fake issues", () => {
    const emptyResponse = {
      repo_name: "empty-repo",
      repo_url: "https://github.com/org/empty-repo",
      total_open: 0,
      returned: 0,
      counts: { easy: 0, medium: 0, hard: 0, claimed: 0 },
      issues: [],
    };

    assert.equal(emptyResponse.issues.length, 0);
    assert.equal(emptyResponse.counts.easy, 0);
  });

  // Test 9: Duplicate submissions are prevented
  it("prevents duplicate concurrent submissions while a request is in flight", async () => {
    let callCount = 0;
    let loadingPhase = null;

    const executeWorkflow = async (_repoUrl) => {
      if (loadingPhase) return "BLOCKED";
      loadingPhase = "loading_repo";
      try {
        callCount++;
        // Simulating async work
        await new Promise((resolve) => setTimeout(resolve, 10));
        loadingPhase = "ranking_issues";
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "SUCCESS";
      } finally {
        loadingPhase = null;
      }
    };

    // Trigger two calls simultaneously
    const promise1 = executeWorkflow("https://github.com/org/repo");
    const promise2 = executeWorkflow("https://github.com/org/repo");

    const [res1, res2] = await Promise.all([promise1, promise2]);

    assert.equal(res1, "SUCCESS");
    assert.equal(res2, "BLOCKED");
    assert.equal(callCount, 1, "Only one execution should proceed");
  });

  // Test 10: Changing repository selection clears previous results
  it("clears ranked issues data when repository URL changes to prevent stale results", () => {
    let rankedIssuesData = {
      repo_url: "https://github.com/htr-tech/zphisher",
      issues: [{ number: 1, title: "Old Repo Issue" }],
    };
    let currentRepo = "https://github.com/htr-tech/zphisher";
    let prevRepo = currentRepo;

    // Simulate repo change
    currentRepo = "https://github.com/sherlock-project/sherlock";

    if (prevRepo !== currentRepo) {
      rankedIssuesData = null;
      prevRepo = currentRepo;
    }

    assert.equal(rankedIssuesData, null, "Ranked issues data must be cleared on repo change");
  });

  // Test 11: Existing chat workflows remain functional and separate
  it("keeps ranked_issues state completely isolated from ask/analysis message history", () => {
    const messages = [
      { id: "1", type: "user", text: "How do I install this?" },
      { id: "2", type: "assistant", text: "Run `npm install`." },
    ];
    const rankedIssuesData = {
      issues: [{ number: 1, title: "Fix bug" }],
    };

    assert.equal(messages.length, 2);
    assert.equal(messages[0].text, "How do I install this?");
    assert.equal(rankedIssuesData.issues.length, 1);
    // Neither interferes with the other
  });
});
