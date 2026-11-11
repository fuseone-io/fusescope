"""idp_login re-queries only the element of the action that hit a
StaleElementReferenceException, a bounded number of times, and lets every
other failure through (#346). Runs on a fake driver: no browser, no Keycloak."""

import pytest
from selenium.common.exceptions import ElementNotInteractableException, StaleElementReferenceException, TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support.wait import WebDriverWait

from fixtures import idp

IDP = "http://idp.test:6060/realms/master/login"
APP = "http://signoz.test:8080/basepath/"


class Element:
    """A login form element; stale makes its next calls raise, as when Keycloak's page replaces the node."""

    def __init__(self, page: "Page", locator: str, stale: int = 0) -> None:
        self.page, self.locator, self.stale = page, locator, stale

    def is_displayed(self) -> bool:
        return True

    def is_enabled(self) -> bool:
        return True

    def _touch(self, action: str) -> None:
        self.page.actions.append((self.locator, id(self), action))
        if self.stale:
            self.stale -= 1
            raise StaleElementReferenceException("stale element not found")

    def clear(self) -> None:
        self._touch("clear")
        self.page.values[self.locator] = ""

    def send_keys(self, text: str) -> None:
        self._touch(f"send_keys {text}")
        self.page.values[self.locator] = self.page.values.get(self.locator, "") + text

    def click(self) -> None:
        self._touch("click")
        if self.page.navigates:
            self.page.current_url = APP


class Page:
    """A fake driver: find_element hands out the next element queued for that id."""

    def __init__(self, elements: dict[str, list[int]], navigates: bool = True) -> None:
        self.queues = {locator: [Element(self, locator, stale) for stale in stales] for locator, stales in elements.items()}
        self.finds: list[str] = []
        self.actions: list[tuple[str, int, str]] = []
        self.values: dict[str, str] = {}
        self.current_url = IDP
        self.navigates = navigates

    def find_element(self, by: str, value: str) -> Element:
        assert by == By.ID
        self.finds.append(value)
        queue = self.queues[value]
        return queue.pop(0) if len(queue) > 1 else queue[0]

    def find_elements(self, by: str, value: str) -> list[Element]:
        assert by == By.ID
        return [] if self.current_url == APP else [self.queues[value][0]]


def fill(text: str):
    return lambda element, retry: idp.fill_field(element, text, retry)


def test_send_keys_on_a_stale_field_refetches_only_that_field_and_clears_it() -> None:
    page = Page({"password": [1, 0]})
    idp.act_on_fresh(WebDriverWait(page, 1), (By.ID, "password"), fill("secret"))

    assert page.finds == ["password", "password"]
    assert [action[2] for action in page.actions] == ["send_keys secret", "clear", "send_keys secret"]
    assert page.actions[0][1] != page.actions[1][1] == page.actions[2][1]
    assert page.values["password"] == "secret"


def test_click_on_a_stale_button_refetches_only_the_button() -> None:
    page = Page({"kc-login": [1, 0]})
    idp.act_on_fresh(WebDriverWait(page, 1), (By.ID, "kc-login"), lambda element, _: element.click())

    assert page.finds == ["kc-login", "kc-login"]
    assert [action[2] for action in page.actions] == ["click", "click"]
    assert page.actions[0][1] != page.actions[1][1]


def test_a_field_stale_on_every_attempt_fails_with_the_stale_error() -> None:
    page = Page({"username": [1] * (idp.STALE_ATTEMPTS + 1)})
    with pytest.raises(StaleElementReferenceException):
        idp.act_on_fresh(WebDriverWait(page, 1), (By.ID, "username"), fill("a@b.test"))

    assert page.finds == ["username"] * idp.STALE_ATTEMPTS


@pytest.mark.parametrize("error", [ElementNotInteractableException("not interactable"), RuntimeError("other")])
def test_other_errors_are_not_retried(error: Exception) -> None:
    page = Page({"kc-login": [0]})

    def fail(_element, _retry) -> None:
        raise error

    with pytest.raises(type(error)):
        idp.act_on_fresh(WebDriverWait(page, 1), (By.ID, "kc-login"), fail)
    assert page.finds == ["kc-login"]


def test_a_timeout_finding_the_element_is_not_retried() -> None:
    class Hidden(Page):
        def find_element(self, by: str, value: str) -> Element:
            self.finds.append(value)
            element = Element(self, value)
            element.is_displayed = lambda: False
            return element

    page = Hidden({})
    with pytest.raises(TimeoutException):
        idp.act_on_fresh(WebDriverWait(page, 0.3, poll_frequency=0.1), (By.ID, "username"), fill("a@b.test"))
    assert not page.actions


def test_idp_login_retries_each_stale_element_once_and_leaves_the_idp() -> None:
    page = Page({"username": [1, 0], "password": [1, 0], "kc-login": [1, 0]})
    idp.idp_login.__wrapped__(page)("viewer@oidc.basepath.test", "password123")

    assert page.values == {"username": "viewer@oidc.basepath.test", "password": "password123"}
    assert [action[2] for action in page.actions] == [
        "send_keys viewer@oidc.basepath.test",
        "clear",
        "send_keys viewer@oidc.basepath.test",
        "send_keys password123",
        "clear",
        "send_keys password123",
        "click",
        "click",
    ]
    assert page.current_url == APP


def test_idp_login_that_stays_on_the_idp_times_out_without_clicking_again(monkeypatch: pytest.MonkeyPatch) -> None:
    """Rejected credentials keep the login page: the navigation wait times out, and the login is not repeated."""
    monkeypatch.setattr(idp, "IDP_WAIT_SECONDS", 0.3)
    page = Page({"username": [0], "password": [0], "kc-login": [0]}, navigates=False)
    with pytest.raises(TimeoutException):
        idp.idp_login.__wrapped__(page)("viewer@oidc.basepath.test", "wrong")
    assert [action[2] for action in page.actions].count("click") == 1
