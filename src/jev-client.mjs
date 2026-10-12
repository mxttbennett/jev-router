import { TypeSafeClient } from "@typesafe-ai/sdk";
import { OPENROUTER_MODEL, OPENROUTER_URL, describeMissingJev, resolveJevProvider } from "./provider.mjs";

export { describeMissingJev, resolveJevProvider };

/**
 * Builds a client exposing the SDK's `systemOne(request, { signal })` shape for either
 * provider, so the router does not care which one answers.
 */
export function createJevClient({ timeout, retry, env = process.env }) {
  const resolved = resolveJevProvider(env);
  if (!resolved) throw new Error(describeMissingJev(env));
  if (resolved.provider === "typesafe") {
    return new TypeSafeClient({
      apiKey: resolved.apiKey,
      timeout,
      retry,
      logLevel: "warn", // never "debug": request bodies contain the user's prompt
    });
  }
  return openRouterClient({
    apiKey: resolved.apiKey,
    url: env.JEV_OPENROUTER_URL || OPENROUTER_URL,
    model: env.JEV_OPENROUTER_MODEL || OPENROUTER_MODEL,
    timeout,
    retry,
  });
}

function openRouterClient({ apiKey, url, model, timeout, retry }) {
  return {
    async systemOne(request, { signal } = {}) {
      const body = JSON.stringify({
        ...request,
        model: request.model ?? model,
        // Without the pin OpenRouter may hand the request to a different model.
        provider: { only: ["typesafe"], allow_fallbacks: false },
      });
      let lastError;
      for (let attempt = 0; attempt <= retry.maxRetries; attempt++) {
        if (signal?.aborted) break;
        if (attempt > 0) await sleep(backoff(retry, attempt), signal);
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body,
            signal: withTimeout(signal, timeout),
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.answers && typeof data.answers === "object") return data;
            lastError = new Error("OpenRouter Jev response has no answers");
            throw lastError;
          }
          lastError = new Error(`OpenRouter Jev HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
          if (res.status !== 429 && res.status < 500) throw lastError;
        } catch (err) {
          if (err === lastError || signal?.aborted) throw err;
          lastError = err;
        }
      }
      throw lastError ?? new Error("OpenRouter Jev request aborted");
    },
  };
}

function withTimeout(signal, ms) {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function backoff({ backoffInitialMs = 150, backoffMaxMs = 400 }, attempt) {
  return Math.min(backoffInitialMs * 2 ** (attempt - 1), backoffMaxMs);
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });
}
