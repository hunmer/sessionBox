export function windowsProcessTreeKillArgs(pid: number): string[] {
  return ['/PID', String(pid), '/T', '/F']
}

export function parseWindowsProcessIds(output: string): number[] {
  return [...new Set(output.split(/\r?\n/).map((line) => Number(line.trim())).filter((pid) => Number.isInteger(pid) && pid > 0))]
}
