import type { SessionInfo } from 'claude-code'

type Platform = NonNullable<SessionInfo['platform']>
export type ClipboardRun = { argv: string[]; stdin?: string }

// Silencing output matters: wl-copy forks a server that would otherwise hold the captured pipe open.
const LINUX_SCRIPT = [
  'exec >/dev/null 2>&1',
  'if [ -n "$WAYLAND_DISPLAY" ]; then exec wl-copy --type text/html',
  'elif command -v xclip; then exec xclip -selection clipboard -t text/html',
  'else exit 127; fi',
].join('\n')

// Windows PowerShell 5.1 has -AsHtml (PowerShell 7 dropped it); stdin is read as UTF-8 explicitly.
const POWERSHELL = [
  'powershell.exe',
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  '[Console]::InputEncoding = [Text.Encoding]::UTF8; Set-Clipboard -AsHtml -Value ([Console]::In.ReadToEnd())',
]

export const utf8Hex = (text: string) =>
  encodeURIComponent(text).replace(/%([0-9A-F]{2})|([^%])/g, (_, escaped: string | undefined, plain: string | undefined) =>
    escaped ?? (plain ?? '').charCodeAt(0).toString(16).padStart(2, '0').toUpperCase(),
  )

// $.ui.copy writes text/plain only, so text/html goes through the OS's own clipboard tool.
export const htmlClipboardRun = (platform: Platform, html: string): ClipboardRun => {
  if (platform === 'macos') {
    return { argv: ['osascript', '-e', `set the clipboard to «data HTML${utf8Hex(html)}»`] }
  }
  if (platform === 'windows' || platform === 'wsl') return { argv: POWERSHELL, stdin: html }
  return { argv: ['sh', '-c', LINUX_SCRIPT], stdin: html }
}
