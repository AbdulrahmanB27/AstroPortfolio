# Agent Monitor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a system-wide Claude Code agent monitoring dashboard with hook-based event collection, SQLite storage, and a live web UI.

**Architecture:** Claude Code hooks fire `node emit-event.js` (async) on 7 event types, writing to `~/.claude-monitor/monitor.db` (SQLite WAL). A separate Express+WebSocket server polls SQLite every second and pushes state to a browser dashboard at localhost:9100.

**Tech Stack:** Node.js, better-sqlite3, Express, ws (WebSocket), vanilla HTML/CSS/JS dashboard

**Spec:** `docs/superpowers/specs/2026-03-11-agent-monitor-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `tools/agent-monitor/package.json` | Dependencies and npm scripts |
| `tools/agent-monitor/db.js` | SQLite init, schema creation, query helpers |
| `tools/agent-monitor/emit-event.js` | Hook script: read stdin JSON, write event + upsert agent state |
| `tools/agent-monitor/server.js` | Express HTTP + WebSocket server, SQLite polling, serves dashboard |
| `tools/agent-monitor/setup.js` | One-time: create DB dir, merge hooks into ~/.claude/settings.json |
| `tools/agent-monitor/dashboard.html` | Single-file web dashboard with inline CSS/JS |
| `tools/agent-monitor/README.md` | Usage documentation |

---

## Chunk 1: Foundation (package.json + db.js)

### Task 1: Create package.json

**Files:**
- Create: `tools/agent-monitor/package.json`

- [ ] **Step 1: Create the tools/agent-monitor directory**

```bash
mkdir -p tools/agent-monitor
```

- [ ] **Step 2: Write package.json**

```json
{
  "name": "agent-monitor",
  "version": "1.0.0",
  "private": true,
  "description": "Claude Code agent monitoring dashboard",
  "scripts": {
    "start": "node server.js",
    "setup": "node setup.js"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "express": "^5.1.0",
    "ws": "^8.18.0"
  }
}
```

- [ ] **Step 3: Install dependencies**

```bash
cd tools/agent-monitor && npm install
```
Expected: node_modules created, package-lock.json generated, 0 vulnerabilities.

- [ ] **Step 4: Add to .gitignore**

Append to root `.gitignore`:
```
tools/agent-monitor/node_modules
```

- [ ] **Step 5: Commit**

```bash
git add tools/agent-monitor/package.json tools/agent-monitor/package-lock.json .gitignore
git commit -m "feat(agent-monitor): init package with better-sqlite3, express, ws"
```

---

### Task 2: Create db.js (SQLite helpers)

**Files:**
- Create: `tools/agent-monitor/db.js`

- [ ] **Step 1: Write db.js**

```js
const Database = require('better-sqlite3')
const path = require('path')
const os = require('os')
const fs = require('fs')

const DB_DIR = path.join(os.homedir(), '.claude-monitor')
const DB_PATH = path.join(DB_DIR, 'monitor.db')

function getDb() {
  fs.mkdirSync(DB_DIR, { recursive: true })

  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 3000')

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
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

    CREATE TABLE IF NOT EXISTS agents (
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

    CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_agents_state ON agents(state);
  `)

  return db
}

function purgeOldEvents(db, days = 7) {
  db.prepare(
    `DELETE FROM events WHERE timestamp < datetime('now', '-' || ? || ' days')`
  ).run(days)
}

module.exports = { getDb, purgeOldEvents, DB_DIR, DB_PATH }
```

- [ ] **Step 2: Smoke test db.js**

```bash
cd tools/agent-monitor && node -e "const {getDb}=require('./db');const db=getDb();console.log(db.prepare('SELECT count(*) as n FROM events').get());db.close()"
```
Expected: `{ n: 0 }` — database created at ~/.claude-monitor/monitor.db.

- [ ] **Step 3: Commit**

```bash
git add tools/agent-monitor/db.js
git commit -m "feat(agent-monitor): add db.js with SQLite schema and helpers"
```

---

## Chunk 2: Event Emitter (emit-event.js)

### Task 3: Create emit-event.js (hook script)

**Files:**
- Create: `tools/agent-monitor/emit-event.js`

- [ ] **Step 1: Write emit-event.js**

This script is invoked by Claude Code hooks. It reads JSON from stdin and writes to SQLite.

```js
#!/usr/bin/env node
const { getDb } = require('./db')

function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => { data += chunk })
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(data)) }
      catch { resolve(null) }
    })
    // Timeout safety: if no stdin arrives in 5s, bail
    setTimeout(() => resolve(null), 5000)
  })
}

function deriveState(eventType) {
  switch (eventType) {
    case 'SessionStart': return 'idle'
    case 'PreToolUse': return 'running_tool'
    case 'PostToolUse': return 'idle'
    case 'PostToolUseFailure': return 'error'
    case 'SubagentStart': return 'idle'
    case 'SubagentStop': return 'completed'
    case 'SessionEnd': return 'completed'
    default: return 'idle'
  }
}

function buildSummary(input) {
  const event = input.hook_event_name
  if (event === 'PreToolUse' || event === 'PostToolUse' || event === 'PostToolUseFailure') {
    const tool = input.tool_name || ''
    const ti = input.tool_input || {}
    if (tool === 'Bash') return `Bash: ${(ti.command || '').slice(0, 80)}`
    if (tool === 'Read') return `Read: ${(ti.file_path || '').split(/[/\\]/).pop()}`
    if (tool === 'Write') return `Write: ${(ti.file_path || '').split(/[/\\]/).pop()}`
    if (tool === 'Edit') return `Edit: ${(ti.file_path || '').split(/[/\\]/).pop()}`
    if (tool === 'Grep') return `Grep: ${(ti.pattern || '').slice(0, 60)}`
    if (tool === 'Glob') return `Glob: ${(ti.pattern || '').slice(0, 60)}`
    if (tool === 'Agent') return `Agent: ${ti.subagent_type || 'general'} — ${(ti.description || '').slice(0, 50)}`
    return `${tool}`
  }
  if (event === 'SessionStart') return `Session started (${input.source || 'startup'})`
  if (event === 'SessionEnd') return `Session ended (${input.reason || 'unknown'})`
  if (event === 'SubagentStart') return `Subagent ${input.agent_type || 'unknown'} started`
  if (event === 'SubagentStop') return `Subagent ${input.agent_type || 'unknown'} ${input.result || 'stopped'}`
  return event
}

async function main() {
  const input = await readStdin()
  if (!input || !input.hook_event_name) process.exit(0)

  const db = getDb()
  const eventType = input.hook_event_name
  const sessionId = input.session_id || 'unknown'
  const toolName = input.tool_name || null
  const project = input.cwd || null

  // For subagent events, agent_id comes from the event payload
  // For main session events, agent_id is null (main session)
  let agentId = null
  let agentType = 'main'
  if (eventType === 'SubagentStart' || eventType === 'SubagentStop') {
    agentId = input.agent_id || null
    agentType = input.agent_type || 'unknown'
  }

  const agentKey = agentId ? `${sessionId}:${agentId}` : `${sessionId}:main`

  // Insert event
  db.prepare(`
    INSERT INTO events (session_id, agent_id, agent_type, event_type, tool_name, project, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(sessionId, agentId, agentType, eventType, toolName, project, JSON.stringify(input))

  // Upsert agent state
  const state = deriveState(eventType)
  const summary = buildSummary(input)
  const now = new Date().toISOString()
  const currentTool = eventType === 'PreToolUse' ? toolName : (eventType === 'PostToolUse' || eventType === 'PostToolUseFailure' ? null : undefined)

  const existing = db.prepare('SELECT * FROM agents WHERE agent_key = ?').get(agentKey)

  if (existing) {
    const updates = {
      state,
      last_seen: now,
      last_summary: summary,
      project: project || existing.project,
      error_count: eventType === 'PostToolUseFailure' ? existing.error_count + 1 : existing.error_count,
    }
    if (currentTool !== undefined) updates.current_tool = currentTool

    const setClauses = Object.keys(updates).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE agents SET ${setClauses} WHERE agent_key = @agent_key`).run({
      ...updates,
      agent_key: agentKey,
    })
  } else {
    db.prepare(`
      INSERT INTO agents (agent_key, session_id, agent_id, agent_type, project, state, current_tool, last_summary, started_at, last_seen, error_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(agentKey, sessionId, agentId, agentType, project, state, currentTool === undefined ? null : currentTool, summary, now, now)
  }

  db.close()
  process.exit(0)
}

main().catch(() => process.exit(0))
```

- [ ] **Step 2: Test emit-event.js with simulated hook input**

```bash
cd tools/agent-monitor && echo '{"hook_event_name":"SessionStart","session_id":"test-123","cwd":"/tmp/test","source":"startup","model":"claude-opus-4-6"}' | node emit-event.js
```
Then verify:
```bash
node -e "const {getDb}=require('./db');const db=getDb();console.log(db.prepare('SELECT * FROM agents').all());console.log(db.prepare('SELECT * FROM events').all());db.close()"
```
Expected: 1 agent row (state=idle, agent_key=test-123:main), 1 event row.

- [ ] **Step 3: Test tool use flow**

```bash
cd tools/agent-monitor
echo '{"hook_event_name":"PreToolUse","session_id":"test-123","cwd":"/tmp/test","tool_name":"Bash","tool_input":{"command":"ls -la"}}' | node emit-event.js
echo '{"hook_event_name":"PostToolUse","session_id":"test-123","cwd":"/tmp/test","tool_name":"Bash","tool_input":{"command":"ls -la"},"tool_response":"total 0"}' | node emit-event.js
node -e "const {getDb}=require('./db');const db=getDb();const a=db.prepare('SELECT * FROM agents WHERE agent_key=?').get('test-123:main');console.log('state:',a.state,'tool:',a.current_tool,'events:',db.prepare('SELECT count(*) as n FROM events').get().n);db.close()"
```
Expected: state=idle, tool=null, events=3.

- [ ] **Step 4: Commit**

```bash
git add tools/agent-monitor/emit-event.js
git commit -m "feat(agent-monitor): add emit-event.js hook script with state inference"
```

---

## Chunk 3: Dashboard Server (server.js)

### Task 4: Create server.js

**Files:**
- Create: `tools/agent-monitor/server.js`

- [ ] **Step 1: Write server.js**

```js
const express = require('express')
const { WebSocketServer } = require('ws')
const http = require('http')
const path = require('path')
const { getDb, purgeOldEvents } = require('./db')

const PORT = process.env.MONITOR_PORT || 9100
const POLL_INTERVAL = 1000

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ server })

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'))
})

// REST API for initial load and detail views
app.get('/api/agents', (req, res) => {
  const db = getDb()
  const agents = db.prepare('SELECT * FROM agents ORDER BY last_seen DESC').all()
  db.close()
  res.json(agents)
})

app.get('/api/events', (req, res) => {
  const db = getDb()
  const limit = parseInt(req.query.limit) || 100
  const sessionId = req.query.session_id
  const agentKey = req.query.agent_key

  let query = 'SELECT * FROM events'
  const params = []
  const conditions = []

  if (sessionId) { conditions.push('session_id = ?'); params.push(sessionId) }
  if (agentKey) {
    const [sid, aid] = agentKey.split(':')
    conditions.push('session_id = ?'); params.push(sid)
    if (aid === 'main') { conditions.push('agent_id IS NULL') }
    else { conditions.push('agent_id = ?'); params.push(aid) }
  }

  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ')
  query += ' ORDER BY id DESC LIMIT ?'
  params.push(limit)

  const events = db.prepare(query).all(...params)
  db.close()
  res.json(events)
})

app.get('/api/stats', (req, res) => {
  const db = getDb()
  const total = db.prepare('SELECT count(*) as n FROM agents').get().n
  const active = db.prepare("SELECT count(*) as n FROM agents WHERE state IN ('idle','running_tool')").get().n
  const errors = db.prepare("SELECT count(*) as n FROM agents WHERE state = 'error'").get().n
  const completed = db.prepare("SELECT count(*) as n FROM agents WHERE state = 'completed'").get().n
  const projects = db.prepare('SELECT DISTINCT project FROM agents WHERE project IS NOT NULL').all().map(r => r.project)
  db.close()
  res.json({ total, active, errors, completed, idle: active, projects })
})

// WebSocket: push updates every POLL_INTERVAL
let lastEventId = 0

function broadcast() {
  if (wss.clients.size === 0) return

  const db = getDb()
  const agents = db.prepare('SELECT * FROM agents ORDER BY last_seen DESC').all()
  const newEvents = db.prepare('SELECT * FROM events WHERE id > ? ORDER BY id DESC LIMIT 50').all(lastEventId)
  const stats = {
    total: agents.length,
    active: agents.filter(a => a.state === 'idle' || a.state === 'running_tool').length,
    errors: agents.filter(a => a.state === 'error').length,
    completed: agents.filter(a => a.state === 'completed').length,
  }

  if (newEvents.length > 0) lastEventId = newEvents[0].id

  const payload = JSON.stringify({ agents, recentEvents: newEvents, stats })
  db.close()

  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload)
  }
}

// Startup
const db = getDb()
purgeOldEvents(db)
const latest = db.prepare('SELECT max(id) as maxId FROM events').get()
lastEventId = latest.maxId || 0
db.close()

setInterval(broadcast, POLL_INTERVAL)

server.listen(PORT, () => {
  console.log(`Agent Monitor dashboard: http://localhost:${PORT}`)
})
```

- [ ] **Step 2: Smoke test server startup**

```bash
cd tools/agent-monitor && node -e "const s=require('http').createServer();s.listen(9100,()=>{console.log('port ok');s.close()})" && echo "Port available"
```
Then:
```bash
cd tools/agent-monitor && timeout 3 node server.js || true
```
Expected: prints `Agent Monitor dashboard: http://localhost:9100` then times out (no dashboard.html yet, that's ok).

- [ ] **Step 3: Commit**

```bash
git add tools/agent-monitor/server.js
git commit -m "feat(agent-monitor): add Express+WebSocket dashboard server"
```

---

## Chunk 4: Web Dashboard (dashboard.html)

### Task 5: Create dashboard.html

**Files:**
- Create: `tools/agent-monitor/dashboard.html`

- [ ] **Step 1: Write dashboard.html**

Single self-contained HTML file with inline CSS and JS. Dark theme. Four panels: header stats, agent table, agent detail, event stream.

The file is large (~500 lines) but self-contained. Key sections:

**CSS:** Dark theme (`#0a0e17` background, `#1a1f2e` panels), monospace font, color-coded state badges, responsive grid layout.

**HTML structure:**
```
header.stats-bar > .stat-badge * 4 + select#project-filter
main.grid >
  section#agent-table (left 60%)
  section#event-stream (right 40%)
section#agent-detail (full width, hidden by default)
```

**JS:**
- WebSocket connection to `ws://localhost:9100`
- On message: parse JSON, update stats badges, rebuild agent table rows, append events to stream
- Click agent row → fetch `/api/events?agent_key=X` → render detail panel
- Stale detection: compare `last_seen` to now, >60s = yellow, >300s = red
- Project filter: show/hide agents by project
- Event stream pause/resume toggle
- Auto-reconnect on WebSocket close

(Full implementation in the file — see step below.)

- [ ] **Step 2: Write the full dashboard.html file**

Write the complete file with all HTML, CSS, and JS inline. The file implements the full dashboard UI described in the design spec.

- [ ] **Step 3: Test end-to-end**

Terminal 1:
```bash
cd tools/agent-monitor && node server.js
```

Terminal 2 (simulate some events):
```bash
cd tools/agent-monitor
echo '{"hook_event_name":"SessionStart","session_id":"demo-1","cwd":"c:/Dev/PortfolioClaude","source":"startup","model":"claude-opus-4-6"}' | node emit-event.js
echo '{"hook_event_name":"PreToolUse","session_id":"demo-1","cwd":"c:/Dev/PortfolioClaude","tool_name":"Read","tool_input":{"file_path":"src/App.jsx"}}' | node emit-event.js
echo '{"hook_event_name":"PostToolUse","session_id":"demo-1","cwd":"c:/Dev/PortfolioClaude","tool_name":"Read","tool_input":{"file_path":"src/App.jsx"},"tool_response":"..."}' | node emit-event.js
echo '{"hook_event_name":"SubagentStart","session_id":"demo-1","cwd":"c:/Dev/PortfolioClaude","agent_id":"agent-abc","agent_type":"Explore"}' | node emit-event.js
echo '{"hook_event_name":"PreToolUse","session_id":"demo-1","cwd":"c:/Dev/PortfolioClaude","tool_name":"Grep","tool_input":{"pattern":"useStore"}}' | node emit-event.js
```

Open browser to http://localhost:9100.
Expected: dashboard shows 2 agents (demo-1:main and demo-1:agent-abc), event stream shows 5 events, stats show 2 active.

- [ ] **Step 4: Commit**

```bash
git add tools/agent-monitor/dashboard.html
git commit -m "feat(agent-monitor): add live web dashboard with agent table and event stream"
```

---

## Chunk 5: Setup Script + Hook Wiring

### Task 6: Create setup.js

**Files:**
- Create: `tools/agent-monitor/setup.js`

- [ ] **Step 1: Write setup.js**

```js
#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const os = require('os')

const CLAUDE_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json')
const EMIT_SCRIPT = path.resolve(__dirname, 'emit-event.js')
const DB_DIR = path.join(os.homedir(), '.claude-monitor')

// Ensure DB directory exists
fs.mkdirSync(DB_DIR, { recursive: true })
console.log(`[OK] Database directory: ${DB_DIR}`)

// Read existing settings or create new
let settings = {}
if (fs.existsSync(CLAUDE_SETTINGS)) {
  try {
    settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8'))
    console.log(`[OK] Read existing settings: ${CLAUDE_SETTINGS}`)
  } catch {
    console.log(`[WARN] Could not parse ${CLAUDE_SETTINGS}, starting fresh`)
  }
} else {
  fs.mkdirSync(path.dirname(CLAUDE_SETTINGS), { recursive: true })
  console.log(`[OK] Creating new settings file: ${CLAUDE_SETTINGS}`)
}

if (!settings.hooks) settings.hooks = {}

const HOOK_EVENTS = [
  'SessionStart', 'SessionEnd',
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'SubagentStart', 'SubagentStop',
]

const command = `node "${EMIT_SCRIPT}"`
let added = 0
let skipped = 0

for (const event of HOOK_EVENTS) {
  if (!settings.hooks[event]) settings.hooks[event] = []

  // Check if our hook already exists
  const alreadyInstalled = settings.hooks[event].some(entry =>
    entry.hooks && entry.hooks.some(h => h.command && h.command.includes('emit-event.js'))
  )

  if (alreadyInstalled) {
    skipped++
    continue
  }

  settings.hooks[event].push({
    hooks: [{ type: 'command', command, async: true }]
  })
  added++
}

fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2))
console.log(`[OK] Hooks installed: ${added} added, ${skipped} already present`)
console.log(`[OK] Settings written to: ${CLAUDE_SETTINGS}`)
console.log('')
console.log('Setup complete! Start the dashboard:')
console.log('  cd tools/agent-monitor && node server.js')
```

- [ ] **Step 2: Dry-run test setup.js**

First back up existing settings if any:
```bash
cp ~/.claude/settings.json ~/.claude/settings.json.bak 2>/dev/null; echo "backed up or no file"
```

Then run:
```bash
cd tools/agent-monitor && node setup.js
```
Expected: prints OK messages, 7 hooks added.

Verify:
```bash
node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync(require('path').join(require('os').homedir(),'.claude','settings.json'),'utf8')).hooks,null,2))"
```
Expected: 7 hook entries with emit-event.js commands.

- [ ] **Step 3: Test idempotency**

```bash
cd tools/agent-monitor && node setup.js
```
Expected: 0 added, 7 already present.

- [ ] **Step 4: Commit**

```bash
git add tools/agent-monitor/setup.js
git commit -m "feat(agent-monitor): add setup.js for hook installation"
```

---

## Chunk 6: Documentation + Final Verification

### Task 7: Create README.md

**Files:**
- Create: `tools/agent-monitor/README.md`

- [ ] **Step 1: Write README.md**

Document: architecture diagram, event flow, adapters, how to run, how to add sources.

- [ ] **Step 2: Commit**

```bash
git add tools/agent-monitor/README.md
git commit -m "docs(agent-monitor): add README with architecture and usage guide"
```

### Task 8: End-to-end verification

- [ ] **Step 1: Clean slate test**

```bash
# Remove test data
rm -f ~/.claude-monitor/monitor.db
cd tools/agent-monitor && node setup.js
```

- [ ] **Step 2: Start server and simulate full session lifecycle**

Terminal 1:
```bash
cd tools/agent-monitor && node server.js
```

Terminal 2:
```bash
cd tools/agent-monitor

# Session starts
echo '{"hook_event_name":"SessionStart","session_id":"e2e-test","cwd":"c:/Dev/PortfolioClaude","source":"startup","model":"claude-opus-4-6"}' | node emit-event.js

# Tool use cycle
echo '{"hook_event_name":"PreToolUse","session_id":"e2e-test","cwd":"c:/Dev/PortfolioClaude","tool_name":"Bash","tool_input":{"command":"npm run build"}}' | node emit-event.js
sleep 1
echo '{"hook_event_name":"PostToolUse","session_id":"e2e-test","cwd":"c:/Dev/PortfolioClaude","tool_name":"Bash","tool_input":{"command":"npm run build"},"tool_response":"Build complete"}' | node emit-event.js

# Subagent lifecycle
echo '{"hook_event_name":"SubagentStart","session_id":"e2e-test","cwd":"c:/Dev/PortfolioClaude","agent_id":"sub-1","agent_type":"Explore"}' | node emit-event.js
echo '{"hook_event_name":"PreToolUse","session_id":"e2e-test","cwd":"c:/Dev/PortfolioClaude","tool_name":"Grep","tool_input":{"pattern":"TODO"}}' | node emit-event.js
echo '{"hook_event_name":"SubagentStop","session_id":"e2e-test","cwd":"c:/Dev/PortfolioClaude","agent_id":"sub-1","agent_type":"Explore","result":"completed"}' | node emit-event.js

# Error event
echo '{"hook_event_name":"PostToolUseFailure","session_id":"e2e-test","cwd":"c:/Dev/PortfolioClaude","tool_name":"Bash","tool_input":{"command":"bad-cmd"},"error":"command not found"}' | node emit-event.js

# Session ends
echo '{"hook_event_name":"SessionEnd","session_id":"e2e-test","cwd":"c:/Dev/PortfolioClaude","reason":"natural"}' | node emit-event.js
```

- [ ] **Step 3: Verify in browser**

Open http://localhost:9100 and confirm:
- Header shows correct stats
- Agent table has 2 rows (main + subagent)
- Main session shows error_count=1
- Subagent shows state=completed
- Event stream shows all 8 events in order
- Click an agent row → detail panel shows events
- Project filter dropdown includes c:/Dev/PortfolioClaude

- [ ] **Step 4: Final commit**

```bash
git add -A tools/agent-monitor/
git commit -m "feat(agent-monitor): complete v1 agent monitoring dashboard"
```
