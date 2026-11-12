import unittest

from authorize import Context, approved_at, decide, head_time, is_fresh

HEAD = "a" * 40
BASE = dict(repo="fuseone-io/fusescope", number="1", head_sha=HEAD, sha="m" * 40, label="", fork=False, user="klinux", relevant=True, merge_group="run")


def ctx(**kw) -> Context:
    fields = dict(BASE, event="pull_request", action="synchronize", triggers=("safe-to-test",), trusted_requires=(), untrusted_requires=("safe-to-test",))
    fields.update(kw)
    return Context(**fields)


class DecideTest(unittest.TestCase):
    def test_trusted_push_without_labels_runs(self) -> None:
        d = decide(ctx(), fresh={})
        self.assertEqual((d.ignored, d.authorized, d.run, d.sha), (False, True, True, HEAD))

    def test_irrelevant_change_passes_without_running(self) -> None:
        d = decide(ctx(relevant=False, trusted_requires=("safe-to-integrate",)), fresh={})
        self.assertEqual((d.ignored, d.run), (False, False))
        self.assertTrue(d.passes_without_tests)

    def test_trusted_needs_a_fresh_label_when_required(self) -> None:
        c = ctx(trusted_requires=("safe-to-integrate",), triggers=("safe-to-integrate",))
        self.assertFalse(decide(c, fresh={"safe-to-integrate": False}).run)
        self.assertTrue(decide(c, fresh={"safe-to-integrate": True}).run)

    def test_untrusted_never_runs_tests_under_pull_request(self) -> None:
        d = decide(ctx(user="dependabot[bot]"), fresh={"safe-to-test": True})
        self.assertEqual((d.ignored, d.run), (False, False))
        self.assertIn("safe-to-test", d.reason)

    def test_untrusted_labeled_target_with_fresh_label_and_approval_runs(self) -> None:
        c = ctx(event="pull_request_target", action="labeled", label="safe-to-test", fork=True)
        self.assertTrue(decide(c, fresh={"safe-to-test": True}, approved=True).run)

    def test_untrusted_needs_an_approving_review_on_the_head(self) -> None:
        c = ctx(event="pull_request_target", action="labeled", label="safe-to-test", fork=True)
        d = decide(c, fresh={"safe-to-test": True}, approved=False)
        self.assertEqual((d.authorized, d.run), (False, False))
        self.assertIn("approving review", d.reason)
        self.assertIn(HEAD, d.reason)

    def test_trusted_needs_no_review(self) -> None:
        c = ctx(trusted_requires=("safe-to-integrate",), triggers=("safe-to-integrate",))
        self.assertTrue(decide(c, fresh={"safe-to-integrate": True}, approved=False).run)

    def test_unknown_head_time_has_its_own_reason(self) -> None:
        c = ctx(event="pull_request_target", action="labeled", label="safe-to-test", fork=True)
        d = decide(c, fresh={"safe-to-test": False}, approved=True, head_known=False)
        self.assertFalse(d.run)
        self.assertIn("head time unknown", d.reason)

    def test_untrusted_labeled_target_with_stale_label_does_not_run(self) -> None:
        c = ctx(event="pull_request_target", action="labeled", label="safe-to-test", fork=True)
        d = decide(c, fresh={"safe-to-test": False})
        self.assertEqual((d.ignored, d.authorized, d.run), (False, False, False))

    def test_untrusted_needs_every_required_label(self) -> None:
        c = ctx(event="pull_request_target", action="labeled", label="safe-to-integrate", user="dependabot[bot]",
                triggers=("safe-to-test", "safe-to-integrate"), untrusted_requires=("safe-to-test", "safe-to-integrate"))
        self.assertFalse(decide(c, fresh={"safe-to-test": False, "safe-to-integrate": True}, approved=True).run)
        self.assertTrue(decide(c, fresh={"safe-to-test": True, "safe-to-integrate": True}, approved=True).run)

    def test_other_label_events_are_ignored(self) -> None:
        self.assertTrue(decide(ctx(action="labeled", label="bug"), fresh={}).ignored)
        self.assertTrue(decide(ctx(event="pull_request_target", action="labeled", label="bug", fork=True), fresh={}).ignored)

    def test_trusted_target_runs_are_ignored(self) -> None:
        self.assertTrue(decide(ctx(event="pull_request_target", action="labeled", label="safe-to-test"), fresh={}).ignored)

    def test_untrusted_labeled_pull_request_is_ignored(self) -> None:
        self.assertTrue(decide(ctx(action="labeled", label="safe-to-test", fork=True), fresh={}).ignored)

    def test_non_pr_events_run_everything_at_the_event_sha(self) -> None:
        for event in ("schedule", "workflow_dispatch", "merge_group"):
            d = decide(ctx(event=event, action=""), fresh={})
            self.assertEqual((d.ignored, d.run, d.sha), (False, True, "m" * 40), event)

    def test_merge_group_can_pass_without_running(self) -> None:
        d = decide(ctx(event="merge_group", action="", merge_group="pass"), fresh={})
        self.assertEqual((d.run, d.passes_without_tests), (False, True))


class ApprovalTest(unittest.TestCase):
    WRITERS = {"m": "write", "a": "admin", "r": "read", "t": "triage", "x": "none"}

    def review(self, user, state, commit, when):
        return {"user": user, "state": state, "commit_id": commit, "submitted_at": when}

    def approved(self, reviews) -> bool:
        return approved_at(reviews, HEAD, lambda user: self.WRITERS.get(user, "none"))

    def test_an_approval_on_the_head_by_a_writer_counts(self) -> None:
        self.assertTrue(self.approved([self.review("m", "APPROVED", HEAD, "2026-11-12T10:00:00Z")]))
        self.assertTrue(self.approved([self.review("a", "APPROVED", HEAD, "2026-11-12T10:00:00Z")]))

    def test_an_approval_on_an_earlier_head_does_not_count(self) -> None:
        self.assertFalse(self.approved([self.review("m", "APPROVED", "b" * 40, "2026-11-12T10:00:00Z")]))

    def test_an_approval_without_write_permission_does_not_count(self) -> None:
        for user in ("r", "t", "x", "stranger"):
            self.assertFalse(self.approved([self.review(user, "APPROVED", HEAD, "2026-11-12T10:00:00Z")]), user)

    def test_a_later_change_request_by_the_same_reviewer_withdraws_it(self) -> None:
        reviews = [self.review("m", "APPROVED", HEAD, "2026-11-12T10:00:00Z"), self.review("m", "CHANGES_REQUESTED", HEAD, "2026-11-12T10:05:00Z")]
        self.assertFalse(self.approved(reviews))

    def test_a_comment_after_an_approval_keeps_it(self) -> None:
        reviews = [self.review("m", "APPROVED", HEAD, "2026-11-12T10:00:00Z"), self.review("m", "COMMENTED", HEAD, "2026-11-12T10:05:00Z")]
        self.assertTrue(self.approved(reviews))

    def test_a_dismissed_approval_does_not_count(self) -> None:
        self.assertFalse(self.approved([self.review("m", "DISMISSED", HEAD, "2026-11-12T10:00:00Z")]))

    def test_permissions_are_only_looked_up_for_approvals_on_the_head(self) -> None:
        asked = []
        reviews = [self.review("r", "COMMENTED", HEAD, "2026-11-12T10:00:00Z"), self.review("x", "APPROVED", "b" * 40, "2026-11-12T10:00:00Z")]
        approved_at(reviews, HEAD, lambda user: asked.append(user) or "write")
        self.assertEqual(asked, [])


class FreshTest(unittest.TestCase):
    def test_head_time_is_the_earliest_pr_run(self) -> None:
        runs = [("pull_request_target", "2026-11-12T10:00:05Z"), ("pull_request", "2026-11-12T10:00:01Z"), ("schedule", "2026-11-12T09:00:00Z")]
        self.assertEqual(head_time(runs), "2026-11-12T10:00:01Z")

    def test_head_time_unknown_without_pr_runs(self) -> None:
        self.assertIsNone(head_time([("schedule", "2026-11-12T09:00:00Z")]))

    def test_a_label_added_after_the_head_is_fresh(self) -> None:
        events = [("safe-to-test", "2026-11-12T09:59:00Z"), ("safe-to-test", "2026-11-12T10:01:00Z")]
        self.assertTrue(is_fresh("safe-to-test", {"safe-to-test"}, events, "2026-11-12T10:00:01Z"))

    def test_a_label_from_an_earlier_head_is_stale(self) -> None:
        events = [("safe-to-test", "2026-11-12T09:59:00Z")]
        self.assertFalse(is_fresh("safe-to-test", {"safe-to-test"}, events, "2026-11-12T10:00:01Z"))

    def test_a_label_in_the_same_second_as_the_head_is_stale(self) -> None:
        events = [("safe-to-test", "2026-11-12T10:00:01Z")]
        self.assertFalse(is_fresh("safe-to-test", {"safe-to-test"}, events, "2026-11-12T10:00:01Z"))

    def test_a_removed_label_is_not_fresh(self) -> None:
        events = [("safe-to-test", "2026-11-12T10:01:00Z")]
        self.assertFalse(is_fresh("safe-to-test", set(), events, "2026-11-12T10:00:01Z"))

    def test_no_head_time_is_not_fresh(self) -> None:
        self.assertFalse(is_fresh("safe-to-test", {"safe-to-test"}, [("safe-to-test", "2026-11-12T10:01:00Z")], None))


if __name__ == "__main__":
    unittest.main()
