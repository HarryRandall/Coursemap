import { randomUUID } from "node:crypto";
import { test as base, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";
import { readFileSync } from "node:fs";

type Account = { email: string; password: string; id: string };
export const test = base.extend<{
  indoorMap: { roomId: string; buildingSlug: string };
  student: Account;
  administrator: Account;
  planner: Account;
}>({
  page: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await provide(page);
    expect(errors).toEqual([]);
  },
  indoorMap: async ({}, provide) => {
    const sql = postgres(localTestEnvironment().COURSEMAP_DATABASE_URL, {
      max: 1,
    });
    const fixture = JSON.parse(
      readFileSync(
        new URL("../scripts/fixtures/campus-map.json", import.meta.url),
        "utf8",
      ),
    );
    const map = fixture.indoorMaps[0];
    const building = fixture.places.find(
      (place: { id: string }) => place.id === map.buildingPlaceId,
    );
    const id = randomUUID();
    try {
      await sql`insert into public.campus_indoor_maps (id, building_place_id, name, status, document, published_at) values (${id}::uuid, ${map.buildingPlaceId}::uuid, 'Browser regression map', 'published', ${sql.json(map.document)}, now())`;
      await provide({ buildingSlug: building.slug, roomId: "demo-room-1-1" });
    } finally {
      await sql`delete from public.campus_indoor_maps where id = ${id}::uuid`;
      await sql.end();
    }
  },
  student: async ({}, provide) => {
    const env = localTestEnvironment();
    const client = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SECRET_KEY,
      { auth: { persistSession: false } },
    );
    const email = `coursemap-test-${randomUUID()}@example.test`;
    const password = `Local-${randomUUID()}!`;
    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user)
      throw error ?? new Error("Failed to create fixture account");
    try {
      await provide({ email, password, id: data.user.id });
    } finally {
      const result = await client.auth.admin.deleteUser(data.user.id);
      if (result.error) throw result.error;
    }
  },
  planner: async ({ student }, provide) => {
    const sql = postgres(localTestEnvironment().COURSEMAP_DATABASE_URL, {
      max: 1,
    });
    try {
      await sql`insert into public.plans (owner_id, academic_year_id, name, is_primary, commencement_year, study_load) select ${student.id}::uuid, id, 'Browser regression plan', true, 2026, 'full_time' from public.academic_years where year = 2026`;
      // A plan without a degree shows the onboarding prompt, not the planner.
      await sql`insert into public.plan_structures (plan_id, owner_id, catalogue_record_id, role) select plans.id, plans.owner_id, records.id, 'programme' from public.plans join public.catalogue_records as records on records.academic_year_id = plans.academic_year_id join public.catalogue_codes as codes on codes.id = records.code_id where plans.owner_id = ${student.id}::uuid and codes.code = 'LOCAL-PROGRAMME'`;
      await provide(student);
    } finally {
      await sql.end();
    }
  },
  administrator: async ({ student }, provide) => {
    const sql = postgres(localTestEnvironment().COURSEMAP_DATABASE_URL, {
      max: 1,
    });
    try {
      await sql`insert into private.user_roles (user_id, role_id) select ${student.id}::uuid, id from private.app_roles where key = 'admin' on conflict (user_id) do update set role_id = excluded.role_id`;
      await provide(student);
    } finally {
      await sql.end();
    }
  },
});
export { expect };
export async function login(
  page: import("@playwright/test").Page,
  account: Account,
) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(account.email);
  await page.locator('input[name="password"]').fill(account.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
