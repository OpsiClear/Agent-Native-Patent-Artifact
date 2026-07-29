# Local APA MCP server

The MCP server exposes one configured harness matter to Codex, Claude, ChatGPT, or another MCP
client. It is an interface over `@apa/application`; it is not a second workflow or state store.

## Start

From the repository:

```sh
npm install
node apps/mcp-server/server.mjs --matter /absolute/path/to/matter
```

After workspace installation, the equivalent binary is:

```sh
apa-mcp --matter /absolute/path/to/matter
```

A generic stdio client configuration is:

```json
{
  "mcpServers": {
    "apa": {
      "command": "node",
      "args": [
        "/absolute/path/to/Agent-Native-Patent-Artifact/apps/mcp-server/server.mjs",
        "--matter",
        "/absolute/path/to/matter"
      ]
    }
  }
}
```

Use the current configuration format documented by the selected host. Keep the matter argument local
and absolute; do not commit a confidential matter path into this repository.

## Resources

| URI | Default content |
|---|---|
| `apa://matter/summary` | Matter type, ledger head, review counts, current artifact hashes |
| `apa://matter/workflow` | Executor, proposal, gate, checkpoint, invalidation, alternative, and loop policy |
| `apa://matter/status` | Ledger-derived stage states and reason codes |
| `apa://matter/proposals` | Proposal IDs, types, hashes, actors, and decision status |
| `apa://matter/artifacts` | Current adopted IDs, revisions, hashes, and decision references |

These resources deliberately omit proposal and artifact bytes, local filesystem roots, and external
source paths.

## Tools

Read-only:

- `apa_head`
- `apa_plan`
- `apa_summary`
- `apa_verify`

Mutating:

- `apa_propose`
- `apa_adopt`
- `apa_reject`
- `apa_record_checkpoint`
- `apa_request_loop`

Every mutating tool requires:

- the exact `expectedHead` returned by `apa_head` or the preceding mutation;
- a caller-stable `idempotencyKey`;
- an identified actor;
- an identified human reviewer for adoption or rejection.

`apa_propose` accepts an explicit workflow stage and otherwise infers common stages from artifact
types such as `claims`, `specification`, and `drawings`. `apa_record_checkpoint` accepts only a
checkpoint or `gate:*` identifier declared by that stage. It records the identified human reviewer
and the exact pre-event ledger head reviewed, so a later artifact adoption or rerun makes an older
checkpoint stale instead of silently carrying it forward.

The server has no unrestricted filesystem tool and cannot address a different matter after startup.
An MCP host can still transmit tool inputs or returned metadata to its model provider. Review the
host's model, retention, telemetry, and tracing settings before using confidential material.

## Human boundary

`apa_adopt` records review of exact proposal bytes. It does not represent a patentability opinion or
filing authorization. APA refuses signature, certification, fee-payment, and filing-submission
artifact types, and it never operates Patent Center.
