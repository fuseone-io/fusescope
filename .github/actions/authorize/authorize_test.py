import unittest

from authorize import Context, decide, head_time, is_fresh

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

    def test_untrusted_labeled_target_with_fresh_label_runs(self) -> None:
        c = ctx(event="pull_request_target", action="labeled", label="safe-to-test", fork=True)
        self.assertTrue(decide(c, fresh={"safe-to-test": True}).run)

    def test_untrusted_labeled_target_with_stale_label_does_not_run(self) -> None:
        c = ctx(event="pull_request_target", action="labeled", label="safe-to-test", fork=True)
        d = decide(c, fresh={"safe-to-test": False})
        self.assertEqual((d.ignored, d.authorized, d.run), (False, False, False))

    def test_untrusted_needs_every_required_label(self) -> None:
        c = ctx(event="pull_request_target", action="labeled", label="safe-to-integrate", user="dependabot[bot]",
                triggers=("safe-to-test", "safe-to-integrate"), untrusted_requires=("safe-to-test", "safe-to-integrate"))
        self.assertFalse(decide(c, fresh={"safe-to-test": False, "safe-to-integrate": True}).run)
        self.assertTrue(decide(c, fresh={"safe-to-test": True, "safe-to-integrate": True}).run)

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
