const express = require('express')
const { WebSocketServer } = require('ws')
const http = require('http')
const path = require('path')
const { readAgents, readEvents, countEvents, purgeOldEvents } = require('./db')

const PORT = process.env.MONITOR_PORT || 9100
const POLL_INTERVAL = 1000

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ server })

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'))
})

// REST endpoints
app.get('/api/agents', (req, res) => {
  const agents = readAgents()
  const list = Object.values(agents).sort((a, b) => (b.last_seen || '').localeCompare(a.last_seen || ''))
  res.json(list)
})

app.get('/api/events', (req, res) => {
  const limit = parseInt(req.query.limit) || 100
  const agentKey = req.query.agent_key
  let events = readEvents()
  if (agentKey) {
    const [sid, aid] = agentKey.split(':')
    events = events.filter(e => {
      if (e.session_id !== sid) return false
      if (aid === 'main') return !e.agent_id
      return e.agent_id === aid
    })
  }
  events.reverse()
  res.json(events.slice(0, limit))
})

app.get('/api/stats', (req, res) => {
  const agents = Object.values(readAgents())
  const active = agents.filter(a => a.state === 'idle' || a.state === 'running_tool').length
  const errors = agents.filter(a => a.state === 'error').length
  const completed = agents.filter(a => a.state === 'completed').length
  const projects = [...new Set(agents.map(a => a.project).filter(Boolean))]
  res.json({ total: agents.length, active, errors, completed, projects })
})

// WebSocket: push updates every POLL_INTERVAL
let lastEventCount = 0

function broadcast() {
  if (wss.clients.size === 0) return

  const agents = Object.values(readAgents()).sort((a, b) => (b.last_seen || '').localeCompare(a.last_seen || ''))
  const totalEvents = countEvents()
  const newEvents = totalEvents > lastEventCount ? readEvents(lastEventCount) : []
  lastEventCount = totalEvents

  const stats = {
    total: agents.length,
    active: agents.filter(a => a.state === 'idle' || a.state === 'running_tool').length,
    errors: agents.filter(a => a.state === 'error').length,
    completed: agents.filter(a => a.state === 'completed').length,
  }

  const payload = JSON.stringify({ agents, recentEvents: newEvents.reverse(), stats })

  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload)
  }
}

// Startup
purgeOldEvents()
lastEventCount = countEvents()
setInterval(broadcast, POLL_INTERVAL)

server.listen(PORT, () => {
  console.log(`Agent Monitor dashboard: http://localhost:${PORT}`)
})
