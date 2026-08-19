/**
 * Verify an API key against a provider endpoint before writing configs.
 * OpenAI-compatible: GET {base}/models with Bearer.
 * Anthropic-compatible: GET {base}/v1/models with x-api-key.
 * Falls back to a minimal chat completion when /models is not implemented
 * by the vendor (some OpenAI-compatible gateways 404 on it).
 */
export async function verifyKey({ baseUrl, apiKey, mode = 'openai' }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const headers =
      mode === 'anthropic'
        ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
        : { Authorization: `Bearer ${apiKey}` };
    const modelsUrl = mode === 'anthropic'
      ? new URL('/v1/models', baseUrl.endsWith('/') ? baseUrl : baseUrl + '/')
      : new URL('/models', baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');

    let res = await fetch(modelsUrl.toString(), { headers, signal: controller.signal });
    if (res.status === 401 || res.status === 403) return { ok: false, status: res.status, error: 'invalid-key' };
    if (res.ok) return { ok: true, status: res.status, method: 'models' };

    // Vendor does not implement /models — try a minimal completion (1 token).
    const chatUrl = mode === 'anthropic'
      ? new URL('/v1/messages', baseUrl.endsWith('/') ? baseUrl : baseUrl + '/')
      : new URL('/chat/completions', baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
    const chatBody = mode === 'anthropic'
      ? { model: 'claude-3-5-haiku-latest', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }
      : { model: 'gpt-4o-mini', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] };
    res = await fetch(chatUrl.toString(), {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(chatBody),
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) return { ok: false, status: res.status, error: 'invalid-key' };
    if (res.ok) return { ok: true, status: res.status, method: 'completion' };
    return { ok: false, status: res.status, error: 'endpoint-error' };
  } catch (err) {
    return { ok: false, error: err?.name === 'AbortError' ? 'timeout' : 'network', detail: err?.message };
  } finally {
    clearTimeout(timer);
  }
}
