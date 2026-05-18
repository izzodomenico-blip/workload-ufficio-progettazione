import type { AppData } from '../types'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...options?.headers,
    },
  })
  if (!response.ok) {
    const message = await readErrorMessage(response)
    throw new Error(message)
  }
  return response.json() as Promise<T>
}

export function fetchAppData(): Promise<AppData> {
  return request<AppData>('/api/app-data')
}

export function saveAppData(data: AppData): Promise<AppData> {
  return request<AppData>('/api/app-data', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: string; detail?: string }
    return body.detail || body.error || `Errore API ${response.status}`
  } catch {
    return `Errore API ${response.status}`
  }
}
