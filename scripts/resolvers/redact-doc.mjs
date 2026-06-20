/**
 * {{REDACT_INVOCATION_BLOCK:<sink>}} resolver — the scan-at-sink confidentiality procedure injected
 * into every skill that touches an external sink, so it never drifts from the apa-redact engine
 * (see packages/apa-redact and DESIGN.md §7.2). <sink> names the egress, e.g. "prior-art-query",
 * "cloud-llm", "filing".
 */

export function redactInvocationBlock(sink) {
  const label = sink || "external-sink";
  return [
    `### Scan-at-sink before sending (sink: ${label})`,
    "Confidentiality of an unfiled invention is load-bearing. Before this content leaves the machine:",
    "1. Write the EXACT bytes to be sent to a temp file.",
    "2. Run the redaction guard on THAT file: `node packages/apa-redact/cli.mjs --from-file <tmp>`.",
    "3. Branch on the exit code: **0** = clean, send the SAME file; **2** = MEDIUM findings — confirm",
    "   each with the human (sterner if the destination is public) before sending; **3** = HIGH findings",
    "   — **block**; do not send. Never scan a string then re-render a different payload.",
    "4. For a cloud-LLM or foreign destination, confirm a zero-retention/no-training backend and obtain",
    "   logged human acknowledgment first (35 USC 102 secrecy / 184 export).",
    "The guard catches accidents and carelessness, not a determined leaker — it is a guardrail, not",
    "airtight enforcement.",
  ].join("\n");
}
