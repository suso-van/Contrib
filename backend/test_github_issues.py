import pytest
from unittest.mock import patch, MagicMock
from github_issues import (
    strip_boilerplate, fast_score_issue, fetch_open_issues,
    detect_linked_pr_and_claimed, _issues_cache, localize_issue
)

def test_boilerplate_stripping():
    text = """- [ ] Checkbox
Code of Conduct
Labels: some label
Title: issue title
Real issue content"""
    stripped = strip_boilerplate(text)
    assert "Real issue content" in stripped
    assert "Checkbox" not in stripped
    assert "Code of Conduct" not in stripped

def test_scoring_monotonicity():
    typo_issue = {
        "labels": [{"name": "typo"}, {"name": "good first issue"}],
        "body": "There is a typo in the readme.",
        "comments": 0
    }
    
    refactor_issue = {
        "labels": [{"name": "refactor"}, {"name": "epic"}],
        "body": "We need to refactor the entire system over the next 3 weeks.\n" * 100,
        "comments": 15
    }
    
    score1, _ = fast_score_issue(typo_issue, [])
    score2, _ = fast_score_issue(refactor_issue, [])
    assert score1 > score2
    assert score1 >= 70 # easy
    assert score2 < 40 # hard

@pytest.mark.asyncio
@patch('httpx.AsyncClient.get')
async def test_fetch_pagination_and_pr_filtering(mock_get):
    class MockResp:
        def __init__(self, data, headers):
            self.data = data
            self.headers = headers
            self.status_code = 200
        def json(self):
            return self.data
        def raise_for_status(self):
            pass
            
    # Page 1: 1 PR, 1 issue
    # Page 2: empty
    mock_get.side_effect = [
        MockResp([{"id": 1, "pull_request": {}}, {"id": 2}], {"x-ratelimit-remaining": "100"}),
        MockResp([], {"x-ratelimit-remaining": "100"})
    ]
    
    res = await fetch_open_issues("https://github.com/foo/bar", max_issues=200)
    assert len(res["issues"]) == 1
    assert res["issues"][0]["id"] == 2
    assert not res["truncated"]

@pytest.mark.asyncio
@patch('httpx.AsyncClient.get')
async def test_rate_limit(mock_get):
    class MockResp:
        def __init__(self):
            self.status_code = 429
            self.headers = {"x-ratelimit-reset": "12345"}
    mock_get.return_value = MockResp()
    
    with pytest.raises(RuntimeError, match="API rate limit exceeded"):
        await fetch_open_issues("https://github.com/foo/bar2")

@pytest.mark.asyncio
@patch('httpx.AsyncClient.get')
async def test_cache_hit(mock_get):
    class MockResp:
        def __init__(self):
            self.status_code = 304
            self.headers = {}
    mock_get.return_value = MockResp()
    _issues_cache["https://github.com/foo/bar3"] = {"issues": [{"id": 99}], "truncated": False, "rate_limit": {}, "etag": "abc", "expires_at": 9999999999}
    res = await fetch_open_issues("https://github.com/foo/bar3")
    assert len(res["issues"]) == 1
    assert res["issues"][0]["id"] == 99

@pytest.mark.asyncio
@patch('httpx.AsyncClient.get')
async def test_detect_linked_pr_and_claimed(mock_get):
    class MockResp:
        def __init__(self, data):
            self.status_code = 200
            self.data = data
        def json(self):
            return self.data
            
    mock_get.return_value = MockResp([
        {"event": "commented", "body": "i'll take this"}
    ])
    
    claimed, reason = await detect_linked_pr_and_claimed("foo", "bar", 1, False)
    assert claimed
    assert reason == "Comment indicates claimed"

def test_sherlock_regression():
    issue = {
        "title": "Break down sherlock() function to multiple helper functions",
        "body": "The `sherlock()` function in `sherlock.py` is too large.",
        "labels": []
    }
    sources = {
        "sherlock_project/sherlock.py": "def sherlock():\n" + "    pass\n" * 60
    }
    
    likely_files = localize_issue(issue, sources)
    assert likely_files[0]["path"] == "sherlock_project/sherlock.py"
    
    score, _ = fast_score_issue(issue, likely_files)
    # Refactor of a large function should not be "easy"
    # Actually wait, refactor without "refactor" label but high file match score?
    # We explicitly checked "not easy", so score < 70
    assert score < 70
