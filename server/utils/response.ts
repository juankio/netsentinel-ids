import type { ApiResponse } from '~/types/network'

export function okResponse<T>(data: T, message = 'OK'): ApiResponse<T> {
  return {
    success: true,
    data,
    message,
    error: null
  }
}

export function failResponse(
  message: string,
  error: Record<string, unknown> | string | null = null
): ApiResponse<null> {
  return {
    success: false,
    data: null,
    message,
    error
  }
}
