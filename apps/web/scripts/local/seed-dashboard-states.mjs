#!/usr/bin/env node

/**
 * Puts a local student's plan into a known state so the dashboard can be
 * reviewed empty, early, midway and near completion.
 *
 *   pnpm db:seed:dashboard <empty|first-year|midway|final-year> [email]
 *
 * Loopback databases only. The student's course attempts and plan items are
 * replaced; sample courses are published only where a course year has no
 * published version, so imported catalogue data is never overwritten.
 */

import { fileURLToPath } from "node:url";

import { createLocalDatabaseClient } from "../catalogue/lib/local-database.mjs";

const FIXTURE_ADMIN = "90000000-0000-4000-8000-000000000001";

// Bachelor of Computing core courses first, so the composition's core fills
// before electives do.
const SAMPLE_COURSES = [
  ["COMP1100", "Programming as Problem Solving", 1000],
  ["COMP1110", "Structured Programming", 1000],
  ["MATH1005", "Discrete Mathematical Models", 1000],
  ["COMP1600", "Foundations of Computing", 1000],
  ["COMP2100", "Software Design Methodologies", 2000],
  ["COMP2300", "Computer Organisation and Program Execution", 2000],
  ["COMP2400", "Relational Databases", 2000],
  ["MATH2222", "Introduction to Mathematical Thinking", 2000],
  ["STAT1008", "Quantitative Research Methods", 1000],
  ["MATH1013", "Mathematics and Applications 1", 1000],
  ["INFS2024", "Information Systems Analysis", 2000],
  ["DESN2010", "Design Thinking", 2000],
  ["ENGN1211", "Discovering Engineering", 1000],
  ["MATH2301", "Games, Graphs and Machines", 2000],
  ["STAT1003", "Statistical Techniques", 1000],
  ["INFS3002", "Information Systems Project", 3000],
  ["MGMT2009", "Entrepreneurship and Innovation", 2000],
  ["SOCY2166", "Social Science of the Internet", 2000],
  ["COMP3600", "Algorithms", 3000],
  ["COMP3900", "Human-Computer Interaction", 3000],
  ["INFS3024", "Information Systems Security", 3000],
  ["MATH2307", "Bayesian Statistics", 2000],
  ["ARTH2181", "Art and Technology", 2000],
  ["ENVS2015", "Sustainable Systems", 2000],
  ["SCOM3029", "Science Communication", 3000],
  ["ASIA3032", "Digital Asia", 3000],
  ["MUSI3309", "Music and Computation", 3000],
  ["MGMT3027", "Managing Technology", 3000],
];

// Marks cycle through the grade bands so every bar has something in it.
const MARKS = [86, 74, 91, 63, 78, 55, 82, 69, 88, 72, 95, 58, 80, 67, 84];

/**
 * Each state lists its semesters in order. Completed semesters carry marks,
 * the current semester is enrolled, and later semesters are planned.
 */
const STATES = {
  empty: { commencementYear: 2026, semesters: [] },
  "first-year": {
    commencementYear: 2026,
    semesters: [
      { year: 2026, code: "S1", status: "completed", courses: 4 },
      { year: 2026, code: "S2", status: "enrolled", courses: 4 },
    ],
  },
  midway: {
    commencementYear: 2025,
    semesters: [
      { year: 2025, code: "S1", status: "completed", courses: 4 },
      { year: 2025, code: "S2", status: "completed", courses: 4 },
      { year: 2026, code: "S1", status: "completed", courses: 4 },
      { year: 2026, code: "S2", status: "enrolled", courses: 4 },
      { year: 2027, code: "S1", status: "planned", courses: 3 },
      { year: 2027, code: "S2", status: "planned", courses: 2 },
    ],
  },
  "final-year": {
    commencementYear: 2024,
    semesters: [
      { year: 2024, code: "S1", status: "completed", courses: 4 },
      { year: 2024, code: "S2", status: "completed", courses: 4 },
      { year: 2025, code: "S1", status: "completed", courses: 4 },
      { year: 2025, code: "S2", status: "completed", courses: 4 },
      { year: 2026, code: "S1", status: "completed", courses: 4 },
      { year: 2026, code: "S2", status: "enrolled", courses: 4 },
    ],
  },
};

// Indicative domestic fees per 6-unit course, by subject group.
const DOMESTIC_FEES = {
  COMP: 1180,
  MATH: 1180,
  STAT: 1180,
  ENGN: 1180,
  INFS: 1180,
  DESN: 1180,
  ENVS: 1180,
  MGMT: 2485,
};
const DEFAULT_DOMESTIC_FEE = 2640;

const PERIOD_DATES = {
  S1: { name: "Semester 1", starts: "02-23", ends: "06-28", order: 1 },
  S2: { name: "Semester 2", starts: "07-27", ends: "11-22", order: 2 },
};

function gradeFor(mark) {
  if (mark >= 80) return "HD";
  if (mark >= 70) return "D";
  if (mark >= 60) return "CR";
  if (mark >= 50) return "P";
  return "N";
}

async function academicYearId(sql, year) {
  const [row] = await sql`
    insert into public.academic_years (year) values (${year})
    on conflict (year) do update set year = excluded.year
    returning id`;
  return row.id;
}

/** A period for attempts to reference; draft, so the catalogue ignores it. */
async function periodId(sql, year, code) {
  const [existing] = await sql`
    select id from public.academic_periods
    where calendar_year = ${year} and code = ${code}`;
  if (existing) return existing.id;
  const dates = PERIOD_DATES[code];
  const [row] = await sql`
    insert into public.academic_periods (
      calendar_year, code, name, short_name, starts_on, ends_on, sort_order, status
    ) values (
      ${year}, ${code}, ${dates.name}, ${code},
      ${`${year}-${dates.starts}`}, ${`${year}-${dates.ends}`},
      ${dates.order}, 'draft'
    )
    returning id`;
  return row.id;
}

/** The content hash that marks a version this script published. */
const seedHash = (code, year, generation) => [
  `${code}:${year}:dashboard-seed${generation}`,
  `published:${code}`,
];

/**
 * The course's record and published version for a year. Publishes a sample
 * version when none is published, and replaces this script's own earlier
 * versions that were published without a fee. Sealed versions cannot gain
 * fees, so a fresh version is published instead.
 */
async function publishedCourse(sql, [code, title, level], year) {
  const yearId = await academicYearId(sql, year);
  await sql`
    insert into public.catalogue_codes (kind, code) values ('course', ${code})
    on conflict (kind, code) do nothing`;
  const [record] = await sql`
    insert into public.catalogue_records (code_id, kind, academic_year_id)
    select id, 'course', ${yearId} from public.catalogue_codes
    where kind = 'course' and code = ${code}
    on conflict (code_id, academic_year_id)
      do update set kind = excluded.kind
    returning id, published_version_id`;
  if (record.published_version_id) {
    const [earlier] = await sql`
      select 1 from public.catalogue_versions
      where id = ${record.published_version_id}
        and content_hash = md5(${seedHash(code, year, "")[0]})
          || md5(${seedHash(code, year, "")[1]})`;
    if (!earlier) {
      return { recordId: record.id, versionId: record.published_version_id };
    }
  }
  const [hash, published] = seedHash(code, year, ":fees");
  const [version] = await sql`
    insert into public.catalogue_versions (
      record_id, kind, academic_year_id, origin, content_hash, created_by
    ) values (
      ${record.id}, 'course', ${yearId}, 'manual',
      md5(${hash}) || md5(${published}),
      ${FIXTURE_ADMIN}
    )
    returning id`;
  const subject = code.slice(0, 4);
  await sql`
    insert into public.course_version_details (
      version_id, title, unit_value_kind, units, eftsl, level, subject_code,
      subject_name, school, college, academic_career, convener_text,
      delivery_summary, introduction, description, workload_text,
      workload_hours, inherent_requirements, prescribed_texts,
      offering_status, source_updated_at
    ) values (
      ${version.id}, ${title}, 'fixed', 6, 0.125, ${level}, ${subject},
      ${subject}, 'Local dashboard sample', 'ANU', 'UGRD', 'Sample convenor',
      'In person at Acton campus', 'Sample course for dashboard review.',
      'Sample course for dashboard review.', 'Approximately ten hours per week.',
      10, 'None listed.', 'No prescribed text.', 'offered',
      ${`${year}-01-01 00:00:00+10`}
    )`;
  const fee = DOMESTIC_FEES[subject] ?? DEFAULT_DOMESTIC_FEE;
  await sql`
    insert into public.course_fees (
      version_id, position, fee_year, audience, fee_type, amount, currency,
      basis, source_label, source_text
    ) values (
      ${version.id}, 1, ${year}, 'domestic', 'student_contribution', ${fee},
      'AUD', 'course', 'Domestic student contribution',
      ${`Domestic student contribution: $${fee.toLocaleString("en-AU")}`}
    )`;
  await sql`
    update public.catalogue_records set published_version_id = ${version.id}
    where id = ${record.id}`;
  return { recordId: record.id, versionId: version.id };
}

export async function seedDashboardState({
  state,
  email = "test@test.com",
  createClient = createLocalDatabaseClient,
}) {
  const plan = STATES[state];
  if (!plan) {
    throw new Error(
      `Unknown state "${state}". Use one of: ${Object.keys(STATES).join(", ")}.`,
    );
  }
  const sql = await createClient();
  try {
    await sql.begin(async (tx) => {
      const [owner] = await tx`
        select plans.id as plan_id, plans.owner_id
        from public.plans
        join auth.users on users.id = plans.owner_id
        where users.email = ${email} and plans.is_primary`;
      if (!owner) {
        throw new Error(
          `${email} has no primary plan. Finish onboarding first.`,
        );
      }
      await tx`delete from public.course_attempts where owner_id = ${owner.owner_id}`;
      await tx`delete from public.plan_items where plan_id = ${owner.plan_id}`;
      await tx`
        update public.plans set commencement_year = ${plan.commencementYear}
        where id = ${owner.plan_id}`;

      let next = 0;
      for (const semester of plan.semesters) {
        for (let index = 0; index < semester.courses; index += 1) {
          const course = SAMPLE_COURSES[next];
          const mark = MARKS[next % MARKS.length];
          next += 1;
          if (semester.status === "planned") {
            // Planned courses point at the current catalogue year's record.
            const { recordId } = await publishedCourse(tx, course, 2026);
            await tx`
              insert into public.plan_items (
                plan_id, owner_id, catalogue_record_id, sort_order,
                planned_calendar_year, planned_period_code
              ) values (
                ${owner.plan_id}, ${owner.owner_id}, ${recordId}, ${next},
                ${semester.year}, ${semester.code}
              )`;
            continue;
          }
          const { versionId } = await publishedCourse(
            tx,
            course,
            semester.year,
          );
          const completed = semester.status === "completed";
          await tx`
            insert into public.course_attempts (
              owner_id, academic_period_id, status, mark, grade,
              units_attempted, units_earned, source, catalogue_version_id
            ) values (
              ${owner.owner_id},
              ${await periodId(tx, semester.year, semester.code)},
              ${semester.status},
              ${completed ? mark : null},
              ${completed ? gradeFor(mark) : null},
              6, ${completed ? 6 : 0}, 'user_entered', ${versionId}
            )`;
        }
      }
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const isMainModule = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false;

if (isMainModule) {
  const [state, email] = process.argv.slice(2);
  await seedDashboardState({ state, email });
  console.log(`Seeded the "${state}" dashboard state.`);
}
