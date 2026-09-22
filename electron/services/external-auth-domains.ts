const GOOGLE_LOGIN_HOSTS = ['accounts.google.com', 'accounts.google.cn']

export function isGoogleLoginHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return GOOGLE_LOGIN_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`))
}
