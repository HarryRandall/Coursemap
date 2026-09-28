const SOCIETY_CATEGORIES = new Set([
  "Academic",
  "Arts and performance",
  "Culture and community",
  "Hobbies and interests",
  "Advocacy",
]);
const EVENT_CATEGORIES = new Set(["social", "workshop", "gaming"]);
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;

function requireText(value, field, allowEmpty = false) {
  if (
    typeof value !== "string" ||
    (!allowEmpty && !value.trim()) ||
    value.includes("\0")
  )
    throw new Error(`The society snapshot has an invalid ${field}.`);
}

function requireUrl(value, field) {
  requireText(value, field);
  let url;
  try {
    url = new URL(value);
  } catch {
    /* Report the field without echoing its value. */
  }
  if (
    !url ||
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(`The society snapshot has an invalid ${field}.`);
}

function requireTimestamp(value) {
  return (
    typeof value === "string" &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

/** Validate every row before either a database write or a portable SQL export. */
export function validateSocietySnapshot(snapshot) {
  if (
    !snapshot ||
    snapshot.source !== "rubric" ||
    !requireTimestamp(snapshot.retrievedAt)
  )
    throw new Error("The society snapshot has invalid provenance.");
  if (
    !Array.isArray(snapshot.societies) ||
    !Array.isArray(snapshot.events) ||
    !snapshot.societies.length
  )
    throw new Error(
      "The society snapshot needs club and event arrays and at least one club.",
    );
  const slugs = new Set();
  for (const [records, kind] of [
    [snapshot.societies, "club"],
    [snapshot.events, "event"],
  ]) {
    const ids = new Set();
    const sourceIds = new Set();
    for (const record of records) {
      if (
        !record ||
        typeof record !== "object" ||
        !UUID.test(record.id) ||
        !HASH.test(record.sourceHash)
      )
        throw new Error(
          `The society snapshot has an invalid ${kind} identifier or content hash.`,
        );
      requireText(record.sourceId, `${kind} source identifier`);
      if (ids.has(record.id) || sourceIds.has(record.sourceId))
        throw new Error(
          `The society snapshot contains duplicate ${kind} identifiers.`,
        );
      ids.add(record.id);
      sourceIds.add(record.sourceId);
      if (kind === "club") {
        requireText(record.slug, "club slug");
        if (
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.slug) ||
          slugs.has(record.slug)
        )
          throw new Error(
            "The society snapshot contains invalid or duplicate club slugs.",
          );
        slugs.add(record.slug);
        for (const field of ["name", "shortName", "summary", "overview"])
          requireText(record[field], `club ${field}`);
        if (
          !SOCIETY_CATEGORIES.has(record.category) ||
          !Array.isArray(record.interests)
        )
          throw new Error(
            "The society snapshot has an invalid club category or interests.",
          );
        for (const interest of record.interests)
          requireText(interest, "club interest");
        requireUrl(record.directoryUrl, "club source URL");
        for (const field of ["website", "logoUrl"])
          if (record[field] != null) requireUrl(record[field], `club ${field}`);
        if (record.links != null && !Array.isArray(record.links))
          throw new Error("The society snapshot has invalid social links.");
        const labels = new Set();
        for (const link of record.links ?? []) {
          if (
            !link ||
            !["Instagram", "Facebook", "Discord"].includes(link.label) ||
            labels.has(link.label)
          )
            throw new Error(
              "The society snapshot has invalid or duplicate social links.",
            );
          labels.add(link.label);
          requireUrl(link.url, "club social URL");
        }
      } else {
        if (
          !slugs.has(record.societySlug) ||
          !requireTimestamp(record.startsAt) ||
          !requireTimestamp(record.endsAt) ||
          !(Date.parse(record.endsAt) > Date.parse(record.startsAt))
        )
          throw new Error(
            "Every society event needs an organiser and a valid date range.",
          );
        if (!EVENT_CATEGORIES.has(record.category))
          throw new Error(
            "The society snapshot has an invalid event category.",
          );
        for (const field of ["title", "location"])
          requireText(record[field], `event ${field}`);
        requireText(record.description, "event description", true);
        requireUrl(record.sourceUrl, "event source URL");
        for (const field of ["artworkUrl", "ticketsUrl"])
          if (record[field] != null)
            requireUrl(record[field], `event ${field}`);
      }
    }
  }
}

export function societyRow(club, snapshot) {
  const social = (label) =>
    club.links?.find((link) => link.label === label)?.url ?? null;
  return {
    id: club.id,
    slug: club.slug,
    source: snapshot.source,
    source_id: club.sourceId,
    name: club.name,
    short_name: club.shortName,
    category: club.category,
    summary: club.summary,
    overview: club.overview,
    interests: club.interests,
    website_url: club.website ?? null,
    logo_url: club.logoUrl ?? null,
    instagram_url: social("Instagram"),
    facebook_url: social("Facebook"),
    discord_url: social("Discord"),
    source_url: club.directoryUrl,
    fetched_at: snapshot.retrievedAt,
    source_hash: club.sourceHash,
  };
}

export function societyEventRow(event, societyId, snapshot) {
  return {
    id: event.id,
    society_id: societyId,
    source: snapshot.source,
    source_id: event.sourceId,
    title: event.title,
    category: event.category,
    starts_at: event.startsAt,
    ends_at: event.endsAt,
    location: event.location,
    description: event.description,
    artwork_url: event.artworkUrl ?? null,
    tickets_url: event.ticketsUrl ?? null,
    source_url: event.sourceUrl,
    fetched_at: snapshot.retrievedAt,
    source_hash: event.sourceHash,
  };
}
