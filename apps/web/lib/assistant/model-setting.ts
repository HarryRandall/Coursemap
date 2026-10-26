export type AssistantModelOption = {
  id: string;
  name: string;
  description: string;
};

// Three cheap OpenRouter models that call tools reliably, checked against a
// plan review in October 2026. Prices are per million input and output tokens.
export const DEFAULT_ASSISTANT_MODELS: AssistantModelOption[] = [
  {
    // US$0.10 / US$0.50. The most careful answers and the best chart use.
    id: "anthropic/claude-haiku-5.5",
    name: "Claude Haiku 5.5",
    description: "Most thorough",
  },
  {
    // US$0.10 / US$0.50. About twice as fast, with shorter answers.
    id: "openai/gpt-6-luna",
    name: "GPT-6 Luna",
    description: "Fastest",
  },
  {
    // US$0.03 / US$0.13. Roughly a quarter of the cost of the others.
    id: "qwen/qwen3.7-flash",
    name: "Qwen 3.7 Flash",
    description: "Lowest cost",
  },
];
/**
 * Chat titles use the default model whichever model answers: cheaper models
 * ignored the length and casing asked for, and a title costs only a few dozen
 * tokens.
 */
export function assistantTitleModel(env: NodeJS.ProcessEnv = process.env) {
  return assistantModelOptions(env)[0].id;
}

const MODEL_SLUG_PATTERN = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/u;

/**
 * The models students can choose from, default first. An operator can replace
 * the list with `COURSEMAP_ASSISTANT_MODELS`; slugs not listed above show
 * their slug as the name.
 */
export function assistantModelOptions(
  env: NodeJS.ProcessEnv = process.env,
): AssistantModelOption[] {
  const ids = (env.COURSEMAP_ASSISTANT_MODELS ?? "")
    .split(",")
    .map((model) => model.trim().toLowerCase())
    .filter((model) => MODEL_SLUG_PATTERN.test(model))
    .slice(0, 4);
  if (!ids.length) return DEFAULT_ASSISTANT_MODELS;
  return ids.map(
    (id) =>
      DEFAULT_ASSISTANT_MODELS.find((option) => option.id === id) ?? {
        id,
        name: id.split("/")[1],
        description: "",
      },
  );
}

/**
 * The chosen model first, then the default as OpenRouter's fallback when the
 * chosen one is unavailable. Anything not on the list gets the default.
 */
export function resolveAssistantModels(
  requested: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
) {
  const ids = assistantModelOptions(env).map((option) => option.id);
  const chosen = requested && ids.includes(requested) ? requested : ids[0];
  return [...new Set([chosen, ids[0]])];
}
