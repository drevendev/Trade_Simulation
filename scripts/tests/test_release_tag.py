"""What may be released, and what the registry's milestone column must keep true.

The last tests are the important ones: they are the only thing standing between a
requirement the researcher adds and a milestone gate that silently never covers it.
"""

import csv
import io
import json
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import release_tag  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "docs" / "spec" / "mirror" / "REQUIREMENTS_REGISTRY.csv"
STATUS = ROOT / "docs" / "spec" / "implementation_status.csv"

MAP = {"M0": ["REQ-A", "REQ-B"], "M1": ["REQ-C"]}


def row(req_id, status="IMPLEMENTED", commit="abc123", issue="1", pull="2"):
    return {"REQ_ID": req_id, "STATUS": status, "ISSUE": issue, "PR": pull,
            "MERGE_COMMIT": commit, "EVIDENCE": ""}


class CompletenessTests(unittest.TestCase):
    def test_all_implemented_is_complete(self):
        self.assertTrue(release_tag.complete([row("REQ-A"), row("REQ-B")], MAP["M0"]))

    def test_one_partial_row_is_not_complete(self):
        # REQ-CONFIG-003 and REQ-CONFIG-004 sat at PARTIAL for a day after post-merge
        # QA. A milestone containing them is not released.
        rows = [row("REQ-A"), row("REQ-B", status="PARTIAL")]
        self.assertFalse(release_tag.complete(rows, MAP["M0"]))

    def test_a_missing_row_is_not_complete(self):
        # The ledger gains a row when work lands, so absent and not-done are the same
        # fact. Treating absence as success would release unstarted work.
        self.assertFalse(release_tag.complete([row("REQ-A")], MAP["M0"]))

    def test_status_is_read_case_and_space_insensitively(self):
        rows = [row("REQ-A", status=" implemented "), row("REQ-B")]
        self.assertTrue(release_tag.complete(rows, MAP["M0"]))


class PlanTests(unittest.TestCase):
    def test_a_newly_complete_milestone_is_tagged_from_zero(self):
        got = release_tag.plan([row("REQ-A"), row("REQ-B")], {"M0": MAP["M0"]}, {})
        self.assertEqual([entry["tag"] for entry in got], ["v0.0.0"])

    def test_an_unchanged_milestone_is_not_re_tagged(self):
        # The job runs on every push to master. Same coverage, same digest, no tag.
        rows = [row("REQ-A"), row("REQ-B")]
        digest = release_tag.coverage_digest(rows)
        got = release_tag.plan(rows, {"M0": MAP["M0"]}, {"M0": [(0, digest)]})
        self.assertEqual(got, [])

    def test_a_milestone_satisfied_by_different_commits_earns_a_patch(self):
        # M1 was reached, two rows went back to PARTIAL, repairs landed at new
        # commits. The old tag stands; a patch is cut beside it.
        before = [row("REQ-A"), row("REQ-B")]
        after = [row("REQ-A"), row("REQ-B", commit="def456")]
        got = release_tag.plan(
            after, {"M0": MAP["M0"]}, {"M0": [(0, release_tag.coverage_digest(before))]}
        )
        self.assertEqual([entry["tag"] for entry in got], ["v0.0.1"])

    def test_the_patch_counts_from_the_highest_existing_tag(self):
        got = release_tag.plan(
            [row("REQ-A"), row("REQ-B")], {"M0": MAP["M0"]},
            {"M0": [(0, "stale"), (1, "alsostale")]},
        )
        self.assertEqual([entry["tag"] for entry in got], ["v0.0.2"])

    def test_row_order_in_the_ledger_does_not_look_like_a_re_release(self):
        forward = [row("REQ-A"), row("REQ-B")]
        reversed_ = [row("REQ-B"), row("REQ-A")]
        self.assertEqual(
            release_tag.coverage_digest(forward), release_tag.coverage_digest(reversed_)
        )

    def test_an_incomplete_milestone_yields_nothing(self):
        rows = [row("REQ-A"), row("REQ-B"), row("REQ-C", status="PARTIAL")]
        got = release_tag.plan(rows, MAP, {})
        self.assertEqual([entry["tag"] for entry in got], ["v0.0.0"])


class TagListingTests(unittest.TestCase):
    def test_the_digest_is_read_out_of_a_tag_message(self):
        listing = (
            "v0.0.0\tM0 complete.\n\ncoverage-digest: 7323469a3507b253\n\x00"
            "v0.1.0\tM1 complete.\n\ncoverage-digest: aaaabbbbccccdddd\n\x00"
        )
        got = release_tag.parse_tag_listing(listing, MAP)
        self.assertEqual(got["M0"], [(0, "7323469a3507b253")])
        self.assertEqual(got["M1"], [(0, "aaaabbbbccccdddd")])

    def test_a_tag_without_a_digest_still_holds_its_patch_number(self):
        # A tag cut by hand blocks nothing, but the next patch must still clear it.
        got = release_tag.parse_tag_listing("v0.0.0\tcut by hand\x00", MAP)
        self.assertEqual(got["M0"], [(0, "")])
        self.assertEqual(release_tag.next_patch(got["M0"]), 1)

    def test_tags_that_are_not_releases_are_ignored(self):
        # scheme/N marks a change of operating setup and shares the tag namespace.
        listing = "scheme/3\tverdict ownership\x00v1.2.3\tnot ours\x00"
        got = release_tag.parse_tag_listing(listing, MAP)
        self.assertEqual(got, {"M0": [], "M1": []})


class ForeignTaggerTests(unittest.TestCase):
    """A release this job did not cut has passed none of its gates."""

    MACHINE = "zendev-machine[bot]"

    def test_a_tag_cut_by_a_model_run_is_reported(self):
        # v0.2.0, 2026-09-08 06:02Z: cut by hand while REQ-CORE-006 was still PARTIAL,
        # bypassing the completeness check, the provenance refusal and the digest.
        listing = ("v0.0.0\tzendev-machine[bot]\x00"
                   "v0.2.0\tclaude[bot]\x00")
        self.assertEqual(
            release_tag.foreign_taggers(listing, self.MACHINE),
            [("v0.2.0", "claude[bot]")],
        )

    def test_this_jobs_own_tags_are_not_reported(self):
        listing = "v0.0.0\tzendev-machine[bot]\x00"
        self.assertEqual(release_tag.foreign_taggers(listing, self.MACHINE), [])

    def test_scheme_tags_are_not_releases(self):
        # scheme/N shares the namespace and is cut by the operator by design.
        listing = "scheme/4\tDreven\x00"
        self.assertEqual(release_tag.foreign_taggers(listing, self.MACHINE), [])

    def test_a_lightweight_tag_with_no_tagger_is_not_reported(self):
        # An unannotated tag carries no tagger; reporting every one of those would be
        # noise that trains the reader to ignore the warning that matters.
        listing = "v0.3.0\t\x00"
        self.assertEqual(release_tag.foreign_taggers(listing, self.MACHINE), [])

    def test_an_empty_listing_reports_nothing(self):
        self.assertEqual(release_tag.foreign_taggers("", self.MACHINE), [])


def registry_row(req_id, milestone="M1", status="READY"):
    return {"REQ_ID": req_id, "STATUS": status, "MILESTONE": milestone}


class MembershipFromTheRegistryTests(unittest.TestCase):
    """Membership is the researcher's column, not a copy of it."""

    def test_rows_are_grouped_by_milestone_in_registry_order(self):
        rows = [
            registry_row("REQ-B", "M1"),
            registry_row("REQ-A", "M0"),
            registry_row("REQ-C", "M1"),
        ]
        self.assertEqual(
            release_tag.milestones_from_registry(rows),
            {"M1": ["REQ-B", "REQ-C"], "M0": ["REQ-A"]},
        )

    def test_a_row_without_a_milestone_gates_nothing(self):
        rows = [
            registry_row("REQ-SCOPE-001", "", status="FROZEN"),
            registry_row("REQ-A", "M0"),
        ]
        self.assertEqual(release_tag.milestones_from_registry(rows), {"M0": ["REQ-A"]})

    def test_a_milestone_that_is_not_m_n_is_refused(self):
        with self.assertRaises(ValueError):
            release_tag.milestones_from_registry([registry_row("REQ-A", "Milestone 1")])

    def test_the_plan_walks_milestones_in_numeric_order_whatever_the_registry_order(self):
        rows = [registry_row("REQ-A", "M1"), registry_row("REQ-B", "M0")]
        milestones = release_tag.milestones_from_registry(rows)
        got = release_tag.plan([row("REQ-A"), row("REQ-B")], milestones, {})
        self.assertEqual([e["milestone"] for e in got], ["M0", "M1"])


class TheRegistrysOwnColumnTests(unittest.TestCase):
    """The column is the researcher's data, and the specification changes.

    The guard that used to live here compared a hand copy in docs/zendev/milestones.json
    with the registry, in both directions. That copy blocked the mirror proposal that
    registered REQ-VISUALIZATION-007 and -008: the map did not name them, and no
    ordinary branch could name them before the registry did (#377). What the guard was
    for survives — a requirement the researcher adds that belongs to no milestone is
    covered by no gate and would never appear in any release, silently. Now that fails
    here, in the column itself, and the only thing that fixes it is the researcher's row.
    """

    def setUp(self):
        with io.open(REGISTRY, encoding="utf-8", newline="") as handle:
            self.registry = list(csv.DictReader(handle))

    def test_the_registry_carries_the_column(self):
        self.assertIn("MILESTONE", self.registry[0])

    def test_a_requirement_without_a_milestone_is_a_frozen_cross_cutting_row(self):
        # The researcher leaves the column empty on purpose for the scope statements
        # and the cross-cutting visibility rule, and those are FROZEN. Anything else
        # without a milestone is a requirement no gate covers.
        loose = [
            (r["REQ_ID"], (r.get("STATUS") or "").strip())
            for r in self.registry
            if not (r.get("MILESTONE") or "").strip()
        ]
        self.assertEqual(
            [req_id for req_id, status in loose if status != "FROZEN"],
            [],
            "requirements that no milestone claims",
        )

    def test_every_named_milestone_is_well_formed(self):
        milestones = release_tag.milestones_from_registry(self.registry)  # raises on M?
        self.assertTrue(milestones, "the registry names no milestone at all")
        for name in milestones:
            release_tag.milestone_number(name)

    def test_the_ledger_only_carries_requirements_the_registry_knows(self):
        registry = {r["REQ_ID"] for r in self.registry}
        self.assertEqual(
            {r["REQ_ID"] for r in release_tag.read_rows(STATUS)} - registry, set()
        )


WORKFLOW = ROOT / ".github" / "workflows" / "release-tag.yml"


def trigger_problems(text):
    """Why the workflow's `on:` block would let a provenance proposal go stale. Pure.

    Text rather than a YAML parse, like the other workflow tests: this runs in the
    policy-guard job with nothing but the standard library.
    """
    block = text.split("\non:\n", 1)[1].split("\npermissions:", 1)[0]
    triggers = [line for line in block.splitlines() if line and not line.lstrip().startswith("#")]
    problems = []
    if "  push:" not in triggers or "    branches: [master]" not in triggers:
        problems.append("the workflow no longer runs on a push to master")
    if any(line.strip().startswith(("paths:", "paths-ignore:")) for line in triggers):
        problems.append(
            "the push trigger is filtered by path, so a push that leaves the ledger alone "
            "strands an open provenance proposal behind master (#778)"
        )
    if "  workflow_dispatch:" not in triggers:
        problems.append("the workflow can no longer be dispatched by hand")
    return problems


class ProducerFollowsMasterTests(unittest.TestCase):
    """The provenance proposal is recomputed whenever `master` moves (#778).

    #777 was opened after #661 merged, went stale when #772 merged while its checks
    were still running, and waited on a head that could no longer go green: the only
    trigger was a push touching the ledger or the registry, and nothing else may
    repair a machine branch.
    """

    def test_the_shipped_workflow_runs_on_every_push_to_master(self):
        self.assertEqual(trigger_problems(WORKFLOW.read_text(encoding="utf-8")), [])

    def test_a_path_filter_on_the_push_trigger_is_caught(self):
        edited = WORKFLOW.read_text(encoding="utf-8").replace(
            "    branches: [master]\n",
            "    branches: [master]\n    paths:\n      - 'docs/spec/implementation_status.csv'\n",
            1,
        )
        self.assertIn("filtered by path", " ".join(trigger_problems(edited)))

    def test_losing_the_dispatch_is_caught(self):
        edited = WORKFLOW.read_text(encoding="utf-8").replace("  workflow_dispatch:\n", "", 1)
        self.assertIn("dispatched by hand", " ".join(trigger_problems(edited)))


if __name__ == "__main__":
    unittest.main()
