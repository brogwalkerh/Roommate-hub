// Guard for fetching calendar links that people paste in: public HTTPS hosts only.

const PRIVATE_NAMES = [/^localhost$/i, /\.localhost$/i, /\.internal$/i, /\.local$/i, /\.home\.arpa$/i]

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null
    n = n * 256 + Number(p)
  }
  return n
}

// [network, prefix length]
const PRIVATE_V4: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3],
]

function isPrivateV4(ip: string): boolean {
  const n = ipv4ToInt(ip)
  if (n === null) return false
  return PRIVATE_V4.some(([net, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    return ((n & mask) >>> 0) === ((ipv4ToInt(net)! & mask) >>> 0)
  })
}

function isPrivateV6(ip: string): boolean {
  const v = ip.toLowerCase()
  if (v === '::' || v === '::1') return true
  if (/^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v)) return true
  // IPv4-mapped or -compatible (::ffff:1.2.3.4, ::1.2.3.4, or hex forms like ::ffff:7f00:1)
  const mapped = /^::(ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(v)
  if (mapped) return isPrivateV4(mapped[2])
  if (/^::(ffff:)?[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(v)) return true
  return false
}

/** True for loopback, private, link-local, carrier-grade NAT, multicast and other non-public addresses. */
export function isPrivateAddress(address: string): boolean {
  const a = address.replace(/^\[|\]$/g, '')
  return a.includes(':') ? isPrivateV6(a) : isPrivateV4(a)
}

/** Returns an error sentence, or null when the URL is OK to fetch. Checks the name only, no DNS. */
export function checkFeedUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.replace(/^webcal:\/\//i, 'https://'))
  } catch {
    return "That doesn't look like a web address."
  }
  if (url.protocol !== 'https:') return 'The calendar link must start with https:// or webcal://.'
  if (url.username || url.password) return 'Calendar links with a username or password are not supported.'
  const host = url.hostname.replace(/\.$/, '').replace(/^\[|\]$/g, '')
  if (!host) return "That doesn't look like a web address."
  if (PRIVATE_NAMES.some((re) => re.test(host)) || isPrivateAddress(host)) {
    return 'That calendar link points to a private network address.'
  }
  return null
}
