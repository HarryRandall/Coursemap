#!/usr/bin/env node

/**
 * Fills the local database with realistic activity so the admin dashboard can
 * be reviewed with more than one account in it.
 *
 *   pnpm db:seed:admin-dashboard          replace the demo data
 *   pnpm db:seed:admin-dashboard --clear  remove it again
 *
 * Loopback databases only. Every row is tagged (demo user ids, the demo parser
 * version, the demo editing session and the demo SELT filename) so a rerun
 * replaces the previous demo data and never touches imported or real records.
 * Values are generated from a fixed seed, so each run looks the same.
 */

import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { createLocalDatabaseClient } from "../catalogue/lib/local-database.mjs";

const DEMO_USER_PREFIX = "9a000000-0000-4000-8000-";
const DEMO_PARSER_VERSION = "admin-dashboard-demo";
const DEMO_SESSION = "9a000000-0000-4000-8000-00000000d3e0";
const DEMO_SELT_FILE = "admin-dashboard-demo.pdf";
const DAY_MS = 86_400_000;

const STUDENTS = 220;
const SYNC_DAYS = 30;
const CHANGE_DAYS = 182;
const SELT_PUBLISHED = 96;
const SELT_READY = 12;
const SELT_BLOCKED = 3;

/** A small deterministic generator, so the dashboard looks the same each run. */
function generator(seed) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

const random = generator(20_261_007);
const between = (low, high) => low + Math.floor(random() * (high - low + 1));
const pick = (values) => values[Math.floor(random() * values.length)];

function demoUserId(index) {
  return `${DEMO_USER_PREFIX}${String(index).padStart(12, "0")}`;
}

/** An instant `days` ago at a working-hours time, never in the future. */
function daysAgo(now, days) {
  const instant = new Date(now.getTime() - days * DAY_MS);
  instant.setUTCHours(between(0, 8), between(0, 59), between(0, 59), 0);
  return instant > now
    ? new Date(now.getTime() - between(1, 60) * 60_000)
    : instant;
}

async function clear(sql) {
  const userPattern = `${DEMO_USER_PREFIX}%`;
  await sql`
    delete from public.selt_reports
    where source_filename = ${DEMO_SELT_FILE}`;
  await sql`
    delete from public.selt_import_runs
    where requested_by::text like ${userPattern}`;
  await sql`
    delete from public.catalogue_change_events
    where editing_session_id = ${DEMO_SESSION}`;
  await sql`
    delete from public.catalogue_syncs
    where parser_version = ${DEMO_PARSER_VERSION}`;
  // Profiles, plans and plan items cascade from the auth user.
  await sql`delete from auth.users where id::text like ${userPattern}`;
}

async function seedStudents(sql, now, courseRecords) {
  // Popularity falls away steeply, as in a real cohort where a few
  // first-year courses appear in most plans.
  const weighted = courseRecords.flatMap((record, index) =>
    Array(Math.max(1, Math.round(40 / (index + 1)))).fill(record),
  );
  const [year] = await sql`
    select id from public.academic_years where year = ${now.getUTCFullYear()}`;
  for (let index = 1; index <= STUDENTS; index += 1) {
    const id = demoUserId(index);
    const email = `demo-student-${index}@coursemap.local.test`;
    // Sign-ups grow over the last four months, with a block of earlier users.
    const createdDaysAgo =
      index <= 50 ? between(130, 300) : Math.floor(126 * random() ** 1.6);
    const createdAt = daysAgo(now, createdDaysAgo);
    await sql`
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        is_sso_user, is_anonymous, created_at, updated_at
      ) values (
        '00000000-0000-0000-0000-000000000000', ${id}, 'authenticated',
        'authenticated', ${email}, '', ${createdAt},
        '{"provider":"email","providers":["email"]}'::jsonb,
        ${sql.json({ full_name: `Demo Student ${index}` })},
        false, false, ${createdAt}, ${createdAt}
      )`;
    await sql`
      insert into public.profiles (id, email, display_name, created_at, updated_at)
      values (${id}, ${email}, ${`Demo Student ${index}`}, ${createdAt}, ${createdAt})
      on conflict (id) do update
      set created_at = excluded.created_at, updated_at = excluded.updated_at`;

    if (!year || random() < 0.25) continue;
    const lastActive = Math.min(createdDaysAgo, Math.floor(84 * random() ** 2));
    const activeAt = daysAgo(now, lastActive);
    const [plan] = await sql`
      insert into public.plans (
        owner_id, name, is_primary, commencement_year, study_load,
        academic_year_id, created_at, updated_at
      ) values (
        ${id}, 'My degree', true, ${pick([2024, 2025, 2026, 2026])},
        'full_time', ${year.id}, ${createdAt}, ${activeAt}
      )
      returning id`;
    const chosen = new Set();
    const target = between(5, 14);
    while (chosen.size < target) chosen.add(pick(weighted));
    let order = 0;
    for (const recordId of chosen) {
      await sql`
        insert into public.plan_items (
          plan_id, owner_id, catalogue_record_id, sort_order,
          created_at, updated_at
        ) values (
          ${plan.id}, ${id}, ${recordId}, ${order++}, ${createdAt}, ${activeAt}
        )
        on conflict do nothing`;
    }
  }
}

async function seedSyncs(sql, now, recordIds) {
  const [model] = await sql`
    select requested_model from public.catalogue_syncs
    where requested_model is not null
    limit 1`;
  const [fallback] = model
    ? [model]
    : await sql`select id as requested_model from public.import_models limit 1`;
  const outcomes = [
    ["applied", 0.66],
    ["unchanged", 0.16],
    ["review_required", 0.05],
    ["failed", 0.05],
    ["cancelled", 0.08],
  ];
  for (let day = SYNC_DAYS - 1; day >= 0; day -= 1) {
    const weekday = new Date(now.getTime() - day * DAY_MS).getUTCDay();
    const quiet = weekday === 0 || weekday === 6;
    // A weekly scheduled sweep on Mondays, smaller manual runs otherwise.
    const count =
      weekday === 1 ? between(60, 110) : quiet ? between(0, 6) : between(8, 34);
    for (let index = 0; index < count; index += 1) {
      let roll = random();
      const status =
        outcomes.find(([, share]) => (roll -= share) < 0)?.[0] ?? "applied";
      const at = daysAgo(now, day);
      await sql`
        insert into public.catalogue_syncs (
          record_id, trigger, status, requested_model, parser_version,
          prompt_version, schema_version, requested_at, started_at,
          completed_at, created_at, updated_at, error_message
        ) values (
          ${pick(recordIds)}, ${weekday === 1 ? "scheduled" : "manual"},
          ${status}, ${fallback.requested_model}, ${DEMO_PARSER_VERSION}, 'demo', 'demo',
          ${at}, ${at}, ${at}, ${at}, ${at},
          ${status === "failed" ? "The ANU source did not respond in time." : null}
        )`;
    }
  }
}

async function seedChanges(sql, now, recordIds) {
  for (let day = CHANGE_DAYS - 1; day >= 0; day -= 1) {
    const weekday = new Date(now.getTime() - day * DAY_MS).getUTCDay();
    if ((weekday === 0 || weekday === 6) && random() < 0.8) continue;
    // Busier around the start of each semester's catalogue updates.
    const surge = day % 91 < 10 ? 3 : 1;
    const count = random() < 0.25 ? 0 : Math.floor(random() ** 2 * 22 * surge);
    for (let index = 0; index < count; index += 1) {
      await sql`
        insert into public.catalogue_change_events (
          record_id, event_kind, origin, editing_session_id, created_at
        ) values (
          ${pick(recordIds)},
          ${pick(["source_checked", "source_changed", "publish", "edit"])},
          ${random() < 0.7 ? "source" : "manual"},
          ${DEMO_SESSION}, ${daysAgo(now, day)}
        )`;
    }
  }
}

function surveySeries(base) {
  const surveys = [];
  for (let year = 2019; year <= 2025; year += 1) {
    for (const session of ["sem_1", "sem_2"]) {
      if (random() < 0.3) continue;
      const enrolments = between(60, 340);
      const respondents = Math.max(
        8,
        Math.round(enrolments * (0.15 + random() * 0.2)),
      );
      const value = (offset) =>
        Math.max(
          15,
          Math.min(98, Math.round(base + offset + (random() - 0.5) * 24)),
        );
      surveys.push({
        year,
        session,
        label: `${session === "sem_1" ? "Sem 1" : "Sem 2"} ${year}`,
        enrolments,
        respondents,
        response_rate_percent: Math.round((respondents / enrolments) * 100),
        teaching_and_learning_activities: value(0),
        workload: value(-4),
        feedback: value(-12),
        analytical_development: value(6),
        overall_learning_experience: value(0),
      });
    }
  }
  return surveys;
}

async function seedSelt(sql, now, courses) {
  const [run] = await sql`
    insert into public.selt_import_runs (requested_by, token_sha256, expires_at)
    values (
      ${demoUserId(1)},
      ${createHash("sha256").update(randomUUID()).digest("hex")},
      ${new Date(now.getTime() + 9 * 3_600_000)}
    )
    returning id`;
  const total = SELT_PUBLISHED + SELT_READY + SELT_BLOCKED;
  for (const [index, course] of courses.slice(0, total).entries()) {
    const published = index < SELT_PUBLISHED;
    const blocked = index >= SELT_PUBLISHED + SELT_READY;
    const [report] = await sql`
      insert into public.selt_reports (
        code_id, import_run_id, course_name, subject_owner, source_name,
        page_count, text_extractor, chart_extractor, schema_version,
        source_url, source_sha256, source_filename, source_bytes,
        parser_version, warnings, published_at, published_by, created_at
      ) values (
        ${course.code_id}, ${run.id}, ${course.title}, 'Demo college',
        'ANU Insight Data Warehouse', 1, 'pdftotext -layout',
        'pdfplumber vector line geometry', 'selt-course-time-series.v1',
        ${`https://example.invalid/selt/${course.code}.pdf`},
        ${createHash("sha256").update(`demo-${course.code}`).digest("hex")},
        ${DEMO_SELT_FILE}, 100000, ${DEMO_PARSER_VERSION},
        ${blocked ? ["Chart value for Feedback does not match the table."] : []},
        ${published ? daysAgo(now, between(0, 40)) : null},
        ${published ? demoUserId(1) : null},
        ${daysAgo(now, between(0, 40))}
      )
      returning id`;
    for (const survey of surveySeries(between(48, 82))) {
      await sql`insert into public.selt_surveys ${sql({ report_id: report.id, ...survey })}`;
    }
  }
}

export async function seedAdminDashboard({ clearOnly = false } = {}) {
  const sql = await createLocalDatabaseClient();
  const now = new Date();
  try {
    await sql.begin(async (transaction) => {
      await clear(transaction);
      if (clearOnly) return;
      const courses = await transaction`
        select record_id, code_id, code, title
        from public.published_course_summaries
        where academic_year = ${now.getUTCFullYear()}
        order by code`;
      if (courses.length === 0) {
        throw new Error(
          "No published courses for this year. Run pnpm db:seed:preview or import courses first.",
        );
      }
      // Shuffle so popularity and SELT coverage are not alphabetical.
      const shuffled = [...courses].sort(() => random() - 0.5);
      const records = await transaction`
        select records.id
        from public.catalogue_records as records
        join public.academic_years as years on years.id = records.academic_year_id
        where years.year = ${now.getUTCFullYear()} and records.archived_at is null`;
      const recordIds = records.map((record) => record.id);

      await seedStudents(
        transaction,
        now,
        shuffled.map((course) => course.record_id),
      );
      await seedSyncs(transaction, now, recordIds);
      await seedChanges(transaction, now, recordIds);
      await seedSelt(transaction, now, shuffled);
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const isMainModule = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false;

if (isMainModule) {
  const clearOnly = process.argv.includes("--clear");
  await seedAdminDashboard({ clearOnly });
  console.log(
    clearOnly
      ? "Removed the admin dashboard demo data."
      : "Seeded admin dashboard demo data. Remove it with --clear.",
  );
}
