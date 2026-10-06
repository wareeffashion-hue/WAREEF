export class ConnectorError extends Error {}

/** fetch + JSON with readable errors. `fetchImpl` is injectable for tests. */
export async function getJson(fetchImpl, url, init = {}) {
  const res = await fetchImpl(url, init);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new ConnectorError(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg = body?.error?.message || body?.message || body?.error_description || body?.debug_message || text.slice(0, 200);
    throw new ConnectorError(`HTTP ${res.status}: ${msg}`);
  }
  return body;
}
