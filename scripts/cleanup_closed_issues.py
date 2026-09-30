"""Remove status:* labels from closed Issues.

GitHub forge property: a closed Issue carries no active status:* label, since the
forge closed state and its reason are the durable resolution.

The labels come off regardless of how the Issue was closed (ACCEPTOR merge, operator
action, etc). Until #770 nothing ran this on closure, and 88 closed Issues kept a status
label; the forge now applies the rule on every closure through `issue_status.py`
(`.github/workflows/issue-status.yml`). The command line below still clears one Issue
by hand.

This module is also the one definition of what a status label *is*: `is_status_label`,
which the two filters below and `issue_status.py` all use. A second spelling of the
prefix elsewhere would let the closed-Issue rule and the open-Issue rule disagree about
which labels are theirs.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Optional

STATUS_PREFIX = "status:"


def is_status_label(name) -> bool:
    """Whether a label name is on the `status:*` axis. The one definition; see above."""
    return isinstance(name, str) and name.startswith(STATUS_PREFIX)


def filter_status_labels(labels: list[dict]) -> list[str]:
    """Extract label names that do NOT start with 'status:'.

    Args:
        labels: List of label dictionaries with 'name' field

    Returns:
        List of label names that should be kept (not status:* labels)
    """
    return [label["name"] for label in labels if not is_status_label(label["name"])]


def get_status_labels(labels: list[dict]) -> list[str]:
    """Extract label names that start with 'status:'.

    Args:
        labels: List of label dictionaries with 'name' field

    Returns:
        List of status:* label names to be removed
    """
    return [label["name"] for label in labels if is_status_label(label["name"])]


def remove_label_from_issue(
    issue_number: int,
    label_name: str,
    repo: str,
    github_token: str,
) -> tuple[bool, str]:
    """Remove a single label from a GitHub Issue via API.

    Args:
        issue_number: GitHub Issue number
        label_name: Name of the label to remove
        repo: Repository in format owner/name
        github_token: GitHub API token

    Returns:
        (success: bool, message: str)
    """
    if not github_token:
        return False, f"Issue #{issue_number}: no GitHub token provided"

    api_url = f"https://api.github.com/repos/{repo}/issues/{issue_number}/labels/{label_name}"

    try:
        request = urllib.request.Request(
            api_url,
            method="DELETE",
            headers={
                "Authorization": f"Bearer {github_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "trade-simulation-label-cleanup",
            },
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            response.read()
        return True, f"Removed label '{label_name}' from Issue #{issue_number}"
    except urllib.error.HTTPError as e:
        return False, f"Failed to remove '{label_name}' from Issue #{issue_number}: HTTP {e.code}"
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return False, f"API error removing '{label_name}' from Issue #{issue_number}: {e}"


def remove_status_labels_from_issue(
    issue_number: int,
    issue_labels: list[dict],
    repo: str,
    github_token: Optional[str] = None,
) -> tuple[bool, str]:
    """Remove status:* labels from a closed Issue.

    Args:
        issue_number: GitHub Issue number
        issue_labels: List of label dictionaries currently on the Issue
        repo: Repository in format owner/name
        github_token: GitHub API token (uses GITHUB_TOKEN env var if not provided)

    Returns:
        (success: bool, message: str)
    """
    status_labels = get_status_labels(issue_labels)

    if not status_labels:
        return True, f"Issue #{issue_number}: no status:* labels found"

    if not github_token:
        return False, f"Issue #{issue_number}: no GitHub token provided; cannot remove {len(status_labels)} label(s)"

    messages = []
    all_succeeded = True

    for label in status_labels:
        success, message = remove_label_from_issue(
            issue_number,
            label,
            repo,
            github_token,
        )
        messages.append(message)
        if not success:
            all_succeeded = False

    result_msg = f"Issue #{issue_number}: {'removed' if all_succeeded else 'partially removed'} {len(status_labels)} status:* label(s)"
    if messages:
        result_msg += f" ({'; '.join(messages)})"

    return all_succeeded, result_msg


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Remove status:* labels from a closed GitHub Issue"
    )
    parser.add_argument(
        "--issue",
        type=int,
        required=True,
        help="Issue number to clean up",
    )
    parser.add_argument(
        "--labels",
        type=str,
        default="[]",
        help="JSON array of label objects with 'name' field",
    )
    parser.add_argument(
        "--repo",
        type=str,
        default=os.environ.get("GITHUB_REPOSITORY", ""),
        help="Repository (owner/name)",
    )
    parser.add_argument(
        "--token",
        type=str,
        default=os.environ.get("GITHUB_TOKEN", ""),
        help="GitHub API token",
    )

    args = parser.parse_args()

    if not args.repo:
        print("Error: --repo or GITHUB_REPOSITORY env var required", file=sys.stderr)
        return 1

    try:
        labels = json.loads(args.labels)
    except json.JSONDecodeError as e:
        print(f"Error parsing labels JSON: {e}", file=sys.stderr)
        return 1

    success, message = remove_status_labels_from_issue(
        args.issue,
        labels,
        args.repo,
        args.token,
    )

    print(message)
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
