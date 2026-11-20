// Minimal static file server that behaves like GitHub Pages for a project site:
// files are served under a base path (e.g. /space-portfolio/), directories redirect to a trailing slash,
// index.html is the directory index, unknown paths get 404.html. No rewrites, no SPA fallback.
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.pdf': 'application/pdf',
}

export function startServer(root, basePath = '/space-portfolio', port = 4188) {
  const base = basePath.replace(/\/$/, '')
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    let path = decodeURIComponent(url.pathname)
    const send404 = () => {
      const f = join(root, '404.html')
      res.writeHead(404, { 'content-type': TYPES['.html'] })
      if (existsSync(f)) createReadStream(f).pipe(res)
      else res.end('Not found')
    }
    if (path === base) {
      res.writeHead(301, { location: base + '/' + url.search })
      return res.end()
    }
    if (!path.startsWith(base + '/')) return send404()
    path = path.slice(base.length)
    const file = normalize(join(root, path))
    if (!file.startsWith(normalize(root))) return send404()
    if (existsSync(file) && statSync(file).isDirectory()) {
      if (!path.endsWith('/')) {
        res.writeHead(301, { location: base + path + '/' + url.search })
        return res.end()
      }
      const index = join(file, 'index.html')
      if (!existsSync(index)) return send404()
      res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-cache' })
      return createReadStream(index).pipe(res)
    }
    if (!existsSync(file)) return send404()
    res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-cache' })
    createReadStream(file).pipe(res)
  })
  return new Promise((resolve) => server.listen(port, () => resolve({ server, url: `http://localhost:${port}${base}/` })))
}

// CLI: node tools/qa/static-server.mjs <dir> [basePath] [port]
if (process.argv[1] && process.argv[1].endsWith('static-server.mjs')) {
  const [dir = 'dist', basePath = '/space-portfolio', port = '4188'] = process.argv.slice(2)
  const { url } = await startServer(join(process.cwd(), dir), basePath, Number(port))
  console.log(`serving ${dir} at ${url}`)
}
