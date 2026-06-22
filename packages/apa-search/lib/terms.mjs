export const TERM_VARIANTS = new Map([
  ["linked document", ["web page", "hyperlink", "node", "link graph"]],
  ["linking document", ["backlink", "inbound link", "citing page"]],
  ["rank", ["score", "importance", "authority"]],
  ["ranking", ["scoring", "importance ordering", "authority ranking"]],
  ["key/value", ["key value", "key-value", "tuple"]],
  ["key value", ["key/value", "key-value", "tuple"]],
  ["mapreduce", ["map reduce", "mapper reducer", "distributed data processing"]],
  ["reduce", ["aggregation", "grouped intermediate values"]],
  ["out-of-distribution", ["ood", "distribution shift", "anomaly detection"]],
  ["feature vector", ["embedding", "latent representation"]],
  ["cluster", ["k-means", "centroid", "nearest cluster"]],
  ["threshold", ["distance threshold", "confidence threshold"]],
  ["classification model", ["classifier", "neural network model"]],
  ["dictionary compression", ["adaptive dictionary coding", "dictionary coding", "string dictionary"]],
  ["string table", ["dictionary table", "stored strings", "string dictionary"]],
  ["variable length code", ["variable-rate coding", "variable rate code", "minimum-redundancy code"]],
  ["public key cryptography", ["public-key cryptosystem", "asymmetric cryptography", "public key encryption"]],
  ["digital signature", ["digital signatures", "authentication signature"]],
  ["collaborative filtering", ["automated collaborative filtering", "recommender system", "grouplens"]],
  ["recommend items", ["item recommendation", "recommendations service", "recommend products"]],
]);

export function expandTermVariants(keywords = []) {
  const out = [];
  const seen = new Set(keywords.map((k) => String(k).toLowerCase()));
  for (const raw of keywords) {
    const term = String(raw || "").toLowerCase().trim();
    for (const [key, variants] of TERM_VARIANTS) {
      if (!term || !(term === key || term.includes(key) || key.includes(term))) continue;
      for (const variant of variants) {
        const normalized = String(variant).toLowerCase().trim();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        out.push(normalized);
      }
    }
  }
  return out;
}
