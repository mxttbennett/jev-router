import type { EngineInterface, Register } from 'claude-code'

import { AUTO_MODEL } from '../src/config.mjs'

import {
  ROUTING_DEADLINE_MS,
  availableModels,
  chooseModel,
  jevCall,
  parseEnvFile,
  tierOfModel,
  type Decision,
  type Vars,
} from './route'

const ENV_NAMES = [
  'JEV_API_KEY',
  'TYPESAFE_API_KEY',
  'OPENROUTER_API_KEY',
  'JEV_PROVIDER',
  'JEV_OPENROUTER_URL',
  'JEV_OPENROUTER_MODEL',
  'JEV_ALLOW_FABLE',
  'TYPESAFE_BASE_URL',
  'TYPESAFE_DEFAULT_MODEL',
] as const

async function loadVars($: EngineInterface): Promise<Vars> {
  const home = (await $.env.get('HOME')) ?? ''
  const vars: Vars = {}
  for (const file of [`${home}/.jev-claude.env`, `${home}/.jev-router.env`]) {
    try {
      Object.assign(vars, parseEnvFile(await $.fs.read(file)))
    } catch {
      // Missing or unreadable; the key may still come from the real environment.
    }
  }
  const real: Vars = {
    JEV_API_KEY: await $.env.get('JEV_API_KEY'),
    TYPESAFE_API_KEY: await $.env.get('TYPESAFE_API_KEY'),
    OPENROUTER_API_KEY: await $.env.get('OPENROUTER_API_KEY'),
    JEV_PROVIDER: await $.env.get('JEV_PROVIDER'),
    JEV_OPENROUTER_URL: await $.env.get('JEV_OPENROUTER_URL'),
    JEV_OPENROUTER_MODEL: await $.env.get('JEV_OPENROUTER_MODEL'),
    JEV_ALLOW_FABLE: await $.env.get('JEV_ALLOW_FABLE'),
    TYPESAFE_BASE_URL: await $.env.get('TYPESAFE_BASE_URL'),
    TYPESAFE_DEFAULT_MODEL: await $.env.get('TYPESAFE_DEFAULT_MODEL'),
  }
  for (const name of ENV_NAMES) if (real[name]) vars[name] = real[name]
  return vars
}

type SessionState = {
  vars: Vars
  baseline: string | null
  isManual: boolean
  routed: Decision | null
  pending: Map<string, Promise<Decision | null>>
}

const state: SessionState = { vars: {}, baseline: null, isManual: false, routed: null, pending: new Map() }

async function isEnabled($: EngineInterface) {
  const isUnderJevClaude = (await $.env.get('ANTHROPIC_MODEL')) === AUTO_MODEL
  return !isUnderJevClaude && (await $.store.get('enabled')) !== false
}

async function publish($: EngineInterface, status: object) {
  try {
    const tmp = ((await $.env.get('TMPDIR')) ?? '/tmp').replace(/\/+$/, '')
    const id = (await $.session.id()).replace(/[^\w-]/g, '')
    await $.fs.write(`${tmp}/jev-claude/${id}.json`, JSON.stringify({ ...status, at: await $.clock.now() }))
  } catch {
    // The status line is cosmetic and must never interfere with a turn.
  }
}

async function route($: EngineInterface, prompt: string, sessionModel: string): Promise<Decision | null> {
  const models = availableModels(state.vars)
  const tier = tierOfModel(sessionModel) ?? 'opus'
  const current = state.routed ?? { tier, model: models.find(m => m.tier === tier)?.id ?? sessionModel }
  const contextTokens = (await $.session.usage()).context.tokens ?? 0
  const call = jevCall(state.vars, { prompt, current: current.model, contextTokens, models })
  if (!call) return null

  const ask = $.http
    .fetch(call.url, { method: 'POST', headers: call.headers, body: call.body })
    .then(res => (res.ok ? (JSON.parse(res.text) as { answers?: unknown }).answers : undefined))
    .catch(() => undefined)
  const timeout = new Promise<undefined>(resolve => $.clock.after(ROUTING_DEADLINE_MS, () => resolve(undefined)))
  const answers = await Promise.race([ask, timeout])

  const decision = chooseModel({
    prompt,
    answers,
    current,
    models,
    contextTokens,
  })
  state.routed = decision
  await publish($, decision)
  return decision
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    state.vars = await loadVars($)
    await $.command.register({
      name: 'jev',
      description: 'Turn Jev model routing on or off for every session (on, off, or no argument to toggle)',
    })
    return next(e)
  })

  on('command.run', { command: 'jev' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const enabled = arg === 'on' ? true : arg === 'off' ? false : !(await isEnabled($))
    await $.store.set('enabled', enabled)
    if (enabled) state.isManual = false
    return { text: `Jev routing ${enabled ? 'on' : 'off'}.` }
  })

  on('turn.start', async ($, e, next) => {
    const result = await next(e)
    if (state.isManual || !(await isEnabled($))) return result

    const sessionModel = await $.session.model()
    state.baseline ??= sessionModel
    if (sessionModel !== state.baseline) {
      state.isManual = true
      await publish($, { manual: true })
      return result
    }

    const isRoutable = e.text.trim() !== '' && !e.text.includes('<jev-explain>')
    if (isRoutable) state.pending.set(e.turnId, route($, e.text, sessionModel).catch(() => null))
    return result
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined || state.isManual || !(await isEnabled($))) return yield* next(e)

    const decision = (await state.pending.get(e.turnId)) ?? state.routed
    return yield* next(decision ? { ...e, model: decision.model } : e)
  })

  on('turn.complete', async ($, e, next) => {
    state.pending.delete(e.turnId)
    return next(e)
  })
}
