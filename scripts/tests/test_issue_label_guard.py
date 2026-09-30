"""Negative controls for the Issue-label-axis guard: prove it refuses, not merely that it runs."""

import contextlib
import io
import json
import pathlib
import re
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import issue_label_guard as guard  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
CI = ROOT / ".github" / "workflows" / "ci.yml"
ACCEPTOR_RUNBOOK = ROOT / "docs" / "zendev" / "ACCEPTOR_RUNBOOK.md"

# Exactly what Issue #448 carried when it reached PR #459: two axes and no `area:*`.
LABELS_448 = ["priority:high", "type:bug", "status:needs-review"]

GOOD = ["priority:normal", "type:process", "area:tooling", "status:in-progress"]

BODY = "Closes #462\n\n## Changed artifacts\n\n- `scripts/issue_label_guard.py`\n"

# The repository the guard runs for, spelled as #519's Evidence table spells it. It is test
# data here, passed in as the workflow passes it; the guard itself names no repository.
REPO = "drevendev/trade_simulation"
ELSEWHERE = "octo-org/octo-repo"


def resolver(mapping):
    """A `labels_of` that answers from a dict and fails loudly on anything else."""

    def labels_of(number):
        if number not in mapping:
            raise AssertionError("the guard asked about an Issue it was not given: #%d" % number)
        return mapping[number]

    return labels_of


def recorded(mapping):
    """A `resolver` that also lists every Issue it was asked about, in order."""
    asked = []
    answer_from = resolver(mapping)

    def labels_of(number):
        asked.append(number)
        return answer_from(number)

    return labels_of, asked


def answer(*numbers, repo=REPO):
    """What `gh pr view --json closingIssuesReferences` prints, parsed, linking `numbers`."""
    owner, name = repo.split("/")
    return {
        "closingIssuesReferences": [
            {
                "id": "I_%d" % number,
                "number": number,
                "repository": {"id": "R_1", "name": name, "owner": {"id": "U_1", "login": owner}},
                "url": "https://github.com/%s/issues/%d" % (repo, number),
            }
            for number in numbers
        ]
    }


def github(reply):
    """A `closing_references` provider: returns `reply`, or raises it if it is an exception."""

    def closing_references():
        if isinstance(reply, BaseException):
            raise reply
        return reply

    return closing_references


class AxisTests(unittest.TestCase):
    def test_the_448_label_set_is_refused_and_names_the_issue_and_the_axis(self):
        violations = guard.axis_violations(448, LABELS_448)
        self.assertEqual(len(violations), 1)
        self.assertIn("#448", violations[0])
        self.assertIn("area:", violations[0])
        self.assertIn("at least one", violations[0])

    def test_the_message_names_the_labels_that_are_present(self):
        # The fix must be one `gh issue edit`, not an investigation.
        violations = guard.axis_violations(448, LABELS_448)
        for name in LABELS_448:
            self.assertIn(name, violations[0])

    def test_a_fully_labelled_issue_passes(self):
        self.assertEqual(guard.axis_violations(462, GOOD), [])

    def test_several_area_labels_are_allowed(self):
        self.assertEqual(
            guard.axis_violations(1, ["priority:high", "type:bug", "area:config", "area:market"]),
            [],
        )

    def test_no_priority_is_refused(self):
        violations = guard.axis_violations(1, ["type:bug", "area:market"])
        self.assertEqual(len(violations), 1)
        self.assertIn("priority:", violations[0])
        self.assertIn("exactly one", violations[0])

    def test_two_priorities_are_refused(self):
        violations = guard.axis_violations(1, ["priority:high", "priority:normal", "type:bug", "area:market"])
        self.assertEqual(len(violations), 1)
        self.assertIn("priority:", violations[0])

    def test_no_type_is_refused(self):
        violations = guard.axis_violations(1, ["priority:high", "area:market"])
        self.assertEqual(len(violations), 1)
        self.assertIn("type:", violations[0])

    def test_two_types_are_refused(self):
        violations = guard.axis_violations(1, ["priority:high", "type:bug", "type:process", "area:market"])
        self.assertEqual(len(violations), 1)
        self.assertIn("type:", violations[0])

    def test_every_wrong_axis_is_reported_not_just_the_first(self):
        violations = guard.axis_violations(1, ["status:ready"])
        self.assertEqual(len(violations), 3)

    def test_an_unlabelled_issue_is_refused(self):
        violations = guard.axis_violations(1, [])
        self.assertEqual(len(violations), 3)
        self.assertIn("none", violations[0])


class StatusAxisTests(unittest.TestCase):
    def test_status_is_not_counted_toward_any_axis(self):
        # Two `status:*` labels is a different defect (#214) and not this gate's business.
        noisy = GOOD + ["status:needs-review"]
        self.assertEqual(guard.axis_violations(1, noisy), [])

    def test_a_missing_status_label_changes_nothing(self):
        without = [name for name in GOOD if not name.startswith("status:")]
        self.assertEqual(guard.axis_violations(1, without), guard.axis_violations(1, GOOD))

    def test_status_alone_does_not_satisfy_an_axis(self):
        self.assertEqual(len(guard.axis_violations(1, ["status:ready", "status:blocked"])), 3)


class LinkTests(unittest.TestCase):
    def test_the_template_closing_keyword_links_the_issue(self):
        self.assertEqual(guard.linked_issues("Closes #462"), [462])

    def test_every_closing_keyword_form_links(self):
        for word in ("Closes", "closes", "Fixes", "fixed", "Resolves", "RESOLVE"):
            with self.subTest(keyword=word):
                self.assertEqual(guard.linked_issues("%s #7" % word), [7])

    def test_a_bare_reference_is_not_a_link(self):
        # "#448 is related" must not drag an unrelated Issue's labels into this gate.
        self.assertEqual(guard.linked_issues("See #448 and PR #459 for context"), [])

    def test_repeated_links_are_reported_once(self):
        self.assertEqual(guard.linked_issues("Closes #5\n\nCloses #5\nFixes #6"), [5, 6])

    def test_an_empty_or_missing_body_links_nothing(self):
        self.assertEqual(guard.linked_issues(""), [])
        self.assertEqual(guard.linked_issues(None), [])


class QualifiedLinkTests(unittest.TestCase):
    """Issue #519: a keyword also links an Issue named by its URL or as `owner/name#N`.

    Measured at `dd51464`, both forms linked the Issue on GitHub and `[]` here, so the gate
    reported green over an Issue it never inspected. They link here now — but only when the
    repository they name is the one the guard runs for.
    """

    def test_the_url_form_links_an_issue_of_this_repository(self):
        body = "Closes https://github.com/drevendev/trade_simulation/issues/462"
        self.assertEqual(guard.linked_issues(body, REPO), [462])

    def test_the_cross_repository_form_links_an_issue_of_this_repository(self):
        self.assertEqual(guard.linked_issues("Closes drevendev/trade_simulation#462", REPO), [462])

    def test_the_repository_is_compared_without_regard_to_case(self):
        self.assertEqual(guard.linked_issues("Fixes DrevenDev/Trade_Simulation#462", REPO), [462])
        body = "Fixes https://github.com/DrevenDev/Trade_Simulation/issues/462"
        self.assertEqual(guard.linked_issues(body, REPO), [462])

    def test_an_issue_of_another_repository_links_nothing_here(self):
        for body in (
            "Closes octo-org/octo-repo#462",
            "Closes https://github.com/octo-org/octo-repo/issues/462",
            # A fork keeps the name and changes the owner: still another repository.
            "Closes someone/trade_simulation#462",
            "Closes https://github.com/someone/trade_simulation/issues/462",
            # A name that merely begins with this one is another repository too.
            "Closes drevendev/trade_simulation-archive#462",
        ):
            with self.subTest(body=body):
                self.assertEqual(guard.linked_issues(body, REPO), [])

    def test_every_keyword_takes_every_form(self):
        targets = (
            "#7",
            "drevendev/trade_simulation#7",
            "https://github.com/drevendev/trade_simulation/issues/7",
        )
        for word in ("Closes", "fixed", "RESOLVE"):
            for target in targets:
                with self.subTest(keyword=word, target=target):
                    self.assertEqual(guard.linked_issues("%s %s" % (word, target), REPO), [7])

    def test_the_short_form_is_unchanged_by_naming_the_repository(self):
        # Criteria 3 and 4 with the repository given, as the guard now always runs.
        self.assertEqual(guard.linked_issues("Closes #462", REPO), [462])
        self.assertEqual(guard.linked_issues("See #448 and PR #459 for context", REPO), [])
        self.assertEqual(
            guard.linked_issues("A body reading `Closes #999999` is refused.", REPO), []
        )

    def test_a_bare_qualified_reference_is_not_a_link_either(self):
        # The keyword is what links, in every form, exactly as for `#N`.
        body = (
            "See drevendev/trade_simulation#448 and "
            "https://github.com/drevendev/trade_simulation/issues/459"
        )
        self.assertEqual(guard.linked_issues(body, REPO), [])

    def test_a_qualified_form_in_quoted_text_links_nothing(self):
        body = (
            "A body reading `Closes drevendev/trade_simulation#999999` is refused.\n\n"
            "```\nCloses https://github.com/drevendev/trade_simulation/issues/999998\n```\n"
            "<!-- Fixes drevendev/trade_simulation#999997 -->\n"
        )
        self.assertEqual(guard.linked_issues(body, REPO), [])

    def test_a_pull_request_url_is_not_an_issue(self):
        # A closing keyword closes Issues; a pull request's URL names nothing it can close.
        body = "Closes https://github.com/drevendev/trade_simulation/pull/462"
        self.assertEqual(guard.linked_issues(body, REPO), [])

    def test_without_a_repository_only_the_short_form_links(self):
        # Nothing says which repository is this one, so no qualified form can be kept.
        self.assertEqual(guard.linked_issues("Closes drevendev/trade_simulation#462"), [])
        self.assertEqual(guard.linked_issues("Closes #462"), [462])

    def test_three_spellings_of_one_issue_are_one_link(self):
        body = (
            "Closes #462\n"
            "Fixes drevendev/trade_simulation#462\n"
            "Resolves https://github.com/drevendev/trade_simulation/issues/463\n"
        )
        self.assertEqual(guard.linked_issues(body, REPO), [462, 463])


class QuotedTextTests(unittest.TestCase):
    """PR #518 refused itself: its handoff quoted `Closes #999999` and the guard obeyed it.

    GitHub links a closing keyword in ordinary prose and ignores one inside a code span,
    a fenced block or an HTML comment. The guard now agrees, so a handoff can describe a
    link without making one.
    """

    def test_a_backticked_closing_keyword_is_not_a_link(self):
        self.assertEqual(guard.linked_issues("A body reading `Closes #999999` is refused."), [])

    def test_a_fenced_block_does_not_link(self):
        body = "Closes #462\n\n```\nCloses #999999\n```\n"
        self.assertEqual(guard.linked_issues(body), [462])

    def test_a_tilde_fence_does_not_link(self):
        self.assertEqual(guard.linked_issues("~~~\nFixes #1\n~~~\n"), [])

    def test_a_longer_closing_fence_closes_the_block(self):
        # GFM 4.5: the closer is the same character, at least as many times. Requiring an
        # exactly-equal closer left the block open, the `|\Z` fallback ate the rest of the
        # body, and the real link below it disappeared — the guard failing open. Reported
        # against PR #518 by the external QA voice.
        self.assertEqual(guard.linked_issues("```\nquoted\n````\n\nCloses #448\n"), [448])
        self.assertEqual(guard.linked_issues("~~~\nquoted\n~~~~\n\nCloses #448\n"), [448])

    def test_the_quoted_link_inside_such_a_block_still_does_not_link(self):
        # The other half of the same rule: closing the block early must not start reading
        # links out of it.
        self.assertEqual(guard.linked_issues("```\nFixes #999999\n````\n\nCloses #448\n"), [448])

    def test_a_shorter_closing_fence_does_not_close_the_block(self):
        # ``` cannot close ````, so the keyword below stays quoted and links nothing.
        self.assertEqual(guard.linked_issues("````\nquoted\n```\nCloses #999999\n"), [])

    def test_an_invalid_backtick_info_string_does_not_open_a_block(self):
        # GFM 4.5 example 115: a backtick fence's info string may not contain a backtick, so
        # "``` aa ```" is an ordinary paragraph and GitHub links the keyword under it. The
        # guard used to accept it as an opener; the `|\Z` fallback then ate the rest of the
        # body and #448 was never resolved, so its labels were never checked. Issue #521.
        self.assertEqual(guard.linked_issues("``` aa ```\nCloses #448\n```\n"), [448])

    def test_an_invalid_opener_does_not_hide_a_link_further_down(self):
        # The same fail-open without a trailing fence line: nothing closes the would-be
        # block, so every link below it disappeared at once.
        body = "``` a ` b\n\nsome prose\n\nCloses #448\n"
        self.assertEqual(guard.linked_issues(body), [448])

    def test_a_valid_fence_after_an_invalid_opener_still_hides_its_contents(self):
        # Rejecting the bad opener must not also stop the real fence below from closing.
        body = "``` aa ```\nCloses #448\n\n```python\nFixes #999999\n```\n"
        self.assertEqual(guard.linked_issues(body), [448])

    def test_a_tilde_info_string_may_contain_backticks(self):
        # The prohibition is on the backtick side only (GFM 4.5 example 118), so the repair
        # is deliberately not mirrored onto tildes: this is still a real fence.
        self.assertEqual(guard.linked_issues("~~~ ```\nFixes #999999\n~~~\n\nCloses #448\n"), [448])
        self.assertEqual(guard.linked_issues("~~~ ~ x\nFixes #999999\n~~~\n"), [])

    def test_a_backtick_info_string_without_backticks_still_opens_a_block(self):
        # The ordinary case the repair must not break: an info string is allowed, it just
        # may not contain a backtick.
        self.assertEqual(guard.linked_issues("```python title=x\nFixes #999999\n```\n"), [])

    def test_a_four_space_indented_fence_does_not_open_a_block(self):
        # GFM 4.5 example 104: a fence indented four spaces is an indented code line, not an
        # opener, so the unindented keyword under it is ordinary Markdown and GitHub links
        # it. The guard's `[ \t]*` accepted the four spaces, the unindented fence below
        # "closed" the block, and `strip_code` reduced the entire body to "\n" — #448 was
        # never resolved and its labels were never checked. Issue #523.
        self.assertEqual(guard.linked_issues("    ```\nCloses #448\n```\n"), [448])
        self.assertEqual(guard.linked_issues("    ~~~\nCloses #448\n~~~\n"), [448])

    def test_a_four_space_indented_opener_does_not_hide_a_link_further_down(self):
        # The same fail-open with no trailing fence at all: nothing closed the falsely
        # recognized block, so the `|\Z` fallback ate every link below it at once.
        body = "    ```python\n\nsome prose\n\nCloses #448\n"
        self.assertEqual(guard.linked_issues(body), [448])

    def test_a_tab_indented_fence_does_not_open_a_block(self):
        # Indentation is measured in columns against four-column tab stops, so a tab in
        # columns 0-3 lands on column 4 and is already past the three-space allowance.
        # There is no leading tab a fence may carry.
        self.assertEqual(guard.linked_issues("\t```\nCloses #448\n```\n"), [448])
        self.assertEqual(guard.linked_issues(" \t```\nCloses #448\n```\n"), [448])

    def test_an_opener_indented_up_to_three_spaces_still_hides_its_contents(self):
        # The allowance GFM does grant, which the repair must not take away.
        for indent in ("", " ", "  ", "   "):
            with self.subTest(indent=len(indent)):
                self.assertEqual(guard.linked_issues("%s```\nFixes #999999\n```\n" % indent), [])
                self.assertEqual(guard.linked_issues("%s~~~\nFixes #999999\n~~~\n" % indent), [])

    def test_a_closer_indented_up_to_three_spaces_still_closes_the_block(self):
        # The closer carries the same 0-3-space allowance, independently of the opener's.
        for indent in ("", " ", "  ", "   "):
            with self.subTest(indent=len(indent)):
                body = "```\nFixes #999999\n%s```\n\nCloses #448\n" % indent
                self.assertEqual(guard.linked_issues(body), [448])

    def test_a_four_space_indented_closer_does_not_close_the_block(self):
        # The other half of the rule, and the one place the repair removes a link: at four
        # spaces the line is content, the fence stays open to the end of the document, and
        # GitHub links nothing below it. The guard used to close the block there and read
        # #448 out of text GitHub renders as code. Agreeing with GitHub is the whole point
        # of `strip_code`; a body that links nothing is the ACCEPTOR's gate, not this one.
        self.assertEqual(guard.linked_issues("```\nFixes #999999\n    ```\n\nCloses #448\n"), [])

    def test_an_html_comment_does_not_link(self):
        # The pull request template ships its guidance in exactly these.
        self.assertEqual(guard.linked_issues("<!-- Closes #1 -->\nCloses #2"), [2])

    def test_the_real_link_still_survives_a_body_full_of_quoted_ones(self):
        body = (
            "Closes #462\n\n"
            "| `Closes #999999` | exit 1 |\n"
            "| `Closes #463` | exit 0 |\n"
            "<!-- Fixes #1 -->\n"
            "```\nResolves #2\n```\n"
        )
        self.assertEqual(guard.linked_issues(body), [462])

    def test_an_unclosed_backtick_swallows_a_paragraph_at_most(self):
        # A code span cannot contain a blank line, so a stray backtick must not blind the
        # guard to a link further down the body.
        self.assertEqual(guard.linked_issues("a stray ` tick\n\nCloses #462"), [462])

    def test_a_stray_backtick_pairs_with_the_next_one_in_its_paragraph(self):
        # The case #519's Evidence table recorded as a miss, decided here against CommonMark
        # rather than against the guard (#519 criterion 6). A lone backtick is a backtick
        # string, and a code span runs to the next backtick string of the same length in
        # the same paragraph, across its line endings, which become spaces (CommonMark 6.1).
        # So the "stray" backtick is not unmatched: it pairs with the opener of `code`, and
        # GitHub renders `a stray <code>tick Closes #462 and</code>code` here` — the keyword
        # sits inside a code span and links nothing, and it is the last backtick that is
        # left literal. The guard agrees: a negative control, not a fail-open.
        body = "a stray ` tick\nCloses #462\nand `code` here"
        self.assertEqual(guard.linked_issues(body), [])
        self.assertEqual(guard.linked_issues(body, REPO), [])

    def test_stripping_leaves_ordinary_prose_alone(self):
        self.assertEqual(guard.strip_code("plain text"), "plain text")
        self.assertEqual(guard.strip_code(None), "")


class RecordedLimitTests(unittest.TestCase):
    """Issues #525 and #526, decided rather than repaired: see the comment above `FENCED_CODE`.

    GitHub renders the keyword in each of these bodies as code and links nothing; the guard
    reads a link. That over-links, which fails closed and names the Issue it inspected.
    These pin the limit where the recorded decision puts it, so that modelling indented
    code or list context is a deliberate change to that decision, not a side effect.
    """

    def test_an_indented_code_block_is_read_as_prose(self):
        # Issue #525's shape: a paragraph, a blank line, a four-space-indented keyword.
        self.assertEqual(guard.linked_issues("Handoff.\n\n    Closes #448\n"), [448])

    def test_a_fence_indented_under_a_list_item_is_not_recognized(self):
        # Issue #526's two reproduction bodies, measured there as `[448]` at `6006e06`.
        under_an_item = "- item\n\n    ```\n    Closes #448\n\n    more\n    ```\n"
        under_a_nested_item = "- item\n  - nested\n\n      ```\n      Closes #448\n\n      more\n      ```\n"
        self.assertEqual(guard.linked_issues(under_an_item), [448])
        self.assertEqual(guard.linked_issues(under_a_nested_item), [448])

    def test_the_over_link_fails_closed_and_is_named(self):
        # What makes the limit acceptable: the gate inspects one Issue too many and says so.
        violations = guard.check("Handoff.\n\n    Closes #448\n", "claude/x", resolver({448: LABELS_448}))
        self.assertEqual(len(violations), 1)
        self.assertIn("#448", violations[0])


class CheckTests(unittest.TestCase):
    def test_a_linked_issue_missing_an_axis_refuses_the_pull_request(self):
        violations = guard.check("Closes #448", "claude/issue-448-x", resolver({448: LABELS_448}))
        self.assertEqual(len(violations), 1)
        self.assertIn("#448", violations[0])

    def test_a_correctly_labelled_linked_issue_passes(self):
        self.assertEqual(guard.check(BODY, "claude/issue-462-x", resolver({462: GOOD})), [])

    def test_no_linked_issue_is_not_this_guards_refusal(self):
        # Section 2 of the ACCEPTOR runbook owns that gate; a second wording of it would
        # report one failure as two unrelated defects.
        self.assertEqual(guard.check("## Handoff\n\nNothing linked.", "claude/x", resolver({})), [])

    def test_every_linked_issue_is_checked(self):
        violations = guard.check(
            "Closes #448\nCloses #462", "claude/x", resolver({448: LABELS_448, 462: GOOD})
        )
        self.assertEqual(len(violations), 1)
        self.assertIn("#448", violations[0])

    def test_an_invalid_backtick_opener_does_not_bypass_the_axis_gate(self):
        # Issue #521, at the level the gate actually decides. The resolver returns the #448
        # label set, which is missing `area:*`; before the repair the parser never reached
        # #448, the resolver was never consulted, and `check()` returned no violation — a
        # required gate passing over an Issue nobody looked at.
        body = "``` aa ```\nCloses #448\n```\n"
        violations = guard.check(body, "claude/issue-521-x", resolver({448: LABELS_448}))
        self.assertEqual(len(violations), 1)
        self.assertIn("#448", violations[0])
        self.assertIn("area:", violations[0])

    def test_a_four_space_indented_opener_does_not_bypass_the_axis_gate(self):
        # Issue #523 at the level the gate actually decides, with the #448 label set, which
        # is missing `area:*`. Before the repair the parser stripped the whole body, #448
        # was never resolved, the resolver was never consulted, and `check()` returned no
        # violation — the required gate reporting success over an Issue nobody looked at.
        body = "    ```\nCloses #448\n```\n"
        violations = guard.check(body, "claude/issue-523-x", resolver({448: LABELS_448}))
        self.assertEqual(len(violations), 1)
        self.assertIn("#448", violations[0])
        self.assertIn("area:", violations[0])

    def test_a_machine_branch_is_exempt_without_resolving_anything(self):
        # A mirror snapshot has no author and no Issue; its own class guard decides it.
        def explode(number):
            raise AssertionError("the forge must not be asked about a machine pull request")

        self.assertEqual(guard.check("Closes #448", "spec-mirror", explode), [])


class LinkSourceTests(unittest.TestCase):
    """Issue #519: the Issues checked are the union of the body's links and GitHub's own."""

    def test_a_sidebar_only_link_is_resolved_and_its_axes_checked(self):
        # The link no reading of the body can see: nothing in it links, GitHub does. Before
        # #519 this passed without the resolver ever being asked about #448.
        violations = guard.check(
            "## Handoff\n\nNothing in the body links.",
            "claude/issue-448-x",
            resolver({448: LABELS_448}),
            REPO,
            github(answer(448)),
        )
        self.assertEqual(len(violations), 1)
        self.assertIn("#448", violations[0])
        self.assertIn("area:", violations[0])

    def test_an_issue_both_witnesses_link_is_checked_once(self):
        labels_of, asked = recorded({462: GOOD})
        self.assertEqual(guard.check(BODY, "claude/x", labels_of, REPO, github(answer(462))), [])
        self.assertEqual(asked, [462])

    def test_github_adds_to_the_body_and_removes_nothing(self):
        # A second witness, not a veto: the body's link is checked even where GitHub's answer
        # omits it, and GitHub's own is checked after it.
        labels_of, asked = recorded({462: GOOD, 448: LABELS_448})
        violations = guard.check(BODY, "claude/x", labels_of, REPO, github(answer(448)))
        self.assertEqual(asked, [462, 448])
        self.assertEqual(len(violations), 1)
        self.assertIn("#448", violations[0])

        labels_of, asked = recorded({462: GOOD})
        self.assertEqual(guard.check(BODY, "claude/x", labels_of, REPO, github(answer())), [])
        self.assertEqual(asked, [462])

    def test_githubs_answer_about_another_repository_is_not_checked(self):
        labels_of, asked = recorded({})
        reply = answer(448, repo=ELSEWHERE)
        self.assertEqual(guard.check("Nothing linked.", "claude/x", labels_of, REPO, github(reply)), [])
        self.assertEqual(asked, [])

    def test_githubs_repository_is_compared_without_regard_to_case(self):
        labels_of, asked = recorded({448: LABELS_448})
        reply = answer(448, repo="DrevenDev/Trade_Simulation")
        guard.check("Nothing linked.", "claude/x", labels_of, REPO, github(reply))
        self.assertEqual(asked, [448])

    def test_whatever_the_body_misses_githubs_answer_supplies(self):
        # The stray-backtick body links nothing by the guard's reading, as on GitHub. Were
        # that reading ever wrong in the direction #519 feared, GitHub's answer would name the
        # Issue, and it would be checked all the same.
        labels_of, asked = recorded({462: GOOD})
        body = "a stray ` tick\nCloses #462\nand `code` here"
        self.assertEqual(guard.check(body, "claude/x", labels_of, REPO, github(answer(462))), [])
        self.assertEqual(asked, [462])

    def test_an_unreadable_answer_falls_back_to_the_body_and_says_why(self):
        failures = (
            subprocess.CalledProcessError(1, ["gh"], output="", stderr="HTTP 403: Forbidden"),
            FileNotFoundError(2, "No such file or directory", "gh"),
            json.JSONDecodeError("Expecting value", "<html>", 0),
        )
        for failure in failures:
            with self.subTest(failure=type(failure).__name__):
                labels_of, asked = recorded({462: GOOD})
                warnings = []
                violations = guard.check(
                    BODY, "claude/x", labels_of, REPO, github(failure), warnings.append
                )
                self.assertEqual(violations, [])
                self.assertEqual(asked, [462])
                self.assertEqual(len(warnings), 1)
                self.assertIn("could not read the Issues GitHub links", warnings[0])
                self.assertIn("closing keywords alone decide", warnings[0])
        warnings = []
        guard.check(BODY, "claude/x", recorded({462: GOOD})[0], REPO, github(failures[0]), warnings.append)
        self.assertIn("gh exited 1: HTTP 403: Forbidden", warnings[0])

    def test_an_answer_of_another_shape_is_unreadable_not_empty(self):
        # Read as "links nothing", a changed answer would remove the witness silently.
        misshapen = (
            {},
            [],
            {"closingIssuesReferences": None},
            {"closingIssuesReferences": [{"number": 448}]},
            {"closingIssuesReferences": [dict(answer(448)["closingIssuesReferences"][0], number="448")]},
        )
        for reply in misshapen:
            with self.subTest(reply=reply):
                labels_of, asked = recorded({462: GOOD})
                warnings = []
                violations = guard.check(
                    BODY, "claude/x", labels_of, REPO, github(reply), warnings.append
                )
                self.assertEqual(violations, [])
                self.assertEqual(asked, [462])
                self.assertEqual(len(warnings), 1)

    def test_githubs_answer_is_read_in_order_and_once(self):
        self.assertEqual(guard.github_linked(answer(5, 6, 5), REPO), [5, 6])
        self.assertEqual(guard.github_linked(answer(), REPO), [])

    def test_a_machine_branch_consults_neither_witness(self):
        # Criterion 5: a machine pull request costs no call to the forge, old or new.
        def explode(*args):
            raise AssertionError("a machine pull request must not reach the forge")

        for branch in ("spec-mirror", "ledger-provenance"):
            with self.subTest(branch=branch):
                warnings = []
                self.assertEqual(
                    guard.check("Closes #448", branch, explode, REPO, explode, warnings.append), []
                )
                self.assertEqual(warnings, [])


class MainTests(unittest.TestCase):
    """The command line the workflow runs, with `gh` replaced: what it asks, what it exits."""

    def run_main(self, body, pull_reply, labels, head_ref="claude/issue-519-x"):
        calls = []

        def fake_gh(args):
            calls.append(list(args))
            if args[:2] == ["pr", "view"]:
                reply = pull_reply
            elif int(args[2]) in labels:
                reply = {"labels": [{"name": name} for name in labels[int(args[2])]]}
            else:
                reply = subprocess.CalledProcessError(
                    1, ["gh", *args], output="", stderr="GraphQL: Could not resolve to an issue"
                )
            if isinstance(reply, BaseException):
                raise reply
            return reply if isinstance(reply, str) else json.dumps(reply)

        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "body.md"
            path.write_text(body, encoding="utf-8")
            argv = [
                "issue_label_guard.py", "--repo", REPO, "--pull", "519",
                "--head-ref", head_ref, "--body-file", str(path),
            ]
            out = io.StringIO()
            with mock.patch.object(guard, "_gh", fake_gh), mock.patch.object(sys, "argv", argv):
                with contextlib.redirect_stdout(out):
                    code = guard.main()
        return code, out.getvalue(), calls

    def test_it_asks_github_about_the_pull_request_it_was_given(self):
        code, out, calls = self.run_main("Nothing linked.", answer(462), {462: GOOD})
        self.assertEqual(code, 0)
        self.assertEqual(
            calls,
            [
                ["pr", "view", "519", "--repo", REPO, "--json", "closingIssuesReferences"],
                ["issue", "view", "462", "--repo", REPO, "--json", "labels"],
            ],
        )
        self.assertIn("issue-label-guard: #462 carries its priority/type/area axes", out)

    def test_a_sidebar_only_link_to_a_badly_labelled_issue_fails_the_check(self):
        code, out, _ = self.run_main("Nothing linked.", answer(448), {448: LABELS_448})
        self.assertEqual(code, 1)
        self.assertIn("::error::issue-label-guard: Issue #448", out)

    def test_an_unreadable_answer_warns_and_the_body_decides(self):
        # The one call #519 adds may fail without making the required check red: that is
        # the guard's behaviour before #519, stated in a warning instead of silently.
        for reply in (
            subprocess.CalledProcessError(1, ["gh"], output="", stderr="HTTP 502: Bad Gateway"),
            "<html>502 Bad Gateway</html>",
        ):
            with self.subTest(reply=reply):
                code, out, _ = self.run_main(BODY, reply, {462: GOOD})
                self.assertEqual(code, 0)
                self.assertIn("::warning::issue-label-guard: could not read the Issues GitHub links", out)
                self.assertIn("#462 carries its priority/type/area axes", out)
                self.assertNotIn("::error::", out)

    def test_nothing_linked_anywhere_passes_and_says_so(self):
        code, out, calls = self.run_main("Nothing linked.", answer(), {})
        self.assertEqual(code, 0)
        self.assertEqual(len(calls), 1)
        self.assertIn("found no linked Issue to check", out)

    def test_a_machine_branch_makes_no_call_at_all(self):
        code, out, calls = self.run_main(
            "Closes #448", AssertionError("asked the forge"), {}, head_ref="spec-mirror"
        )
        self.assertEqual(code, 0)
        self.assertEqual(calls, [])
        self.assertIn("`spec-mirror` is a machine pull request", out)

    def test_an_unreadable_linked_issue_still_fails_the_check(self):
        # Unchanged by #519, and deliberately: an Issue the guard knows is linked but cannot
        # read is not a pass.
        code, out, _ = self.run_main("Closes #999999", answer(), {})
        self.assertEqual(code, 1)
        self.assertIn("::error::issue-label-guard: could not read a linked Issue", out)


class WorkflowTests(unittest.TestCase):
    def text(self):
        return CI.read_text(encoding="utf-8")

    def test_the_guard_runs_inside_policy_guard_on_pull_requests(self):
        text = self.text()
        self.assertIn("scripts/issue_label_guard.py", text)
        job = text.index("policy-guard:")
        self.assertGreater(text.index("scripts/issue_label_guard.py"), job)

    def test_the_body_arrives_through_the_environment_not_an_expression(self):
        # Attacker-controllable text on a public repository must never be interpolated
        # into a shell line.
        text = self.text()
        self.assertIn("PR_BODY: ${{ github.event.pull_request.body }}", text)
        self.assertNotIn('"${{ github.event.pull_request.body }}"', text)

    def test_the_guard_is_given_a_token_to_read_the_issue_with(self):
        rows = self.text().splitlines()
        call = next(i for i, row in enumerate(rows) if "scripts/issue_label_guard.py" in row)
        step = next(i for i in range(call, -1, -1) if rows[i].lstrip().startswith("- name:"))
        self.assertIn("GH_TOKEN", "\n".join(rows[step:call]))

    def step(self):
        """The guard's step, from its `- name:` line to the first line indented no deeper."""
        rows = self.text().splitlines()
        call = next(i for i, row in enumerate(rows) if "scripts/issue_label_guard.py" in row)
        start = next(i for i in range(call, -1, -1) if rows[i].lstrip().startswith("- name:"))
        depth = len(rows[start]) - len(rows[start].lstrip())
        end = next(
            (
                i
                for i in range(start + 1, len(rows))
                if rows[i].strip() and len(rows[i]) - len(rows[i].lstrip()) <= depth
            ),
            len(rows),
        )
        return "\n".join(rows[start:end])

    def test_the_number_and_the_repository_arrive_through_the_environment(self):
        # Issue #519: the guard asks GitHub about the pull request itself, so it needs the
        # number. Neither it nor the repository is interpolated into the shell line.
        step = self.step()
        self.assertIn("PR_NUMBER: ${{ github.event.pull_request.number }}", step)
        self.assertIn("REPOSITORY: ${{ github.repository }}", step)
        self.assertIn('--pull "${PR_NUMBER}"', step)
        self.assertIn('--repo "${REPOSITORY}"', step)
        self.assertNotIn("${{", step[step.index("run: |"):])

    def test_the_workflow_token_reads_issues_and_writes_nothing(self):
        # Issue #520: the guard reads the linked Issue under an explicit grant, not because
        # the repository happens to be public, and the grant is `read` and no wider. The
        # whole set is pinned, as test_mergeability_trust pins its own (#495), so that any
        # later grant is a visible change rather than a quiet one.
        block = re.search(r"^permissions:\n((?:  .*\n)*)", self.text(), re.MULTILINE).group(1)
        grants = dict(re.findall(r"^  ([\w-]+):\s*(\w+)\s*$", block, re.MULTILINE))
        self.assertEqual(grants.get("issues"), "read")
        self.assertEqual(grants, {"contents": "read", "pull-requests": "read", "issues": "read"})
        rows = block.splitlines()
        self.assertIn("issue-label-guard", rows[rows.index("  issues: read") - 1])


class RunbookTests(unittest.TestCase):
    def test_the_decision_table_names_the_check_for_the_label_axes_gate(self):
        # Acceptance criterion 6: the gate moved, so the table must say who holds it now.
        text = ACCEPTOR_RUNBOOK.read_text(encoding="utf-8")
        row = next(
            line for line in text.splitlines()
            if line.startswith("|") and "Label axes on the Issue" in line
        )
        self.assertIn("issue_label_guard.py", row)
        self.assertNotIn("| you |", row)

    def test_the_prose_counts_agree_with_the_rows_it_counts(self):
        """The section's stated purpose is that its accounting is complete.

        *"A gate belonging to neither would be the worst outcome — the contract would make
        it look enforced while nothing enforced it."* The count words are how a reader
        checks that claim, so a wrong one is not a typo: a later editor reconciling "four"
        against five bullets closes the gap by deleting one, and the deleted one is a gate
        nobody then holds. The first revision of #518 moved a row between the columns and
        left all three words behind; this pins them to the rows themselves.
        """
        words = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven"}
        text = ACCEPTOR_RUNBOOK.read_text(encoding="utf-8")
        rows = [line.rstrip() for line in text.splitlines() if line.startswith("|")]
        yours = words[sum(1 for row in rows if row.endswith("| you |"))]
        checked = words[sum(1 for row in rows if row.endswith(", required |"))]

        reasons = text.index("the reason no check decides them")
        closing = text.index("If you find a defect in one of the")
        bullets = sum(
            1 for line in text[reasons:closing].splitlines() if line.startswith("- *")
        )
        self.assertEqual(words[bullets], yours, "one bullet per gate that is yours")

        for sentence in (
            "and %s are yours;" % yours,
            "**For the %s that are yours" % yours,
            "If you find a defect in one of the %s," % yours,
            "%s of them are already decided" % checked.capitalize(),
            "**For the %s a check decides" % checked,
        ):
            with self.subTest(sentence=sentence):
                self.assertIn(sentence, text)

    def test_the_observed_failure_that_moved_the_gate_is_recorded(self):
        text = ACCEPTOR_RUNBOOK.read_text(encoding="utf-8")
        for evidence in ("#448", "#459", "#462"):
            with self.subTest(evidence=evidence):
                self.assertIn(evidence, text)


if __name__ == "__main__":
    unittest.main()
