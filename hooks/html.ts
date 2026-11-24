// Markdown to HTML with inline styles: Teams, Outlook and Google Docs drop <style> blocks.

const TABLE_STYLE = 'border-collapse:collapse'
const CELL_STYLE = 'border:1px solid #999;padding:4px 8px;vertical-align:top'
const QUOTE_STYLE = 'border-left:3px solid #999;margin:0;padding-left:8px;color:#555'

const LIST_ITEM = /^(\s*)([-*+]|(\d+)[.)])\s+(.*)$/
const PIPE_ROW = /^\s*\|.*\|\s*$/
const PIPE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/
const FENCE = /^\s*(`{3,}|~{3,})/
const QUOTE = /^\s*>\s?(.*)$/

type Align = 'left' | 'center' | 'right'
type ListItem = { indent: number; tag: 'ul' | 'ol'; start: number; html: string }

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const inline = (text: string): string => {
  const codeSpans: string[] = []
  return escapeHtml(text.trim())
    .replace(/`([^`]+)`/g, (_, code) => `\u0000${codeSpans.push(code) - 1}\u0000`)
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `<b>${a ?? b}</b>`)
    .replace(
      /(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])|(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)/g,
      (_, a, b) => `<i>${a ?? b}</i>`,
    )
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${codeSpans[Number(n)]}</code>`)
}

const splitPipeRow = (line: string) =>
  line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(cell => cell.replace(/\\\|/g, '|').trim())

const alignOf = (separatorCell: string): Align => {
  const cell = separatorCell.trim()
  if (cell.startsWith(':') && cell.endsWith(':')) return 'center'
  return cell.endsWith(':') ? 'right' : 'left'
}

const renderTable = (header: string[], aligns: Align[], body: string[][]) => {
  const row = (cells: string[], tag: 'th' | 'td') =>
    '<tr>' +
    cells
      .map((cell, i) => `<${tag} style="${CELL_STYLE};text-align:${aligns[i] ?? 'left'}">${inline(cell)}</${tag}>`)
      .join('') +
    '</tr>'
  return `<table style="${TABLE_STYLE}"><thead>${row(header, 'th')}</thead><tbody>${body.map(r => row(r, 'td')).join('')}</tbody></table>`
}

const renderList = (items: ListItem[]) => {
  const out: string[] = []
  const open: { indent: number; tag: string }[] = []
  for (const { indent, tag, start, html } of items) {
    while ((open.at(-1)?.indent ?? -1) > indent) out.push(`</li></${open.pop()!.tag}>`)
    const top = open.at(-1)
    if (top && top.indent === indent && top.tag === tag) {
      out.push('</li>')
    } else {
      if (top && top.indent === indent) out.push(`</li></${open.pop()!.tag}>`)
      out.push(tag === 'ol' && start !== 1 ? `<ol start="${start}">` : `<${tag}>`)
      open.push({ indent, tag })
    }
    out.push(`<li>${html}`)
  }
  for (const { tag } of open.reverse()) out.push(`</li></${tag}>`)
  return out.join('')
}

const blocksOf = (lines: string[]): string[] => {
  const at = (n: number) => lines[n] ?? ''
  const blocks: string[] = []
  let paragraph: string[] = []
  let items: ListItem[] = []
  let itemText: string[] = []

  const finishItem = () => {
    const last = items.at(-1)
    if (last && itemText.length) last.html = inline(itemText.join(' '))
    itemText = []
  }
  const flush = () => {
    finishItem()
    if (items.length) blocks.push(renderList(items))
    if (paragraph.length) blocks.push(`<p>${inline(paragraph.join(' '))}</p>`)
    items = []
    paragraph = []
  }

  let i = 0
  while (i < lines.length) {
    const line = at(i)
    const stripped = line.trim()

    if (PIPE_ROW.test(line) && i + 1 < lines.length && PIPE_SEPARATOR.test(at(i + 1))) {
      flush()
      const header = splitPipeRow(line)
      const aligns = splitPipeRow(at(i + 1)).map(alignOf)
      const body: string[][] = []
      for (i += 2; i < lines.length && PIPE_ROW.test(at(i)); i++) body.push(splitPipeRow(at(i)))
      blocks.push(renderTable(header, aligns, body))
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      flush()
      let end = i + 1
      while (end < lines.length && !at(end).trim().startsWith(fence[1] ?? '```')) end++
      blocks.push(`<pre><code>${escapeHtml(lines.slice(i + 1, end).join('\n'))}</code></pre>`)
      i = end + 1
      continue
    }

    if (QUOTE.test(line)) {
      flush()
      const quoted: string[] = []
      for (; i < lines.length && QUOTE.test(at(i)); i++) quoted.push(QUOTE.exec(at(i))?.[1] ?? '')
      blocks.push(`<blockquote style="${QUOTE_STYLE}">${blocksOf(quoted).join('\n')}</blockquote>`)
      continue
    }

    const heading = HEADING.exec(stripped)
    const item = LIST_ITEM.exec(line)
    if (!stripped) {
      flush()
    } else if (heading) {
      flush()
      const level = heading[1]?.length ?? 1
      blocks.push(`<h${level}>${inline(heading[2] ?? '')}</h${level}>`)
    } else if (RULE.test(line)) {
      flush()
      blocks.push('<hr>')
    } else if (item) {
      if (paragraph.length) flush()
      finishItem()
      items.push({ indent: item[1]?.length ?? 0, tag: item[3] ? 'ol' : 'ul', start: Number(item[3] ?? 1), html: '' })
      itemText.push(item[4] ?? '')
    } else if (items.length) {
      itemText.push(stripped)
    } else {
      paragraph.push(stripped)
    }
    i++
  }
  flush()
  return blocks
}

export const markdownToHtml = (markdown: string): string =>
  '<meta charset="utf-8">' + blocksOf(markdown.replace(/\t/g, '    ').split(/\r?\n/)).join('\n')

// $.ui.copy writes text/plain only. Silencing the clipboard tool's output matters:
// wl-copy forks a server that would otherwise hold the captured pipe open.
export const HTML_CLIPBOARD_SCRIPT = [
  'exec >/dev/null 2>&1',
  'if [ -n "$WAYLAND_DISPLAY" ]; then exec wl-copy --type text/html',
  'elif command -v xclip; then exec xclip -selection clipboard -t text/html',
  'else exit 127; fi',
].join('\n')
