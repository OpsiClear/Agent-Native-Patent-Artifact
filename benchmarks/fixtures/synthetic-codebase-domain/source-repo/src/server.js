const express = require("express");
const app = express();

app.post("/encode", (req, res) => {
  res.json({ ok: true });
});

function authenticateRequest(req) {
  return Boolean(req);
}
