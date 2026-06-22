export function validateSearchDossier(dossier) {
  const errors = [];
  const add = (path, message) => errors.push({ path, message });
  const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);
  const isArray = Array.isArray;
  const hex64 = /^[0-9a-f]{64}$/;

  if (!isObject(dossier)) {
    return { ok: false, errors: [{ path: "$", message: "dossier must be an object" }] };
  }
  if (dossier.schema !== "apa-search-dossier-v1") add("schema", "must be apa-search-dossier-v1");
  if (!String(dossier.generated_at || "").trim()) add("generated_at", "required");

  if (!isObject(dossier.query)) {
    add("query", "required object");
  } else {
    if (!isArray(dossier.query.keywords)) add("query.keywords", "must be an array");
    if (!isArray(dossier.query.cpc)) add("query.cpc", "must be an array");
    if (!Number.isFinite(Number(dossier.query.limit))) add("query.limit", "must be numeric");
    if (!hex64.test(String(dossier.query.serialized_sha256 || ""))) {
      add("query.serialized_sha256", "must be a 64-character lowercase sha256 hex digest");
    }
    const scan = dossier.query.scan_verdict;
    if (!isObject(scan)) {
      add("query.scan_verdict", "required object");
    } else {
      for (const key of ["blocked", "needs_confirm"]) {
        if (typeof scan[key] !== "boolean") add(`query.scan_verdict.${key}`, "must be boolean");
      }
      for (const key of ["high_count", "medium_count"]) {
        if (!Number.isFinite(Number(scan[key]))) add(`query.scan_verdict.${key}`, "must be numeric");
      }
    }
  }

  if (!isArray(dossier.search_plan) || dossier.search_plan.length === 0) add("search_plan", "must be a non-empty array");
  for (const [index, step] of (dossier.search_plan || []).entries()) {
    if (!isObject(step)) add(`search_plan.${index}`, "must be an object");
    else if (!String(step.id || "").trim()) add(`search_plan.${index}.id`, "required");
  }

  if (!isArray(dossier.sources)) add("sources", "must be an array");
  for (const [index, source] of (dossier.sources || []).entries()) {
    if (!isObject(source)) {
      add(`sources.${index}`, "must be an object");
      continue;
    }
    if (!String(source.source_id || "").trim()) add(`sources.${index}.source_id`, "required");
    if (!isObject(source.source_health)) add(`sources.${index}.source_health`, "required object");
    if (!("query_parameters" in source)) add(`sources.${index}.query_parameters`, "required, may be null");
  }

  if (!isObject(dossier.top_n)) {
    add("top_n", "required object");
  } else {
    for (const key of ["before_dedupe", "after_dedupe_before_ranking", "after_ranking"]) {
      if (!isArray(dossier.top_n[key])) add(`top_n.${key}`, "must be an array");
    }
  }
  for (const key of ["dedupe_clusters", "excluded_results", "ranked_candidates", "assigned_references", "caveats"]) {
    if (!isArray(dossier[key])) add(key, "must be an array");
  }
  if (!isObject(dossier.citation_expansion)) add("citation_expansion", "required object");

  const limits = dossier.coverage_limits;
  if (!isObject(limits)) {
    add("coverage_limits", "required object");
  } else {
    if (limits.search_complete_asserted !== false) add("coverage_limits.search_complete_asserted", "must be false");
    if (!isArray(limits.searched_source_ids)) add("coverage_limits.searched_source_ids", "must be an array");
    if (!isArray(limits.known_unsearched_sources)) add("coverage_limits.known_unsearched_sources", "must be an array");
  }

  for (const [index, candidate] of (dossier.ranked_candidates || []).entries()) {
    if (!isObject(candidate)) {
      add(`ranked_candidates.${index}`, "must be an object");
      continue;
    }
    if (!("quote_handoff" in candidate)) add(`ranked_candidates.${index}.quote_handoff`, "required");
    if (!("rank_explanation" in candidate)) add(`ranked_candidates.${index}.rank_explanation`, "required, may be null");
    if (!isObject(candidate.verification)) add(`ranked_candidates.${index}.verification`, "required object");
  }

  const handoff = dossier.analysis_handoff;
  if (!isObject(handoff)) {
    add("analysis_handoff", "required object");
  } else {
    if (handoff.schema !== "apa-search-to-patentability-handoff-v1") {
      add("analysis_handoff.schema", "must be apa-search-to-patentability-handoff-v1");
    }
    if (!isArray(handoff.candidate_cells)) add("analysis_handoff.candidate_cells", "must be an array");
  }

  const closest = dossier.closest_art_selection;
  if (!isObject(closest)) {
    add("closest_art_selection", "required object");
  } else {
    if (typeof closest.human_verified !== "boolean") add("closest_art_selection.human_verified", "must be boolean");
    if (!isArray(closest.selected_pa_ids)) add("closest_art_selection.selected_pa_ids", "must be an array");
    if (!isObject(closest.verification)) add("closest_art_selection.verification", "required object");
  }

  return { ok: errors.length === 0, errors };
}

export function formatDossierErrors(errors = []) {
  return errors.map((e) => `${e.path}: ${e.message}`).join("\n");
}
