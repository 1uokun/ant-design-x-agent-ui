import type { ApiResponse } from "./types";

export function jsonOk<T>(data: T, status = 200): Response {
  const body: ApiResponse<T> = { success: true, data };
  return Response.json(body, { status });
}

export function jsonError(message: string, status = 400): Response {
  const body: ApiResponse<never> = { success: false, message };
  return Response.json(body, { status });
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function truncateTitle(text: string, max = 15): string {
  const trimmed = text.trim();
  if (!trimmed) return "新对话";
  return [...trimmed].slice(0, max).join("");
}
