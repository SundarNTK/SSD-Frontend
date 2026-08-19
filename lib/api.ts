import axios from "axios";
import { authActions } from "./authStore";

const authBaseURL = process.env.NEXT_PUBLIC_AUTH_API_BASE_URL ?? "http://localhost:5003/api/v1";
const catalogBaseURL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5004/api/v1";

function withAuthHeader(client: ReturnType<typeof axios.create>) {
  client.interceptors.request.use((config) => {
    const token = localStorage.getItem("ssd_admin_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;

    // FormData must set its own Content-Type, because the multipart boundary
    // is generated with the body. Leaving the client's default
    // "application/json" in place makes the server parse nothing and the
    // upload silently arrive empty.
    if (config.data instanceof FormData) delete config.headers["Content-Type"];
    return config;
  });

  /**
   * The other half of signing out — the half the server initiates.
   *
   * A token is good for 8 hours, but the account behind it can be
   * deactivated, have its access period lapse, or be deleted at any moment,
   * and the API starts answering 401 immediately when that happens. Without
   * this, the panel would sit there looking signed in while every panel on
   * screen quietly failed. Clearing the session makes ProtectedRoute
   * redirect on the next render.
   *
   * `/auth/` is excluded: a 401 from a login attempt means "wrong password",
   * not "your session died", and treating it as the latter would wipe the
   * message the login form is trying to show.
   */
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error?.response?.status;
      const url: string = error?.config?.url ?? "";
      const isAuthRoute = url.includes("/auth/");

      if (status === 401 && !isAuthRoute && authActions.getToken()) {
        authActions.endSession("expired");
      }
      return Promise.reject(error);
    }
  );

  return client;
}

/** User-Service — login, activate, forgot/reset password, and (later) the Entity/User/Role masters. */
export const authApi = withAuthHeader(
  axios.create({ baseURL: authBaseURL, headers: { "Content-Type": "application/json" } })
);

/** Catalog-Service — everything else (masters, POS, inventory, payments) as those modules land. */
export const api = withAuthHeader(
  axios.create({ baseURL: catalogBaseURL, headers: { "Content-Type": "application/json" } })
);

/**
 * Every response from both services is wrapped the same way (see
 * response-handler.js on the backend): `{ success, message, data }`. The
 * actual payload is always one level deeper than axios's own `.data` —
 * `unwrap()` is the one place that reaches through both layers, so no page
 * has to remember `response.data.data` (and get it wrong: an earlier bug
 * had Login reading `response.data.token`, which is always `undefined`,
 * silently storing no session and bouncing straight back to /login).
 */
export type ApiEnvelope<T> = { success: boolean; message: string; data: T };

export function unwrap<T>(response: { data: ApiEnvelope<T> }): T {
  return response.data.data;
}

export type ApiError = { message: string };

export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiError | undefined;
    if (data?.message) return data.message;
    if (error.code === "ERR_NETWORK") return "Can't reach the server — check that the backend service is running.";
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}