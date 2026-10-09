from pydantic import BaseModel, Field, model_validator
from typing import Optional, List

class RepoLoadRequest(BaseModel):
  repo_url: str

class RepoQARequest(BaseModel):
  repo_url: str
  question: str


class AnalyzeRequest(BaseModel):
  repo_url: str

  issue_text: Optional[str] = None
  issue_title: Optional[str] = None

  issue_url: Optional[str] = None

  @model_validator(mode="after")
  def require_issue_source(self) -> "AnalyzeRequest":
    has_issue_url = bool(
      self.issue_url and self.issue_url.strip()
    )

    has_issue_text = bool(
      self.issue_text and self.issue_text.strip()
    )

    has_issue_title = bool(
      self.issue_title and self.issue_title.strip()
    )

    if not (
      has_issue_url or
      has_issue_text or
      has_issue_title
    ):
      raise ValueError(
        "Provide either "
        "'issue_text', "
        "'issue_title', "
        "or 'issue_url'."
      )

    return self

class RelevantFile(BaseModel):
  path: str
  relevance: str = "high"
  reason: str
  functions: List[str] = Field(default_factory=list)
  classes: List[str] = Field(default_factory=list)
  role: Optional[str] = None

class ContributionStep(BaseModel):
  step: int
  title: str
  description: str
  files_involved: List[str] = Field(default_factory=list)

class PatchHunk(BaseModel):
  file_path: str
  diff: str

class CodeExplanation(BaseModel):
  where_to_start: str = Field(
    description="The very first file or function a beginner should open."
  )
  what_to_read_first: List[str] = Field(
    description="Ordered list of files/sections to read before touching code."
  )
  explanation: str = Field(
    description="Plain-English explanation of what the relevant code does."
  )
  logic_trace: List[str] = Field(
    description="Step-by-step reasoning trace across connected files."
  )
  contribution_path: List[ContributionStep] = Field(
    description="Actionable, ordered steps for the contributor."
  )
  common_mistakes: List[str] = Field(
    description="Pitfalls a beginner is likely to hit on this issue."
  )
  dependency_chain: List[str] = Field(
    default_factory=list,
    description="Import/call chain leading to the affected code.",
  )
  suggested_patch: Optional[PatchHunk] = Field(
    default=None,
    description="Optional unified diff with a concrete code fix.",
  )

class TreeNode(BaseModel):
  name: str
  path: str
  type: str
  children: Optional[List["TreeNode"]] = None

class Section(BaseModel):
  title: str
  content: str
  references: List[str] = Field(default_factory=list)

class Citation(BaseModel):
  file: str
  start_line: int
  end_line: int
  snippet: str

class AskResponse(BaseModel):
  repo_name: str
  answer: str = ""
  relevant_files: List[str] = Field(default_factory=list)
  project_structure: List[TreeNode] = Field(default_factory=list)
  sections: List[Section] = Field(default_factory=list)
  citations: List[Citation] = Field(default_factory=list)
  truncated: Optional[bool] = None

TreeNode.model_rebuild()
class Timings(BaseModel):
    ingest: float = 0.0
    embed_query: float = 0.0
    bm25: float = 0.0
    rerank: float = 0.0
    prompt_build: float = 0.0
    time_to_first_token: float = 0.0
    total_generation: float = 0.0

class RepoIssuesRequest(BaseModel):
    repo_url: str
    limit: int = 50
    state: str = "open"
    deep_top_n: int = 5
    stream: bool = False
