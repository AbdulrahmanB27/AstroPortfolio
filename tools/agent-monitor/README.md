# Agent Monitor

Real-time monitoring dashboard for Claude Code AI agents.

## Architecture

```
Claude Code Session
  │
  ├─ SessionStart ──┐
  ├─ PreToolUse ────┤
  ├─ PostToolUse ───┤  hook: node emit-event.js
  ├─ SubagentStart ─┤  (reads stdin JSON, appends to JSONL + updates agents.json)
  ├─ SubagentStop ──┤
  └─ SessionEnd ────┘
                    │
                    ▼
        ~/.claude-monitor/
          events.jsonl    ← append-only event log
          agents.json     ← current agent states
                    │
                    ▼
        Dashboard Server (Express + WebSocket)
        localhost:9100
          │
          ├─ Polls files every 1s
          ├─ Pushes state via WebSocket
          └─ Serves dashboard.html
```

## Setup

```bash
cd tools/agent-monitor
npm install
node setup.js    # installs hooks into ~/.claude/settings.json
```

## Usage

```bash
node server.js   # opens dashboard at http://localhost:9100
```

Or: `npm start`

## Event Flow

1. Claude Code fires a hook event (e.g. `PreToolUse`)
2. Hook config invokes `node emit-event.js` with JSON on stdin
3. `emit-event.js` appends event to `~/.claude-monitor/events.jsonl`
4. `emit-event.js` upserts agent state in `~/.claude-monitor/agents.json`
5. Dashboard server polls these files every second
6. New data is pushed to connected browsers via WebSocket

## Dashboard Panels

- **Header**: Connection status, active/idle/error/total badges, project filter
- **Agent Table**: All detected agents with state, tool, task, runtime
- **Agent Detail**: Click a row to see recent events for that agent
- **Event Stream**: Real-time scrolling feed of all events

## Agent States

| State | Color | Meaning |
|-------|-------|---------|
| running_tool | Green | Currently executing a tool |
| idle | Blue | Between tool calls |
| error | Red | Last tool call failed |
| completed | Gray | Session or subagent ended |
| stalled | Yellow | No activity for >60s (dashboard-inferred) |

## Hook Events Captured

| Event | Trigger |
|-------|---------|
| SessionStart | Claude Code session begins |
| SessionEnd | Session terminates |
| PreToolUse | Before tool execution |
| PostToolUse | After successful tool execution |
| PostToolUseFailure | After tool error |
| SubagentStart | Subagent spawned |
| SubagentStop | Subagent finished |

## Adding New Event Sources

Create a new script that writes to the same JSONL format:

```js
const { appendEvent, readAgents, writeAgents } = require('./db')

appendEvent({
  session_id: 'my-source-123',
  agent_id: null,
  agent_type: 'custom',
  event_type: 'CustomEvent',
  tool_name: null,
  project: '/path/to/project',
  summary: 'Description of what happened',
})
```

Then update agents.json following the same schema as emit-event.js.

## Configuration

- **Port**: Set `MONITOR_PORT` env var (default: 9100)
- **Retention**: Events older than 7 days are purged on server startup
- **Stale threshold**: 60s no activity = yellow, 300s = red (dashboard-side)

## Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies (express, ws) |
| `db.js` | File I/O helpers for events.jsonl and agents.json |
| `emit-event.js` | Hook script — reads stdin, writes event + agent state |
| `server.js` | Express + WebSocket server, polls files, serves dashboard |
| `setup.js` | Installs hooks into ~/.claude/settings.json |
| `dashboard.html` | Single-file web dashboard (inline CSS/JS) |
