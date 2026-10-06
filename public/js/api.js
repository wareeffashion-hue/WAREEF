export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body, { raw = false } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'X-Requested-With': 'fetch', ...(body !== undefined && { 'Content-Type': raw ? 'text/csv' : 'application/json' }) },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new Event('auth:expired'));
  if (!res.ok) throw new ApiError(res.status, data.error || res.statusText);
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  put: (p, b) => request('PUT', p, b),
  del: (p) => request('DELETE', p),
  csv: (p, text) => request('POST', p, text, { raw: true }),
};
