#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { createLocalDatabaseClient } from "../catalogue/lib/local-database.mjs";
import { readRealCatalogue, seedRealCatalogue } from "./real-catalogue.mjs";

const PREVIEW_SEED_PATH = new URL(
  "../fixtures/local-preview.sql",
  import.meta.url,
);

export async function seedLocalPreview({
  createClient = createLocalDatabaseClient,
  readSeed = readFile,
} = {}) {
  const sql = await createClient();

  try {
    const seed = await readSeed(PREVIEW_SEED_PATH, "utf8");
    await sql.unsafe(seed);
    await seedRealCatalogue(sql, await readRealCatalogue(readSeed));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const isMainModule = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false;

if (isMainModule) {
  await seedLocalPreview();
  console.log("Seeded the guarded local Coursemap preview data.");
}
