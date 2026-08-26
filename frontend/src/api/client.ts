import axios, { type AxiosError } from "axios";

export type ApiError = {
  code: string;
  message: string;
};

export const api = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
});

const AUTH_PROBE = ["/auth/me", "/auth/login", "/auth/register", "/auth/accept-invite"];

export function setupAuthInterceptor(onUnauthorized: () => void) {
  api.interceptors.response.use(
    (res) => res,
    (err: AxiosError) => {
      if (err.response?.status === 401) {
        const url = err.config?.url ?? "";
        const probe = AUTH_PROBE.some((path) => url.includes(path));
        if (!probe) onUnauthorized();
      }
      return Promise.reject(err);
    },
  );
}

export function getApiError(err: unknown): ApiError {
  const ax = err as AxiosError<{ error?: ApiError }>;
  return (
    ax.response?.data?.error ?? {
      code: "network",
      message: "Нет связи с сервером",
    }
  );
}
