/** Validate public client configuration without crashing the application shell. */
export function readEnvironment(values = import.meta.env) {
  const value = values?.VITE_API_BASE_URL?.trim()

  if (!value) {
    return {
      apiBaseUrl: null,
      error: 'The service connection has not been configured.',
    }
  }

  try {
    const url = new URL(value)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    ) {
      throw new Error('Invalid backend origin')
    }
    return { apiBaseUrl: url.origin, error: null }
  } catch {
    return {
      apiBaseUrl: null,
      error: 'The service connection configuration is invalid.',
    }
  }
}

export const environment = readEnvironment()
