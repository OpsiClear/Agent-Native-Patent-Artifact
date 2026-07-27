/**
 * Fail-closed checks for SVG that will be embedded in locally opened HTML.
 *
 * This is deliberately smaller than a general SVG sanitizer. APA's sheet compositor accepts
 * passive line-art SVG, rejects active constructs, and leaves any needed conversion to an
 * explicit upstream normalization step.
 */

const ACTIVE_TAG_RE =
  /<\s*(?:[A-Za-z_][\w.-]*:)?(?:script|style|foreignObject|iframe|object|embed|image|use|a|audio|video|canvas|link|meta|base|animate|animateMotion|animateTransform|set)\b/i;
const EVENT_ATTRIBUTE_RE = /\s(on[a-z][a-z0-9:_-]*)\s*=/gi;
const HREF_RE = /\b(?:href|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/gi;
const XML_BASE_RE = /\bxml:base\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/gi;
const STYLE_ATTRIBUTE_RE = /\bstyle\s*=\s*(["'])(.*?)\1/gi;
const URL_FUNCTION_RE = /url\s*\(\s*(["']?)(.*?)\1\s*\)/gi;
const ACTIVE_CSS_RE = /@import|expression\s*\(|(?:-moz-)?binding\s*:|behavior\s*:|javascript\s*:|data\s*:/i;
const PASSIVE_TAGS = new Set([
  "svg",
  "g",
  "defs",
  "marker",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "title",
  "desc",
  "clippath",
]);
const PASSIVE_ATTRIBUTES = new Set([
  "xmlns",
  "id",
  "class",
  "role",
  "aria-label",
  "focusable",
  "viewbox",
  "preserveaspectratio",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "transform",
  "fill",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-dashoffset",
  "clip-rule",
  "clip-path",
  "opacity",
  "vector-effect",
  "shape-rendering",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "word-spacing",
  "text-anchor",
  "dominant-baseline",
  "marker-start",
  "marker-mid",
  "marker-end",
  "markerwidth",
  "markerheight",
  "markerunits",
  "refx",
  "refy",
  "orient",
  "style",
]);

function issue(code, message, detail = {}) {
  return { code, message, ...detail };
}

function findTagEnd(source, start) {
  let quote = "";
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return i;
    }
  }
  return -1;
}

function inspectAttributes(raw, tag, issues) {
  let offset = 0;
  const seen = new Set();
  while (offset < raw.length) {
    while (/\s/.test(raw[offset] || "")) offset++;
    if (offset >= raw.length) break;
    const nameMatch = raw.slice(offset).match(/^([A-Za-z_][A-Za-z0-9_.:-]*)/);
    if (!nameMatch) {
      issues.push(issue("SVG_ATTRIBUTE_SYNTAX_INVALID", `Malformed attribute syntax on <${tag}>.`));
      return;
    }
    const originalName = nameMatch[1];
    const name = originalName.toLowerCase();
    offset += originalName.length;
    while (/\s/.test(raw[offset] || "")) offset++;
    if (raw[offset] !== "=") {
      issues.push(issue("SVG_ATTRIBUTE_SYNTAX_INVALID", `Attribute ${originalName} on <${tag}> must have a quoted value.`));
      return;
    }
    offset++;
    while (/\s/.test(raw[offset] || "")) offset++;
    const quote = raw[offset];
    if (quote !== '"' && quote !== "'") {
      issues.push(issue("SVG_ATTRIBUTE_SYNTAX_INVALID", `Attribute ${originalName} on <${tag}> must use a quoted value.`));
      return;
    }
    offset++;
    const end = raw.indexOf(quote, offset);
    if (end < 0) {
      issues.push(issue("SVG_ATTRIBUTE_SYNTAX_INVALID", `Attribute ${originalName} on <${tag}> has an unterminated value.`));
      return;
    }
    const value = raw.slice(offset, end);
    offset = end + 1;
    if (seen.has(name)) {
      issues.push(issue("SVG_ATTRIBUTE_DUPLICATE", `Duplicate attribute ${originalName} is not allowed.`, {
        attribute: originalName,
      }));
    }
    seen.add(name);
    if (!PASSIVE_ATTRIBUTES.has(name)) {
      issues.push(issue("SVG_ATTRIBUTE_NOT_ALLOWED", `Attribute ${originalName} is outside the passive line-art allowlist.`, {
        attribute: originalName,
      }));
    }
    if (name === "xmlns" && value !== "http://www.w3.org/2000/svg") {
      issues.push(issue("SVG_NAMESPACE_INVALID", "The SVG root namespace must be http://www.w3.org/2000/svg."));
    }
  }
}

function inspectDocumentStructure(source) {
  const issues = [];
  const stack = [];
  let rootCount = 0;
  let offset = 0;
  const xmlDeclaration = source.slice(offset).match(/^\s*<\?xml\s+[^?]*\?>/i);
  if (xmlDeclaration) offset += xmlDeclaration[0].length;

  while (offset < source.length) {
    const next = source.indexOf("<", offset);
    const text = next < 0 ? source.slice(offset) : source.slice(offset, next);
    if (stack.length === 0 && text.trim()) {
      issues.push(issue("SVG_TEXT_OUTSIDE_ROOT", "Non-whitespace text outside the SVG document root is not allowed."));
    }
    if (next < 0) break;
    if (
      source.startsWith("<!--", next)
      || source.startsWith("<![CDATA[", next)
      || source.startsWith("<!", next)
      || source.startsWith("<?", next)
    ) {
      issues.push(issue("SVG_XML_CONSTRUCT_UNSAFE", "Comments, CDATA, declarations, and processing instructions are not allowed."));
      const terminator = source.startsWith("<!--", next)
        ? "-->"
        : source.startsWith("<![CDATA[", next)
          ? "]]>"
          : ">";
      const end = source.indexOf(terminator, next + 2);
      if (end < 0) break;
      offset = end + terminator.length;
      continue;
    }

    const end = findTagEnd(source, next + 1);
    if (end < 0) {
      issues.push(issue("SVG_XML_MALFORMED", "SVG contains an unterminated element."));
      break;
    }
    const token = source.slice(next, end + 1);
    const closing = token.match(/^<\s*\/\s*([A-Za-z_][A-Za-z0-9_.:-]*)\s*>$/);
    if (closing) {
      const tag = closing[1].toLowerCase();
      const expected = stack.pop();
      if (!expected || expected !== tag) {
        issues.push(issue("SVG_XML_MALFORMED", `Unexpected closing element </${closing[1]}>.`));
      }
      offset = end + 1;
      continue;
    }

    const opening = token.match(/^<\s*([A-Za-z_][A-Za-z0-9_.:-]*)([\s\S]*?)>$/);
    if (!opening) {
      issues.push(issue("SVG_XML_MALFORMED", "SVG contains malformed element syntax."));
      offset = end + 1;
      continue;
    }
    const originalTag = opening[1];
    const tag = originalTag.toLowerCase();
    let attributes = opening[2];
    const selfClosing = /\/\s*$/.test(attributes);
    if (selfClosing) attributes = attributes.replace(/\/\s*$/, "");

    if (stack.length === 0) {
      rootCount++;
      if (tag !== "svg") {
        issues.push(issue("SVG_ROOT_INVALID", "The single document root must be <svg>."));
      }
      if (rootCount > 1) {
        issues.push(issue("SVG_ROOT_INVALID", "SVG must contain exactly one document root."));
      }
    }
    if (originalTag.includes(":") || !PASSIVE_TAGS.has(tag)) {
      issues.push(issue("SVG_ELEMENT_NOT_ALLOWED", `Element <${originalTag}> is outside the passive line-art allowlist.`, {
        element: originalTag,
      }));
    }
    inspectAttributes(attributes, originalTag, issues);
    if (!selfClosing) stack.push(tag);
    offset = end + 1;
  }

  if (stack.length) {
    issues.push(issue("SVG_XML_MALFORMED", `Unclosed element <${stack.at(-1)}>.`));
  }
  if (rootCount !== 1) {
    issues.push(issue("SVG_ROOT_INVALID", "SVG must contain exactly one document root."));
  }
  return issues;
}

export function inspectSvgSafety(svg) {
  const source = String(svg || "");
  const issues = inspectDocumentStructure(source);

  if (!/^\s*(?:<\?xml\b[^?]*\?>\s*)?<svg\b/i.test(source)) {
    issues.push(issue("SVG_ROOT_INVALID", "SVG must contain a single SVG document root."));
  } else if (
    !/<\/svg>\s*$/i.test(source)
    && !/^\s*(?:<\?xml\b[^?]*\?>\s*)?<svg\b[^>]*\/>\s*$/i.test(source)
  ) {
    issues.push(issue("SVG_ROOT_INVALID", "SVG must end at its document root without trailing markup."));
  }
  if (/<!DOCTYPE\b|<!ENTITY\b|\]\s*>/i.test(source)) {
    issues.push(issue("SVG_XML_DECLARATION_UNSAFE", "DTD and entity declarations are not allowed."));
  }
  const withoutXmlDeclaration = source.replace(/^\s*<\?xml\b[^?]*\?>/i, "");
  if (/<\?[\s\S]*?\?>/.test(withoutXmlDeclaration)) {
    issues.push(issue("SVG_PROCESSING_INSTRUCTION_UNSAFE", "XML processing instructions are not allowed."));
  }

  const activeTag = source.match(ACTIVE_TAG_RE);
  if (activeTag) {
    issues.push(issue(
      "SVG_ACTIVE_TAG",
      `Active or externally loading SVG element ${activeTag[0].replace(/\s+/g, " ").trim()} is not allowed.`,
      { construct: activeTag[0].replace(/[<\s]/g, "") },
    ));
  }

  for (const match of source.matchAll(EVENT_ATTRIBUTE_RE)) {
    issues.push(issue("SVG_EVENT_ATTRIBUTE", `Event-handler attribute ${match[1]} is not allowed.`, {
      attribute: match[1],
    }));
  }

  for (const match of source.matchAll(HREF_RE)) {
    const value = String(match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!/^#[A-Za-z_][A-Za-z0-9_.:-]*$/.test(value)) {
      issues.push(issue("SVG_EXTERNAL_REFERENCE", "Only same-document fragment references are allowed.", {
        reference: value.slice(0, 160),
      }));
    }
  }
  for (const match of source.matchAll(XML_BASE_RE)) {
    const value = String(match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (value) {
      issues.push(issue("SVG_EXTERNAL_BASE", "xml:base is not allowed in an inline drawing SVG."));
    }
  }

  for (const match of source.matchAll(STYLE_ATTRIBUTE_RE)) {
    const value = match[2];
    if (ACTIVE_CSS_RE.test(value)) {
      issues.push(issue("SVG_ACTIVE_STYLE", "Active or externally loading inline CSS is not allowed."));
    }
  }

  for (const match of source.matchAll(URL_FUNCTION_RE)) {
    const value = match[2].trim();
    if (!/^#[A-Za-z_][A-Za-z0-9_.:-]*$/.test(value)) {
      issues.push(issue("SVG_EXTERNAL_URL", "CSS/SVG url() values must be same-document fragments.", {
        reference: value.slice(0, 160),
      }));
    }
  }

  if (/(?:javascript|vbscript|data|file|https?):\s*/i.test(
    source.replace(/\bxmlns(?::[A-Za-z0-9_-]+)?\s*=\s*(["']).*?\1/gi, ""),
  )) {
    issues.push(issue("SVG_EXTERNAL_SCHEME", "Executable, data, file, and network URL schemes are not allowed."));
  }

  return { safe: issues.length === 0, issues };
}

export function assertSafeSvg(svg, label = "SVG") {
  const result = inspectSvgSafety(svg);
  if (!result.safe) {
    const detail = result.issues.map((item) => item.code).join(", ");
    const error = new Error(`${label} contains unsafe or active SVG content: ${detail}`);
    error.code = "APA_UNSAFE_SVG";
    error.issues = result.issues;
    throw error;
  }
  return result;
}

export default { assertSafeSvg, inspectSvgSafety };
