// Validates the published content file with the same schema code the site and the studio use.
// Node 23.6+ strips TypeScript types on import, so the schema is loaded directly.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const schema = await import(pathToFileURL(join(root, 'src', 'content', 'schema.ts')).href)
const file = join(root, 'public', 'data', 'portfolio.json')
const raw = JSON.parse(readFileSync(file, 'utf8'))
const data = schema.normalizePortfolio(raw)
const issues = schema.validatePortfolio(data)
const stable = schema.serializePortfolio(data) === schema.serializePortfolio(schema.normalizePortfolio(JSON.parse(schema.serializePortfolio(data))))
for (const i of issues) console.log(`${i.level.toUpperCase().padEnd(8)} ${i.path}  ${i.message}`)
const errors = issues.filter((i) => i.level === 'error').length
console.log(`\n${data.projects.length} projects, ${errors} errors, ${issues.length - errors} warnings, round-trip stable: ${stable}`)
process.exit(errors || !stable ? 1 : 0)
