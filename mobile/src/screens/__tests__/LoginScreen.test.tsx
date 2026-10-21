import { act, fireEvent, screen } from "@testing-library/react-native";
import i18n from "@/lib/i18n";
import { login, type LoginResult } from "@/lib/session";
import { renderScreen } from "@/test/render";
import { LoginScreen } from "../LoginScreen";

jest.mock("@/lib/session", () => ({ ...jest.requireActual("@/lib/session"), login: jest.fn() }));

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options) as string;
const loginMock = login as jest.MockedFunction<typeof login>;

async function fillAndSubmit() {
  await fireEvent.changeText(screen.getByLabelText(t("login.email")), " Ayse@Demo.test ");
  await fireEvent.changeText(screen.getByLabelText(t("login.password")), "secret");
  await fireEvent.press(screen.getByText(t("login.submit")));
}

afterEach(() => {
  loginMock.mockReset();
  jest.useRealTimers();
});

describe("LoginScreen", () => {
  it("signs in with the e-mail as typed, trimmed and in lower case", async () => {
    loginMock.mockResolvedValue("ok");
    const onSignedIn = jest.fn();

    await renderScreen(<LoginScreen onSignedIn={onSignedIn} />);
    await fillAndSubmit();

    expect(loginMock).toHaveBeenCalledWith("ayse@demo.test", "secret");
    expect(onSignedIn).toHaveBeenCalled();
  });

  it("gives one message for a wrong e-mail or password", async () => {
    loginMock.mockResolvedValue("invalid");

    await renderScreen(<LoginScreen />);
    await fillAndSubmit();

    expect(await screen.findByText(t("login.wrongTitle"))).toBeTruthy();
  });

  it("tells a missing connection apart from a sleeping server", async () => {
    loginMock.mockResolvedValue("unreachable");

    await renderScreen(<LoginScreen />);
    await fillAndSubmit();

    expect(await screen.findByText(t("login.offlineTitle"))).toBeTruthy();
  });

  it("shows how long a sleeping server has been waking", async () => {
    jest.useFakeTimers();
    let answer: (result: LoginResult) => void = () => {};
    loginMock.mockReturnValue(new Promise((resolve) => (answer = resolve)));

    await renderScreen(<LoginScreen />);
    await fillAndSubmit();
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(screen.getByText(t("login.wakingTitle"))).toBeTruthy();
    expect(screen.getByText(t("login.seconds", { n: 5 }))).toBeTruthy();

    await act(async () => answer("ok"));
    expect(screen.queryByText(t("login.wakingTitle"))).toBeNull();
  });
});
