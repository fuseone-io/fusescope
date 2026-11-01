import unittest

from changes import decide

GO = "pkg/types/archivetypes/blockrange.go"
FRONTEND = "frontend/src/lib/rum/androidSetup.ts"
API = "docs/api/openapi.yml"


class DecideTest(unittest.TestCase):
    def check(self, files: list[str], go: bool, js: bool, e2e: bool, integration: str, labels: frozenset[str] = frozenset()) -> None:
        decision, _ = decide(files, set(labels))
        self.assertEqual(decision.outputs(), {"go": str(go).lower(), "js": str(js).lower(), "e2e": str(e2e).lower(), "integration": integration})

    def test_go_only_runs_e2e(self) -> None:
        self.check([GO, "pkg/types/archivetypes/blockrange_test.go"], go=True, js=False, e2e=True, integration="all")

    def test_go_embedded_files(self) -> None:
        self.check(["pkg/query-service/app/integrations/catalog/snapshot/index.json", "templates/email/invite.gotmpl", "conf/example.yaml"], go=True, js=False, e2e=True, integration="all")

    def test_go_and_api(self) -> None:
        self.check([GO, API], go=True, js=True, e2e=True, integration="all")

    def test_frontend_only(self) -> None:
        self.check([FRONTEND, "frontend/src/lib/rum/__tests__/androidSetup.test.ts", "frontend/public/locales/en/rum.json"], go=False, js=True, e2e=True, integration="ui")

    def test_suite_only(self) -> None:
        self.check(["tests/integration/tests/rum/01_applications.py", "tests/integration/tests/ruler/conftest.py"], go=False, js=False, e2e=False, integration="ruler rum")

    def test_frontend_and_suite(self) -> None:
        self.check([FRONTEND, "tests/integration/tests/rum/01_applications.py"], go=False, js=True, e2e=True, integration="rum ui")

    def test_e2e_only(self) -> None:
        self.check(["tests/e2e/tests/rum/errors.spec.ts"], go=False, js=False, e2e=True, integration="")

    def test_docs_only(self) -> None:
        self.check(["docs/adr/0010-collector-single-ingress.md", "frontend/README.md", "docs/brand/mark.svg"], go=False, js=False, e2e=False, integration="")

    def test_label_runs_e2e(self) -> None:
        self.check(["tests/integration/tests/rum/01_applications.py"], go=False, js=False, e2e=True, integration="rum", labels=frozenset({"safe-to-e2e"}))

    def test_infra_runs_everything(self) -> None:
        for path in [
            ".github/workflows/goci.yaml",
            ".github/actions/changes/changes.py",
            "go.mod",
            "go.sum",
            "frontend/package.json",
            "frontend/pnpm-lock.yaml",
            "tests/fixtures/signoz.py",
            "tests/conftest.py",
            "cmd/community/Dockerfile.integration",
            "tests/Dockerfile.seeder",
            "Makefile",
        ]:
            with self.subTest(path=path):
                self.check([FRONTEND, path], go=True, js=True, e2e=True, integration="all")

    def test_unclassified_runs_everything(self) -> None:
        for path in ["grammar/FilterQuery.g4", "tests/integration/groups.py", "tests/uv.lock", "deploy/demo/compose.yaml", ".gitattributes"]:
            with self.subTest(path=path):
                self.check([FRONTEND, path], go=True, js=True, e2e=True, integration="all")


if __name__ == "__main__":
    unittest.main()
