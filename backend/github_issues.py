import os
import re
import ast
import httpx
import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple, Any
import time

logger = logging.getLogger(__name__)

# Cache: repo_url -> {"etag": str, "issues": list, "truncated": bool, "rate_limit": dict, "message": str, "expires_at": float}
_issues_cache: Dict[str, dict] = {}

def normalize_repo_url(url: str) -> str:
    url = url.rstrip("/")
    if url.endswith(".git"):
        url = url[:-4]
    return url.rstrip("/")

def parse_owner_repo(url: str) -> Optional[Tuple[str, str]]:
    pattern = r"https?://github\.com/([^/]+)/([^/]+)"
    m = re.match(pattern, url)
    if m:
        return m.group(1), m.group(2)
    return None

async def fetch_open_issues(repo_url: str, max_issues: int = 200, state: str = "open") -> Dict[str, Any]:
    url_norm = normalize_repo_url(repo_url)
    parsed = parse_owner_repo(url_norm)
    if not parsed:
        raise ValueError(f"Invalid GitHub URL: {repo_url}")
    
    owner, repo = parsed
    
    cached = _issues_cache.get(url_norm)
    if cached and time.time() > cached.get("expires_at", 0):
        del _issues_cache[url_norm]
        cached = None
    
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Contrib-App"
    }
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
        
    if cached and cached.get("etag"):
        headers["If-None-Match"] = cached["etag"]
        
    api_url = f"https://api.github.com/repos/{owner}/{repo}/issues"
    
    issues = []
    truncated = False
    page = 1
    per_page = 100
    current_etag = None
    rate_limit = {"remaining": None, "reset": None}
    
    async with httpx.AsyncClient(timeout=20) as client:
        while True:
            params = {"state": state, "per_page": per_page, "page": page}
            try:
                resp = await client.get(api_url, headers=headers, params=params)
                rate_limit["remaining"] = resp.headers.get("x-ratelimit-remaining")
                rate_limit["reset"] = resp.headers.get("x-ratelimit-reset")
                
                if resp.status_code == 304:
                    if cached:
                        return cached
                    break
                    
                if resp.status_code in (403, 429):
                    reset_time = rate_limit["reset"] or "unknown"
                    raise RuntimeError(f"GitHub API rate limit exceeded. Reset at {reset_time}")
                    
                if resp.status_code == 404:
                    return {"issues": [], "truncated": False, "rate_limit": rate_limit, "message": "Repository not found or issues are disabled."}
                    
                if resp.status_code == 410:
                    return {"issues": [], "truncated": False, "rate_limit": rate_limit, "message": "Issues are disabled for this repository."}
                    
                resp.raise_for_status()
            except httpx.HTTPError as exc:
                if cached:
                    return cached
                raise exc
                
            if page == 1:
                current_etag = resp.headers.get("etag")
                
            data = resp.json()
            if not data:
                break
                
            for item in data:
                if "pull_request" not in item:
                    issues.append(item)
                    if len(issues) >= max_issues:
                        truncated = True
                        break
            
            if truncated or len(data) < per_page:
                break
                
            page += 1

    result = {
        "issues": issues,
        "truncated": truncated,
        "rate_limit": rate_limit,
        "etag": current_etag,
        "expires_at": time.time() + 600
    }
    _issues_cache[url_norm] = result
    return result

def get_cached_issue(repo_url: str, issue_number: int) -> Optional[dict]:
    url_norm = normalize_repo_url(repo_url)
    cached = _issues_cache.get(url_norm)
    if cached and "issues" in cached:
        for issue in cached["issues"]:
            if str(issue.get("number")) == str(issue_number):
                return issue
    return None

def strip_boilerplate(text: str) -> str:
    if not text:
        return ""
    lines = text.split("\n")
    cleaned = []
    for line in lines:
        lower = line.strip().lower()
        if re.match(r"^\s*-\s*\[[x\s]\]", lower):
            continue
        if lower.startswith("code of conduct") or lower.startswith("labels:") or lower.startswith("title:"):
            continue
        cleaned.append(line)
    return "\n".join(cleaned)

def fast_score_issue(issue: dict, likely_files: list) -> Tuple[int, dict]:
    """
    Score from 0-100.
    """
    signals = {}
    score = 50.0
    
    labels = [l.get("name", "").lower() for l in issue.get("labels", []) if isinstance(l, dict)]
    positive = {"good first issue", "documentation", "typo", "help wanted", "easy", "beginner"}
    negative = {"breaking", "epic", "refactor", "security", "performance", "needs design"}
    
    pos_count = sum(1 for l in labels if any(p in l for p in positive))
    neg_count = sum(1 for l in labels if any(n in l for n in negative))
    
    signals["pos_labels"] = pos_count
    signals["neg_labels"] = neg_count
    
    score += pos_count * 15
    score -= neg_count * 20
    
    body = strip_boilerplate(issue.get("body", ""))
    length = len(body)
    has_code = "```" in body
    has_traceback = "traceback" in body.lower() or "exception" in body.lower()
    
    signals["body_len"] = length
    signals["has_code"] = has_code
    signals["has_traceback"] = has_traceback
    
    if length > 50:
        score += 5
    if length > 2000:
        score -= 5
    if has_code or has_traceback:
        score += 10
        
    num_files = len(likely_files)
    signals["num_candidates"] = num_files
    if num_files == 0:
        score -= 10
    elif num_files <= 3:
        score += 15
    else:
        score += 5
        
    # Top retrieval score
    if likely_files:
        top_score = likely_files[0].get("score", 0.0)
        signals["top_score"] = top_score
        score += min(10, top_score * 10)
        
        # Penalize for complex/large functions
        func_comp = likely_files[0].get("func_complexity", 1)
        func_size = likely_files[0].get("func_size", 0)
        if func_comp > 10 or func_size > 50:
            score -= 20
        elif func_comp > 5 or func_size > 20:
            score -= 10
            
    # Comment count, assignee, age
    comments = issue.get("comments", 0)
    has_assignee = bool(issue.get("assignees") or issue.get("assignee"))
    signals["comments"] = comments
    signals["has_assignee"] = has_assignee
    
    created_at = issue.get("created_at")
    age_days = 0
    if created_at:
        try:
            dt = datetime.strptime(created_at, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            age_days = (datetime.now(timezone.utc) - dt).days
        except ValueError:
            pass
    signals["age_days"] = age_days
    
    if comments == 0:
        score += 5
    elif comments > 10:
        score -= 5
        
    # Ensure score stays in 0-100
    score = max(0.0, min(100.0, score))
    
    return int(score), signals

async def detect_linked_pr_and_claimed(owner: str, repo: str, issue_num: int, has_assignee: bool) -> Tuple[bool, Optional[str]]:
    if has_assignee:
        return True, "Has assignee"
        
    # Check timeline for linked PRs and comments
    api_url = f"https://api.github.com/repos/{owner}/{repo}/issues/{issue_num}/timeline"
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Contrib-App"
    }
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
        
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(api_url, headers=headers)
            if resp.status_code != 200:
                return False, None
            timeline = resp.json()
            
            for event in timeline:
                if event.get("event") == "cross-referenced":
                    source = event.get("source", {})
                    issue_obj = source.get("issue", {})
                    if issue_obj.get("pull_request"):
                        return True, "Linked PR exists"
                elif event.get("event") == "commented":
                    body = (event.get("body") or "").lower()
                    claim_phrases = ["i'll take this", "working on it", "can i work on this", "i would like to work on this"]
                    if any(p in body for p in claim_phrases):
                        return True, "Comment indicates claimed"
    except Exception as e:
        logger.warning(f"Error checking timeline for {owner}/{repo}#{issue_num}: {e}")
        
    return False, None

def calculate_complexity(source_code: str, func_name: str) -> Tuple[int, int]:
    """Returns (line_count, cyclomatic_complexity). Only computes complexity for Python."""
    try:
        lines = source_code.split("\n")
        line_count = len(lines)
        
        # very basic complexity for non-python
        complexity = 1
        
        try:
            tree = ast.parse(source_code)
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    if node.name == func_name:
                        # compute complexity
                        comp = 1
                        for child in ast.walk(node):
                            if isinstance(child, (ast.If, ast.While, ast.For, ast.AsyncFor, ast.ExceptHandler, ast.With, ast.AsyncWith)):
                                comp += 1
                            elif isinstance(child, ast.BoolOp):
                                comp += len(child.values) - 1
                        return (node.end_lineno - node.lineno + 1), comp
        except Exception:
            pass
            
        return line_count, complexity
    except Exception:
        return 0, 1

def localize_issue(issue: dict, sources: Dict[str, str]) -> List[dict]:
    # Import issue_parser locally to avoid circular imports if any
    import issue_parser
    import utils
    
    title = issue.get("title", "")
    body = strip_boilerplate(issue.get("body", ""))
    full_text = f"{title}\n{body}"
    
    entities = issue_parser.extract_issue_entities(full_text)
    
    issue_symbols = {e.text for e in entities if e.kind == "symbol"}
    issue_filepaths = {e.text for e in entities if e.kind == "filepath"}
    
    file_scores = []
    
    for fp, source in sources.items():
        file_symbols = utils.extract_symbols(source)
        
        score = 0.0
        reasons = []
        
        # 1. Exact filepath match
        fp_lower = fp.lower().replace("\\", "/")
        for ifp in issue_filepaths:
            if ifp.lower() in fp_lower:
                score += 0.8
                reasons.append(f"Filepath match: {ifp}")
                
        # 2. Symbol match
        exact_matches = issue_symbols & (set(file_symbols.get("functions", [])) | set(file_symbols.get("classes", [])))
        if exact_matches:
            score += 0.5 * len(exact_matches)
            reasons.append(f"Symbol exact match: {', '.join(exact_matches)}")
            
        source_matches = {sym for sym in issue_symbols if re.search(rf"\b{re.escape(sym)}\b", source)}
        if source_matches:
            score += 0.2 * len(source_matches)
            reasons.append(f"Symbol source match: {', '.join(source_matches)}")
            
        if score > 0:
            # pick top matched function for complexity
            top_func = next(iter(exact_matches)) if exact_matches else None
            size, comp = 0, 1
            if top_func:
                size, comp = calculate_complexity(source, top_func)
                
            file_scores.append({
                "path": fp,
                "score": score,
                "why": " | ".join(reasons),
                "func_size": size,
                "func_complexity": comp
            })
            
    file_scores.sort(key=lambda x: x["score"], reverse=True)
    return file_scores[:5]

async def run_deep_pass(issue: dict, sources: Dict[str, str]) -> dict:
    from config import settings
    
    title = issue.get("title", "")
    body = strip_boilerplate(issue.get("body", ""))
    likely_files = issue.get("likely_files", [])
    signals = issue.get("signals", {})
    
    context = ""
    for lf in likely_files[:3]:
        fp = lf["path"]
        if fp in sources:
            context += f"--- {fp} ---\n{sources[fp][:1500]}\n\n"
            
    prompt = f"""Analyze this GitHub issue and determine its difficulty level (easy, medium, hard).
Provide a 1-2 sentence plain-language summary of what needs to be done.
Provide 2-3 brief reasons for the difficulty level based on the issue text and provided source code snippets.

Issue Title: {title}
Issue Body: {body[:1500]}
Signals: {signals}

Source Context:
{context}

Return exactly JSON format:
{{
  "summary": "...",
  "reasons": ["...", "..."]
}}
"""
    try:
        import json
        from llama_index.core import Settings
        if "ollama" in Settings.llm.__class__.__name__.lower():
            schema = {
                "type": "object",
                "properties": {
                    "summary": {"type": "string"},
                    "reasons": {"type": "array", "items": {"type": "string"}}
                }
            }
            resp = Settings.llm.complete(prompt, format=schema, temperature=0.1)
            parsed = json.loads(str(resp).strip())
        else:
            resp = Settings.llm.complete(prompt, temperature=0.1)
            from services import extract_json
            parsed = extract_json(str(resp))
            
        return {
            "summary": parsed.get("summary", ""),
            "reasons": parsed.get("reasons", []),
            "reasons_source": "llm"
        }
    except Exception as exc:
        logger.warning(f"Deep pass failed: {exc}")
        return {
            "summary": "Failed to analyze with LLM.",
            "reasons": ["LLM generation failed", str(exc)],
            "reasons_source": "heuristic"
        }
