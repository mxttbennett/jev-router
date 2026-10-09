import { describe, expect, test } from 'claude-code/testing'

import { availableModels, chooseModel, jevCall, parseEnvFile, tierOfModel } from './route'

const answers = (choice: string, confidence = 0.9) => ({
  model: { choice, confidence },
  task_complexity: { score: 2 },
  reasoning_required: { score: 2 },
  tool_complexity: { score: 1 },
})

describe('parseEnvFile', () => {
  test('reads keys, strips quotes and export, skips comments', async () => {
    // Arrange
    const text = '# keys\nexport OPENROUTER_API_KEY="sk-or"\nJEV_PROVIDER=openrouter\n\nnot a line'

    // Act
    const vars = parseEnvFile(text)

    // Assert
    expect(vars).toEqual({ OPENROUTER_API_KEY: 'sk-or', JEV_PROVIDER: 'openrouter' })
  })
})

describe('jevCall', () => {
  const input = { prompt: 'rename x', current: 'claude-opus-5-5', contextTokens: 10, models: availableModels({}) }

  test('returns null without a key', async () => {
    // Act & Assert
    expect(jevCall({}, input)).toBe(null)
  })

  test('pins OpenRouter to the TypeSafe provider', async () => {
    // Act
    const call = jevCall({ OPENROUTER_API_KEY: 'sk-or' }, input)

    // Assert
    expect(call?.url).toBe('https://openrouter.ai/api/alpha/decisions')
    expect(call?.headers.Authorization).toBe('Bearer sk-or')
    expect(JSON.parse(call!.body).provider).toEqual({ only: ['typesafe'], allow_fallbacks: false })
  })

  test('prefers a TypeSafe key and posts to System One', async () => {
    // Act
    const call = jevCall({ JEV_API_KEY: 'ts', OPENROUTER_API_KEY: 'sk-or' }, input)

    // Assert
    expect(call?.url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(JSON.parse(call!.body).state.request).toBe('rename x')
  })
})

describe('availableModels', () => {
  test('leaves out fable unless allowed', async () => {
    // Act & Assert
    expect(availableModels({}).map(m => m.tier)).toEqual(['haiku', 'sonnet', 'opus'])
    expect(availableModels({ JEV_ALLOW_FABLE: '1' }).map(m => m.tier)).toContain('fable')
  })
})

describe('chooseModel', () => {
  const models = availableModels({})
  const current = { tier: 'opus', model: 'claude-opus-5-5' }

  test('routes down to the model Jev picked while the conversation is small', async () => {
    // Act
    const decision = chooseModel({
      prompt: 'rename x',
      answers: answers('claude-haiku-5-5'),
      current,
      models,
      contextTokens: 5_000,
    })

    // Assert
    expect(decision).toEqual({ tier: 'haiku', model: 'claude-haiku-5-5', reason: 'jev', confidence: 0.9 })
  })

  test('keeps the current model when Jev did not answer', async () => {
    // Act
    const decision = chooseModel({
      prompt: 'rename x',
      answers: undefined,
      current,
      models,
      contextTokens: 0,
    })

    // Assert
    expect(decision.model).toBe('claude-opus-5-5')
    expect(decision.reason).toBe('jev-unavailable/no-change')
  })

  test('honours a model the prompt names over Jev', async () => {
    // Act
    const decision = chooseModel({
      prompt: 'use sonnet to rename x',
      answers: answers('claude-haiku-5-5'),
      current,
      models,
      contextTokens: 0,
    })

    // Assert
    expect(decision.tier).toBe('sonnet')
    expect(decision.reason).toBe('override')
  })

  test('keeps a large conversation on its tier rather than rebuild the cache', async () => {
    // Act
    const decision = chooseModel({
      prompt: 'rename x',
      answers: answers('claude-haiku-5-5'),
      current,
      models,
      contextTokens: 50_000,
    })

    // Assert
    expect(decision.tier).toBe('opus')
  })
})

describe('tierOfModel', () => {
  test('recognises ids and display names', async () => {
    // Act & Assert
    expect(tierOfModel('claude-sonnet-5-5[1m]')).toBe('sonnet')
    expect(tierOfModel('Opus 5.5')).toBe('opus')
  })
})
