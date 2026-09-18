import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, join } from "node:path";

import postgres from "postgres";

/**
 * supabase/config.toml, searched upward from the working directory so the
 * lookup also works inside a Next.js bundle, where import.meta.url no longer
 * points at this source file. The module-relative path covers plain scripts.
 */
function defaultConfigPath() {
  let directory = process.cwd();
  for (;;) {
    const candidate = join(directory, "supabase", "config.toml");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return new URL("../../../../../supabase/config.toml", import.meta.url);
}
const verifiedImportClients = new WeakSet();
const DEFAULT_LOCAL_DATABASE = {
  database: "postgres",
  hostname: "127.0.0.1",
  password: "postgres",
  username: "postgres",
};

function normaliseHostname(hostname) {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }

  return hostname;
}

function isLoopbackAddress(address) {
  const candidate = normaliseHostname(address).toLowerCase();

  if (isIP(candidate) === 4) {
    return candidate.split(".")[0] === "127";
  }

  if (isIP(candidate) !== 6) {
    return false;
  }

  if (candidate === "::1" || candidate === "0:0:0:0:0:0:0:1") {
    return true;
  }

  const mappedAddress = candidate.match(/^::ffff:(127(?:\.\d{1,3}){3})$/)?.[1];
  return mappedAddress ? isLoopbackAddress(mappedAddress) : false;
}

function parseDatabaseUrl(connectionString) {
  let databaseUrl;

  try {
    databaseUrl = new URL(connectionString);
  } catch {
    throw new Error("The catalogue database URL is invalid.");
  }

  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    throw new Error(
      "The catalogue importer only accepts PostgreSQL database URLs.",
    );
  }

  if (!databaseUrl.hostname) {
    throw new Error("The catalogue database URL must include a hostname.");
  }

  return databaseUrl;
}

/**
 * Refuse hostnames other than localhost and literal loopback addresses.
 * The returned URL is parsed but must never be logged because it may contain a password.
 */
export async function assertLoopbackDatabaseUrl(connectionString) {
  const databaseUrl = parseDatabaseUrl(connectionString);
  const hostname = normaliseHostname(databaseUrl.hostname);

  if (hostname.toLowerCase() === "localhost") {
    // Pin localhost to a literal address so validation and connection cannot
    // resolve the hostname differently.
    databaseUrl.hostname = DEFAULT_LOCAL_DATABASE.hostname;
    return databaseUrl;
  }

  if (!isLoopbackAddress(hostname)) {
    throw new Error(
      "The catalogue importer refuses non-loopback database connections.",
    );
  }

  return databaseUrl;
}

function parseSupabaseDatabasePort(configText) {
  let section = "";

  for (const rawLine of configText.split(/\r?\n/u)) {
    const line = rawLine.replace(/\s+#.*$/u, "").trim();
    const sectionMatch = line.match(/^\[([A-Za-z0-9_.-]+)\]$/u);

    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }

    if (section !== "db") {
      continue;
    }

    const portMatch = line.match(/^port\s*=\s*(\d+)$/u);
    if (!portMatch) {
      continue;
    }

    const port = Number.parseInt(portMatch[1], 10);
    if (port >= 1 && port <= 65_535) {
      return port;
    }
  }

  throw new Error("supabase/config.toml does not contain a valid [db] port.");
}

export async function discoverLocalDatabaseUrl({
  env = process.env,
  configPath = defaultConfigPath(),
  readConfig = readFile,
} = {}) {
  const configuredUrl =
    env.COURSEMAP_DATABASE_URL?.trim() || env.DATABASE_URL?.trim();

  if (configuredUrl) {
    const databaseUrl = await assertLoopbackDatabaseUrl(configuredUrl);
    return databaseUrl.toString();
  }

  let configText;
  try {
    configText = await readConfig(configPath, "utf8");
  } catch {
    throw new Error(
      "No local database URL was provided and supabase/config.toml could not be read.",
    );
  }

  const port = parseSupabaseDatabasePort(configText);
  const databaseUrl = new URL("postgresql://127.0.0.1");
  databaseUrl.username = DEFAULT_LOCAL_DATABASE.username;
  databaseUrl.password = DEFAULT_LOCAL_DATABASE.password;
  databaseUrl.hostname = DEFAULT_LOCAL_DATABASE.hostname;
  databaseUrl.port = String(port);
  databaseUrl.pathname = `/${DEFAULT_LOCAL_DATABASE.database}`;

  const connectionString = databaseUrl.toString();
  const validatedUrl = await assertLoopbackDatabaseUrl(connectionString);
  return validatedUrl.toString();
}

export async function createLocalDatabaseClient(options = {}) {
  const connectionString = await discoverLocalDatabaseUrl(options);

  const sql = postgres(connectionString, {
    application_name: "coursemap_import_runner",
    connect_timeout: 5,
    idle_timeout: 5,
    max: 1,
    prepare: false,
    ssl: false,
  });
  verifiedImportClients.add(sql);
  return sql;
}

function isHostedSupabaseDatabaseHost(hostname) {
  const candidate = normaliseHostname(hostname).toLowerCase();
  return (
    candidate.endsWith(".supabase.co") ||
    candidate.endsWith(".pooler.supabase.com")
  );
}

export function assertHostedSupabaseDatabaseUrl(connectionString) {
  const databaseUrl = parseDatabaseUrl(connectionString);
  if (!isHostedSupabaseDatabaseHost(databaseUrl.hostname)) {
    throw new Error(
      "The hosted import runner only accepts a Supabase database connection URL.",
    );
  }
  return databaseUrl;
}

/**
 * Create an explicitly configured hosted database client for an authenticated
 * import runner. This is intentionally separate from the local-only client so
 * routine CLI imports cannot accidentally target production.
 */
export function createHostedImportDatabaseClient(connectionString) {
  const databaseUrl = assertHostedSupabaseDatabaseUrl(connectionString);
  const sql = postgres(databaseUrl.toString(), {
    application_name: "coursemap_import_runner",
    connect_timeout: 10,
    idle_timeout: 5,
    max: 1,
    prepare: false,
    ssl: "require",
  });
  verifiedImportClients.add(sql);
  return sql;
}

export function assertVerifiedImportDatabaseClient(sql) {
  if (!verifiedImportClients.has(sql)) {
    throw new Error(
      "Imports require a client created by createLocalDatabaseClient() or createHostedImportDatabaseClient().",
    );
  }
}

export function assertVerifiedLocalDatabaseClient(sql) {
  assertVerifiedImportDatabaseClient(sql);
}
