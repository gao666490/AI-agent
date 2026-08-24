import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * M4.1: idempotent patch for gemini-cli-router 1.0.3 (proxy-service/src/server.js).
 *
 * Why: gemini-cli 0.56.0 (@google/genai SDK) calls the Gemini REST API as
 * `POST /v1beta/models/{model}:generateContent` and
 * `{model}:streamGenerateContent?alt=sse` (COLON form). GCR 1.0.3 only matched
 * the slash form (`req.path.includes('/generateContent')`), so real CLI requests
 * fell into the models-list fallback and the CLI never got a completion. Two
 * more defects: the proxy forwarded the Gemini-side model name (e.g.
 * gemini-2.5-flash) verbatim to CN providers (DeepSeek → 400), and streaming
 * requests never got an SSE response.
 *
 * This module surgically patches the installed file. It is marker-based and
 * idempotent: already-patched files are left untouched; files that no longer
 * match the known GCR 1.0.3 shape fail cleanly (no corruption). `gcrStart`
 * applies it before spawning, so a fresh `npm i -g` is re-patched on the next
 * wizard start.
 */

/** Marker that only exists after the patch is applied. */
export const GCR_PATCH_MARKER = '// Set model priority (agent-guide):';

/** Surgical edits (from → to), each must match exactly once. */
export const GCR_PATCH_EDITS = [
  {
    // 1) Match both `:generateContent` / `:streamGenerateContent` (colon, what
    //    gemini-cli sends) and `/generateContent` (slash) — case-insensitive
    //    because the streaming form is camelCased with a capital G.
    from: "    if (req.path.includes('/generateContent')) {",
    to: "    if (req.path.toLowerCase().includes('generatecontent')) {",
  },
  {
    // 2) Configured provider model wins over the Gemini URL alias (the alias is
    //    never a valid CN provider model name). The x-third-party-model header
    //    still overrides via `targetModel`, now only as a last resort.
    from: [
      '      // Set model priority: custom model > configured model > default',
      '      if (!translatedRequest.model) {',
      '        translatedRequest.model = targetModel || config.provider.model || providerConfig.model;',
      '      }',
    ].join('\n'),
    to: [
      '      // Set model priority (agent-guide): configured provider model wins over the Gemini URL alias',
      '      if (!translatedRequest.model) {',
      '        translatedRequest.model = config.provider.model || providerConfig.model || targetModel;',
      '      }',
    ].join('\n'),
  },
  {
    // 3) streamGenerateContent must be answered in SSE shape (gemini-cli parses
    //    `data:` lines). No [DONE] sentinel: the SDK JSON-parses every line.
    from: '      const geminiResponse = GeminiTranslator.translateResponse(providerResponse);',
    to: [
      '      const geminiResponse = GeminiTranslator.translateResponse(providerResponse);',
      "      const isStream = req.path.includes('streamGenerateContent');",
      '      if (isStream) {',
      "        res.setHeader('Content-Type', 'text/event-stream');",
      "        res.setHeader('Cache-Control', 'no-cache');",
      "        res.setHeader('Connection', 'keep-alive');",
      '        res.write(`data: ${JSON.stringify(geminiResponse)}\\n\\n`);',
      '        res.end();',
      '        return;',
      '      }',
    ].join('\n'),
  },
];

/**
 * Apply the GCR compatibility patch to an installed router package.
 *
 * @param {string} serviceDir path to the installed `gemini-cli-router/proxy-service`
 * @param {(line: string) => void} [log]
 * @returns {Promise<{patched: boolean, alreadyPatched?: boolean, file: string, error?: string}>}
 */
export async function ensureGcrPatched(serviceDir, log = () => {}) {
  const file = path.join(serviceDir, 'src', 'server.js');
  let source;
  try {
    source = await fs.readFile(file, 'utf8');
  } catch {
    return { patched: false, error: `server.js not found: ${file}` };
  }
  if (source.includes(GCR_PATCH_MARKER)) {
    return { patched: false, alreadyPatched: true, file };
  }
  let next = source;
  for (const edit of GCR_PATCH_EDITS) {
    const count = next.split(edit.from).length - 1;
    if (count !== 1) {
      return {
        patched: false,
        error: `anchor not unique (count=${count}), file may differ from GCR 1.0.3: ${edit.from.slice(0, 70)}...`,
      };
    }
    next = next.replace(edit.from, edit.to);
  }
  await fs.writeFile(file, next, 'utf8');
  log(`gemini-cli-router patched: ${file}`);
  return { patched: true, file };
}
