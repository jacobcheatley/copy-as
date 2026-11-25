import { FENCE, PIPE_ROW, PIPE_SEPARATOR, splitPipeRow } from './html'

export type Part = { kind: 'table'; rows: string[][] } | { kind: 'code'; language: string; code: string }

// Spreadsheets show markdown marks literally, so cells keep only their text.
const plainCell = (cell: string) =>
  cell
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => a ?? b)
    .replace(/(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1')
    .replace(/[\t\r\n]+/g, ' ')

export const tableToTsv = (rows: string[][]) => rows.map(row => row.map(plainCell).join('\t')).join('\n')

export const partsOf = (markdown: string): Part[] => {
  const lines = markdown.split(/\r?\n/)
  const at = (n: number) => lines[n] ?? ''
  const parts: Part[] = []
  let i = 0
  while (i < lines.length) {
    const fence = FENCE.exec(at(i))
    if (fence) {
      const marker = fence[1] ?? '```'
      const language = at(i).trim().slice(marker.length).trim()
      let end = i + 1
      while (end < lines.length && !at(end).trim().startsWith(marker)) end++
      parts.push({ kind: 'code', language, code: lines.slice(i + 1, end).join('\n') })
      i = end + 1
    } else if (PIPE_ROW.test(at(i)) && PIPE_SEPARATOR.test(at(i + 1))) {
      const rows = [splitPipeRow(at(i))]
      for (i += 2; i < lines.length && PIPE_ROW.test(at(i)); i++) rows.push(splitPipeRow(at(i)))
      parts.push({ kind: 'table', rows })
    } else {
      i++
    }
  }
  return parts
}

// Text a tool's result row shows, for the tools whose result is text.
export const toolOutputText = (output: unknown): string | undefined => {
  if (typeof output === 'string') return output || undefined
  if (typeof output !== 'object' || output === null) return undefined
  const fields = output as { stdout?: unknown; stderr?: unknown; content?: unknown; result?: unknown; file?: { content?: unknown } }
  if (typeof fields.stdout === 'string') {
    const stderr = typeof fields.stderr === 'string' ? fields.stderr : ''
    return [fields.stdout, stderr].filter(Boolean).join('\n') || undefined
  }
  for (const text of [fields.content, fields.result, fields.file?.content]) {
    if (typeof text === 'string' && text) return text
  }
  return undefined
}
