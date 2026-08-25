export const ERROR_HTTP: Record<string, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  invite_expired: 410,
  validation: 422,
  llm_unavailable: 503,
};

export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.httpStatus = ERROR_HTTP[code] ?? 500;
  }
}

export function unauthorized(): AppError {
  return new AppError("unauthorized", "Нет сессии");
}

export function forbidden(): AppError {
  return new AppError("forbidden", "Недостаточно прав");
}

export function notFound(): AppError {
  return new AppError("not_found", "Не найдено");
}

export function conflict(message: string): AppError {
  return new AppError("conflict", message);
}

export function validation(message: string): AppError {
  return new AppError("validation", message);
}

export function inviteExpired(): AppError {
  return new AppError("invite_expired", "Приглашение недействительно");
}

export function llmUnavailable(): AppError {
  return new AppError("llm_unavailable", "Ассистент сейчас не отвечает");
}
