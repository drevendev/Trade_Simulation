"""The forge reports what it measured on a head, and never more than it measured (#765).

Three things are held here.

The **diff identity** is what lets a handoff and a verdict survive a base merge, so it
is proven on real commits rather than on strings: the same across a merge of the base
that moved the pull request's hunks, different the moment a line of content changes —
even a space — and different when the base merge had to resolve a conflict inside the
pull request's own lines.

The **comment** is made only of measurements: four green checks or no comment at all,
one comment per head, and only the forge's own earlier comment counts as already said.

The **workflow** runs `master`'s definition, reads the judged head as data, and holds
grants no wider than reading. Those are text assertions, like the other workflow
tests — standard library only — and every one is paired with a synthetic edit that it
refuses, because a check that only ever sees the shipped file cannot be told apart from
one that checks nothing.
"""

import os
import pathlib
import re
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import head_evidence as he  # noqa: E402
import mergeability  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / ".github" / "workflows"
WORKFLOW = WORKFLOWS / "head-evidence.yml"

A = "a" * 40
B = "b" * 40
C = "c" * 40
D = "d" * 40
M1 = "1" * 40
M2 = "2" * 40


# ----------------------------------------------------------------------------- pure


class IdentityTests(unittest.TestCase):
    BEFORE = (
        "diff --git a/src/x.ts b/src/x.ts\n"
        "index 1111111..2222222 100644\n"
        "--- a/src/x.ts\n"
        "+++ b/src/x.ts\n"
        "@@ -5 +5 @@ function f() {\n"
        "-  return 1;\n"
        "+  return 2;\n"
    )

    def test_a_hunk_that_only_moved_is_the_same_diff(self):
        moved = self.BEFORE.replace("@@ -5 +5 @@ function f() {", "@@ -9 +9 @@ function g() {")
        moved = moved.replace("index 1111111..2222222", "index 3333333..4444444")
        self.assertEqual(he.identity(self.BEFORE), he.identity(moved))

    def test_a_changed_line_is_a_different_diff(self):
        self.assertNotEqual(he.identity(self.BEFORE), he.identity(self.BEFORE.replace("return 2", "return 3")))

    def test_a_space_is_content(self):
        self.assertNotEqual(he.identity(self.BEFORE), he.identity(self.BEFORE.replace("return 2;", "return  2;")))

    def test_another_file_is_a_different_diff(self):
        self.assertNotEqual(he.identity(self.BEFORE), he.identity(self.BEFORE.replace("src/x.ts", "src/y.ts")))

    def test_line_endings_do_not_decide(self):
        self.assertEqual(he.identity(self.BEFORE), he.identity(self.BEFORE.replace("\n", "\r\n")))

    def test_the_identity_is_sixteen_hex_digits(self):
        self.assertRegex(he.identity(self.BEFORE), r"^[0-9a-f]{16}$")


def commits(*described):
    """A reader over commits described as (sha, parents, merges_base, identity[, on_base])."""
    table = {}
    for sha, parents, merges_base, ident, *rest in described:
        table[sha] = he.Commit(sha, tuple(parents), merges_base, bool(rest and rest[0]), ident)
    return table.__getitem__


class WalkTests(unittest.TestCase):
    def test_a_head_that_changed_the_diff_carries_its_own_content(self):
        chain = he.walk(B, commits((B, [A], False, "x"), (A, [], False, "w")))
        self.assertEqual(chain.heads, (B,))
        self.assertFalse(chain.carried)
        self.assertEqual(chain.origin, B)

    def test_the_diff_decides_not_the_kind_of_commit(self):
        # #661's `22feb2aa`: an ordinary commit that regenerated the coverage table. Its
        # diff is its parent's, so what was said about the parent stands for it.
        chain = he.walk(C, commits((C, [B], False, "x"), (B, [A], False, "x"), (A, [], False, "w")))
        self.assertEqual(chain.heads, (B, C))
        self.assertTrue(chain.carried)

    def test_the_walk_never_steps_onto_the_base(self):
        # A pull request whose own diff is empty has the identity of every commit of the
        # base. Without this the walk would run down the base's history to the bound.
        chain = he.walk(B, commits((B, [M2], False, "e"), (M2, [M1], False, "e", True), (M1, [], False, "e", True)))
        self.assertEqual(chain.heads, (B,))
        self.assertFalse(chain.bounded)

    def test_base_merges_with_the_same_diff_are_followed_to_the_last_change(self):
        chain = he.walk(
            D,
            commits(
                (D, [C, M2], True, "x"),
                (C, [B, M1], True, "x"),
                (B, [A], False, "x"),
                (A, [], False, "w"),
            ),
        )
        self.assertEqual(chain.heads, (B, C, D))
        self.assertEqual(chain.origin, B)
        self.assertTrue(chain.carried)
        self.assertFalse(chain.bounded)

    def test_a_base_merge_that_changed_the_diff_ends_the_chain_at_itself(self):
        chain = he.walk(C, commits((C, [B, M1], True, "y"), (B, [A], False, "x")))
        self.assertEqual(chain.heads, (C,))
        self.assertFalse(chain.carried)

    def test_the_chain_stops_at_the_merge_whose_parent_differed(self):
        chain = he.walk(
            D,
            commits((D, [C, M2], True, "y"), (C, [B, M1], True, "y"), (B, [A], False, "x")),
        )
        self.assertEqual(chain.heads, (C, D))

    def test_a_merge_that_brought_content_in_is_where_the_chain_starts(self):
        # Two parents, the second another branch: what it brought in changed the diff.
        chain = he.walk(C, commits((C, [B, A], False, "y"), (B, [], False, "x")))
        self.assertEqual(chain.heads, (C,))

    def test_a_base_merge_is_two_parents_with_the_base_as_the_second(self):
        self.assertTrue(he.is_base_merge(he.Commit(C, (B, M1), True, False, "x")))
        self.assertFalse(he.is_base_merge(he.Commit(C, (B, A), False, False, "x")))
        self.assertFalse(he.is_base_merge(he.Commit(B, (A,), False, False, "x")))
        self.assertFalse(he.is_base_merge(he.Commit(D, (A, B, C), True, False, "x")))

    def test_the_walk_is_bounded_and_says_so(self):
        shas = [f"{n:040x}" for n in range(1, 8)]
        described = [(sha, [shas[i + 1], M1], True, "x") for i, sha in enumerate(shas[:-1])]
        described.append((shas[-1], [], False, "x"))
        chain = he.walk(shas[0], commits(*described), bound=3)
        self.assertTrue(chain.bounded)
        self.assertEqual(chain.heads[-1], shas[0])
        self.assertLess(len(chain.heads), len(shas))


def run(name, conclusion="success", status="completed", started="2026-09-29T17:23:00Z", ident=1):
    return {
        "name": name,
        "status": status,
        "conclusion": conclusion,
        "started_at": started,
        "completed_at": started,
        "id": ident,
        "html_url": f"https://example.invalid/{name}/{ident}",
    }


def status(state="success", created="2026-09-29T17:23:23Z", ident=1, context=None):
    return {
        "context": context or he.STATUS,
        "state": state,
        "created_at": created,
        "id": ident,
        "description": "merges cleanly into the base branch",
    }


ALL_GREEN = [run(name) for name in he.JOBS]


class GreenTests(unittest.TestCase):
    def test_four_green_checks_are_four_rows_in_the_declared_order(self):
        rows, reason = he.green(ALL_GREEN, [status()])
        self.assertEqual(reason, "")
        self.assertEqual([row.name for row in rows], [*he.JOBS, he.STATUS])
        self.assertTrue(all(row.evidence for row in rows))

    def test_a_failed_job_is_named(self):
        runs = [run("build-and-test"), run("typescript", "failure"), run("policy-guard")]
        rows, reason = he.green(runs, [status()])
        self.assertIsNone(rows)
        self.assertIn("`typescript` concluded `failure`", reason)

    def test_a_job_that_never_ran_is_not_green(self):
        rows, reason = he.green(ALL_GREEN[:2], [status()])
        self.assertIsNone(rows)
        self.assertIn("has not run", reason)

    def test_a_job_still_running_is_not_green(self):
        runs = [*ALL_GREEN[:2], run("policy-guard", None, "in_progress")]
        self.assertIsNone(he.green(runs, [status()])[0])

    def test_the_re_run_decides_not_the_run_it_replaced(self):
        earlier = run("typescript", "failure", started="2026-09-29T17:00:00Z", ident=1)
        later = run("typescript", "success", started="2026-09-29T17:20:00Z", ident=2)
        runs = [run("build-and-test"), earlier, later, run("policy-guard")]
        self.assertIsNotNone(he.green(runs, [status()])[0])
        worse = run("typescript", "failure", started="2026-09-29T17:30:00Z", ident=3)
        self.assertIsNone(he.green([*runs, worse], [status()])[0])

    def test_a_missing_status_is_not_green(self):
        rows, reason = he.green(ALL_GREEN, [status(context="something-else")])
        self.assertIsNone(rows)
        self.assertIn("has not been written", reason)

    def test_the_latest_status_decides_whatever_order_they_arrive_in(self):
        old = status("success", "2026-09-29T17:00:00Z", 1)
        new = status("failure", "2026-09-29T17:30:00Z", 2)
        for order in ([old, new], [new, old]):
            with self.subTest(first=order[0]["state"]):
                self.assertIsNone(he.green(ALL_GREEN, order)[0])

    def test_pending_is_not_green(self):
        self.assertIsNone(he.green(ALL_GREEN, [status("pending")])[0])


def pull(ref="zen/issue-1-x", sha=A, state="open", head_repo="o/r", base_repo="o/r"):
    return {
        "number": 661,
        "state": state,
        "head": {"ref": ref, "sha": sha, "repo": {"full_name": head_repo}},
        "base": {"ref": "master", "repo": {"full_name": base_repo}},
    }


class ReportableTests(unittest.TestCase):
    def test_the_loop_s_and_the_outside_author_s_branches_are_reported_on(self):
        for ref in ("zen/issue-657-x", "claude/issue-1-y"):
            with self.subTest(ref=ref):
                self.assertEqual(he.reportable(pull(ref), A), (True, ""))

    def test_everything_else_is_left_alone_and_says_why(self):
        cases = {
            "not open": pull(state="closed"),
            "no longer its head": pull(sha=B),
            "not in this repository": pull(head_repo="fork/r"),
            "machine class": pull("spec-mirror"),
            "not a loop branch": pull("policy/765-x"),
        }
        for fragment, candidate in cases.items():
            with self.subTest(case=fragment):
                ok, reason = he.reportable(candidate, A)
                self.assertFalse(ok)
                self.assertIn(fragment, reason)


def comment(login, body):
    return {"user": {"login": login}, "body": body}


class AlreadySaidTests(unittest.TestCase):
    def test_the_forge_s_own_comment_on_this_head_is_already_said(self):
        said = [comment(he.MACHINE_LOGIN, f"{he.HEADING}: `{A}`\n\nMeasured")]
        self.assertTrue(he.already_said(said, A))

    def test_a_comment_on_another_head_is_not(self):
        said = [comment(he.MACHINE_LOGIN, f"{he.HEADING}: `{B}`\n")]
        self.assertFalse(he.already_said(said, A))

    def test_a_look_alike_from_anyone_else_does_not_silence_the_forge(self):
        said = [comment("drevendev", f"{he.HEADING}: `{A}`\n"), comment("andy-zen-dev", f"{he.HEADING}: `{A}`\n")]
        self.assertFalse(he.already_said(said, A))

    def test_a_mention_of_the_head_in_another_kind_of_comment_is_not(self):
        said = [comment(he.MACHINE_LOGIN, f"## zen-edit: applied\n\n`{A}`")]
        self.assertFalse(he.already_said(said, A))


ROWS = [he.Row(name, "2026-09-29T17:23:38Z", f"https://example.invalid/{name}") for name in he.JOBS]
ROWS.append(he.Row(he.STATUS, "2026-09-29T17:23:23Z", "merges cleanly into the base branch"))


class RenderTests(unittest.TestCase):
    def test_a_carried_head_names_the_chain_and_what_stands_for_it(self):
        body = he.render(C, ROWS, he.Chain((A, B, C), False), 6, "7dd16cf18319e659", "master", True)
        self.assertTrue(body.startswith(f"{he.HEADING}: `{C}`\n"))
        self.assertIn("This head is a merge of `master` into the branch", body)
        for name in (*he.JOBS, he.STATUS):
            self.assertIn(f"| `{name}` | passed |", body)
        self.assertIn(f"`{A[:8]}` → `{B[:8]}` → `{C[:8]}`", body)
        self.assertIn(f"The diff last changed at `{A[:8]}`", body)
        self.assertIn(f"stands for `{C[:8]}`", body)
        self.assertIn("7dd16cf18319e659", body)
        self.assertIn("6 files", body)

    def test_a_carried_commit_is_not_called_a_merge(self):
        body = he.render(C, ROWS, he.Chain((B, C), False), 6, "0" * 16, "master", False)
        self.assertIn("This head is a commit on the branch", body)
        self.assertNotIn("is a merge of", body)
        self.assertIn(f"stands for `{C[:8]}`", body)

    def test_a_head_with_new_content_carries_nothing_forward(self):
        for merged_base in (True, False):
            with self.subTest(merged_base=merged_base):
                body = he.render(C, ROWS, he.Chain((C,), False), 1, "414fc30637946703", "master", merged_base)
                self.assertIn("carries content of its own", body)
                self.assertIn("1 file,", body)
                self.assertNotIn("stands for", body)
                self.assertNotIn("→", body)

    def test_a_bounded_chain_does_not_claim_where_the_diff_last_changed(self):
        body = he.render(C, ROWS, he.Chain((A, B, C), True), 2, "0" * 16, "master", True)
        self.assertIn(f"at least since `{A[:8]}`", body)

    def test_the_comment_never_judges(self):
        body = he.render(C, ROWS, he.Chain((A, B, C), False), 6, "0" * 16, "master", True)
        self.assertIn("Nothing here is a judgement", body)
        for verdict in ("## Verdict", "ACCEPT", "REQUEST_CHANGES"):
            self.assertNotIn(verdict, body)


# ------------------------------------------------------------------------ real commits


class Repository:
    """A throwaway repository: one base branch, one loop branch, real merges."""

    def __init__(self, path):
        self.path = path
        self.git("init", "-q", "-b", "master")
        self.git("config", "user.email", "test@example.invalid")
        self.git("config", "user.name", "Test")
        self.git("config", "core.autocrlf", "false")
        self.git("config", "commit.gpgsign", "false")

    def git(self, *args, check=True):
        result = subprocess.run(
            ["git", *args], cwd=self.path, capture_output=True, text=True, encoding="utf-8"
        )
        if check and result.returncode:
            raise AssertionError(f"git {' '.join(args)}: {result.stderr}")
        return result

    def write(self, name, text):
        target = pathlib.Path(self.path, name)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8", newline="\n")

    def commit(self, message):
        self.git("add", "-A")
        self.git("commit", "-q", "-m", message)
        return self.git("rev-parse", "HEAD").stdout.strip()

    def merge(self, other, resolve=None):
        """Merge `other` into the current branch; `resolve` writes what a conflict needs."""
        merged = self.git("merge", "--no-ff", "--no-edit", "-q", other, check=False)
        if merged.returncode:
            if resolve is None:
                raise AssertionError(f"unexpected conflict: {merged.stdout}{merged.stderr}")
            resolve()
            return self.commit(f"Merge {other}")
        return self.git("rev-parse", "HEAD").stdout.strip()


def numbered(changed=None):
    lines = [f"line {n}" for n in range(1, 11)]
    for index, text in (changed or {}).items():
        lines[index - 1] = text
    return "\n".join(lines) + "\n"


class RealCommitTests(unittest.TestCase):
    """The identity and the walk, over merges git actually made."""

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        repo = self.repo = Repository(self.directory.name)
        repo.write("src/a.txt", numbered())
        repo.write("src/other.txt", "other\n")
        repo.write(he.GENERATED, "table v1\n")
        repo.commit("base")
        repo.git("checkout", "-q", "-b", "zen/issue-1-x")
        repo.write("src/a.txt", numbered({5: "line five, changed"}))
        repo.write(he.GENERATED, "table v1 and my row\n")
        self.first = repo.commit("the change")

    def base_moves(self, write):
        self.repo.git("checkout", "-q", "master")
        write()
        moved = self.repo.commit("the base moves")
        self.repo.git("checkout", "-q", "zen/issue-1-x")
        return moved

    def identity_of(self, sha):
        diff, files = he.own_diff(sha, "master", self.repo.path)
        return he.identity(diff), files

    def chain_of(self, sha):
        return he.walk(sha, he.reader("master", self.repo.path))

    def regenerate(self, text):
        return lambda: self.repo.write(he.GENERATED, text)

    def test_a_base_merge_that_moved_the_hunk_keeps_the_identity_and_is_carried(self):
        def elsewhere():
            self.repo.write("src/a.txt", "a line the base added above\n" + numbered())
            self.repo.write("src/other.txt", "other, changed by the base\n")
            self.repo.write(he.GENERATED, "table v2\n")

        self.base_moves(elsewhere)
        merged = self.repo.merge("master", self.regenerate("table v2 and my row\n"))
        self.assertEqual(self.identity_of(merged), self.identity_of(self.first))
        self.assertEqual(self.identity_of(merged)[1], 1, "the generated table is not counted")
        chain = self.chain_of(merged)
        self.assertEqual(chain.heads, (self.first, merged))
        self.assertTrue(chain.carried)

    def test_two_base_merges_in_a_row_are_one_chain(self):
        self.base_moves(lambda: self.repo.write("src/other.txt", "second\n"))
        one = self.repo.merge("master")
        self.base_moves(lambda: self.repo.write("src/other.txt", "third\n"))
        two = self.repo.merge("master")
        self.assertEqual(self.chain_of(two).heads, (self.first, one, two))

    def test_new_content_after_a_base_merge_starts_over(self):
        self.base_moves(lambda: self.repo.write("src/other.txt", "second\n"))
        self.repo.merge("master")
        self.repo.write("src/a.txt", numbered({5: "line five, changed", 7: "line seven, too"}))
        pushed = self.repo.commit("more of the change")
        self.assertNotEqual(self.identity_of(pushed)[0], self.identity_of(self.first)[0])
        self.assertEqual(self.chain_of(pushed).heads, (pushed,))

    def test_content_smuggled_into_a_base_merge_is_not_carried(self):
        self.base_moves(lambda: self.repo.write("src/other.txt", "second\n"))
        self.repo.git("merge", "--no-ff", "--no-commit", "-q", "master")
        self.repo.write("src/a.txt", numbered({5: "line five, changed", 9: "and line nine"}))
        merged = self.repo.commit("Merge master")
        self.assertEqual(len(self.repo.git("rev-list", "--parents", "-n", "1", merged).stdout.split()), 3)
        self.assertEqual(self.chain_of(merged).heads, (merged,))

    def test_a_conflict_inside_the_change_is_not_carried(self):
        self.base_moves(lambda: self.repo.write("src/a.txt", numbered({5: "line five, by the base"})))
        merged = self.repo.merge(
            "master", lambda: self.repo.write("src/a.txt", numbered({5: "line five, changed"}))
        )
        self.assertNotEqual(self.identity_of(merged)[0], self.identity_of(self.first)[0])
        self.assertEqual(self.chain_of(merged).heads, (merged,))

    def test_a_merge_of_another_branch_is_content(self):
        self.repo.git("checkout", "-q", "-b", "zen/issue-2-y", "master")
        self.repo.write("src/third.txt", "from another branch\n")
        self.repo.commit("another change")
        self.repo.git("checkout", "-q", "zen/issue-1-x")
        merged = self.repo.merge("zen/issue-2-y")
        self.assertEqual(self.chain_of(merged).heads, (merged,))

    def test_a_commit_that_only_regenerates_the_table_is_carried(self):
        self.repo.write(he.GENERATED, "table v1 and my row, regenerated\n")
        regenerated = self.repo.commit("Regenerate implementation status")
        self.assertEqual(self.identity_of(regenerated), self.identity_of(self.first))
        self.assertEqual(self.chain_of(regenerated).heads, (self.first, regenerated))

    def test_a_pull_request_with_no_diff_of_its_own_does_not_walk_into_the_base(self):
        self.base_moves(lambda: self.repo.write("src/other.txt", "second\n"))
        self.base_moves(lambda: self.repo.write("src/other.txt", "third\n"))
        self.repo.git("checkout", "-q", "-b", "zen/issue-3-z", "master")
        self.repo.write(he.GENERATED, "only the table\n")
        only = self.repo.commit("the table and nothing else")
        self.assertEqual(self.identity_of(only), (he.identity(""), 0))
        chain = self.chain_of(only)
        self.assertEqual(chain.heads, (only,))
        self.assertFalse(chain.bounded)

    def test_only_the_generated_table_is_left_out(self):
        self.repo.write("docs/spec/implementation_status.csv", "REQ_ID,STATUS\nREQ-X-001,IMPLEMENTED\n")
        with_row = self.repo.commit("the ledger row")
        identity, files = self.identity_of(with_row)
        self.assertNotEqual(identity, self.identity_of(self.first)[0])
        self.assertEqual(files, 2)


# ------------------------------------------------------------------------------ main


class MainTests(unittest.TestCase):
    """End to end through `main`, with the forge and the repository stubbed."""

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.report = os.path.join(self.directory.name, "report.md")
        self.output = os.path.join(self.directory.name, "output.txt")
        self.saved = {
            name: getattr(he, name)
            for name in ("pulls_with_head", "check_runs", "statuses", "comments", "reader", "own_diff")
        }
        self.addCleanup(lambda: [setattr(he, name, value) for name, value in self.saved.items()])
        previous = os.environ.get("GITHUB_OUTPUT")
        os.environ["GITHUB_OUTPUT"] = self.output
        self.addCleanup(
            lambda: os.environ.pop("GITHUB_OUTPUT")
            if previous is None
            else os.environ.__setitem__("GITHUB_OUTPUT", previous)
        )
        he.pulls_with_head = lambda repo, sha: [pull(sha=C)]
        he.check_runs = lambda repo, sha: ALL_GREEN
        he.statuses = lambda repo, sha: [status()]
        he.comments = lambda repo, number: []
        he.reader = lambda base, cwd=".": commits(
            (C, [B, M1], True, "x"), (B, [A], False, "x"), (A, [M1], False, "w"), (M1, [], False, "e", True)
        )
        he.own_diff = lambda sha, base, cwd=".": ("diff --git a/x b/x\n@@ -1 +1 @@\n-a\n+b\n", 1)

    def outcome(self):
        if not os.path.exists(self.output):
            return {}
        with open(self.output, encoding="utf-8") as handle:
            return dict(line.strip().split("=", 1) for line in handle if "=" in line)

    def run_main(self, sha=C):
        return he.main(["--repo", "o/r", "--sha", sha, "--report", self.report])

    def test_a_green_head_is_reported_with_its_number(self):
        self.assertEqual(self.run_main(), 0)
        self.assertEqual(self.outcome(), {"outcome": "evidence", "number": "661"})
        with open(self.report, encoding="utf-8") as handle:
            body = handle.read()
        self.assertIn(f"{he.HEADING}: `{C}`", body)
        self.assertIn(f"`{B[:8]}` → `{C[:8]}`", body)

    def test_a_head_that_is_not_green_is_silent_and_writes_nothing(self):
        he.check_runs = lambda repo, sha: ALL_GREEN[:2]
        self.assertEqual(self.run_main(), 0)
        self.assertEqual(self.outcome()["outcome"], "silent")
        self.assertFalse(os.path.exists(self.report))

    def test_a_head_already_reported_is_not_reported_twice(self):
        he.comments = lambda repo, number: [comment(he.MACHINE_LOGIN, f"{he.HEADING}: `{C}`\n")]
        self.assertEqual(self.run_main(), 0)
        self.assertEqual(self.outcome()["outcome"], "already")
        self.assertFalse(os.path.exists(self.report))

    def test_a_head_that_belongs_to_no_loop_pull_request_is_silent(self):
        he.pulls_with_head = lambda repo, sha: [pull("policy/765-x", sha=C)]
        self.assertEqual(self.run_main(), 0)
        self.assertEqual(self.outcome(), {"outcome": "silent"})

    def test_text_that_is_not_a_commit_is_refused_before_anything_is_asked(self):
        def forbidden(*_):
            raise AssertionError("the forge was asked about text that is not a commit")

        he.pulls_with_head = forbidden
        for text in ("master", C[:12], f"{C}; rm -rf /", ""):
            with self.subTest(text=text):
                self.assertEqual(self.run_main(text or " "), 0)
        self.assertEqual(self.outcome()["outcome"], "silent")

    def test_a_forge_that_does_not_answer_is_a_warning_not_a_failed_run(self):
        def unreachable(repo, sha):
            raise RuntimeError("could not read: HTTP 502")

        he.pulls_with_head = unreachable
        self.assertEqual(self.run_main(), 0)
        self.assertEqual(self.outcome()["outcome"], "silent")


# ------------------------------------------------------------------------- the names


JOB_NAME = re.compile(r"^    name:\s*(\S+)\s*$", re.MULTILINE)
WORKFLOW_NAME = re.compile(r"^name:\s*(.+?)\s*$", re.MULTILINE)


class RequiredCheckNameTests(unittest.TestCase):
    def test_the_three_jobs_are_jobs_of_the_ci_workflow(self):
        names = JOB_NAME.findall((WORKFLOWS / "ci.yml").read_text(encoding="utf-8"))
        for name in he.JOBS:
            with self.subTest(job=name):
                self.assertIn(name, names)

    def test_the_status_is_the_one_mergeability_writes(self):
        self.assertEqual(he.STATUS, mergeability.CONTEXT)
        self.assertNotIn(he.STATUS, he.JOBS)

    def test_the_generated_table_named_here_is_the_generator_s(self):
        import implementation_status

        self.assertEqual(pathlib.PurePosixPath(he.GENERATED), pathlib.PurePosixPath(implementation_status.RENDERED_PATH))


# ----------------------------------------------------------------------- the workflow


def workflow():
    return WORKFLOW.read_text(encoding="utf-8")


def triggers(body):
    block = re.search(r"^on:\n((?:(?:[ ]+\S.*)?\n)*)", body, re.MULTILINE).group(1)
    return {m.group(1): m.group(2) for m in re.finditer(r"^  ([\w]+):[^\n]*\n((?:    [^\n]*\n)*)", block, re.MULTILINE)}


def steps(body):
    starts = [m.start() for m in re.finditer(r"^      - (?:name|uses|id):", body, re.MULTILINE)]
    starts.append(len(body))
    return [body[a:b] for a, b in zip(starts, starts[1:])]


def commands(step):
    """The shell lines of a step's `run:`, continuation lines folded in. Pure."""
    match = re.search(r"^        run:[ ]*(\|[ ]*\n((?:          .*\n?)+)|(.+)$)", step, re.MULTILINE)
    if not match:
        return []
    text = match.group(2) if match.group(2) is not None else match.group(3)
    folded = re.sub(r"\\\n\s*", " ", text)
    return [line.strip() for line in folded.splitlines() if line.strip()]


ALLOWED_COMMANDS = ("git fetch --no-tags origin ", "python scripts/head_evidence.py ", "gh pr comment ")
GRANTS = {"contents": "read", "pull-requests": "read", "checks": "read", "statuses": "read"}
MACHINE = ("vars.ZENDEV_MACHINE_APP_CLIENT_ID", "secrets.ZENDEV_MACHINE_APP_PRIVATE_KEY")
THIS_REPOSITORY = "repositories: ${{ github.event.repository.name }}"


def violations(body):
    """Every way `body` lets a judged branch decide what is said about it. Pure."""
    found = []
    events = triggers(body)
    for event in sorted(set(events) - {"workflow_run", "workflow_dispatch"}):
        found.append(f"`{event}` is not a trigger this workflow may have")
    if "workflow_run" not in events:
        found.append("no `workflow_run` trigger: nothing would report when the checks are in")

    block = re.search(r"^permissions:\n((?:  .*\n)*)", body, re.MULTILINE)
    grants = dict(re.findall(r"^  ([\w-]+):\s*(\w+)\s*$", block.group(1), re.MULTILINE)) if block else {}
    if grants != GRANTS:
        found.append(f"the workflow token's grants are {grants}, not reads only")

    all_steps = steps(body)
    checkouts = [step for step in all_steps if "actions/checkout" in step]
    if len(checkouts) != 1:
        found.append(f"{len(checkouts)} checkout steps; the reviewed definition is checked out once")
    for step in checkouts:
        for key in ("ref", "path", "repository"):
            if re.search(rf"^\s+{key}:", step, re.MULTILINE):
                found.append(f"the checkout names a `{key}:`; the default branch is the only revision that may run here")

    for step in all_steps:
        for command in commands(step):
            if not command.startswith(ALLOWED_COMMANDS):
                found.append(f"a step runs `{command}`, which is not one of the three this workflow may run")
            if "${{" in command:
                found.append(f"an expression is interpolated into the shell: `{command}`")
        if "gh pr comment" in step and "steps.identity.outputs.token" not in step:
            found.append("the comment is not posted as the MACHINE identity")

    mints = [step for step in all_steps if "create-github-app-token" in step]
    if len(mints) != 1:
        found.append(f"{len(mints)} identity steps; the MACHINE identity is minted once")
    for step in mints:
        for needle in (*MACHINE, THIS_REPOSITORY):
            if needle not in step:
                found.append(f"the identity step lacks `{needle}`")
        if "steps.measure.outputs.outcome == 'evidence'" not in step:
            found.append("the identity is minted even when there is nothing to say")
    return found


class WorkflowHoldsTests(unittest.TestCase):
    def test_the_shipped_workflow_has_no_violation(self):
        self.assertEqual(violations(workflow()), [])

    def test_the_scan_sees_what_it_guards(self):
        body = workflow()
        self.assertEqual(set(triggers(body)), {"workflow_run", "workflow_dispatch"})
        seen = [command for step in steps(body) for command in commands(step)]
        self.assertEqual(len(seen), 3, seen)
        for prefix in ALLOWED_COMMANDS:
            self.assertEqual(sum(1 for command in seen if command.startswith(prefix)), 1)

    def test_it_waits_for_the_two_workflows_that_write_the_required_checks(self):
        waited = re.search(r"workflows:\s*\[(.*?)\]", triggers(workflow())["workflow_run"]).group(1)
        names = [name.strip() for name in waited.split(",")]
        shipped = {
            WORKFLOW_NAME.search(path.read_text(encoding="utf-8")).group(1): path.name
            for path in WORKFLOWS.glob("*.yml")
        }
        self.assertEqual(sorted(shipped[name] for name in names), ["ci.yml", "mergeability.yml"])

    def test_a_push_to_the_base_is_not_a_head_to_report_on(self):
        body = workflow()
        self.assertIn("github.event.workflow_run.event == 'pull_request'", body)
        self.assertIn("github.event.workflow_run.event == 'pull_request_target'", body)
        self.assertNotIn("workflow_run.event == 'push'", body)

    def test_one_queue_per_head(self):
        self.assertIn(
            "group: head-evidence-${{ github.event.workflow_run.head_sha || inputs.sha }}", workflow()
        )


class WorkflowErodesTests(unittest.TestCase):
    """Each edit below is small, plausible, and lets a branch speak for itself. Each is refused."""

    def setUp(self):
        self.body = workflow()
        self.assertEqual(violations(self.body), [], "the fixture must start clean")

    def edited(self, old, new):
        replaced = self.body.replace(old, new, 1)
        self.assertNotEqual(replaced, self.body, "the fixture edit must apply")
        return replaced

    def assert_refused(self, body, fragment):
        found = violations(body)
        self.assertTrue(any(fragment in v for v in found), f"expected {fragment!r} in {found}")

    def test_a_pull_request_trigger_is_refused(self):
        for event in ("pull_request", "pull_request_target"):
            with self.subTest(event=event):
                edited = self.edited("  workflow_dispatch:\n", f"  {event}:\n    types: [synchronize]\n  workflow_dispatch:\n")
                self.assert_refused(edited, f"`{event}` is not a trigger")

    def test_a_checkout_of_the_judged_head_is_refused(self):
        edited = self.edited(
            "        with:\n          fetch-depth: 0\n",
            "        with:\n          ref: ${{ github.event.workflow_run.head_sha }}\n          fetch-depth: 0\n",
        )
        self.assert_refused(edited, "the checkout names a `ref:`")

    def test_a_second_checkout_is_refused(self):
        edited = self.edited(
            "      - uses: actions/setup-python@v7\n",
            "      - uses: actions/checkout@v7\n        with:\n          path: work\n      - uses: actions/setup-python@v7\n",
        )
        self.assert_refused(edited, "2 checkout steps")
        self.assert_refused(edited, "the checkout names a `path:`")

    def test_checking_the_head_out_by_hand_is_refused(self):
        edited = self.edited(
            'run: git fetch --no-tags origin "${HEAD_SHA}"',
            'run: |\n          git fetch --no-tags origin "${HEAD_SHA}"\n          git checkout "${HEAD_SHA}"',
        )
        self.assert_refused(edited, 'a step runs `git checkout "${HEAD_SHA}"`')

    def test_running_the_branch_s_own_tests_is_refused(self):
        edited = self.edited(
            'run: git fetch --no-tags origin "${HEAD_SHA}"',
            'run: |\n          git fetch --no-tags origin "${HEAD_SHA}"\n          npm test',
        )
        self.assert_refused(edited, "a step runs `npm test`")

    def test_text_an_operator_typed_never_reaches_the_shell_as_an_expression(self):
        edited = self.edited('origin "${HEAD_SHA}"', "origin ${{ inputs.sha }}")
        self.assert_refused(edited, "an expression is interpolated into the shell")

    def test_a_widened_grant_is_refused(self):
        edited = self.edited("  pull-requests: read\n", "  pull-requests: write\n")
        self.assert_refused(edited, "not reads only")

    def test_a_comment_in_the_workflow_s_own_voice_is_refused(self):
        edited = self.edited("GH_TOKEN: ${{ steps.identity.outputs.token }}", "GH_TOKEN: ${{ github.token }}")
        self.assert_refused(edited, "not posted as the MACHINE identity")

    def test_an_identity_minted_for_nothing_is_refused(self):
        edited = self.edited(
            "        id: identity\n        if: steps.measure.outputs.outcome == 'evidence'\n",
            "        id: identity\n",
        )
        self.assert_refused(edited, "minted even when there is nothing to say")

    def test_an_identity_wider_than_this_repository_is_refused(self):
        edited = self.edited(f"          {THIS_REPOSITORY}\n", "")
        self.assert_refused(edited, "the identity step lacks")


if __name__ == "__main__":
    unittest.main()
