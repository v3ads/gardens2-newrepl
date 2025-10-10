export function getBaseUrl(h?: Headers) {
  const proto = h?.get('x-forwarded-proto') ?? 'https'
  const host = h?.get('x-forwarded-host') ?? h?.get('host')
  
  if (!host) throw new Error('No host header; cannot compute base URL.')
  
  return `${proto}://${host}`
}