import { render, waitFor, act } from "@testing-library/react";

import { AuthBootstrap } from "@/components/auth/AuthBootstrap";
import { AUTH_STATE_CHANGE_EVENT } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";

jest.mock("@/stores/authStore", () => ({
  useAuthStore: jest.fn(),
}));

const mockedUseAuthStore = useAuthStore as jest.MockedFunction<
  typeof useAuthStore
>;

describe("AuthBootstrap", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("checks auth only once on initial mount when unauthenticated", async () => {
    const checkAuth = jest.fn().mockResolvedValue(undefined);

    mockedUseAuthStore.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isCheckingSession: false,
      isSubmitting: false,
      error: null,
      login: jest.fn(),
      register: jest.fn(),
      logout: jest.fn(),
      checkAuth,
      clearError: jest.fn(),
      setUser: jest.fn(),
    });

    render(<AuthBootstrap />);

    await waitFor(() => {
      expect(checkAuth).toHaveBeenCalledTimes(1);
    });
  });

  test("re-checks auth on explicit auth state change event without looping", async () => {
    const checkAuth = jest.fn().mockResolvedValue(undefined);

    mockedUseAuthStore.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isCheckingSession: false,
      isSubmitting: false,
      error: null,
      login: jest.fn(),
      register: jest.fn(),
      logout: jest.fn(),
      checkAuth,
      clearError: jest.fn(),
      setUser: jest.fn(),
    });

    render(<AuthBootstrap />);

    await waitFor(() => {
      expect(checkAuth).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      window.dispatchEvent(new Event(AUTH_STATE_CHANGE_EVENT));
    });

    await waitFor(() => {
      expect(checkAuth).toHaveBeenCalledTimes(2);
    });
  });
});
