import asyncio
import logging
import os
import tempfile
import traceback
import subprocess
import httpx
import re
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi import Request
import json

from schemas import AnalyzeRequest, RepoLoadRequest, RepoQARequest
from utils import validate_github_url, get_repo_name, fetch_github_issue

def normalize_repo_url(url: str) -> str:
    url = url.rstrip("/")
    if url.endswith(".git"):
        url = url[:-4]
    return url.rstrip("/")

from gitingest import ingest_async
from services import (
  repo_cache,
  build_query_engine_async,
  run_issue_analyzer,
  run_retrieval_agent,
  run_reasoning_agent,
  run_repo_qa,
)
from limiter import limiter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

_indexing_in_progress: dict[str, asyncio.Event] = {}

async def _stream_status(steps: list[tuple[str, any]]) -> AsyncGenerator[str, None]:
  """
  Yield newline-delimited JSON status events for SSE / chunked streaming.

  Each step is a (status_label, coroutine_or_value) tuple.  The coroutine is
  awaited and its result is sent in the final ``done`` event.
  """
  for label, coro in steps:
    yield json.dumps({"status": label}) + "\n"
    await asyncio.sleep(0)
    if asyncio.iscoroutine(coro):
      result = await coro
    else:
      result = coro
  yield json.dumps({"status": "done", "result": result}) + "\n"

async def check_repo_size(repo_url: str, max_mb: int = 500) -> bool:
  """Check the GitHub API to ensure the repo isn't too massive to process."""
  try:
    from utils import parse_github_issue_url
    pattern = r"https://github\.com/([^/]+)/([^/]+)"
    m = re.match(pattern, repo_url.rstrip("/"))
    if not m:
      return True

    owner, repo = m.group(1), m.group(2)
    api_url = f"https://api.github.com/repos/{owner}/{repo}"

    async with httpx.AsyncClient(timeout=10) as client:
      resp = await client.get(api_url)
      if resp.status_code == 200:
        size_kb = resp.json().get("size", 0)
        if (size_kb / 1024) > max_mb:
          raise HTTPException(
            400,
            f"Repository is too large ({(size_kb / 1024):.1f}MB). Maximum allowed is {max_mb}MB."
          )
    return True
  except Exception as e:
    logger.warning(f"Could not verify repo size: {e}")
    return True

@router.post("/load-repo")
@limiter.limit("5/minute")
async def load_repo(request: Request, req: RepoLoadRequest):
  """
  Clone and index a GitHub repository.

  Behaviour:
  - Already in memory → returns immediately as ``"cached"``.
  - Currently being indexed by another request → waits for it to finish.
  - ChromaDB collection exists but not in memory → reloads without cloning.
  - Fresh repo → clones, ingests, indexes asynchronously.

  Returns progressive JSON status events as a streaming response so the
  frontend can show live progress feedback.
  """
  if not validate_github_url(req.repo_url):
    raise HTTPException(400, "Invalid GitHub URL")

  await check_repo_size(req.repo_url, max_mb=300)

  cache_key = normalize_repo_url(req.repo_url)
  repo_name = get_repo_name(req.repo_url)

  if cache_key in repo_cache:
    entry = repo_cache[cache_key]
    return {
      "status":    "cached",
      "repo_name": repo_name,
      "summary":   entry["summary"],
      "tree":      entry["tree"],
    }

  if cache_key in _indexing_in_progress:
    logger.info(f"Waiting for in-progress indexing of {cache_key} …")
    await _indexing_in_progress[cache_key].wait()
    if cache_key in repo_cache:
      entry = repo_cache[cache_key]
      return {
        "status":    "cached",
        "repo_name": repo_name,
        "summary":   entry["summary"],
        "tree":      entry["tree"],
      }
    raise HTTPException(500, "Indexing finished but repo not found in cache.")

  done_event = asyncio.Event()
  _indexing_in_progress[cache_key] = done_event

  
  async def _do_index():
    try:
      import time
      with tempfile.TemporaryDirectory() as tmp_dir:
        repo_path = os.path.join(tmp_dir, "cloned_repo")
        yield {"status": "cloning", "repo_url": req.repo_url}
        t_clone_start = time.perf_counter()

        process = await asyncio.to_thread(
          subprocess.run,
          ["git", "clone", "--depth=1", req.repo_url, repo_path],
          capture_output=True,
          text=True,
        )
        t_clone = time.perf_counter() - t_clone_start

        if process.returncode != 0:
          raise RuntimeError(f"Git clone failed: {process.stderr.strip()}")
          
        sha_process = await asyncio.to_thread(
            subprocess.run,
            ["git", "rev-parse", "HEAD"],
            cwd=repo_path,
            capture_output=True,
            text=True
        )
        commit_sha = sha_process.stdout.strip()

        yield {"status": "ingesting", "clone_time": t_clone}
        t_ingest_start = time.perf_counter()
        summary, tree, content = await ingest_async(repo_path)
        t_ingest = time.perf_counter() - t_ingest_start

      from services import build_query_engine_progressive
      async for event in build_query_engine_progressive(content, repo_name, commit_sha):
          if event["status"] == "bm25_ready":
              engine_bundle = event["bundle"]
              # We can cache the partial bundle
              repo_cache[cache_key] = {
                  "summary": summary,
                  "tree": tree,
                  "engine_bundle": engine_bundle,
              }
              yield {"status": "bm25_ready", "repo_name": repo_name, "summary": summary, "tree": tree}
          elif event["status"] == "ready":
              engine_bundle = event["bundle"]
              repo_cache[cache_key]["engine_bundle"] = engine_bundle
              yield {"status": "ready", "repo_name": repo_name, "summary": summary, "tree": tree}
          else:
              yield event
    except Exception as exc:
      logger.exception("FULL INGESTION TRACEBACK")
      traceback.print_exc()
      raise exc
    finally:
      done_event.set()
      _indexing_in_progress.pop(cache_key, None)

  return StreamingResponse(
    _progressive_load(cache_key, repo_name, _do_index),
    media_type="application/x-ndjson",
  )


async def _progressive_load(
    cache_key: str,
    repo_name: str,
    index_generator_factory,
) -> AsyncGenerator[str, None]:
    """Yield newline-delimited JSON progress events while indexing runs."""
    try:
        async for event in index_generator_factory():
            yield json.dumps(event) + "\n"
    except Exception as exc:
        yield json.dumps({"status": "error", "detail": repr(exc)}) + "\n"

@router.post("/analyze-issue")
@limiter.limit("20/minute")
async def analyze_issue(
    request: Request,
    req: AnalyzeRequest,
    generate_patch: bool = Query(
        default=False,
        description="Set to true to include an optional unified diff in the response.",
    ),
    stream: bool = Query(
        default=False,
        description="Set to true for newline-delimited JSON progress events.",
    ),
):
    """
    Run the full multi-agent pipeline against a loaded repository.

    With ``stream=true`` the response is a newline-delimited JSON stream where
    each line carries a ``status`` field (``analyzing`` → ``retrieving`` →
    ``reasoning`` → ``done``).  With ``stream=false`` (default) the full result
    is returned as a single JSON object.
    """
    if not validate_github_url(req.repo_url):
        raise HTTPException(400, "Invalid GitHub URL")

    cache_key = normalize_repo_url(req.repo_url)
    if cache_key not in repo_cache:
        raise HTTPException(
            400,
            "Repository not loaded. Call POST /api/load-repo first.",
        )

    entry         = repo_cache[cache_key]
    engine_bundle = entry["engine_bundle"]
    tree          = entry["tree"]
    sources: dict = engine_bundle["sources"]

    issue_title = (
      (req.issue_title or "")
      .strip()
    )

    issue_text = (
      (req.issue_text or "")
      .strip()
    )
    if req.issue_url:
      try:
        from utils import parse_github_issue_url
        from github_issues import get_cached_issue
        
        parsed_issue = parse_github_issue_url(req.issue_url)
        fetched = None
        if parsed_issue:
          owner, repo_name, number = parsed_issue
          r_url = f"https://github.com/{owner}/{repo_name}"
          cached_issue = get_cached_issue(r_url, int(number))
          if cached_issue:
            fetched = {
              "title": cached_issue.get("title", ""),
              "body": cached_issue.get("body", "") or "",
              "labels": [l["name"] for l in cached_issue.get("labels", []) if isinstance(l, dict)],
              "number": cached_issue.get("number")
            }
            
        if not fetched:
          fetched = await fetch_github_issue(req.issue_url)

        issue_title = (
            fetched.get("title") or ""
        ).strip()


        issue_text = (
            fetched.get("body") or ""
        ).strip()

        labels_str = ", ".join(
          fetched.get("labels", [])
        )

        if labels_str:
          issue_text += (
            f"\n\nLabels: {labels_str}"
          )

      except ValueError as exc:

        raise HTTPException(
          400,
          str(exc)
        )

      except Exception as exc:

        logger.error(
          f"GitHub issue fetch failed: {exc}"
        )

        raise HTTPException(
          502,
          f"Could not fetch GitHub issue: {exc}"
        )

    if not any([
      issue_title,
      issue_text,
      req.issue_url,
    ]):
      raise HTTPException(
        status_code=422,
        detail=(
          "Provide either:\n"
          "- issue_title\n"
          "- issue_text\n"
          "- issue_url"
        )
      )

    issue_parts = []

    if issue_title:
      issue_parts.append(
        f"Title: {issue_title}"
      )

    if issue_text:
      issue_parts.append(issue_text)

    issue_full = "\n\n".join(issue_parts).strip()

    meaningful_tokens = re.findall(
      r"[a-zA-Z_]{3,}",
      issue_full
    )

    if len(meaningful_tokens) < 4:
      raise HTTPException(
        status_code=422,
        detail=(
          "Issue description is too short. "
          "Please provide more context."
        )
      )

    repo_name = get_repo_name(req.repo_url)

    async def _run_pipeline():
        analysis_task  = asyncio.to_thread(run_issue_analyzer, tree, issue_full)
        retrieval_task = asyncio.to_thread(run_retrieval_agent, engine_bundle, issue_full)

        analysis, retrieval = await asyncio.gather(analysis_task, retrieval_task)

        from services import compute_complexity_factors
        fix_zone = retrieval.get("most_likely_fix_zone") or {}
        factors = compute_complexity_factors(sources, fix_zone)
        
        if "difficulty" in analysis and isinstance(analysis["difficulty"], dict):
            analysis["difficulty"]["factors"] = factors
            c = factors.get("target_function_complexity", 0)
            if c > 20:
                analysis["difficulty"]["level"] = "hard"
            elif c > 10:
                analysis["difficulty"]["level"] = "medium"
            
        retrieved_file_paths = [
            f["path"] for f in retrieval.get("relevant_files", []) if "path" in f
        ]
        reranker_meta = retrieval.get("reranker") or {}

        reasoning = await asyncio.to_thread(
            run_reasoning_agent,
            tree=tree,
            retrieved_files=retrieved_file_paths,
            sources=sources,
            issue_full=issue_full,
            include_patch=generate_patch,
            reranker_meta=reranker_meta,
        )

        return {
            "repo_name": repo_name,
            "issue": {
            "title": (
                issue_title
                or issue_text[:120]
                or "Untitled Issue"
            ),
            "source": req.issue_url or "manual",
            },
            "analysis":  analysis,
            "retrieval": retrieval,
            "reasoning": reasoning,
            "retrieval_mode": "bm25_only" if engine_bundle.get("is_embedding") else "hybrid"
        }

    if stream:
        return StreamingResponse(
            _streamed_pipeline(issue_full, _run_pipeline),
            media_type="application/x-ndjson",
        )

    return await _run_pipeline()

async def _streamed_pipeline(issue_full: str, pipeline_coro_factory) -> AsyncGenerator[str, None]:
    """Emit progressive status events, then the final result."""
    yield json.dumps({"status": "analyzing"}) + "\n"
    await asyncio.sleep(0)
    yield json.dumps({"status": "retrieving"}) + "\n"
    await asyncio.sleep(0)
    yield json.dumps({"status": "reasoning"}) + "\n"
    await asyncio.sleep(0)
    try:
        result = await pipeline_coro_factory()
        
        if "answer" in result:
            struct = {
                "relevant_files": result.get("relevant_files", []),
                "project_structure": result.get("project_structure", []),
                "sections": result.get("sections", []),
                "citations": result.get("citations", []),
                "timings": result.get("timings", {})
            }
            yield json.dumps({"status": "structured", "result": struct}) + "\n"
            
        yield json.dumps({"status": "done", "result": result}) + "\n"
    except Exception as exc:
        yield json.dumps({"status": "error", "detail": repr(exc)}) + "\n"

@router.get("/repo-tree")
@limiter.limit("5/minute")
async def get_repo_tree(request: Request, repo_url: str):
    cache_key = normalize_repo_url(repo_url)
    if cache_key not in repo_cache:
        raise HTTPException(400, "Repository not loaded.")
    return {
        "project_structure": repo_cache[cache_key]["engine_bundle"].get("project_structure", []),
        "truncated": repo_cache[cache_key]["engine_bundle"].get("truncated", False)
    }

@router.get("/file")
@limiter.limit("30/minute")
async def get_file(request: Request, repo_url: str, path: str):
    cache_key = normalize_repo_url(repo_url)
    if cache_key not in repo_cache:
        raise HTTPException(400, "Repository not loaded.")
    sources = repo_cache[cache_key]["engine_bundle"]["sources"]
    
    # Path traversal protection
    path = path.replace("\\", "/")
    if ".." in path or path.startswith("/"):
        raise HTTPException(400, "Invalid path")
        
    if path not in sources:
        raise HTTPException(404, "File not found in indexed set")
        
    content = sources[path]
    if len(content) > 200 * 1024:
        raise HTTPException(400, "File too large")
        
    ext = path.split(".")[-1] if "." in path else ""
    return {
        "path": path,
        "language": ext,
        "content": content,
        "line_count": content.count("\n") + 1
    }

@router.post("/ask")
@limiter.limit("30/minute")
async def ask_repo(request: Request,req: RepoQARequest):
    """Ask a general question about a loaded repository."""
    if not validate_github_url(req.repo_url):
        raise HTTPException(400, "Invalid GitHub URL")

    cache_key = normalize_repo_url(req.repo_url)
    if cache_key not in repo_cache:
        raise HTTPException(
            400,
            "Repository not loaded. Call POST /api/load-repo first.",
        )

    entry         = repo_cache[cache_key]
    engine_bundle = entry["engine_bundle"]

    qa_result = await asyncio.to_thread(run_repo_qa, engine_bundle, req.question)
    
    return {
        "repo_name":      get_repo_name(req.repo_url),
        "question":       req.question,
        "answer":         qa_result["answer"],
        "relevant_files": qa_result["relevant_files"],
        "project_structure": qa_result.get("project_structure", []),
        "sections": qa_result.get("sections", []),
        "citations": qa_result.get("citations", []),
        "truncated": qa_result.get("truncated", False),
        "retrieval_mode": "bm25_only" if engine_bundle.get("is_embedding") else "hybrid"
    }

@router.get("/repo-status")
@limiter.limit("5/minute")
async def repo_status(request: Request,):
    """Return metadata about every repository currently held in memory."""
    repos = []
    for url, entry in repo_cache.items():
        bundle  = entry.get("engine_bundle", {})
        sources = bundle.get("sources", {})
        repos.append({
            "url":        url,
            "repo_name":  get_repo_name(url),
            "file_count": len(sources),
            "has_bm25":   bundle.get("bm25") is not None,
        })
    return {"cached_repos": repos}

@router.get("/health")
async def health(request: Request,):
    in_progress = list(_indexing_in_progress.keys())
    return {
        "status":       "ok",
        "cached_repos": list(repo_cache.keys()),
        "indexing":     in_progress,
    }
@router.post("/analyze-repo")
async def analyze_repo(req: RepoLoadRequest):
    """Broad review of architecture, risks, quality, docs, dependencies."""
    if not validate_github_url(req.repo_url):
        raise HTTPException(400, "Invalid GitHub URL")

    cache_key = normalize_repo_url(req.repo_url)
    if cache_key not in repo_cache:
        raise HTTPException(400, "Repository not loaded. Call POST /api/load-repo first.")

    entry = repo_cache[cache_key]
    tree = entry["tree"]
    
    findings = []
    
    tree_lower = tree.lower()
    
    if "requirements.txt" not in tree_lower and "package.json" not in tree_lower and "pyproject.toml" not in tree_lower:
        findings.append({
            "id": "dep-1",
            "title": "Missing dependency configuration",
            "severity": "high",
            "category": "architecture",
            "status": "verified",
            "effort": "easy",
            "evidence": [],
            "recommendation": "Add a requirements.txt or package.json to define dependencies."
        })
        
    if "test" not in tree_lower:
         findings.append({
            "id": "test-1",
            "title": "Missing test suite",
            "severity": "high",
            "category": "quality",
            "status": "verified",
            "effort": "medium",
            "evidence": [],
            "recommendation": "Add a tests directory and setup a test runner."
        })
        
    if "license" not in tree_lower:
        findings.append({
            "id": "lic-1",
            "title": "Missing LICENSE file",
            "severity": "medium",
            "category": "legal",
            "status": "verified",
            "effort": "easy",
            "evidence": [],
            "recommendation": "Add an open-source license."
        })

    return {
        "mode": "repository",
        "overview": entry.get("summary", ""),
        "architecture": {"components": []},
        "findings": findings,
        "dependencies": [],
        "documentation": "Good" if "readme.md" in tree_lower else "Missing README",
        "action_plan": [{"priority": 1, "title": f"Address {len(findings)} findings", "effort": "medium"}],
        "timings": {}
    }

from schemas import RepoIssuesRequest
from github_issues import fetch_open_issues, fast_score_issue, detect_linked_pr_and_claimed, localize_issue, run_deep_pass

@router.post("/repo-issues")
@limiter.limit("5/minute")
async def get_repo_issues(request: Request, payload: RepoIssuesRequest):
    import time
    from utils import get_repo_name
    from services import repo_cache
    
    t0 = time.time()
    
    cache_key = normalize_repo_url(payload.repo_url)
    if cache_key not in repo_cache:
        raise HTTPException(status_code=409, detail="Repository not loaded. Please call /api/load-repo first.")
        
    engine_bundle = repo_cache[cache_key].get("engine_bundle", {})
    sources = engine_bundle.get("sources", {})
    
    # 1. Fetch
    try:
        fetch_res = await fetch_open_issues(payload.repo_url, max_issues=payload.limit, state=payload.state)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    if "message" in fetch_res and not fetch_res.get("issues"):
        return {"repo_name": get_repo_name(payload.repo_url), "repo_url": payload.repo_url, "total_open": 0, "returned": 0, "truncated": False, "rate_limit": fetch_res.get("rate_limit"), "counts": {}, "issues": [], "timings": {}}
        
    raw_issues = fetch_res.get("issues", [])
    
    # 2. Fast score & localize
    scored_issues = []
    counts = {"easy": 0, "medium": 0, "hard": 0, "claimed": 0}
    
    for issue in raw_issues:
        has_assignee = bool(issue.get("assignees") or issue.get("assignee"))
        
        # Localize
        likely_files = localize_issue(issue, sources)
        
        # Fast score
        score, signals = fast_score_issue(issue, likely_files)
        
        level = "hard"
        if score >= 70:
            level = "easy"
        elif score >= 40:
            level = "medium"
            
        is_claimed = False
        claim_reason = None
        if has_assignee:
            is_claimed = True
            claim_reason = "Has assignee"
            
        gfi = "good first issue" in [l.get("name", "").lower() for l in issue.get("labels", []) if isinstance(l, dict)]
        
        diff = {
            "level": level,
            "ease_score": score,
            "reasons": [],
            "reasons_source": "heuristic",
            "estimated_hours": None,
            "good_first_issue": gfi,
            "confidence": "medium"
        }
        
        scored_issues.append({
            "number": issue.get("number"),
            "title": issue.get("title"),
            "url": issue.get("html_url"),
            "labels": [l.get("name") for l in issue.get("labels", []) if isinstance(l, dict)],
            "author": issue.get("user", {}).get("login"),
            "comments": issue.get("comments", 0),
            "created_at": issue.get("created_at"),
            "updated_at": issue.get("updated_at"),
            "likely_claimed": is_claimed,
            "claimed_reason": claim_reason,
            "difficulty": diff,
            "signals": signals,
            "likely_files": likely_files,
            "summary": None,
            "_raw_body": issue.get("body", "") # hidden field for deep pass
        })
        
    # Sort
    scored_issues.sort(key=lambda x: (x["likely_claimed"], -x["difficulty"]["ease_score"]))
    
    # Check top 30 for linked PR if not already claimed
    import asyncio
    owner, repo_name = get_repo_name(payload.repo_url), get_repo_name(payload.repo_url) # weak fallback
    from github_issues import parse_owner_repo
    parsed = parse_owner_repo(payload.repo_url)
    if parsed:
        owner, repo_name = parsed
        
    tasks = []
    for issue in scored_issues[:30]:
        if not issue["likely_claimed"]:
            tasks.append(detect_linked_pr_and_claimed(owner, repo_name, issue["number"], False))
        else:
            tasks.append(asyncio.sleep(0, result=(issue["likely_claimed"], issue["claimed_reason"])))
            
    if tasks:
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for idx, res in enumerate(results):
            if isinstance(res, tuple):
                claimed, reason = res
                if claimed:
                    scored_issues[idx]["likely_claimed"] = True
                    scored_issues[idx]["claimed_reason"] = reason
                    
    # Re-sort after PR check
    scored_issues.sort(key=lambda x: (x["likely_claimed"], -x["difficulty"]["ease_score"]))
    
    for i in scored_issues:
        if i["likely_claimed"]:
            counts["claimed"] += 1
        else:
            counts[i["difficulty"]["level"]] += 1
            
    t_fast = time.time()
    
    if payload.stream:
        async def event_stream():
            yield json.dumps({"type": "issues_fetched", "total": len(raw_issues)}) + "\n"
            
            # Send fast scored issues immediately
            # Remove hidden field
            clean_issues = []
            for item in scored_issues:
                c = dict(item)
                c.pop("_raw_body", None)
                clean_issues.append(c)
                
            yield json.dumps({"type": "issues_scored", "issues": clean_issues}) + "\n"
            
            # Deep pass
            deep_tasks = []
            for issue in scored_issues[:payload.deep_top_n]:
                raw_dict = {"title": issue["title"], "body": issue.get("_raw_body", ""), "likely_files": issue["likely_files"], "signals": issue["signals"]}
                deep_tasks.append((issue["number"], run_deep_pass(raw_dict, sources)))
                
            for num, task in deep_tasks:
                res = await task
                yield json.dumps({"type": "issue_enriched", "number": num, "summary": res.get("summary"), "reasons": res.get("reasons")}) + "\n"
                
            yield json.dumps({"type": "done"}) + "\n"
            
        return StreamingResponse(event_stream(), media_type="application/x-ndjson")
        
    else:
        # Sync deep pass
        deep_tasks = []
        for issue in scored_issues[:payload.deep_top_n]:
            raw_dict = {"title": issue["title"], "body": issue.get("_raw_body", ""), "likely_files": issue["likely_files"], "signals": issue["signals"]}
            deep_tasks.append((issue, run_deep_pass(raw_dict, sources)))
            
        for issue, task in deep_tasks:
            res = await task
            issue["summary"] = res.get("summary")
            issue["difficulty"]["reasons"] = res.get("reasons", [])
            issue["difficulty"]["reasons_source"] = res.get("reasons_source", "llm")
            
        for item in scored_issues:
            item.pop("_raw_body", None)
            
        return {
            "repo_name": get_repo_name(payload.repo_url),
            "repo_url": payload.repo_url,
            "total_open": len(raw_issues),
            "returned": len(scored_issues),
            "truncated": fetch_res.get("truncated", False),
            "rate_limit": fetch_res.get("rate_limit", {}),
            "counts": counts,
            "issues": scored_issues,
            "timings": {
                "fast_pass": t_fast - t0,
                "deep_pass": time.time() - t_fast,
                "total": time.time() - t0
            }
        }
