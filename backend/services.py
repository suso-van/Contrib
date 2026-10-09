from __future__ import annotations

import hashlib
import os
from config import settings
import asyncio
import json
import logging
import re
import time
import torch
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from llama_index.llms.ollama import Ollama
from llama_index.llms.openai_like import OpenAILike
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.core import Settings, Document
from llama_index.core import VectorStoreIndex, StorageContext
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.schema import NodeWithScore

_original_get = HuggingFaceEmbedding._get_text_embeddings

def _sorted_get_text_embeddings(self, texts: List[str]) -> List[List[float]]:
    indexed = list(enumerate(texts))
    indexed.sort(key=lambda x: len(x[1]))
    sorted_texts = [x[1] for x in indexed]
    sorted_embeds = _original_get(self, sorted_texts)
    restored = [None] * len(texts)
    for i, (orig_idx, _) in enumerate(indexed):
        restored[orig_idx] = sorted_embeds[i]
    return restored

HuggingFaceEmbedding._get_text_embeddings = _sorted_get_text_embeddings
import chromadb
from llama_index.vector_stores.chroma import ChromaVectorStore

from rank_bm25 import BM25Okapi

from utils import (
    extract_imports,
    extract_symbols,
    classify_file_role,
    build_dependency_chain,
)
from reranker import rerank
from issue_parser import extract_issue_entities

logger = logging.getLogger(__name__)

repo_cache: Dict[str, dict] = {}

CHROMA_DIR = Path("./chroma_db")
CHROMA_DIR.mkdir(exist_ok=True)
_chroma_client = chromadb.PersistentClient(path=str(CHROMA_DIR))

device = settings.embed_device
if not device:
    device = (
        "mps" if torch.backends.mps.is_available()
        else "cuda" if torch.cuda.is_available()
        else "cpu"
    )

if settings.is_production:
    logger.info("Using Remote Embedding Server")

    from llama_index.embeddings.openai_like import OpenAILikeEmbedding

    Settings.embed_model = OpenAILikeEmbedding(
        model_name=settings.embed_model,
        api_base=settings.cloud_embed_url,
        api_key="dummy-key",
        embed_batch_size=settings.embed_batch_size,
    )
    logger.info(f"Embedding URL: {settings.cloud_embed_url}")

else:
    logger.info(f"Using Local Embedding Device: {device}")

    Settings.embed_model = HuggingFaceEmbedding(
        model_name=settings.embed_model,
        device=device,
        embed_batch_size=settings.embed_batch_size,
    )
    if hasattr(Settings.embed_model, "_model"):
        Settings.embed_model._model.max_seq_length = settings.embed_max_seq_len

if settings.is_production:
    logger.info("Using Remote AMD GPU vLLM Inference")

    Settings.llm = OpenAILike(
      model=settings.llm_model,
      api_base=settings.llm_base_url,
      api_key="dummy-key",
      context_window=32768,
      is_chat_model=True,
      tokenizer=None,
      request_timeout=float(settings.llm_timeout),
      max_tokens=2048,
      temperature=0.0,
      additional_kwargs={
        "stop": ["```"]
      },
    )
    logger.info(f"LLM URL: {settings.llm_base_url}")

elif settings.remote_llm_base_url:
    logger.info("Using Authenticated Remote LLM (ngrok)")
    headers = {}
    if settings.remote_llm_auth_secret:
        headers["Authorization"] = f"Bearer {settings.remote_llm_auth_secret}"
    Settings.llm = OpenAILike(
      model=settings.remote_llm_model,
      api_base=settings.remote_llm_base_url,
      api_key=settings.remote_llm_auth_secret or "dummy-key",
      context_window=32768,
      is_chat_model=True,
      tokenizer=None,
      request_timeout=float(settings.llm_timeout),
      max_tokens=2048,
      temperature=0.0,
      default_headers=headers,
      additional_kwargs={
        "stop": ["```"]
      },
    )
    logger.info(f"Remote LLM URL: {settings.remote_llm_base_url}")

else:
    logger.info("Using Local Ollama Inference")

    Settings.llm = Ollama(
        model=settings.llm_model,
        base_url=settings.llm_base_url,
        request_timeout=float(settings.llm_timeout),
        context_window=16384,
    )

_IGNORE_DIRS: frozenset[str] = frozenset({
    "test", "tests", "__tests__", "spec", "specs",
    "docs", "doc", "documentation",
    "examples", "example", "demo", "demos", "sample", "samples",
    "notebooks", "notebook",
    "benchmark", "benchmarks",
    "migrations", "locale", "locales", "i18n",
    "vendor", "node_modules", ".git", ".github",
    "dist", "build", "out", "target", "bin", "obj",
    "static", "assets", "public", "media",
    "coverage", "htmlcov", ".tox", ".mypy_cache", "__pycache__",
})

_IGNORE_EXTS: frozenset[str] = frozenset({
    ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico",
    ".lock", ".sum",
    ".csv", ".tsv",
    ".json",
    ".min.js", ".map",
    ".md", ".rst", ".txt",
    ".ipynb",
    ".pb", ".onnx", ".pt", ".pth",
    ".whl", ".egg",
    ".toml", ".yaml", ".yml", ".ini", ".cfg", ".env",
    ".css", ".scss", ".less",
    ".html", ".htm",
    ".xml",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".download",
})

_IGNORE_NAME_PATTERNS: Tuple[str, ...] = (
    "setup.py", "setup.cfg", "pyproject.toml",
    "requirements.txt", "requirements-dev.txt",
    "conftest.py", "pytest.ini",
    "Makefile", "Dockerfile", ".dockerignore",
    "CHANGELOG", "CHANGES", "HISTORY",
    "LICENSE", "LICENCE", "NOTICE", "AUTHORS", "CONTRIBUTORS",
    "package.json", "package-lock.json", "yarn.lock",
    "tsconfig.json", "eslint", "prettier", ".editorconfig",
    "jquery", "vendor", "bootstrap", "tailwind",
)

_CORE_DIR_HINTS: frozenset[str] = frozenset({
    "src", "lib", "core", "app", "api", "server",
    "pkg", "internal", "backend", "service", "services",
    "handler", "handlers", "controller", "controllers",
    "model", "models", "schema", "schemas",
    "router", "routers", "route", "routes",
    "util", "utils", "helper", "helpers",
    "middleware",
})

ARCHITECTURE_QUERIES = [
    "change model",
    "where can i change",
    "deepfake model",
    "different model",
    "which model",
    "model used",
    "where is the model",
    "inference pipeline",
    "how does inference work",
    "where is prediction done",
    "where is detection done",
]

MODEL_KEYWORDS = [
    "torch.load",
    "load_model",
    "state_dict",
    "EfficientNet",
    "ResNet",
    "Xception",
    "MesoNet",
    "from_pretrained",
    "AutoModel",
    "predict",
    "inference",
    "classifier",
    "weights",
    ".pth",
    ".pt",
    ".onnx",
    "model =",
    "DeepFake",
    "deepfake",
    "detect",
]

_MAX_EMBED_FILES = 1200
_LARGE_FILE_THRESHOLD = 8_000

ARCHITECTURE_KEYWORDS = {
    "stream": ["stream", "streaming", "async", "generator"],
    "retry": ["retry", "backoff", "resilience"],
    "middleware": ["middleware", "hook", "wrapper"],
    "auth": ["auth", "token", "oauth", "permission"],
    "runtime": ["runtime", "executor", "runner"],
    "config": ["config", "setting", "env"],
}

ROLE_HINTS = {
    "retry": ["service", "client"],
    "stream": ["runtime", "service"],
    "auth": ["middleware", "service"],
    "config": ["config"],
}

def build_retrieval_plan(issue_text: str) -> dict:
    """
    Convert issue text into structured retrieval intent.
    """

    entities = extract_issue_entities(issue_text)

    symbols = []
    modules = []
    filepaths = []

    for e in entities:
        if e.kind == "symbol" and e.confidence >= 0.60:
            symbols.append(e.text)

        elif e.kind == "module" and e.confidence >= 0.60:
            modules.append(e.text)

        elif e.kind == "filepath" and e.confidence >= 0.70:
            filepaths.append(e.text)

    text_lower = issue_text.lower()

    operations = []

    for op, kws in ARCHITECTURE_KEYWORDS.items():
        if any(kw in text_lower for kw in kws):
            operations.append(op)

    role_hints = []

    for op in operations:
        role_hints.extend(ROLE_HINTS.get(op, []))

    return {
        "symbols": list(dict.fromkeys(symbols)),
        "modules": list(dict.fromkeys(modules)),
        "filepaths": list(dict.fromkeys(filepaths)),
        "operations": list(dict.fromkeys(operations)),
        "role_hints": list(dict.fromkeys(role_hints)),
    }


def symbol_retrieval(
    sources: Dict[str, str],
    symbols: List[str],
) -> Dict[str, float]:
  """
  Direct symbol-based retrieval.

  MUCH stronger than semantic similarity
  for engineering issues.
  """

  results = {}

  if not symbols:
    return results

  for fp, src in sources.items():

    score = 0.0

    extracted = extract_symbols(src)

    file_symbols = (
        extracted["functions"] +
        extracted["classes"]
    )

    for sym in symbols:

      if sym in file_symbols:
        score += 5.0

      elif re.search(rf"\b{re.escape(sym)}\b", src):
        score += 2.0

    if score > 0:
      results[fp] = score

  return results

def role_based_retrieval(
    sources: Dict[str, str],
    role_hints: List[str],
) -> Dict[str, float]:

  results = {}

  if not role_hints:
    return results

  for fp, src in sources.items():

    role = classify_file_role(fp, src)

    if role in role_hints:
      results[fp] = 2.0

  return results

def expand_dependency_neighbors(
    initial_files: List[str],
    sources: Dict[str, str],
    max_neighbors: int = 10,
) -> Dict[str, float]:

  expanded = {}

  for fp in initial_files:

    deps = build_dependency_chain(
      fp,
      sources,
      max_depth=2,
    )

    for edge in deps:

      parts = [p.strip() for p in edge.split("→")]

      for p in parts:

        if p != fp and p in sources:
          expanded[p] = 1.5

  return expanded

def build_weighted_query_terms(
    issue_text: str,
    plan: dict,
) -> List[str]:

  generic = re.findall(
    r"[a-zA-Z_]\w+",
    issue_text.lower()
  )

  weighted = []

  weighted.extend(generic)

  for sym in plan["symbols"]:
    weighted.extend([sym.lower()] * 5)

  for op in plan["operations"]:
    weighted.extend([op] * 3)

  for mod in plan["modules"]:
    weighted.extend([mod.lower()] * 4)

  return weighted

def filepath_signal_score(
    filepath: str,
    plan: dict,
) -> float:

  fp = filepath.lower()

  score = 0.0

  for sym in plan["symbols"]:
    if sym.lower() in fp:
      score += 4.0

  for op in plan["operations"]:
    if op.lower() in fp:
      score += 2.5

  for mod in plan["modules"]:
    if mod.lower() in fp:
      score += 3.0

  return score

def expand_issue_query(issue_text: str) -> str:
  """
  Expand vague engineering issues into retrieval-friendly queries.
  """

  text = issue_text.lower()

  expansions = []

  if "auth" in text:
    expansions.extend([
      "authentication middleware",
      "oauth token validation",
      "security dependency",
      "request authentication flow",
    ])

  if "stream" in text:
    expansions.extend([
      "streaming response",
      "async generator",
      "stream response handling",
    ])

  if "retry" in text:
    expansions.extend([
      "retry logic",
      "backoff strategy",
      "request retry wrapper",
    ])

  if "middleware" in text:
    expansions.extend([
      "request middleware",
      "response middleware",
    ])

  if "dependency" in text:
    expansions.extend([
      "dependency injection",
      "dependency resolver",
    ])

  expanded = issue_text + "\n" + "\n".join(expansions)

  return expanded

def _should_skip_file(file_path: str) -> bool:
    """
    Return True if the file should be excluded from embedding entirely.

    Decision is based on path components (directory names), file extension,
    and known low-value filenames — all evaluated without reading the file.
    """
    fp_lower = file_path.lower().replace("\\", "/")
    parts = fp_lower.split("/")

    if any(p in _IGNORE_DIRS for p in parts[:-1]):
        return True

    for ext in _IGNORE_EXTS:
        if fp_lower.endswith(ext):
            return True

    basename = parts[-1]
    if any(basename.startswith(pat.lower()) for pat in _IGNORE_NAME_PATTERNS):
        return True

    return False


def _file_priority(file_path: str) -> int:
    """
    Return a priority score (lower = more important) for ordering files.

    Core source files get 0-1, utility/schema files get 2, test-adjacent or
    config files that slipped through filtering get 3.
    """
    HIGH_SIGNAL_DIRS = [
      "security",
      "auth",
      "oauth",
      "dependency",
      "dependencies",
      "middleware",
      "routing",
      "openapi",
      "params",
    ]

    fp_lower = file_path.lower().replace("\\", "/")
    parts = fp_lower.split("/")

    if any(p in _CORE_DIR_HINTS for p in parts):
        return 0

    stem = parts[-1].replace(".py", "").replace(".ts", "").replace(".js", "")
    if any(hint in stem for hint in ("main", "app", "server", "run", "index")):
        return 0
    if any(hint in stem for hint in ("util", "helper", "schema", "model", "service")):
        return 1
    if any(hint in stem for hint in ("config", "setting")):
        return 2
    if any(seg in stem for seg in HIGH_SIGNAL_DIRS):
      return -2

    return 3


def _split_repo_content(content: str) -> List[Tuple[str, str]]:
    """
    Split the gitingest content blob into (file_path, source_code) pairs,
    applying aggressive intelligent filtering and priority-based capping.
    """
    parts = re.split(r"={48}\n(?:File|FILE|file):\s*", content)

    raw_files: List[Tuple[str, str]] = []
    skipped_reasons = {}
    for part in parts:
        if not part.strip() or "Directory structure:" in part:
            continue
        subparts = part.split("\n" + "=" * 48 + "\n", 1)
        if len(subparts) == 2:
            fp, code = subparts[0].strip(), subparts[1].strip()
            if not fp or not code:
                continue
                
            fp_lower = fp.lower().replace("\\", "/")
            path_parts = fp_lower.split("/")
            
            skip_reason = ""
            if len(code.encode('utf-8')) > settings.max_file_kb * 1024:
                skip_reason = f"over_{settings.max_file_kb}kb"
            elif any(p in _IGNORE_DIRS for p in path_parts[:-1]):
                skip_reason = "ignored_dir"
            else:
                for ext in _IGNORE_EXTS:
                    if fp_lower.endswith(ext):
                        if fp_lower.endswith(".md") and "readme" in fp_lower:
                            break
                        if fp_lower.endswith((".yaml", ".yml", ".toml", ".ini", ".cfg", ".env")):
                            break
                        skip_reason = f"ext_{ext}"
                        break
                
                if not skip_reason:
                    basename = path_parts[-1]
                    if any(basename.startswith(pat.lower()) for pat in _IGNORE_NAME_PATTERNS):
                        skip_reason = "ignored_name"
            
            if skip_reason:
                skipped_reasons[skip_reason] = skipped_reasons.get(skip_reason, 0) + 1
                continue
                
            raw_files.append((fp, code))

    raw_files.sort(key=lambda x: _file_priority(x[0]))
    files = raw_files[:_MAX_EMBED_FILES]

    logger.info(
        f"File filter: {len(parts)} raw parts → {len(raw_files)} after filtering "
        f"→ {len(files)} after cap (max {_MAX_EMBED_FILES})"
    )
    if skipped_reasons:
        logger.info(f"Skipped files breakdown: {skipped_reasons}")
    return files


def _rich_metadata(file_path: str, source: str) -> dict:
    """Build a rich metadata dict for a single file."""
    symbols = extract_symbols(source)
    imports = extract_imports(source)
    role    = classify_file_role(file_path, source)
    return {
        "file_path":  file_path,
        "role":       role,
        "functions":  json.dumps(symbols["functions"]),
        "classes":    json.dumps(symbols["classes"]),
        "imports":    json.dumps(imports),
        "line_count": str(source.count("\n") + 1),
        "priority":   str(_file_priority(file_path)),
    }

def _make_splitter(source_len: int) -> SentenceSplitter:
    """
    Choose chunk size based on file size so large files don't flood the index
    with redundant chunks while small files are kept whole.
    """
    if source_len > _LARGE_FILE_THRESHOLD:
        return SentenceSplitter(chunk_size=settings.chunk_size // 2, chunk_overlap=settings.chunk_overlap // 2)
    return SentenceSplitter(chunk_size=settings.chunk_size, chunk_overlap=settings.chunk_overlap)

def build_query_engine(content: str, repo_name: str, commit_sha: str = "") -> dict:
    """
    Build (or reload) a persistent vector index for *repo_name*.

    Returns a dict with keys:
        ``vector_index``   – LlamaIndex VectorStoreIndex
        ``bm25``           – BM25Okapi instance
        ``bm25_nodes``     – list of dicts (for BM25 lookup)
        ``sources``        – Dict[file_path, source_code]
        ``file_priorities``– Dict[file_path, int] for reranking
    """
    embed_model_name = getattr(Settings.embed_model, "model_name", "default")
    config_str = f"{repo_name}_{commit_sha}_{embed_model_name}_{settings.chunk_size}_{settings.chunk_overlap}"
    repo_hash = hashlib.md5(config_str.encode()).hexdigest()[:16]
    safe_name = f"idx_{repo_hash}"

    collection = _chroma_client.get_or_create_collection(safe_name)
    metadata = collection.metadata or {}
    is_complete = metadata.get("status") == "complete"
    
    if not is_complete and collection.count() > 0:
        _chroma_client.delete_collection(safe_name)
        collection = _chroma_client.create_collection(safe_name)
        
    vector_store    = ChromaVectorStore(chroma_collection=collection)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)

    t0 = time.perf_counter()
    files = _split_repo_content(content)
    t_filter = time.perf_counter() - t0
    
    sources          = {fp: src for fp, src in files}
    file_priorities  = {fp: _file_priority(fp) for fp, _ in files}

    if is_complete and collection.count() > 0:
        logger.info(
            f"Reusing Chroma collection '{safe_name}' "
            f"({collection.count()} chunks) — skipping embedding."
        )
        index = VectorStoreIndex.from_vector_store(
            vector_store, storage_context=storage_context
        )
    else:
        # Measure config
        device = getattr(Settings.embed_model, "_device", getattr(Settings.embed_model, "device", "unknown"))
        model_name = getattr(Settings.embed_model, "model_name", "unknown")
        batch_size = getattr(Settings.embed_model, "embed_batch_size", 0)
        seq_len = "unknown"
        if hasattr(Settings.embed_model, "_model") and hasattr(Settings.embed_model._model, "max_seq_length"):
            seq_len = Settings.embed_model._model.max_seq_length
            
        logger.info(f"Building '{safe_name}' — embedding {len(files)} files…")
        logger.info(f"EMBED SETTINGS: Model={model_name}, Device={device}, BatchSize={batch_size}, MaxSeqLen={seq_len}")
        
        
        t0 = time.perf_counter()
        docs = []
        for fp, src in files:
            meta = _rich_metadata(fp, src)
            docs.append(Document(
                text=src,
                metadata=meta,
                excluded_embed_metadata_keys=["functions", "classes", "imports", "priority"],
                excluded_llm_metadata_keys=["functions", "classes", "imports", "priority"],
            ))

        small_docs = [d for d in docs if len(d.text) <= _LARGE_FILE_THRESHOLD]
        large_docs = [d for d in docs if len(d.text) > _LARGE_FILE_THRESHOLD]

        all_nodes = []
        if small_docs:
            small_splitter = SentenceSplitter(chunk_size=settings.chunk_size, chunk_overlap=settings.chunk_overlap)
            all_nodes.extend(small_splitter.get_nodes_from_documents(small_docs))
        if large_docs:
            large_splitter = SentenceSplitter(chunk_size=settings.chunk_size // 2, chunk_overlap=settings.chunk_overlap // 2)
            all_nodes.extend(large_splitter.get_nodes_from_documents(large_docs))
            
        t_chunking = time.perf_counter() - t0

        t0 = time.perf_counter()
        index = VectorStoreIndex(
            nodes=all_nodes,
            storage_context=storage_context,
            show_progress=True,
        )
        t_embed_and_write = time.perf_counter() - t0
        
        collection.modify(metadata={**(collection.metadata or {}), "status": "complete"})
        
        logger.info(
            f"Index built in {t_filter + t_chunking + t_embed_and_write:.1f}s — "
            f"{len(all_nodes)} chunks from {len(files)} files. "
            f"[Filter: {t_filter:.2f}s, Chunk: {t_chunking:.2f}s, Embed+Write: {t_embed_and_write:.2f}s]"
        )

    bm25_corpus, bm25_nodes = [], []
    for fp, src in files:
        tokens = re.findall(r"[a-zA-Z_]\w*", src)
        bm25_corpus.append(tokens)
        bm25_nodes.append({"file_path": fp, "text": src[:4_000]})

    bm25 = BM25Okapi(bm25_corpus) if bm25_corpus else None

    project_structure, truncated = build_project_tree(sources)
    return {
        "project_structure": project_structure,
        "truncated": truncated,
        "vector_index":    index,
        "bm25":            bm25,
        "bm25_nodes":      bm25_nodes,
        "sources":         sources,
        "file_priorities": file_priorities,
    }


def build_project_tree(sources: Dict[str, str], max_depth: int = 6, max_nodes: int = 2000) -> Tuple[List[dict], bool]:
    tree = {}
    node_count = 0
    truncated = False
    
    for path in sources.keys():
        parts = path.replace("\\", "/").split('/')
        current = tree
        for i, part in enumerate(parts):
            if i >= max_depth:
                truncated = True
                break
            if part not in current:
                if node_count >= max_nodes:
                    truncated = True
                    break
                current[part] = {"_type": "file" if i == len(parts)-1 else "dir", "_children": {}}
                node_count += 1
            current = current[part]["_children"]
            
    def format_tree(node_dict, current_path=""):
        result = []
        for name, data in sorted(node_dict.items(), key=lambda x: (x[1]["_type"] == "file", x[0])):
            path = f"{current_path}/{name}".lstrip("/")
            node = {"name": name, "path": path, "type": data["_type"]}
            if data["_type"] == "dir":
                node["children"] = format_tree(data["_children"], path)
            result.append(node)
        return result
        
    return format_tree(tree), truncated

def validate_paths(paths: List[str], sources: Dict[str, str]) -> List[str]:
    valid = []
    seen = set()
    for p in paths:
        norm = p.replace("\\", "/").lstrip("/")
        if norm in sources and norm not in seen:
            valid.append(norm)
            seen.add(norm)
    return valid

def extract_json(text: str) -> dict:
    """Safely extract the first JSON object from an LLM response."""
    if not text:
        return {}

    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence_match:
        try:
            return json.loads(fence_match.group(1))
        except json.JSONDecodeError:
            pass

    start = text.find("{")
    if start == -1:
        logger.warning("extract_json: no '{' found in LLM output")
        return {}

    depth, end, in_string, escape = 0, -1, False, False
    for i, ch in enumerate(text[start:], start):
        if escape:
            escape = False
            continue
        if ch == "\\" and in_string:
            escape = True
            continue
        if ch == '"' and not escape:
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i
                break

    if end == -1:
        open_braces = text.count("{", start) - text.count("}", start)
        candidate   = text[start:] + ("}" * max(open_braces, 1))
        logger.warning("extract_json: JSON appears truncated; attempting repair")
    else:
        candidate = text[start : end + 1]

    try:
        return json.loads(candidate)
    except json.JSONDecodeError as exc:
        logger.warning(f"extract_json: decode error: {exc}")
        return {}

def run_issue_analyzer(tree: str, issue_full: str) -> dict:
    """Categorise the issue: type, difficulty, required skills, affected areas."""
    prompt = f"""You are an expert open-source contributor mentor. Analyse the GitHub issue and return ONLY valid JSON (no markdown fences, no extra text).

Repository structure (truncated):
{tree[:2000]}

Issue:
{issue_full[:1500]}

Return a JSON object with exactly these keys:
{{
  "issue_type": "bug|feature|docs|refactor|test",
  "difficulty": {{
    "level": "easy|medium|hard",
    "label": "Short label",
    "score": 5,
    "estimated_hours": {{"min": 1, "max": 2}},
    "reasons": ["reason 1"],
    "confidence": "high|medium|low",
    "good_first_issue": true
  }},
  "problem_summary": "One sentence summary of the issue.",
  "root_cause": {{
    "hypothesis": "what is most likely causing this",
    "status": "potential"
  }},
  "required_skills": ["skill1", "skill2"],
  "affected_areas": [
    {{"path": "path/to/file", "role": "Main logic", "why": "reason"}}
  ]
}}"""
    try:
        resp = Settings.llm.complete(prompt)
        return extract_json(str(resp))
    except Exception as exc:
        logger.warning(f"Issue analysis failed: {exc}")
        return {}


def run_retrieval_agent(engine_bundle: dict, issue_full: str) -> dict:
  """
  Production-grade hybrid retrieval pipeline.

  Improvements:
  - Retrieval fusion BEFORE reranking
  - Strong filepath boosting
  - Symbol-aware ranking
  - Better BM25 weighting
  - Dependency expansion only after low confidence
  - Cleaner confidence handling
  """

  vector_index: VectorStoreIndex = engine_bundle["vector_index"]
  bm25: Optional[BM25Okapi] = engine_bundle["bm25"]
  bm25_nodes: list = engine_bundle["bm25_nodes"]
  sources: Dict[str, str] = engine_bundle["sources"]

  plan = build_retrieval_plan(issue_full)

  expanded_issue = expand_issue_query(issue_full)

  logger.info(
    f"Retrieval plan | "
    f"symbols={plan['symbols']} | "
    f"operations={plan['operations']} | "
    f"roles={plan['role_hints']}"
  )

  candidates: Dict[str, Tuple[float, str]] = {}

  try:
    if vector_index:
        retriever = vector_index.as_retriever(similarity_top_k=30)
        nodes: List[NodeWithScore] = retriever.retrieve(expanded_issue)
    else:
        nodes = []

    for node in nodes:
      fp = node.metadata.get("file_path", "")

      if not fp:
        continue

      score = float(node.score or 0)

      semantic_score = score * 4.0

      if (
          fp not in candidates or
          semantic_score > candidates[fp][0]
      ):
        candidates[fp] = (
          semantic_score,
          "semantic"
        )

  except Exception as exc:
    logger.warning(f"Vector retrieval failed: {exc}")

  if bm25 and bm25_nodes:

    query_tokens = build_weighted_query_terms(
      expanded_issue,
      plan,
    )

    bm25_scores = bm25.get_scores(query_tokens)

    top_k = min(25, len(bm25_scores))

    top_indices = sorted(
      range(len(bm25_scores)),
      key=lambda i: bm25_scores[i],
      reverse=True,
    )[:top_k]

    for idx in top_indices:

      raw_score = float(bm25_scores[idx])

      if raw_score < 1.0:
        continue

      fp = bm25_nodes[idx]["file_path"]

      bm25_score = raw_score * 1.5

      if fp in candidates:

        old_score, old_method = candidates[fp]

        candidates[fp] = (
          old_score + bm25_score,
          f"{old_method}+bm25"
        )

      else:
        candidates[fp] = (
          bm25_score,
          "bm25"
        )

  symbol_hits = symbol_retrieval(
    sources,
    plan["symbols"],
  )

  for fp, score in symbol_hits.items():

    boosted = score * 4.0

    if fp in candidates:

      old_score, old_method = candidates[fp]

      candidates[fp] = (
        old_score + boosted,
        f"{old_method}+symbol"
      )

    else:

      candidates[fp] = (
        boosted,
        "symbol"
      )

  role_hits = role_based_retrieval(
    sources,
    plan["role_hints"],
  )

  for fp, score in role_hits.items():

    if fp in candidates:

      old_score, old_method = candidates[fp]

      candidates[fp] = (
        old_score + score,
        f"{old_method}+role"
      )

    else:

      candidates[fp] = (
        score,
        "role"
      )

  for fp in list(candidates.keys()):

    boost = filepath_signal_score(
      fp,
      plan,
    )

    if boost > 0:
      old_score, old_method = candidates[fp]

      candidates[fp] = (
        old_score + boost,
        f"{old_method}+filepath"
      )

  sorted_candidates = sorted(
    candidates.items(),
    key=lambda x: x[1][0],
    reverse=True,
  )

  candidates = dict(sorted_candidates[:40])

  reranker_result = rerank(
    candidates=candidates,
    sources=sources,
    issue_full=expanded_issue,
    top_k=6,
  )

  if reranker_result.low_confidence:

    logger.warning(
      "Low-confidence retrieval detected — expanding dependency graph"
    )

    seed_files = [
      r.path
      for r in reranker_result.ranked_files[:3]
    ]

    expanded = expand_dependency_neighbors(
      seed_files,
      sources,
    )

    for fp, score in expanded.items():

      if fp in candidates:

        old_score, old_method = candidates[fp]

        candidates[fp] = (
          old_score + score,
          f"{old_method}+dependency"
        )

      else:

        candidates[fp] = (
          score,
          "dependency"
        )

    reranker_result = rerank(
      candidates=candidates,
      sources=sources,
      issue_full=expanded_issue,
      top_k=6,
    )

  logger.info(
    f"Reranker: {len(candidates)} candidates → "
    f"{len(reranker_result.ranked_files)} after reranking | "
    f"top_tier={reranker_result.confidence_tier} | "
    f"anchor={reranker_result.anchor_file} | "
    f"low_conf={reranker_result.low_confidence}"
  )

  relevant_files = []

  for r in reranker_result.ranked_files:
    relevant_files.append({
      "path": r.path,
      "relevance": r.confidence_tier.lower(),
      "score": r.composite_score,
      "retrieval_score": round(r.retrieval_score, 3),
      "method": r.retrieval_method,
      "reason": r.reason,
      "functions": r.functions,
      "classes": r.classes,
      "role": r.role,
      "signals": {
        "symbol": r.symbol_score,
        "filepath": r.filepath_score,
        "dep": r.dep_score,
        "agreement": r.agreement_score,
        "penalty": r.penalty,
      },
      "matched_symbols": r.matched_symbols,
    })

  fix_zone = None

  if relevant_files:
    top = relevant_files[0]

    fix_zone = {
      "file_path": top.get("path"),
      "role": top.get("role"),
      "localisation_tier": reranker_result.confidence_tier,
      "localisation_score": round(
        reranker_result.overall_confidence,
        3
      ),
      "matched_symbols": top.get("matched_symbols", [])[:8],
      "likely_functions": (top.get("functions") or [])[:8],
      "likely_classes": (top.get("classes") or [])[:8],
      "reason": top.get("reason"),
    }

  entities = extract_issue_entities(expanded_issue)

  keywords = []
  seen = set()

  for e in entities:

    if (
        e.kind in ("symbol", "error_type", "module")
        and e.confidence >= 0.55
    ):

      if e.text not in seen:
        keywords.append(e.text)
        seen.add(e.text)

    if len(keywords) >= 10:
      break

  return {
    "relevant_files": relevant_files,
    "key_functions": list({
      fn
      for f in relevant_files
      for fn in f["functions"]
    })[:10],
    "search_keywords": keywords,
    "most_likely_fix_zone": fix_zone,
    "reranker": {
      "confidence_tier": reranker_result.confidence_tier,
      "overall_confidence": round(
        reranker_result.overall_confidence,
        3
      ),
      "anchor_file": reranker_result.anchor_file,
      "low_confidence": reranker_result.low_confidence,
      "explanation": reranker_result.explanation,
    },
  }

def _build_code_context(
    retrieved_files: List[str],
    sources: Dict[str, str],
    max_chars_per_file: int = 2500,
    total_cap: int = 10_000,
) -> str:
    """
    Assemble a tight code context block.

    Enforces both a per-file cap and a total character cap so the reasoning
    prompt never balloons regardless of how many files are retrieved.
    """
    parts: List[str] = []
    total = 0
    for fp in retrieved_files:
        src = sources.get(fp, "")
        if not src:
            continue
        snippet = src[:max_chars_per_file]
        if total + len(snippet) > total_cap:
            remaining = total_cap - total
            if remaining < 200:
                break
            snippet = snippet[:remaining]
        parts.append(f"--- File: {fp} ---\n{snippet}")
        total += len(snippet)
        if total >= total_cap:
            break
    return "\n\n".join(parts)

def _build_code_context_with_decay(
    core_files: List[str],
    supporting_files: List[str],
    sources: Dict[str, str],
    *,
    core_max_chars: int = 2200,
    supporting_max_chars: int = 700,
    total_cap: int = 8_000,
) -> str:
    """
    Build a context block that enforces *importance decay*.

    - Core files dominate the prompt (larger snippets).
    - Supporting files are included as lightweight breadcrumbs only.
    """
    parts: List[str] = []
    total = 0

    def _add(fp: str, cap: int, label: str) -> None:
        nonlocal total
        src = sources.get(fp, "")
        if not src:
            return
        snippet = src[:cap]
        if total + len(snippet) > total_cap:
            remaining = total_cap - total
            if remaining < 200:
                return
            snippet = snippet[:remaining]
        parts.append(f"--- {label}: {fp} ---\n{snippet}")
        total += len(snippet)

    for fp in core_files:
        _add(fp, core_max_chars, "CORE FILE")
        if total >= total_cap:
            break

    if total < total_cap and supporting_files:
        parts.append("--- SUPPORTING FILES (low importance; use only if directly tied to issue entities) ---")
        for fp in supporting_files:
            _add(fp, supporting_max_chars, "SUPPORTING FILE")
            if total >= total_cap:
                break

    return "\n\n".join(parts)

def _extract_first_path_token(text: str) -> str:
    """Extract a likely file path token from the start of a string."""
    if not text:
        return ""
    t = text.strip().lstrip("(")
    return re.split(r"[\s)→:,—–-]", t, maxsplit=1)[0].strip()

def _filter_list_of_strings_by_paths(items: list, valid_path_set: set) -> list:
    """Drop items that reference a non-retrieved file path token."""
    if not isinstance(items, list):
        return items
    cleaned = []
    for it in items:
        if not isinstance(it, str):
            cleaned.append(it)
            continue
        stripped = it.strip()
        if re.match(r"^(step|phase)\s+\d+", stripped.lower()):
          cleaned.append(it)
          continue

        p = _extract_first_path_token(stripped)
        if not p:
            cleaned.append(it)
            continue
        if p in valid_path_set:
            cleaned.append(it)
            continue
        else:
            logger.warning(f"Stripped hallucinated path from list item: {p!r}")
    return cleaned

def find_model_related_files(sources: Dict[str, str]) -> List[dict]:
  """
  Find files most likely related to ML/deepfake model loading,
  inference, prediction, or weight initialization.
  """

  scored_files = []

  for fp, src in sources.items():
    src_lower = src.lower()

    score = 0
    matched_keywords = []

    for kw in MODEL_KEYWORDS:
      if kw.lower() in src_lower:
        score += 1
        matched_keywords.append(kw)

    if fp.endswith(".py",) and any(kw in src_lower for kw in [".ts", ".tsx", ".js", ".jsx", ".go", ".rs",
            ".java", ".kt", ".c", ".cpp", ".h", ".rb", ".md",
            ".yaml", ".yml", ".toml", ".json",".ipynb"]):
      score += 2

    if any(x in fp.lower() for x in [
      "model",
      "infer",
      "predict",
      "detect",
      "service",
      "backend",
      "classifier",
    ]):
      score += 3

    if score > 0:
      scored_files.append({
        "path": fp,
        "score": score,
        "matched_keywords": matched_keywords[:10],
      })

  scored_files.sort(key=lambda x: x["score"], reverse=True)

  return scored_files[:10]

def _generate_patch(
    retrieved_files: List[str],
    sources: Dict[str, str],
    issue_full: str,
) -> Optional[dict]:
    """Ask the LLM to produce a unified diff for the most relevant file."""
    if not retrieved_files:
        return None

    primary_file = retrieved_files[0]
    original     = sources.get(primary_file, "")
    if not original:
        return None

    prompt = f"""You are a senior engineer. Given the issue and the file below, produce a minimal unified diff (--- a/file  +++ b/file format) that fixes or implements the issue.
Output ONLY the diff, no explanation, no markdown fences.

Issue:
{issue_full[:500]}

File ({primary_file}):
{original[:2500]}"""
    try:
        diff_text = str(Settings.llm.complete(prompt)).strip()
        if diff_text.startswith(("---", "@@", "diff")):
            return {"file_path": primary_file, "diff": diff_text}
    except Exception as exc:
        logger.warning(f"Patch generation failed: {exc}")
    return None

def _build_grounding_preamble(
    valid_paths: List[str],
    low_confidence: bool,
    confidence_tier: str,
    reranker_explanation: str,
) -> str:
    """
    Build the grounding preamble that is prepended to every reasoning prompt.

    When confidence is LOW or PENALISED the preamble is expanded with an
    explicit uncertainty directive so the model admits rather than invents.
    """
    path_list = "\n".join(f"  - {p}" for p in valid_paths) or "  (none)"

    base = (
        "═══════════════════════════════════════════════════════\n"
        "GROUNDING CONTRACT — READ BEFORE GENERATING ANY OUTPUT\n"
        "═══════════════════════════════════════════════════════\n"
        "You are an expert open-source mentor. You MUST follow every rule below.\n\n"
        "RULE 1 — FILE SCOPE\n"
        f"  You may ONLY reference files from this exact list:\n{path_list}\n"
        "  Any file_path value in your JSON that is NOT in this list is a hallucination.\n\n"
        "RULE 2 — NO INVENTION\n"
        "  Do NOT invent function names, class names, variable names, or documentation links.\n"
        "  Every symbol you mention must appear verbatim in the source code provided.\n\n"
        "RULE 3 — UNCERTAINTY\n"
        "  If the code context is insufficient to answer with confidence, say so explicitly.\n"
        "  Use phrases like 'Based on available context…' or 'This cannot be determined from the retrieved files.'\n\n"
        "RULE 4 — NO SPECULATION\n"
        "  Do NOT suggest files that are not in the list above, even if you think they might exist.\n"
        "  Do NOT reference README, CONTRIBUTING, or documentation files unless they appear in the list.\n\n"
    )

    confidence_block = (
        f"LOCALISATION CONFIDENCE: {confidence_tier}\n"
        f"RERANKER ASSESSMENT: {reranker_explanation}\n\n"
    )

    if low_confidence:
        uncertainty_directive = (
            "⚠ LOW-CONFIDENCE WARNING ⚠\n"
            "The bug localisation system has LOW confidence that the retrieved files\n"
            "are the correct fix location. You MUST:\n"
            "  • Begin your 'explanation' field with: 'Note: localisation confidence is low.'\n"
            "  • State in 'common_mistakes' that the fix location may differ from retrieved files.\n"
            "  • Do NOT produce a confident step-by-step patch if evidence is insufficient.\n"
            "  • Set 'where_to_start' to the most likely candidate but flag uncertainty.\n\n"
        )
        return base + confidence_block + uncertainty_directive
    else:
        return base + confidence_block

def run_reasoning_agent(
    tree: str,
    retrieved_files: List[str],
    sources: Dict[str, str],
    issue_full: str,
    include_patch: bool = False,
    reranker_meta: Optional[dict] = None,
) -> dict:
    """
    Confidence-aware mentorship reasoning agent.

    New behaviour vs. previous version:
    - Grounding preamble is dynamically constructed from reranker confidence
    - LOW/PENALISED confidence triggers explicit uncertainty directives in prompt
    - The reranker's explanation and anchor file are injected into the prompt
    - File-path validation: any path invented by the LLM that isn't in the
      retrieved set is stripped from the output before returning
    - dep_chain is always computed statically and injected — never LLM-generated
    """
    reranker_meta    = reranker_meta or {}
    low_confidence   = reranker_meta.get("low_confidence", False)
    confidence_tier  = reranker_meta.get("confidence_tier", "UNKNOWN")
    reranker_explain = reranker_meta.get("explanation", "No reranker metadata available.")
    anchor_file      = reranker_meta.get("anchor_file")
    overall_score    = reranker_meta.get("overall_confidence")

    ordered = list(dict.fromkeys(
        ([anchor_file] if anchor_file and anchor_file in retrieved_files else []) +
        [f for f in retrieved_files if f != anchor_file]
    ))
    core_files       = ordered[:2]
    supporting_files = ordered[2:6]
    code_context = _build_code_context_with_decay(
        core_files=core_files,
        supporting_files=supporting_files,
        sources=sources,
        core_max_chars=2200,
        supporting_max_chars=650,
        total_cap=8_000,
    )
    dep_chain: List[str] = []
    for fp in core_files[:2]:
        dep_chain.extend(build_dependency_chain(fp, sources))
    dep_chain = list(dict.fromkeys(dep_chain))[:12]

    file_role_lines: List[str] = []
    for fp in retrieved_files:
        src  = sources.get(fp, "")
        role = classify_file_role(fp, src)
        file_role_lines.append(f"  - {fp}  [{role}]")
    file_role_str = "\n".join(file_role_lines) or "  (none)"

    anchor_hint = (
        f"ANCHOR FILE (highest symbol-match confidence): {anchor_file}\n"
        if anchor_file else ""
    )

    grounding_preamble = _build_grounding_preamble(
        valid_paths          = retrieved_files,
        low_confidence       = low_confidence,
        confidence_tier      = confidence_tier,
        reranker_explanation = reranker_explain,
    )

    uncertainty_note = (
        '"Note: localisation confidence is low — fix location may differ from retrieved files."'
        if low_confidence else
        '"Based on the retrieved source code…"'
    )

    issue_entities = extract_issue_entities(issue_full)
    focus_symbols  = [e.text for e in issue_entities if e.kind in ("symbol", "error_type") and e.confidence >= 0.60][:12]
    focus_paths    = [e.text for e in issue_entities if e.kind == "filepath" and e.confidence >= 0.70][:8]
    focus_modules  = [e.text for e in issue_entities if e.kind == "module" and e.confidence >= 0.70][:8]
    focus_block = (
        "ISSUE-FOCUS ENTITIES (highest precision; prioritize these):\n"
        f"  - symbols/errors: {', '.join(focus_symbols) if focus_symbols else '(none)'}\n"
        f"  - filepaths:      {', '.join(focus_paths) if focus_paths else '(none)'}\n"
        f"  - modules:        {', '.join(focus_modules) if focus_modules else '(none)'}\n"
    )

    prompt = f"""
  CRITICAL RULES:
- Return ONLY valid JSON.
- Do NOT include markdown.
- Do NOT explain anything outside JSON.
- Do NOT wrap in ``` blocks.
- Output MUST start with {{
- Output MUST end with }}

{grounding_preamble}
You are a patient, expert open-source mentor helping a BEGINNER make their first contribution.
Produce a structured contribution guide that is STRICTLY ISSUE-CENTRIC:
- Focus ONLY on runtime paths, middleware flows, configuration flows, and symbols directly referenced by the issue.
- Treat supporting/infrastructure/utility modules as LOW importance unless they contain a focused entity above.
- Do NOT provide broad repository explanations. Every sentence must connect to a focused entity or the anchor file.

{anchor_hint}File roles:
{file_role_str}

Core files (highest importance): {", ".join(core_files) if core_files else "(none)"}
Supporting files (low importance): {", ".join(supporting_files) if supporting_files else "(none)"}

{focus_block}

Issue:
{issue_full[:800]}

Relevant source code (ONLY reference symbols that appear in the code below):
{code_context}

Dependency chain (statically computed — do not modify):
{chr(10).join(dep_chain) if dep_chain else "N/A"}

Return ONLY valid JSON — no markdown fences, no commentary outside the JSON object.
Start your "explanation" with exactly: {uncertainty_note}

{{
  "where_to_start": "<file path from valid list + function name found in that file's source>",
  "what_to_read_first": [
    "<file_path — specific thing to look for in that file>",
    "<file_path — specific thing to look for in that file>"
  ],
  "explanation": "<begin with the uncertainty_note above, then 2-4 sentences grounded in the code>",
  "logic_trace": [
    "Step 1: (exact_file.py) <what this file does relative to the issue>",
    "Step 2: (exact_file.py) <what happens next>"
  ],
  "contribution_path": [
    {{
      "step": 1,
      "title": "<imperative verb phrase>",
      "description": "<concrete instruction — cite only symbols visible in the source above>",
      "files_involved": ["<path from valid list only>"]
    }}
  ],
  "common_mistakes": [
    "<concrete pitfall drawn from the actual code>",
    "<second pitfall or uncertainty warning if confidence is low>"
  ],
  "dependency_chain": {json.dumps(dep_chain)},
  "confidence_note": "<one sentence summarising how confident the localisation is and why>"
}}"""

    valid_path_set: set = set(retrieved_files)

    def _sanitise(result: dict) -> dict:
        """
        Strip any file paths the LLM invented that aren't in the retrieved set.
        Mutates and returns the result dict.
        """
        wts = result.get("where_to_start", "")
        if wts:
            wts_path = re.split(r"[\s→:,]", wts)[0].strip()
            if wts_path and wts_path not in valid_path_set:
                logger.warning(f"Reasoning agent hallucinated where_to_start path: {wts_path!r}")
                result["where_to_start"] = retrieved_files[0] if retrieved_files else ""

        wtrf = result.get("what_to_read_first", [])
        if isinstance(wtrf, list):
            cleaned = []
            for item in wtrf:
                path_part = re.split(r"[\s—–-]", item)[0].strip()
                if path_part in valid_path_set or path_part not in sources:
                    cleaned.append(item)
                else:
                    logger.warning(f"Stripped hallucinated path from what_to_read_first: {path_part!r}")
            result["what_to_read_first"] = cleaned

        result["logic_trace"] = _filter_list_of_strings_by_paths(
            result.get("logic_trace", []),
            valid_path_set,
        )

        for step in result.get("contribution_path", []):
            fi = step.get("files_involved", [])
            if isinstance(fi, list):
                step["files_involved"] = [
                    f for f in fi if f in valid_path_set
                ]

        return result

    try:
        response_format = {"type": "json_object"}
        resp   = str(Settings.llm.complete(prompt, response_format=response_format))
        result = extract_json(resp)

        if not result:
            logger.warning("Reasoning agent: no valid JSON; using structured fallback.")
            result = _low_confidence_fallback(retrieved_files, dep_chain, low_confidence)
        else:
            result = _sanitise(result)
            # Always inject static dep_chain (model must not modify it)
            result["dependency_chain"] = dep_chain
            # Inject reranker metadata
            result["localisation_confidence"] = {
                "tier":          confidence_tier,
                "score":         overall_score,
                "anchor_file":   anchor_file,
                "low_confidence": low_confidence,
            }

            result["most_likely_fix_zone"] = {
                "file_path":          core_files[0] if core_files else (retrieved_files[0] if retrieved_files else ""),
                "localisation_tier":  confidence_tier,
                "localisation_score": overall_score,
                "anchor_file":        anchor_file,
                "focus_symbols":      focus_symbols,
            }

            if low_confidence:
                expl = str(result.get("explanation", "") or "")
                if "localisation confidence is low" not in expl.lower():
                    result["explanation"] = (
                        "Note: localisation confidence is low — fix location may differ from retrieved files. "
                        + expl
                    ).strip()

    except Exception as exc:
        logger.error(f"Reasoning agent error: {exc}")
        result = {
            "explanation":             f"Failed to generate guide: {exc}",
            "where_to_start":          retrieved_files[0] if retrieved_files else "",
            "what_to_read_first":      retrieved_files[:2],
            "logic_trace":             ["Error during reasoning — review retrieval results manually."],
            "contribution_path":       [],
            "common_mistakes":         ["An internal error occurred. Verify the repository was indexed correctly."],
            "dependency_chain":        dep_chain,
            "confidence_note":         "Reasoning failed; confidence cannot be assessed.",
            "localisation_confidence": reranker_meta,
        }

    if include_patch:
        if not low_confidence:
            result["suggested_patch"] = _generate_patch(retrieved_files, sources, issue_full)
        else:
            result["suggested_patch"] = None

    return result

def _low_confidence_fallback(
    retrieved_files: List[str],
    dep_chain: List[str],
    low_confidence: bool,
) -> dict:
    """Structured fallback when the LLM fails to produce valid JSON."""
    uncertainty = (
        "Note: localisation confidence is low — fix location may differ from retrieved files. "
        if low_confidence else ""
    )
    return {
        "where_to_start":     retrieved_files[0] if retrieved_files else "",
        "what_to_read_first": retrieved_files[:2],
        "explanation": (
            f"{uncertainty}The AI retrieved relevant files but could not format a structured guide. "
            "Review the files in the retrieval section to begin your investigation."
        ),
        "logic_trace":       ["Manual review required — see retrieved files above."],
        "contribution_path": [{
            "step": 1,
            "title": "Review retrieved files",
            "description": (
                "Open each file listed in the retrieval section and search for the "
                "symbols mentioned in the issue (class/function names). Start with the "
                "highest-confidence file."
            ),
            "files_involved": retrieved_files[:3],
        }],
        "common_mistakes": [
            "Do not modify files not listed in the retrieval results.",
            "Verify the fix location manually before writing code — confidence is low."
            if low_confidence else
            "Ensure you understand the dependency chain before modifying files.",
        ],
        "dependency_chain":        dep_chain,
        "confidence_note":         "Fallback response — LLM formatting error.",
        "localisation_confidence": None,
    }

def run_repo_qa(engine_bundle: dict, question: str) -> dict:
    import time
    t0 = time.perf_counter()
    
    sources = engine_bundle.get("sources", {})
    project_structure = engine_bundle.get("project_structure", [])
    truncated = engine_bundle.get("truncated", False)

    question_lower = question.lower()
    
    retrieval = run_retrieval_agent(engine_bundle, question)
    raw_files = [f["path"] for f in retrieval.get("relevant_files", []) if "path" in f]
    retrieved_files = [f for f in raw_files if f in sources]
    
    context_parts = []
    total_len = 0
    for fp in retrieved_files:
        src = sources[fp]
        numbered_src = "\n".join(f"{i+1:4d} | {line}" for i, line in enumerate(src.split("\n")))
        snippet = f"--- {fp} ---\n{numbered_src}\n"
        if total_len + len(snippet) > 6000:
            break
        context_parts.append(snippet)
        total_len += len(snippet)
    
    code_context = "\n".join(context_parts)
    valid_paths = "\n".join(f"  - {fp}" for fp in retrieved_files) or "  (none)"

    prompt = f"""You are an expert AI mentor helping a developer understand a codebase.
Answer the question using ONLY the source code chunks provided below. 
Do not invent code, outputs, or attribute names. Quote identifiers exactly as they appear.
If the answer cannot be found in the context, say "not found in the retrieved files" and avoid generic tutorials.
Include the exact file path for every claim. Keep your answer concise (under ~250 words unless more is needed).

Files you may reference:
{valid_paths}

Question: {question[:600]}

Relevant source code (with line numbers):
{code_context}

Format your answer as a JSON object with:
- "answer": Markdown string (use headings, lists, fenced code blocks with language tags, NEVER use '...').
- "sections": Array of objects {{ "title": string, "content": string (Markdown), "references": [string] (MUST be exact paths from the Files list above) }}
"""
    
    sections = []
    answer = ""
    kwargs = {"temperature": 0.1}
    
    schema = {
        "type": "object",
        "properties": {
            "answer": {"type": "string"},
            "sections": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "content": {"type": "string"},
                        "references": {
                            "type": "array",
                            "items": {"type": "string"}
                        }
                    },
                    "required": ["title", "content", "references"]
                }
            }
        },
        "required": ["answer", "sections"]
    }
    
    try:
        if "ollama" in Settings.llm.__class__.__name__.lower():
            import json
            resp = Settings.llm.complete(prompt, format=schema, **kwargs)
            parsed = json.loads(str(resp).strip())
        else:
            resp = Settings.llm.complete(prompt, **kwargs)
            parsed = extract_json(str(resp))
            
        answer = parsed.get("answer", "")
        sections = parsed.get("sections", [])
            
    except Exception as exc:
        logger.warning(f"QA agent JSON error: {exc}. Retrying...")
        try:
            resp = Settings.llm.complete(prompt, **kwargs)
            parsed = extract_json(str(resp))
            answer = parsed.get("answer", "")
            sections = parsed.get("sections", [])
        except Exception:
            answer = str(resp) if 'resp' in locals() else "Fallback response."
            sections = [{"title": fp, "content": f"Relevant file found: {fp}", "references": [fp]} for fp in retrieved_files[:3]]
    
    valid_sections = []
    for s in sections:
        refs = [r for r in s.get("references", []) if r in sources]
        
        content = s.get("content", "")
        # Strip "**Sources**" or similar block from content if the LLM hallucinated it
        sources_idx = content.find("**Sources**")
        if sources_idx != -1:
            content = content[:sources_idx].strip()
            
        valid_sections.append({
            "title": s.get("title", "Section"),
            "content": content,
            "references": list(set(refs))
        })
        
    citations = []
    for f in retrieved_files[:3]:
        citations.append({
            "file": f,
            "start_line": 1,
            "end_line": min(10, len(sources[f].split("\n"))),
            "snippet": sources[f][:300]
        })
        
    t_end = time.perf_counter()
    timings = retrieval.get("timings", {})
    timings["total_generation"] = (t_end - t0) * 1000
    timings["total"] = timings.get("total", 0) + timings["total_generation"]
    
    return {
        "answer": answer,
        "relevant_files": retrieved_files,
        "project_structure": project_structure,
        "sections": valid_sections,
        "citations": citations,
        "truncated": truncated,
        "timings": timings,
    }

async def build_query_engine_async(content: str, repo_name: str, commit_sha: str = "") -> dict:
    """
    Run build_query_engine in a thread pool so the FastAPI event loop stays
    responsive during the CPU/GPU-heavy embedding phase.
    """
    return await asyncio.to_thread(build_query_engine, content, repo_name, commit_sha)
def compute_complexity_factors(sources: dict, fix_zone: dict) -> dict:
    factors = {
        "files_touched": 1,
        "target_function_complexity": 0,
        "has_tests": False,
        "cross_module": False
    }
    if not fix_zone:
        return factors
        
    fp = fix_zone.get("file_path")
    if fp and fp in sources and fp.endswith(".py"):
        src = sources[fp]
        try:
            from radon.complexity import cc_visit
            blocks = cc_visit(src)
            funcs = fix_zone.get("likely_functions", [])
            max_c = 0
            for b in blocks:
                if b.name in funcs and b.complexity > max_c:
                    max_c = b.complexity
            if max_c > 0:
                factors["target_function_complexity"] = max_c
            elif blocks:
                factors["target_function_complexity"] = max(b.complexity for b in blocks)
        except Exception:
            pass
            
    return factors

import asyncio

async def build_query_engine_progressive(content: str, repo_name: str, commit_sha: str = ""):
    embed_model_name = getattr(Settings.embed_model, "model_name", "default")
    config_str = f"{repo_name}_{commit_sha}_{embed_model_name}_{settings.chunk_size}_{settings.chunk_overlap}"
    repo_hash = hashlib.md5(config_str.encode()).hexdigest()[:16]
    safe_name = f"idx_{repo_hash}"

    collection = _chroma_client.get_or_create_collection(safe_name)
    metadata = collection.metadata or {}
    is_complete = metadata.get("status") == "complete"
    
    if not is_complete and collection.count() > 0:
        _chroma_client.delete_collection(safe_name)
        collection = _chroma_client.create_collection(safe_name)
        
    vector_store = ChromaVectorStore(chroma_collection=collection)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)

    t0 = time.perf_counter()
    files = await asyncio.to_thread(_split_repo_content, content)
    t_filter = time.perf_counter() - t0
    

    sources = {fp: src for fp, src in files}
    file_priorities = {fp: _file_priority(fp) for fp, _ in files}

    cache_dir = os.path.join(".cache", safe_name)
    os.makedirs(cache_dir, exist_ok=True)
    tree_path = os.path.join(cache_dir, "tree.json")
    sources_path = os.path.join(cache_dir, "sources.json")
    
    if os.path.exists(tree_path) and os.path.exists(sources_path) and is_complete:
        with open(tree_path, "r") as f:
            tree_data = json.load(f)
            project_structure = tree_data.get("project_structure", [])
            truncated = tree_data.get("truncated", False)
        with open(sources_path, "r") as f:
            sources = json.load(f)
    else:
        project_structure, truncated = build_project_tree(sources)
        with open(tree_path, "w") as f:
            json.dump({"project_structure": project_structure, "truncated": truncated}, f)
        with open(sources_path, "w") as f:
            json.dump(sources, f)

    # BM25 build

    bm25_corpus, bm25_nodes = [], []
    for fp, src in files:
        tokens = re.findall(r"[a-zA-Z_]\w*", src)
        bm25_corpus.append(tokens)
        bm25_nodes.append({"file_path": fp, "text": src[:4_000]})

    bm25 = BM25Okapi(bm25_corpus) if bm25_corpus else None
    

    bundle = {
        "vector_index": None,
        "bm25": bm25,
        "bm25_nodes": bm25_nodes,
        "sources": sources,
        "file_priorities": file_priorities,
        "is_embedding": not is_complete,
        "project_structure": project_structure,
        "truncated": truncated
    }

    
    yield {"status": "bm25_ready", "bundle": bundle}

    if is_complete and collection.count() > 0:
        logger.info(f"Reusing Chroma collection '{safe_name}'...")
        index = VectorStoreIndex.from_vector_store(vector_store, storage_context=storage_context)
        bundle["vector_index"] = index
        bundle["is_embedding"] = False
        yield {"status": "ready", "bundle": bundle}
        return

    # Background embedding
    logger.info(f"Building '{safe_name}'...")
    
    def _prepare_nodes():
        docs = []
        for fp, src in files:
            meta = _rich_metadata(fp, src)
            docs.append(Document(
                text=src,
                metadata=meta,
                excluded_embed_metadata_keys=["functions", "classes", "imports", "priority"],
                excluded_llm_metadata_keys=["functions", "classes", "imports", "priority"],
            ))
        small_docs = [d for d in docs if len(d.text) <= _LARGE_FILE_THRESHOLD]
        large_docs = [d for d in docs if len(d.text) > _LARGE_FILE_THRESHOLD]
        all_nodes = []
        if small_docs:
            small_splitter = SentenceSplitter(chunk_size=settings.chunk_size, chunk_overlap=settings.chunk_overlap)
            all_nodes.extend(small_splitter.get_nodes_from_documents(small_docs))
        if large_docs:
            large_splitter = SentenceSplitter(chunk_size=settings.chunk_size // 2, chunk_overlap=settings.chunk_overlap // 2)
            all_nodes.extend(large_splitter.get_nodes_from_documents(large_docs))
        return all_nodes
        
    all_nodes = await asyncio.to_thread(_prepare_nodes)
    
    total = len(all_nodes)
    done = 0
    
    # We will embed in batches and yield progress
    batch_size = 32
    
    def _embed_batch(batch):
        # We can use index.insert_nodes which does embedding and writing
        # Wait, if we create an empty VectorStoreIndex:
        idx = VectorStoreIndex([], storage_context=storage_context)
        idx.insert_nodes(batch)
        return idx
        
    index = VectorStoreIndex([], storage_context=storage_context)
    
    start_time = time.time()
    for i in range(0, total, batch_size):
        batch = all_nodes[i:i+batch_size]
        await asyncio.to_thread(index.insert_nodes, batch)
        done += len(batch)
        percent = int(done * 100 / total)
        elapsed = time.time() - start_time
        eta = int((elapsed / done) * (total - done)) if done > 0 else 0
        yield {"status": "embedding_progress", "done": done, "total": total, "percent": percent, "eta_seconds": eta}
        
    collection.modify(metadata={**(collection.metadata or {}), "status": "complete"})
    bundle["vector_index"] = index
    bundle["is_embedding"] = False
    yield {"status": "ready", "bundle": bundle}

