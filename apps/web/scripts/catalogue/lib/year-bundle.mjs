// Moves one catalogue year's published records from the local database to
// another database as a replacement. Records are matched by kind, code and
// year, never by internal id. Each changed record gets a new sealed version
// that becomes its publication, records the bundle omits are unpublished, and
// the year's drafts for those kinds are cleared. History is never deleted: the
// catalogue's immutability guards forbid it, and plans keep their references.
import { createHash } from "node:crypto";

import {
  contentHashForCatalogueContent,
  readVersionContent,
} from "../../../lib/catalogue-import/version-content.ts";
import { insertVersionContent } from "../../../lib/catalogue-sync/persist-source-version.ts";

/** Fixture records that only exist in the local preview. */
const PREVIEW_CODE = /^LOCAL[A-Z]?-/u;

export async function exportYearBundle(sql, { year, kinds }) {
  const rows = await sql`
    select records.kind, codes.code, records.published_version_id
    from public.catalogue_records records
    join public.catalogue_codes codes on codes.id = records.code_id
    join public.academic_years years on years.id = records.academic_year_id
    where years.year = ${year} and records.kind = any(${kinds}::text[])
      and records.archived_at is null and records.published_version_id is not null
    order by records.kind, codes.code
  `;
  const records = [];
  for (const row of rows) {
    if (PREVIEW_CODE.test(String(row.code))) continue;
    const content = await readVersionContent(
      sql,
      Number(row.published_version_id),
    );
    records.push({ ...content, evidence: [], flags: [] });
  }
  return { year, kinds, exportedAt: new Date().toISOString(), records };
}

function bundleKey(record) {
  return `${record.kind}:${record.code}`;
}

/**
 * What a load would change in the target, without writing. The token names
 * this exact plan, so applying it requires the owner to have read it.
 */
export async function planYearLoad(target, bundle) {
  const incoming = new Map(
    bundle.records.map((record) => [
      bundleKey(record),
      contentHashForCatalogueContent(record),
    ]),
  );
  const current = await target`
    select records.id, records.kind, codes.code, versions.content_hash,
      (select count(*)::integer from public.plan_items where plan_items.catalogue_record_id = records.id)
        + (select count(*)::integer from public.plan_structures where plan_structures.catalogue_record_id = records.id) as plan_references
    from public.catalogue_records records
    join public.catalogue_codes codes on codes.id = records.code_id
    join public.academic_years years on years.id = records.academic_year_id
    left join public.catalogue_versions versions on versions.id = records.published_version_id
    where years.year = ${bundle.year} and records.kind = any(${bundle.kinds}::text[])
      and records.archived_at is null
  `;
  const plan = {
    year: bundle.year,
    kinds: bundle.kinds,
    publish: [],
    unchanged: [],
    unpublish: [],
    plannedReferencesToUnpublished: 0,
  };
  const seen = new Set();
  for (const row of current) {
    const key = `${row.kind}:${row.code}`;
    seen.add(key);
    const hash = incoming.get(key);
    if (hash === undefined) {
      if (row.content_hash !== null) {
        plan.unpublish.push(key);
        plan.plannedReferencesToUnpublished += Number(row.plan_references);
      }
    } else if (hash === row.content_hash) plan.unchanged.push(key);
    else plan.publish.push(key);
  }
  for (const key of incoming.keys()) if (!seen.has(key)) plan.publish.push(key);
  const [drafts] = await target`
    select count(*)::integer as count from public.catalogue_drafts drafts
    join public.catalogue_records records on records.id = drafts.record_id
    join public.academic_years years on years.id = records.academic_year_id
    where years.year = ${bundle.year} and records.kind = any(${bundle.kinds}::text[])
  `;
  plan.draftsToClear = Number(drafts.count);
  for (const list of [plan.publish, plan.unchanged, plan.unpublish])
    list.sort();
  plan.token = createHash("sha256")
    .update(
      JSON.stringify([
        plan.year,
        plan.kinds,
        plan.publish,
        plan.unpublish,
        plan.draftsToClear,
        [...incoming.entries()].sort(),
      ]),
    )
    .digest("hex")
    .slice(0, 16);
  return plan;
}

/** Writes one record's bundle content as its new published version. */
async function publishRecord(tx, { content, academicYearId, userId }) {
  const [code] = await tx`
    insert into public.catalogue_codes (kind, code) values (${content.kind}, ${content.code})
    on conflict (kind, code) do update set code = excluded.code
    returning id
  `;
  const [record] = await tx`
    insert into public.catalogue_records (code_id, kind, academic_year_id)
    values (${code.id}, ${content.kind}, ${academicYearId})
    on conflict (code_id, academic_year_id) do update set kind = excluded.kind
    returning id, published_version_id
  `;
  const [version] = await tx`
    insert into public.catalogue_versions (
      record_id, kind, academic_year_id, origin, based_on_version_id, content_hash, created_by
    ) values (
      ${record.id}, ${content.kind}, ${academicYearId}, 'manual',
      ${record.published_version_id}, ${contentHashForCatalogueContent(content)}, ${userId}
    )
    returning id
  `;
  await insertVersionContent(tx, {
    snapshotId: Number(version.id),
    kind: content.kind,
    academicYearId,
    sourcePageId: null,
    write: content,
  });
  await tx`update public.catalogue_versions set sealed_at = greatest(statement_timestamp(), created_at) where id = ${version.id}`;
  await tx`update public.catalogue_records set published_version_id = ${version.id}, updated_at = now() where id = ${record.id}`;
}

/**
 * Applies a reviewed plan. The plan is recomputed first and must still carry
 * the approved token, so a target that changed since the dry run is refused.
 * Each record commits on its own; a failure stops the load and reports how far
 * it got, and running it again continues because unchanged records are skipped.
 */
export async function applyYearLoad(
  target,
  bundle,
  { token, userId = null, onProgress = () => {} },
) {
  const plan = await planYearLoad(target, bundle);
  if (plan.token !== token)
    throw new Error(
      `The target no longer matches the reviewed plan (token ${plan.token}). Run the dry run again.`,
    );
  const [year] =
    await target`select id from public.academic_years where year = ${bundle.year}`;
  if (!year)
    throw new Error(`The academic year ${bundle.year} is not registered.`);
  const academicYearId = Number(year.id);
  const contents = new Map(
    bundle.records.map((record) => [bundleKey(record), record]),
  );
  const claim = async (tx) => {
    if (userId)
      await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
  };
  let published = 0;
  for (const key of plan.publish) {
    await target.begin(async (tx) => {
      await claim(tx);
      await publishRecord(tx, {
        content: contents.get(key),
        academicYearId,
        userId,
      });
    });
    published += 1;
    if (published % 100 === 0) onProgress({ published });
  }
  let unpublished = 0;
  for (const key of plan.unpublish) {
    const [kind, code] = key.split(":");
    await target.begin(async (tx) => {
      await claim(tx);
      await tx`
        update public.catalogue_records records set published_version_id = null, updated_at = now()
        from public.catalogue_codes codes
        where codes.id = records.code_id and codes.kind = ${kind} and codes.code = ${code}
          and records.academic_year_id = ${academicYearId}
      `;
    });
    unpublished += 1;
  }
  const cleared = await target`
    delete from public.catalogue_drafts drafts using public.catalogue_records records
    where records.id = drafts.record_id and records.academic_year_id = ${academicYearId}
      and records.kind = any(${bundle.kinds}::text[])
    returning drafts.record_id
  `;
  return { published, unpublished, draftsCleared: cleared.length };
}
