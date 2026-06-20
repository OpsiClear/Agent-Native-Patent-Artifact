/**
 * Offline deterministic source for tests and zero-network demos. Synthesizes NormalizedRefs from the
 * query keywords so ranking/dedup are exercisable without any external call. Disabled by default.
 */

export const meta = {
  id: "mock",
  label: "Offline mock source (tests/demo)",
  accessMode: "api",
  jurisdiction: "US",
  requiresKey: false,
  enabledByDefault: false,
};

export async function search(query, _opts = {}) {
  const kw = (query.keywords || []).map((k) => k.toLowerCase());
  const has = (s) => kw.some((k) => s.toLowerCase().includes(k) || k.includes(s.toLowerCase()));
  const records = [
    {
      source: "mock", docNumber: "US-10000001-B2",
      title: "Self-watering planter with float-actuated shutoff valve",
      abstract: "A reservoir, a float, and a valve that closes when the float reaches a set level.",
      assignee: "Example Corp", inventors: ["Jane Doe"], date: "2019-05-14",
      cpc: ["A01G27/00"], url: "https://patents.google.com/patent/US10000001B2",
      snippet: "a valve that closes when the float reaches a set level",
    },
    {
      source: "mock", docNumber: "US-9000002-B1",
      title: "Wicking self-watering container",
      abstract: "A reservoir feeds a wick drawing water to soil; a sight window shows fill level.",
      assignee: "Garden Inc", inventors: ["John Roe"], date: "2015-02-03",
      cpc: ["A01G27/04"], url: "https://patents.google.com/patent/US9000002B1",
      snippet: "a wick drawing water to soil; a sight window shows fill level",
    },
    {
      // deliberate duplicate doc number (with a comma) to exercise dedupe/normalization
      source: "mock", docNumber: "US 10,000,001 B2",
      title: "Self-watering planter with float-actuated shutoff valve (dup)",
      abstract: "Duplicate record of US-10000001-B2 to test dedupe.",
      date: "2019-05-14", cpc: ["A01G27/00"],
      url: "https://patents.google.com/patent/US10000001B2",
    },
    {
      source: "mock", docNumber: "US-8000003-A1",
      title: "Unrelated irrigation timer",
      abstract: "An electronic timer controlling a solenoid valve on a schedule.",
      assignee: "Timers LLC", date: "2012-08-21", cpc: ["A01G25/16"],
      url: "https://patents.google.com/patent/US8000003A1", snippet: "an electronic timer controlling a solenoid valve",
    },
    // --- self-closing door-hinge domain (for the full-lifecycle demo matter) -------------------
    // Deterministic fixtures keyed off hinge/damper/detent keywords. They deliberately AVOID the
    // planter terms (reservoir/float/wick and the literal word "valve") so they never leak into the
    // planter query results, and the planter records never leak into the hinge query results.
    {
      source: "mock", docNumber: "US-11000010-B2",
      title: "Self-closing door hinge with integrated hydraulic damper",
      abstract: "A door hinge in which a closing spring biases the door toward the closed position and an integrated hydraulic damper limits the closing speed by displacing a working fluid through an adjustable metering orifice.",
      assignee: "Hinge Works Ltd", inventors: ["Ada Hinge"], date: "2020-11-03",
      cpc: ["E05F1/12", "E05F3/10"], url: "https://patents.google.com/patent/US11000010B2",
      snippet: "an integrated hydraulic damper limits the closing speed by displacing a working fluid through an adjustable metering orifice",
    },
    {
      source: "mock", docNumber: "US-10500011-B1",
      title: "Door hinge with cam-and-follower hold-open detent",
      abstract: "A pivot-spindle door hinge having a cam profile and a follower forming a hold-open detent that retains the door at a selected hold-open angle until a release torque is exceeded.",
      assignee: "Detent Co", inventors: ["Bo Cam"], date: "2018-07-19",
      cpc: ["E05F1/12", "E05D11/10"], url: "https://patents.google.com/patent/US10500011B1",
      snippet: "a cam profile and a follower forming a hold-open detent that retains the door at a selected hold-open angle",
    },
    {
      // deliberate comma-formatted duplicate of US-11000010-B2 to exercise dedupe in this domain too
      source: "mock", docNumber: "US 11,000,010 B2",
      title: "Self-closing door hinge with integrated hydraulic damper (dup)",
      abstract: "Duplicate record of US-11000010-B2 to test dedupe across the hinge domain.",
      date: "2020-11-03", cpc: ["E05F1/12"],
      url: "https://patents.google.com/patent/US11000010B2",
    },
    {
      source: "mock", docNumber: "US-9500012-A1",
      title: "Surface-mounted overhead door closer with speed adjustment",
      abstract: "A surface-mounted overhead door closer using a hydraulic cylinder and an adjustment screw to set the closing speed of a door; closing force is supplied by an internal spring. Not integrated into a hinge.",
      assignee: "Closer Corp", date: "2016-03-08", cpc: ["E05F3/10"],
      url: "https://patents.google.com/patent/US9500012A1",
      snippet: "a hydraulic cylinder and an adjustment screw to set the closing speed of a door",
    },
  ];
  const relevant = records.filter((r) => has(r.title) || has(r.abstract) || kw.length === 0);
  return {
    records: relevant,
    rawCount: relevant.length,
    parameters: {
      source_id: meta.id,
      mode: "deterministic-fixture",
      query: {
        keywords: query.keywords || [],
        cpc: query.cpc || [],
        limit: query.limit ?? null,
      },
    },
    notes: ["mock source: deterministic, no network"],
  };
}
