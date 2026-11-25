import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'

import { htmlClipboardRun } from './clipboard'
import { markdownToHtml } from './html'
import { type Part, partsOf, sourceOfSelection, tableToTsv, toolOutputText } from './parts'

const isRaw = atom({ plugin: 'copy-as', key: 'isRaw' } as const, false)
// Rows drawn opposite to the global mode, by the row's requestId.
const flippedRows = atom({ plugin: 'copy-as', key: 'flippedBlocks' } as const, [] as string[])
// The button just copied from: its label confirms the copy instead of a toast over the buttons.
const copiedKey = atom({ plugin: 'copy-as', key: 'copiedKey' } as const, null as string | null)
const COPIED_LABEL_MS = 1500

// Surfaces with a pointer over terminal-style rows; the desktop app gets a right-click menu instead.
const HOVER_SURFACES: ReadonlySet<RenderSurface> = new Set(['terminal', 'vscode'])

// The desktop's menu names a row by id alone, so each row's text is kept as it is drawn.
type RowSource = { kind: 'reply' | 'output'; text: string }
const rowSources = new Map<string, RowSource>()
const MAX_REMEMBERED_ROWS = 2000
const remember = (id: string, source: RowSource) => {
  rowSources.delete(id)
  rowSources.set(id, source)
  if (rowSources.size > MAX_REMEMBERED_ROWS) rowSources.delete(rowSources.keys().next().value ?? '')
}

const copyPlain = async ($: EngineInterface, surface: RenderSurface, text: string) => {
  const copied = await $.ui.copy({ text, surface })
  if (!copied.isCopied) $.ui.toast(`Copy failed: ${copied.reason}`)
  return copied.isCopied
}

const copyAsHtml = async ($: EngineInterface, markdown: string) => {
  const { platform = 'unknown' } = await $.session.info()
  const { argv, stdin } = htmlClipboardRun(platform, markdownToHtml(markdown))
  const ran = await $.process.run(argv, { stdin, timeoutMs: 5_000 }).catch((error: unknown) => {
    $.ui.toast(`HTML copy failed: could not run ${argv[0]}: ${String(error)}`)
    return undefined
  })
  if (ran && ran.exitCode !== 0) $.ui.toast(`HTML copy failed: ${argv[0]} exited ${ran.exitCode}`)
  return ran?.exitCode === 0
}

const confirmOnButton = async ($: EngineInterface, key: string) => {
  await update($, copiedKey, () => key)
  $.clock.after(COPIED_LABEL_MS, () => void update($, copiedKey, was => (was === key ? null : was)))
}

type PartName = { button: string; menu: string }

export const partNames = (parts: Part[]): PartName[] => {
  const tables = parts.filter(part => part.kind === 'table').length
  const codes = parts.length - tables
  let table = 0
  let code = 0
  return parts.map(part => {
    if (part.kind === 'table') {
      const n = tables > 1 ? ` ${++table}` : ''
      return { button: `[tsv${n}]`, menu: `Copy table${n} as TSV` }
    }
    const n = codes > 1 ? ` ${++code}` : ''
    const language = part.language || 'code'
    return { button: `[${language}${n}]`, menu: `Copy ${part.language ? `${language} code` : 'code'}${n}` }
  })
}

const partText = (part: Part) => (part.kind === 'table' ? tableToTsv(part.rows) : part.code)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'raw',
      description: 'Show replies as raw markdown source (toggle, or on/off)',
      argumentHint: '[on|off]',
    })

    return next(e)
  })

  on('command.run', { command: 'raw' }, async ($, e) => {
    const arg = e.args.trim()
    const wanted = arg === 'on' ? true : arg === 'off' ? false : undefined
    const now = await update($, isRaw, was => wanted ?? !was)
    await update($, flippedRows, () => [])
    $.ui.status(now ? 'raw md' : undefined)

    return { text: now ? 'Replies shown as raw markdown.' : 'Replies rendered.' }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const { text } = e.props
    const id = e.requestId
    remember(id, { kind: 'reply', text })
    const isFlipped = (await read($, flippedRows)).includes(id)
    const showsRaw = (await read($, isRaw)) !== isFlipped
    const body = showsRaw ? <Text>{text}</Text> : await next(e)
    if (!HOVER_SURFACES.has(e.surface)) {
      return body
    }

    const parts = partsOf(text)
    const names = partNames(parts)
    const copied = await read($, copiedKey)
    const label = (key: string, idle: string) => (copied === key ? '[copied]' : idle)
    const flip = () =>
      update($, flippedRows, ids => (ids.includes(id) ? ids.filter(one => one !== id) : [...ids, id].slice(-500)))
    const copyButton = (key: string, copy: (surface: RenderSurface) => Promise<boolean>) => async ({
      surface,
    }: {
      surface: RenderSurface
    }) => {
      if (await copy(surface)) await confirmOnButton($, key)
    }

    return (
      <Box key={id} flexDirection="column">
        {body}
        <Box position="absolute" top={0} right={0} display="none" hover={{ display: 'flex' }}>
          <Button key={`${id}:mode`} plain dimColor label={showsRaw ? '[rendered]' : '[raw]'} onPress={flip} />
          <Text> </Text>
          <Button
            key={`${id}:md`}
            plain
            dimColor
            label={label(`${id}:md`, '[md]')}
            onPress={copyButton(`${id}:md`, surface => copyPlain($, surface, text))}
          />
          <Text> </Text>
          <Button
            key={`${id}:html`}
            plain
            dimColor
            label={label(`${id}:html`, '[html]')}
            onPress={copyButton(`${id}:html`, () => copyAsHtml($, text))}
          />
          {parts.flatMap((part, i) => [
            <Text> </Text>,
            <Button
              key={`${id}:part${i}`}
              plain
              dimColor
              label={label(`${id}:part${i}`, names[i]?.button ?? '[part]')}
              onPress={copyButton(`${id}:part${i}`, surface => copyPlain($, surface, partText(part)))}
            />,
          ])}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const output = toolOutputText(e.props.output)
    const row = await next(e)
    if (output === undefined) {
      return row
    }
    const id = e.requestId
    remember(id, { kind: 'output', text: output })
    if (!HOVER_SURFACES.has(e.surface)) {
      return row
    }

    const { Box, Button } = $.ui.resolve(e)
    const isCopied = (await read($, copiedKey)) === `${id}:copy`
    const copy = async ({ surface }: { surface: RenderSurface }) => {
      if (await copyPlain($, surface, output)) await confirmOnButton($, `${id}:copy`)
    }

    return (
      <Box key={id} flexDirection="column">
        {row}
        <Box position="absolute" top={0} right={0} display="none" hover={{ display: 'flex' }}>
          <Button key={`${id}:copy`} plain dimColor label={isCopied ? '[copied]' : '[copy]'} onPress={copy} />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'ContextMenu' }, ($, e, next) => {
    const id = e.props.row?.requestId
    const source = id === undefined ? undefined : rowSources.get(id)
    if (id === undefined || source === undefined) {
      return next(e)
    }

    const { Box, Button } = $.ui.resolve(e)
    const item = (key: string, title: string, copy: (surface: RenderSurface) => Promise<boolean>) => (
      <Button
        key={`${id}:menu:${key}`}
        onPress={async ({ surface }) => {
          if (await copy(surface)) $.ui.toast('Copied')
        }}
      >
        {title}
      </Button>
    )

    if (source.kind === 'output') {
      return <Box flexDirection="column">{item('output', 'Copy output', surface => copyPlain($, surface, source.text))}</Box>
    }

    const selected = e.props.selection?.text
    const selectedSource = selected === undefined ? undefined : sourceOfSelection(source.text, selected)
    const parts = partsOf(source.text)
    const names = partNames(parts)

    return (
      <Box flexDirection="column">
        {selectedSource !== undefined &&
          item('selection', 'Copy selection as markdown', surface => copyPlain($, surface, selectedSource))}
        {item('md', 'Copy as markdown', surface => copyPlain($, surface, source.text))}
        {item('html', 'Copy as HTML', () => copyAsHtml($, source.text))}
        {parts.map((part, i) =>
          item(`part${i}`, names[i]?.menu ?? 'Copy part', surface => copyPlain($, surface, partText(part))),
        )}
      </Box>
    )
  })
}
