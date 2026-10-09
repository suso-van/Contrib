/**
 * Centralized API service for Contrib frontend
 * Handles communication with the remote backend
 */

export function getApiBaseUrl() {
  let url = '';
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) {
      url = import.meta.env.VITE_API_URL;
    } else if (typeof globalThis !== 'undefined' && globalThis.process && globalThis.process.env && globalThis.process.env.VITE_API_URL) {
      // Safe fallback for Node-based test runners without triggering process ReferenceError in browser
      url = globalThis.process.env.VITE_API_URL;
    }
  } catch {
    url = '';
  }
  return String(url || '').trim().replace(/\/+$/, '');
}

/**
 * Step A: Ensure repository is cloned/indexed and cached on backend
 */
export async function ensureRepoLoaded(repoUrl, onProgress) {
  if (!repoUrl) throw new Error('Repository URL is required');
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new Error('Backend API URL is not configured (missing VITE_API_URL).');
  }

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
    throw new Error(errData.detail || `Repository load failed (${res.status})`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (data.status === 'error') {
      throw new Error(data.detail || 'Repository loading error');
    }
    return data;
  }

  // Handle NDJSON stream
  if (!res.body) return { status: 'ready' };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (onProgress && event.status) {
          onProgress(event.status);
        }
        if (event.status === 'error') {
          throw new Error(event.detail || 'Repository loading error');
        }
        if (event.status === 'ready' || event.status === 'done' || event.status === 'cached') {
          return event;
        }
      } catch (e) {
        if (e.message?.includes('Repository loading error') || e.message?.includes('Git clone failed')) {
          throw e;
        }
      }
    }
  }

  return { status: 'ready' };
}

/**
 * Step B: Retrieve ranked GitHub issues from POST /api/repo-issues
 */
export async function fetchRankedIssues(repoUrl, { limit = 50, deepTopN = 5 } = {}) {
  if (!repoUrl) throw new Error('Repository URL is required');
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new Error('Backend API URL is not configured (missing VITE_API_URL).');
  }

  const res = await fetch(`${baseUrl}/api/repo-issues`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify({
      repo_url: repoUrl,
      limit: Number(limit) || 50,
      deep_top_n: Number(deepTopN) || 5,
      stream: false,
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    let msg = errData.detail || `Failed to fetch repository issues (${res.status})`;
    if (typeof msg === 'object') msg = JSON.stringify(msg);
    throw new Error(msg);
  }

  return await res.json();
}
