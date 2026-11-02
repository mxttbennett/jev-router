// Kept free of Node and SDK imports so the Claude Code mod can load it too.

export const OPENROUTER_URL = "https://openrouter.ai/api/alpha/decisions";
export const OPENROUTER_MODEL = "typesafe/jev-1.13";
const PROVIDERS = ["typesafe", "openrouter"];

/**
 * Picks where Jev decisions come from. `JEV_PROVIDER` wins when set; otherwise a TypeSafe
 * key is preferred and an OpenRouter key is the fallback. Returns null when nothing usable
 * is configured, which callers read as "start without routing".
 *
 * @returns {?{provider: "typesafe" | "openrouter", apiKey: string}}
 */
export function resolveJevProvider(env = process.env) {
  const typesafeKey = env.JEV_API_KEY || env.TYPESAFE_API_KEY;
  const openrouterKey = env.OPENROUTER_API_KEY;
  const requested = env.JEV_PROVIDER?.trim().toLowerCase();
  if (requested && !PROVIDERS.includes(requested)) return null;
  const provider = requested || (typesafeKey ? "typesafe" : openrouterKey ? "openrouter" : null);
  const apiKey = provider === "openrouter" ? openrouterKey : typesafeKey;
  return provider && apiKey ? { provider, apiKey } : null;
}

/** Explains a null `resolveJevProvider` result in one line, for the startup warning. */
export function describeMissingJev(env = process.env) {
  const requested = env.JEV_PROVIDER?.trim().toLowerCase();
  if (requested && !PROVIDERS.includes(requested)) {
    return `JEV_PROVIDER=${env.JEV_PROVIDER} is not one of ${PROVIDERS.join(", ")}`;
  }
  if (requested === "openrouter") return "JEV_PROVIDER=openrouter but no OPENROUTER_API_KEY found";
  return "no JEV_API_KEY or OPENROUTER_API_KEY found";
}
