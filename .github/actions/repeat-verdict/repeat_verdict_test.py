import unittest

from repeat_verdict import Run, repeat

OWN = 100


def run(suite: int, conclusion: str | None = "success", completed: str = "2026-11-16T17:00:00Z") -> Run:
    return Run(suite=suite, status="in_progress" if conclusion is None else "completed", conclusion=conclusion, completed_at=completed, url=f"https://ci/{suite}")


class RepeatTest(unittest.TestCase):
    def test_repeats_a_passing_verdict(self) -> None:
        self.assertEqual(repeat(OWN, [run(90)])[0], "pass")

    def test_repeats_a_failing_verdict(self) -> None:
        state, reason = repeat(OWN, [run(90, "failure")])
        self.assertEqual(state, "fail")
        self.assertIn("https://ci/90", reason)

    def test_fails_without_a_verdict_to_repeat(self) -> None:
        self.assertEqual(repeat(OWN, [])[0], "fail")

    def test_the_latest_suite_wins(self) -> None:
        self.assertEqual(repeat(OWN, [run(80, "failure", "2026-11-16T20:00:00Z"), run(90, "success", "2026-11-16T18:00:00Z")])[0], "pass")
        self.assertEqual(repeat(OWN, [run(80, "success", "2026-11-16T20:00:00Z"), run(90, "failure", "2026-11-16T18:00:00Z")])[0], "fail")

    def test_the_latest_attempt_in_a_suite_wins(self) -> None:
        self.assertEqual(repeat(OWN, [run(90, "failure", "2026-11-16T18:00:00Z"), run(90, "success", "2026-11-16T20:00:00Z")])[0], "pass")

    def test_waits_for_an_earlier_verdict_still_running(self) -> None:
        self.assertEqual(repeat(OWN, [run(80), run(90, None)])[0], "wait")

    def test_later_suites_are_not_its_to_repeat(self) -> None:
        self.assertEqual(repeat(OWN, [run(90), run(110, "failure")])[0], "pass")
        self.assertEqual(repeat(OWN, [run(90), run(110, None)])[0], "pass")
        self.assertEqual(repeat(OWN, [run(OWN, None)])[0], "fail")

    def test_a_cancelled_or_skipped_run_is_no_verdict(self) -> None:
        self.assertEqual(repeat(OWN, [run(80, "success"), run(90, "cancelled")])[0], "pass")
        self.assertEqual(repeat(OWN, [run(90, "skipped")])[0], "fail")

    def test_any_other_conclusion_fails(self) -> None:
        for conclusion in ("timed_out", "action_required", "neutral", "stale"):
            self.assertEqual(repeat(OWN, [run(90, conclusion)])[0], "fail", conclusion)


if __name__ == "__main__":
    unittest.main()
