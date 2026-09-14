import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { ACADEMIC_STRUCTURE_EXTRACTION_SCHEMA_VERSION } from "../lib/structure-import/contract.ts";
import { projectAcademicStructureSnapshot } from "../lib/structure-import/project-snapshot.ts";
import { persistAcademicStructureSnapshotCandidate } from "../lib/structure-import/persist-snapshot.ts";
import {
  claimAcademicStructureImportTarget,
  finishAcademicStructureImportTarget,
} from "../lib/structure-import/import-store.ts";
import { originalStructureImportSnapshotId } from "../lib/coursemap/structure-snapshot-ancestry.ts";
import { createLocalDatabaseClient } from "../scripts/catalogue/lib/local-database.mjs";
function extraction(overrides = {}) {
  return {
    schemaVersion: ACADEMIC_STRUCTURE_EXTRACTION_SCHEMA_VERSION,
    kind: "programme",
    code: "BCOMP",
    year: 2026,
    title: "Bachelor of Computing",
    acronym: "BCMPT",
    shortName: "Computing",
    introduction: "Study computing at ANU.",
    description: "A computing programme.",
    totalUnits: 144,
    durationYears: 3,
    academicCareer: "Undergraduate",
    college: "ANU College of Systems and Society",
    deliveryMode: "In Person",
    selectionRank: 80,
    atar: 80,
    canCombine: true,
    canCombineVertical: false,
    studyAs: "Full-time or part-time",
    contactText: null,
    summaryFields: [],
    sections: [],
    learningOutcomes: [],
    fees: [],
    relationships: [],
    requirements: {
      sourceText: "Complete 144 units.",
      sourceLocator: "#program-requirements",
      rule: {
        type: "group",
        key: "requirements:root",
        operator: "all_of",
        minimumCount: null,
        title: "Program Requirements",
        sourceText: "Complete 144 units.",
        sourceLocator: "#program-requirements",
        children: [
          {
            type: "condition",
            key: "requirements:units",
            conditionKind: "unit_total",
            minimumUnits: 144,
            maximumUnits: null,
            minimumCourses: null,
            courseCodes: [],
            structureKind: null,
            structureCodes: [],
            subjectCode: null,
            minimumLevel: null,
            maximumLevel: null,
            tag: null,
            freeText: null,
            sourceText: "Complete 144 units.",
            sourceLocator: "#program-requirements",
          },
        ],
      },
      unmodelledText: [],
    },
    evidence: [],
    overallConfidence: 0.95,
    reviewItems: [],
    ...overrides,
  };
}

test("editing a first structure draft preserves its review and confirms without replacing edits", async () => {
  const sql = await createLocalDatabaseClient();
  const rollback = new Error("Intentional structure lifecycle rollback");
  try {
    await assert.rejects(
      sql.begin(async (tx) => {
        const actor = randomUUID();
        await tx`insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values (${actor}::uuid,'authenticated','authenticated',${actor + "@example.test"},'{}'::jsonb,'{}'::jsonb)`;
        await tx`update private.user_roles set role_id=(select id from private.app_roles where key='admin') where user_id=${actor}::uuid`;
        const [year] =
          await tx`select id from public.academic_years where year=2026`;
        const [source] =
          await tx`select id from public.academic_structure_sources where kind='anu_programs_and_courses'`;
        const code = "DRAFTTEST-MAJ",
          kind = "major";
        const parsed = extraction({
          code,
          kind,
          title: "Draft lifecycle major",
        });
        const projection = projectAcademicStructureSnapshot(parsed);
        const [page] =
          await tx`insert into public.academic_structure_source_pages ${tx({ source_id: source.id, academic_year_id: year.id, page_kind: "structure", structure_kind: kind, external_key: code, canonical_url: "https://programsandcourses.anu.edu.au/2026/major/" + code, media_type: "text/html", content_sha256: createHash("sha256").update(code).digest("hex"), byte_size: 100, http_status: 200 })} returning id`;
        const [directory] =
          await tx`insert into public.academic_structure_directory_entries ${tx({ academic_year_id: year.id, source_id: source.id, source_page_id: page.id, structure_kind: kind, code, title: parsed.title, source_url: "https://programsandcourses.anu.edu.au/2026/major/" + code })} returning id`;
        const [run] =
          await tx`insert into public.academic_structure_import_runs ${tx({ source_id: source.id, academic_year_id: year.id, structure_kind: kind, requested_model: "google/gemini-3.1-flash-lite", parser_version: "local-fixture", prompt_version: "local-fixture", schema_version: projection.schemaVersion, target_count: 1, queued_count: 1, initiated_by: actor })} returning id`;
        const [target] =
          await tx`insert into public.academic_structure_import_targets ${tx({ run_id: run.id, academic_year_id: year.id, directory_entry_id: directory.id, position: 0, structure_kind: kind, structure_code: code, requested_model: "google/gemini-3.1-flash-lite" })} returning id`;
        const workerId = randomUUID(),
          messageId = "draft-lifecycle-test";
        const claim = await claimAcademicStructureImportTarget(tx, {
          runId: run.id,
          targetId: target.id,
          messageId,
          workerId,
        });
        const candidate = await persistAcademicStructureSnapshotCandidate(tx, {
          claim,
          sourcePageId: Number(page.id),
          projection,
          extraction: parsed,
          messageId,
          workerId,
          expectedLockVersion: claim.lockVersion,
        });
        await finishAcademicStructureImportTarget(tx, {
          runId: run.id,
          targetId: target.id,
          messageId,
          workerId,
          expectedLockVersion: claim.lockVersion,
          processingStatus: "succeeded",
          changeKind: candidate.changeKind,
          structureId: candidate.structureId,
          structureYearId: candidate.structureYearId,
          sourcePageId: Number(page.id),
          candidateSnapshotId: candidate.candidateSnapshotId,
        });
        // Reproduce an older completed import with no prepared workspace.
        await tx`update public.academic_structure_years set draft_snapshot_id = null where id = ${candidate.structureYearId}`;
        const backfill = await readFile(
          new URL(
            "../../../supabase/migrations/20260914090000_prepare_existing_first_catalogue_drafts.sql",
            import.meta.url,
          ),
          "utf8",
        );
        await tx.unsafe(backfill);
        await tx.unsafe(backfill);
        await tx`select set_config('request.jwt.claim.sub',${actor},true)`;
        const [edited] =
          await tx`select public.create_academic_structure_manual_snapshot(${candidate.structureYearId},${candidate.candidateSnapshotId},jsonb_set(private.academic_structure_manual_projection(${candidate.candidateSnapshotId}),'{snapshot,title}','"Manually corrected major"'::jsonb)) as id`;
        const ancestryRows = await tx`
          select id, parent_snapshot_id, origin
          from public.academic_structure_snapshots
          where structure_year_id = ${candidate.structureYearId}
        `;
        const ancestry = ancestryRows.map((row) => ({
          ...row,
          id: Number(row.id),
          parent_snapshot_id:
            row.parent_snapshot_id === null
              ? null
              : Number(row.parent_snapshot_id),
        }));
        assert.equal(
          originalStructureImportSnapshotId(Number(edited.id), ancestry),
          candidate.candidateSnapshotId,
          "edited structures keep the actual imported snapshot as their original source",
        );
        assert.equal(
          originalStructureImportSnapshotId(
            candidate.candidateSnapshotId,
            ancestry,
          ),
          candidate.candidateSnapshotId,
          "an imported structure can display its own original source",
        );
        await assert.rejects(
          tx.savepoint(async (savepoint) => {
            await savepoint`select public.publish_academic_structure_snapshot(${candidate.structureYearId},${edited.id})`;
          }),
          (error) =>
            error.code === "55000" && /blocking review/.test(error.message),
        );
        await assert.rejects(
          tx.savepoint(async (savepoint) => {
            await savepoint`select public.review_academic_structure_import_target(${target.id},'rejected','Do not discard current source')`;
          }),
          (error) => error.code === "55000",
        );
        await assert.rejects(
          tx.savepoint(async (savepoint) => {
            const [unrelated] = await savepoint`
            insert into public.academic_structure_snapshots (
              structure_year_id, academic_year_id, origin, schema_version, semantic_hash, name
            ) values (
              ${candidate.structureYearId}, ${year.id}, 'manual', ${projection.schemaVersion},
              ${createHash("sha256").update("unrelated-draft").digest("hex")}, 'Unrelated draft'
            ) returning id
          `;
            await savepoint`update public.academic_structure_years set draft_snapshot_id=${unrelated.id} where id=${candidate.structureYearId}`;
            await savepoint`select public.review_academic_structure_import_target(${target.id},'accepted','Stale first import')`;
          }),
          (error) => error.code === "40001",
        );
        await tx`select public.review_academic_structure_import_target(${target.id},'accepted','Confirmed edited imported draft')`;
        const [yearState] =
          await tx`select draft_snapshot_id,published_snapshot_id from public.academic_structure_years where id=${candidate.structureYearId}`;
        assert.equal(String(yearState.draft_snapshot_id), String(edited.id));
        assert.equal(yearState.published_snapshot_id, null);
        const [review] =
          await tx`select review_status from public.academic_structure_import_targets where id=${target.id}`;
        assert.equal(review.review_status, "accepted");
        await assert.rejects(
          tx.savepoint(async (savepoint) => {
            await savepoint`select public.publish_academic_structure_snapshot(${candidate.structureYearId},${edited.id})`;
          }),
          /Approve every required section/,
        );
        const [reviewState] =
          await tx`select public.catalogue_review_state(${kind}, ${candidate.structureYearId}, ${edited.id}) as sections`;
        await tx`select public.review_catalogue_sections(${kind}, ${candidate.structureYearId}, ${edited.id}, ${reviewState.sections.map((section) => section.key)}::text[], true, false)`;
        await tx`select public.publish_academic_structure_snapshot(${candidate.structureYearId},${edited.id})`;
        await assert.rejects(
          tx.savepoint(async (savepoint) => {
            await savepoint`select public.review_catalogue_sections(${kind}, ${candidate.structureYearId}, ${edited.id}, array['requirements'], true, true)`;
          }),
          /manual review/,
        );
        const [changed] =
          await tx`select public.create_academic_structure_manual_snapshot(${candidate.structureYearId}, ${edited.id}, jsonb_set(private.academic_structure_manual_projection(${edited.id}), '{snapshot,title}', '"Changed after approval"'::jsonb)) as id`;
        const [changedState] =
          await tx`select public.catalogue_review_state(${kind}, ${candidate.structureYearId}, ${changed.id}) as sections`;
        assert.equal(
          changedState.sections.find((section) => section.key === "details")
            .approved,
          false,
        );
        assert.ok(
          changedState.sections
            .filter((section) => section.key !== "details")
            .every((section) => section.approved),
        );
        await assert.rejects(
          tx.savepoint(async (savepoint) => {
            await savepoint`select public.review_catalogue_sections(${kind}, ${candidate.structureYearId}, ${edited.id}, array['details'], true, false)`;
          }),
          /working content changed/,
        );
        const [published] =
          await tx`select published_snapshot_id from public.academic_structure_years where id=${candidate.structureYearId}`;
        assert.equal(
          String(published.published_snapshot_id),
          String(edited.id),
        );
        await tx`select public.review_catalogue_sections(${kind}, ${candidate.structureYearId}, ${changed.id}, array['details'], true, false)`;
        const [original] =
          await tx`select public_id from public.academic_structure_snapshots where id=${edited.id}`;
        const [restored] =
          await tx`select public.restore_catalogue_version(${kind}, ${candidate.structureYearId}, ${original.public_id}, ${changed.id}) as id`;
        const [restoredState] =
          await tx`select public.catalogue_review_state(${kind}, ${candidate.structureYearId}, ${restored.id}) as sections`;
        assert.equal(
          restoredState.sections.find((section) => section.key === "details")
            .approved,
          false,
        );
        const [secondRun] =
          await tx`insert into public.academic_structure_import_runs ${tx({ source_id: source.id, academic_year_id: year.id, structure_kind: kind, requested_model: "google/gemini-3.1-flash-lite", parser_version: "local-fixture", prompt_version: "local-fixture", schema_version: projection.schemaVersion, target_count: 1, queued_count: 1, initiated_by: actor })} returning id`;
        const [secondTarget] =
          await tx`insert into public.academic_structure_import_targets ${tx({ run_id: secondRun.id, baseline_draft_snapshot_id: restored.id, baseline_published_snapshot_id: edited.id, academic_year_id: year.id, directory_entry_id: directory.id, position: 0, structure_kind: kind, structure_code: code, requested_model: "google/gemini-3.1-flash-lite" })} returning id`;
        const secondClaim = await claimAcademicStructureImportTarget(tx, {
          runId: secondRun.id,
          targetId: secondTarget.id,
          messageId: "second-import",
          workerId,
        });
        const secondExtraction = {
          ...parsed,
          title: "Incoming title",
          description: "Incoming description",
        };
        const secondCandidate = await persistAcademicStructureSnapshotCandidate(
          tx,
          {
            claim: secondClaim,
            sourcePageId: Number(page.id),
            projection: projectAcademicStructureSnapshot(secondExtraction),
            extraction: secondExtraction,
            messageId: "second-import",
            workerId,
            expectedLockVersion: secondClaim.lockVersion,
          },
        );
        await finishAcademicStructureImportTarget(tx, {
          runId: secondRun.id,
          targetId: secondTarget.id,
          messageId: "second-import",
          workerId,
          expectedLockVersion: secondClaim.lockVersion,
          processingStatus: "succeeded",
          changeKind: secondCandidate.changeKind,
          structureId: secondCandidate.structureId,
          structureYearId: secondCandidate.structureYearId,
          sourcePageId: Number(page.id),
          candidateSnapshotId: secondCandidate.candidateSnapshotId,
        });
        const [comparison] =
          await tx`select public.catalogue_import_comparison(${kind}, ${secondTarget.id}) as value`;
        assert.equal(comparison.value.after.snapshot.title, "Incoming title");
        await assert.rejects(
          tx.savepoint(async (savepoint) => {
            await savepoint`select public.apply_catalogue_import_changes(${kind}, ${secondTarget.id}, ${edited.id}, array['title'])`;
          }),
          /record changed/,
        );
        const [applied] =
          await tx`select public.apply_catalogue_import_changes(${kind}, ${secondTarget.id}, ${restored.id}, array['title']) as id`;
        const [appliedProjection] =
          await tx`select private.academic_structure_manual_projection(${applied.id}) as value`;
        assert.equal(appliedProjection.value.snapshot.title, "Incoming title");
        assert.equal(
          appliedProjection.value.snapshot.description,
          comparison.value.before.snapshot.description,
        );
        await tx`select set_config('request.jwt.claim.sub', '', true)`;
        await assert.rejects(
          tx.savepoint(async (savepoint) => {
            await savepoint`select public.review_catalogue_sections(${kind}, ${candidate.structureYearId}, ${restored.id}, array['details'], true, false)`;
          }),
          /permission/,
        );
        throw rollback;
      }),
      (error) => error === rollback,
    );
  } finally {
    await sql.end();
  }
});
