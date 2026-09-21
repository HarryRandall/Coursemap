type CatalogueRecordIdRow = { catalogue_record_id: number };

export function collectPlanCatalogueRecordIds(
  planItems: readonly CatalogueRecordIdRow[],
  attemptedVersions: readonly CatalogueRecordIdRow[],
) {
  return [
    ...new Set(
      [...planItems, ...attemptedVersions].map(
        (record) => record.catalogue_record_id,
      ),
    ),
  ];
}
