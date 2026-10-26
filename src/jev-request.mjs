// Kept free of Node and SDK imports so the Claude Code mod can load it too.
import {
  COMPLEXITY_MAX_SCORE,
  CONTEXT_WINDOW_TOKENS,
  QUESTIONS,
  questionForModels,
} from "./config.mjs";

/** The System One request asking which of `models` fits `prompt`. */
export function buildJevRequest({ prompt, current, contextTokens, models }) {
  return {
    state: {
      request: prompt,
      session: { current_model: current, context_tokens: contextTokens },
      environment: { available_models: models.map((model) => model.id) },
    },
    questions: { ...QUESTIONS, model: questionForModels(models) },
  };
}

/** Jev's model answer plus its scores normalised to 0..1. */
export function readJevAnswers(answers, contextTokens) {
  const { model: answer, task_complexity, reasoning_required, tool_complexity } = answers;
  return {
    ...answer,
    metrics: {
      taskComplexity: task_complexity.score / COMPLEXITY_MAX_SCORE,
      reasoningRequired: reasoning_required.score / COMPLEXITY_MAX_SCORE,
      toolComplexity: tool_complexity.score / COMPLEXITY_MAX_SCORE,
      contextSize: Math.min(contextTokens / CONTEXT_WINDOW_TOKENS, 1),
    },
  };
}
