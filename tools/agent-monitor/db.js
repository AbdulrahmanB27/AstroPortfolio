const fs = require('fs')
const path = require('path')
const os = require('os')

const DB_DIR = path.join(os.homedir(), '.claude-monitor')
const EVENTS_PATH = path.join(DB_DIR, 'events.jsonl')
const AGENTS_PATH = path.join(DB_DIR, 'agents.json')

function ensureDir() {
  fs.mkdirSync(DB_DIR, { recursive: true })
}

function appendEvent(event) {
  ensureDir()
  const line = JSON.stringify({ ...event, _ts: new Date().toISOString() }) + '\n'
  fs.appendFileSync(EVENTS_PATH, line)
}

function readAgents() {
  try {
    return JSON.parse(fs.readFileSync(AGENTS_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function writeAgents(agents) {
  ensureDir()
  fs.writeFileSync(AGENTS_PATH, JSON.stringify(agents, null, 2))
}

function readEvents(since = 0) {
  try {
    const content = fs.readFileSync(EVENTS_PATH, 'utf8')
    const lines = content.trim().split('\n').filter(Boolean)
    return lines.slice(since).map((line, i) => {
      try {
        return { _idx: since + i, ...JSON.parse(line) }
      } catch {
        return null
      }
    }).filter(Boolean)
  } catch {
    return []
  }
}

function countEvents() {
  try {
    const content = fs.readFileSync(EVENTS_PATH, 'utf8')
    return content.trim().split('\n').filter(Boolean).length
  } catch {
    return 0
  }
}

function purgeOldEvents(days = 7) {
  try {
    const content = fs.readFileSync(EVENTS_PATH, 'utf8')
    const lines = content.trim().split('\n').filter(Boolean)
    const cutoff = new Date(Date.now() - days * 86400000).toISOString()
    const kept = lines.filter(line => {
      try {
        const evt = JSON.parse(line)
        return (evt._ts || '') >= cutoff
      } catch {
        return false
      }
    })
    fs.writeFileSync(EVENTS_PATH, kept.join('\n') + (kept.length ? '\n' : ''))
  } catch {
    // No events file yet, nothing to purge
  }
}

module.exports = { DB_DIR, EVENTS_PATH, AGENTS_PATH, ensureDir, appendEvent, readAgents, writeAgents, readEvents, countEvents, purgeOldEvents }
