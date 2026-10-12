import { TIERS, THRESHOLDS, shouldUseExactModel, tierOf } from '../src/config.mjs'
import { buildJevRequest, readJevAnswers } from '../src/jev-request.mjs'
import { decide } from '../src/policy.mjs'
import { OPENROUTER_MODEL, OPENROUTER_URL, resolveJevProvider } from '../src/provider.mjs'

export type Vars = Record<string, string | undefined>
export type Model = { id: string; tier: string; description: string }
export type JevCall = { url: string; headers: Record<string, string>; body: string }
export type Decision = { tier: string; model: string; reason: string; confidence: number | null }

const TYPESAFE_URL = 'https://api.typesafe.ai'
const HISTORY_LIMIT = 20

export type StatusEntry = { at: number } & (Decision | { manual: true })

/** The status file's next contents: the latest entry on top, plus the recent ones it replaced. */
export function withHistory(previousFile: string | undefined, entry: StatusEntry) {
  let history: StatusEntry[] = []
  try {
    const previous = JSON.parse(previousFile ?? '') as { history?: StatusEntry[] }
    history = Array.isArray(previous.history) ? previous.history : []
  } catch {
    // A missing or unreadable file starts a fresh history.
  }
  return { ...entry, history: [...history, entry].slice(-HISTORY_LIMIT) }
}

export function parseEnvFile(text: string): Vars {
  const vars: Vars = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    vars[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return vars
}

export function availableModels(vars: Vars): Model[] {
  return TIERS.filter(t => t.name !== 'fable' || vars.JEV_ALLOW_FABLE === '1').map(t => ({
    id: t.id,
    tier: t.name,
    description: t.id,
  }))
}

export function jevCall(
  vars: Vars,
  input: { prompt: string; current: string; contextTokens: number; models: Model[] },
): JevCall | null {
  const resolved = resolveJevProvider(vars)
  if (!resolved) return null
  const request = buildJevRequest(input)
  const headers = { Authorization: `Bearer ${resolved.apiKey}`, 'Content-Type': 'application/json' }
  if (resolved.provider === 'typesafe') {
    return {
      url: `${(vars.TYPESAFE_BASE_URL || TYPESAFE_URL).replace(/\/+$/, '')}/v1/systemone`,
      headers,
      body: JSON.stringify({ ...request, model: vars.TYPESAFE_DEFAULT_MODEL || 'jev-latest' }),
    }
  }
  return {
    url: vars.JEV_OPENROUTER_URL || OPENROUTER_URL,
    headers,
    body: JSON.stringify({
      ...request,
      model: vars.JEV_OPENROUTER_MODEL || OPENROUTER_MODEL,
      // Without the pin OpenRouter may hand the request to a different model.
      provider: { only: ['typesafe'], allow_fallbacks: false },
    }),
  }
}

export function chooseModel(input: {
  prompt: string
  answers: unknown
  current: { tier: string; model: string }
  models: Model[]
  contextTokens: number
}): Decision {
  const { prompt, current, models, contextTokens } = input
  const jev = parseAnswers(input.answers, contextTokens)
  const chosen = models.find(m => m.id === jev?.choice)
  const { tier, reason } = decide({
    prompt,
    jev: jev && { ...jev, choice: chosen?.tier },
    current: current.tier,
    available: [...new Set(models.map(m => m.tier))],
    contextTokens,
  })
  const model =
    chosen && shouldUseExactModel(reason, chosen.tier, tier)
      ? chosen.id
      : tier === current.tier
        ? current.model
        : (models.find(m => m.tier === tier)?.id ?? current.model)
  return { tier, model, reason, confidence: jev?.confidence ?? null }
}

function parseAnswers(answers: unknown, contextTokens: number) {
  try {
    const read = readJevAnswers(answers, contextTokens)
    return typeof read.choice === 'string' && typeof read.confidence === 'number' ? read : null
  } catch {
    return null
  }
}

export const tierOfModel = (model: string): string | null => tierOf(model.toLowerCase())

export const ROUTING_DEADLINE_MS = THRESHOLDS.jevDeadlineMs
