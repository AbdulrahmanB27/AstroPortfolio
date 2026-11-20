#!/usr/bin/env node
const { appendEvent, readAgents, writeAgents } = require('./db')

function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => { data += chunk })
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(data)) }
      catch { resolve(null) }
    })
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
    return tool
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

  const eventType = input.hook_event_name
  const sessionId = input.session_id || 'unknown'
  const toolName = input.tool_name || null
  const project = input.cwd || null

  let agentId = null
  let agentType = 'main'
  if (eventType === 'SubagentStart' || eventType === 'SubagentStop') {
    agentId = input.agent_id || null
    agentType = input.agent_type || 'unknown'
  }

  const agentKey = agentId ? `${sessionId}:${agentId}` : `${sessionId}:main`
  const now = new Date().toISOString()
  const state = deriveState(eventType)
  const summary = buildSummary(input)

  // Append raw event
  appendEvent({
    session_id: sessionId,
    agent_id: agentId,
    agent_type: agentType,
    event_type: eventType,
    tool_name: toolName,
    project,
    summary,
  })

  // Upsert agent state
  const agents = readAgents()
  const existing = agents[agentKey]

  if (existing) {
    existing.state = state
    existing.last_seen = now
    existing.last_summary = summary
    if (project) existing.project = project
    if (eventType === 'PostToolUseFailure') existing.error_count = (existing.error_count || 0) + 1
    if (eventType === 'PreToolUse') existing.current_tool = toolName
    if (eventType === 'PostToolUse' || eventType === 'PostToolUseFailure') existing.current_tool = null
  } else {
    agents[agentKey] = {
      agent_key: agentKey,
      session_id: sessionId,
      agent_id: agentId,
      agent_type: agentType,
      project,
      state,
      current_tool: eventType === 'PreToolUse' ? toolName : null,
      last_summary: summary,
      started_at: now,
      last_seen: now,
      error_count: eventType === 'PostToolUseFailure' ? 1 : 0,
    }
  }

  writeAgents(agents)
  process.exit(0)
}

main().catch(() => process.exit(0))
