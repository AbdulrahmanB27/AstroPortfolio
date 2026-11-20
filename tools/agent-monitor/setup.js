#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const os = require('os')

const CLAUDE_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json')
const EMIT_SCRIPT = path.resolve(__dirname, 'emit-event.js').replace(/\\/g, '/')
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
