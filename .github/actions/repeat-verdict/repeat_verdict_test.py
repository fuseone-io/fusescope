import unittest

from repeat_verdict import Run, repeat, repeats_from_steps

OWN = 100


def run(suite: int, conclusion: str | None = "success", completed: str = "2026-11-16T17:00:00Z", repeats: bool | None = False) -> Run:
    return Run(suite=suite, status="in_progress" if conclusion is None else "completed", conclusion=conclusion, completed_at=completed, url=f"https://ci/{suite}", repeats=repeats)


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

    def test_a_deciding_suite_created_alongside_with_a_higher_id_is_repeated(self) -> None:
        self.assertEqual(repeat(OWN, [run(110)])[0], "pass")
        self.assertEqual(repeat(OWN, [run(110, "failure")])[0], "fail")
        self.assertEqual(repeat(OWN, [run(110, None)])[0], "wait")

    def test_the_latest_deciding_suite_wins_whatever_its_order(self) -> None:
        self.assertEqual(repeat(OWN, [run(90), run(110, "failure")])[0], "fail")
        self.assertEqual(repeat(OWN, [run(90, "failure"), run(110)])[0], "pass")

    def test_other_repeating_runs_are_never_repeated_or_waited_for(self) -> None:
        self.assertEqual(repeat(OWN, [run(90), run(110, None, repeats=True)])[0], "pass")
        self.assertEqual(repeat(OWN, [run(90, "failure", repeats=True)])[0], "fail")
        self.assertEqual(repeat(OWN, [run(90, None, repeats=True)])[0], "fail")

    def test_a_run_not_yet_known_to_repeat_is_waited_for(self) -> None:
        self.assertEqual(repeat(OWN, [run(90), run(110, None, repeats=None)])[0], "wait")

    def test_waits_for_a_running_suite_whose_check_does_not_exist_yet(self) -> None:
        self.assertEqual(repeat(OWN, [], ["https://ci/run/110"])[0], "wait")
        self.assertEqual(repeat(OWN, [run(90)], ["https://ci/run/110"])[0], "wait")

    def test_its_own_suite_is_ignored(self) -> None:
        self.assertEqual(repeat(OWN, [run(OWN, None)])[0], "fail")

    def test_a_cancelled_or_skipped_run_is_no_verdict(self) -> None:
        self.assertEqual(repeat(OWN, [run(80, "success"), run(90, "cancelled")])[0], "pass")
        self.assertEqual(repeat(OWN, [run(90, "skipped")])[0], "fail")

    def test_any_other_conclusion_fails(self) -> None:
        for conclusion in ("timed_out", "action_required", "neutral", "stale"):
            self.assertEqual(repeat(OWN, [run(90, conclusion)])[0], "fail", conclusion)


class RepeatsFromStepsTest(unittest.TestCase):
    def test_a_skipped_repeat_step_decides(self) -> None:
        self.assertIs(repeats_from_steps([{"name": "repeat", "status": "completed", "conclusion": "skipped"}]), False)

    def test_a_repeat_step_that_ran_or_runs_repeats(self) -> None:
        for status, conclusion in (("completed", "success"), ("completed", "failure"), ("in_progress", None)):
            self.assertIs(repeats_from_steps([{"name": "repeat", "status": status, "conclusion": conclusion}]), True, status)

    def test_unknown_until_the_repeat_step_is_reached(self) -> None:
        self.assertIsNone(repeats_from_steps([]))
        self.assertIsNone(repeats_from_steps([{"name": "repeat", "status": "queued", "conclusion": None}]))


if __name__ == "__main__":
    unittest.main()
