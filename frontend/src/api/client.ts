import axios, { type AxiosError } from "axios";

export type ApiError = {
  code: string;
  message: string;
};

export const api = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
});

export function getApiError(err: unknown): ApiError {
  const ax = err as AxiosError<{ error?: ApiError }>;
  return (
    ax.response?.data?.error ?? {
      code: "network",
      message: "Нет связи с сервером",
    }
  );
}
