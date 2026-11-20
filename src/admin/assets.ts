import { isSafeAsset } from '../content/schema'

export function siteAssetUrl(path: string): string | undefined {
  if (!isSafeAsset(path)) return
  if (/^https:\/\//i.test(path)) return path

  const href = `../${path.replace(/^\.?\//, '')}`
  const root = new URL('../', window.location.href)
  const resolved = new URL(href, window.location.href)
  if (resolved.origin === root.origin && resolved.pathname.startsWith(root.pathname)) return href
}
