import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { browserExecutable, dumpDom } from "./helpers/browser.mjs";

test("real browser invalidates old approvals after claim changes and form regeneration", async t => {
  const executable = browserExecutable();
  if (!executable) { t.skip("Chrome/Edge/Chromium is not installed"); return; }
  const matter = mkdtempSync(join(tmpdir(), "apa-review-browser-"));
  let server;
  try {
    cpSync("examples/minimal-patent-artifact", matter, { recursive: true });
    const generate = () => {
      const generated = spawnSync(process.execPath, ["skills/apa-review-form/scripts/generate_review_form.mjs", "--matter", matter], { encoding: "utf8", windowsHide: true });
      assert.equal(generated.status, 0, generated.stderr);
      const html = readFileSync(join(matter, "assembled/human_review_form.html"), "utf8");
      return { html, data: JSON.parse(html.match(/<script type="application\/json" id="review-data">([\s\S]*?)<\/script>/)[1]) };
    };
    const old = generate();
    const claimsPath = join(matter, "logic/claims.md");
    writeFileSync(claimsPath, readFileSync(claimsPath, "utf8") + "\nChanged synthetic claim review target.\n");
    const current = generate();
    assert.notEqual(old.data.reviewTargetFingerprint.sha256, current.data.reviewTargetFingerprint.sha256);
    const saved = { schema: "apa-review-answers-v1", matterId: old.data.matterId,
      targetFingerprint: old.data.reviewTargetFingerprint, answers: { reviewPages: { claims: { CLM01: { status: "OK" } } } } };
    const bootstrap = `<script>localStorage.setItem(${JSON.stringify("apa-review-form:" + saved.matterId)}, ${JSON.stringify(JSON.stringify(saved))});</script>`;
    const assertion = '<script>document.body.dataset.approvalState = answers.reviewPages?.claims?.CLM01?.status ? "stale-present" : "fresh-empty";</script>';
    const html = current.html.replace("<head>", "<head>" + bootstrap).replace("</body>", assertion + "</body>");
    server = createServer((req, res) => res.writeHead(200, { "content-type": "text/html" }).end(html));
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const dom = await dumpDom(executable, `http://127.0.0.1:${server.address().port}/`);
    assert.equal(dom.match(/data-approval-state="([^"]*)"/)?.[1], "fresh-empty");
    assert.match(dom, /id="review-notice"[^>]*>Saved answers refer to an older/);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    rmSync(matter, { recursive: true, force: true });
  }
});
