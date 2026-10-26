"use server";

import { assistantModelOptions } from "./model-setting";

export async function loadAssistantModels() {
  const models = assistantModelOptions();
  return { models, defaultModel: models[0].id, error: null as string | null };
}
