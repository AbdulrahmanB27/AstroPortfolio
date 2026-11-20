# Agent Monitor — Design Spec

## Overview

A unified AI agent monitoring dashboard that observes Claude Code sessions system-wide and displays agent activity in real time via a web UI.

## Architecture

**Approach: Hook-Direct**

Claude Code hooks fire `node emit-event.js` (async, non-blocking) on every significant event. The script reads JSON from stdin and writes directly to a shared SQLite database. A separate dashboard server polls the database and pushes updates to connected browsers via WebSocket.

```
Claude Code Hook → node emit-event.js → SQLite (WAL) → Dashboard Server → WebSocket → Browser
```

Key properties:
- Hooks are fire-and-forget (async: true), never block Claude Code
- Data accumulates even when the dashboard isn't running
- Dashboard server is optional — start it when you want to watch
- System-wide: hooks in ~/.claude/settings.json, captures all sessions

## File Structure

```
tools/agent-monitor/
  package.json              ← dependencies: better-sqlite3, express, ws
  emit-event.js             ← hook script: reads stdin JSON, writes SQLite
  server.js                 ← dashboard server: Express + WebSocket + SQLite polling
  db.js                     ← shared SQLite init/helpers
  setup.js                  ← one-time setup: creates DB dir, installs hooks
  dashboard.html            ← single-file web dashboard (inline CSS/JS)
  README.md                 ← usage docs

~/.claude-monitor/
  monitor.db                ← SQLite database (auto-created)

~/.claude/settings.json     ← hook configuration (system-wide)
```

## Database Schema

```sql
-- Raw event log (append-only)
CREATE TABLE events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp   TEXT DEFAULT (datetime('now')),
  session_id  TEXT,
  agent_id    TEXT,
  agent_type  TEXT,
  event_type  TEXT,
  tool_name   TEXT,
  project     TEXT,
  payload     TEXT
);

-- Derived agent state (upserted per event)
CREATE TABLE agents (
  agent_key    TEXT PRIMARY KEY,
  session_id   TEXT,
  agent_id     TEXT,
  agent_type   TEXT,
  project      TEXT,
  state        TEXT,
  current_tool TEXT,
  last_summary TEXT,
  started_at   TEXT,
  last_seen    TEXT,
  error_count  INTEGER DEFAULT 0
);

CREATE INDEX idx_events_session ON events(session_id);
CREATE INDEX idx_events_timestamp ON events(timestamp);
CREATE INDEX idx_agents_state ON agents(state);
```

## Event Schema

Hook events captured:
- SessionStart (source, model, agent_type)
- SessionEnd (reason)
- PreToolUse (tool_name, tool_input)
- PostToolUse (tool_name, tool_response)
- PostToolUseFailure (tool_name, error)
- SubagentStart (agent_id, agent_type)
- SubagentStop (agent_id, result)

## State Inference

| Event              | State Set      | Notes                          |
|--------------------|----------------|--------------------------------|
| SessionStart       | idle           | Creates agent row              |
| PreToolUse         | running_tool   | Sets current_tool              |
| PostToolUse        | idle           | Clears current_tool            |
| PostToolUseFailure | error          | Increments error_count         |
| SubagentStart      | idle           | Creates new agent row          |
| SubagentStop       | completed      | Final state                    |
| SessionEnd         | completed      | Final state                    |

Stale detection (dashboard-side):
- >60s since last_seen with no SessionEnd → yellow (stalled)
- >5min since last_seen with no SessionEnd → red (likely crashed)

## Dashboard UI

Web dashboard at localhost:9100. Dark theme. Four panels:

### Header
- Title, stat badges (Active/Idle/Error/Total), project filter dropdown

### Agent Table (60% viewport)
- Columns: Status | Name | Type | Project | State | Tool | Task | Runtime | Last Seen
- Click row to expand detail view
- Color-coded states: green=running_tool, blue=idle, red=error, gray=completed, yellow=stalled

### Agent Detail (expandable)
- Recent events for selected agent (last 50)
- Tool usage counts
- Error log
- Event timeline

### Event Stream (right sidebar, 40%)
- Real-time scrolling feed across all agents
- Color-coded by event type
- Pause/resume toggle

### WebSocket Protocol
Server pushes `{ agents: [...], recentEvents: [...], stats: {...} }` every 1 second.
Dashboard diffs and updates DOM. Vanilla JS, no framework.

## Hook Configuration

All hooks registered in ~/.claude/settings.json as async command hooks:

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "node <abs-path>/emit-event.js", "async": true }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "node <abs-path>/emit-event.js", "async": true }] }],
    "PreToolUse": [{ "hooks": [{ "type": "command", "command": "node <abs-path>/emit-event.js", "async": true }] }],
    "PostToolUse": [{ "hooks": [{ "type": "command", "command": "node <abs-path>/emit-event.js", "async": true }] }],
    "PostToolUseFailure": [{ "hooks": [{ "type": "command", "command": "node <abs-path>/emit-event.js", "async": true }] }],
    "SubagentStart": [{ "hooks": [{ "type": "command", "command": "node <abs-path>/emit-event.js", "async": true }] }],
    "SubagentStop": [{ "hooks": [{ "type": "command", "command": "node <abs-path>/emit-event.js", "async": true }] }]
  }
}
```

## Setup & Usage

```bash
cd tools/agent-monitor && npm install
node setup.js          # creates ~/.claude-monitor/, installs hooks
node server.js         # http://localhost:9100
```

## Retention

Events older than 7 days purged on dashboard startup. SQLite WAL mode + auto-vacuum.

## V1 Limitations

- No IDE/Antigravity adapter yet (placeholder only)
- No task board / kanban view
- No persistent agent naming (uses session_id:agent_id)
- No authentication on dashboard server
- Single-machine only
