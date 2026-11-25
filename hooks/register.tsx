import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'

import { HTML_CLIPBOARD_SCRIPT, markdownToHtml } from './html'
import { type Part, partsOf, tableToTsv, toolOutputText } from './parts'

const isRaw = atom({ plugin: 'copy-as', key: 'isRaw' } as const, false)
// Rows drawn opposite to the global mode, by the row's requestId.
const flippedRows = atom({ plugin: 'copy-as', key: 'flippedBlocks' } as const, [] as string[])
// The button just copied from: its label confirms the copy instead of a toast over the buttons.
const copiedKey = atom({ plugin: 'copy-as', key: 'copiedKey' } as const, null as string | null)
const COPIED_LABEL_MS = 1500

type Press = { surface: RenderSurface }

const confirmCopied = async ($: EngineInterface, key: string) => {
  await update($, copiedKey, () => key)
  $.clock.after(COPIED_LABEL_MS, () => void update($, copiedKey, was => (was === key ? null : was)))
}

const copyText = async ($: EngineInterface, press: Press, key: string, text: string) => {
  const copied = await $.ui.copy({ text, surface: press.surface })
  if (copied.isCopied) await confirmCopied($, key)
  else $.ui.toast(`Copy failed: ${copied.reason}`)
}

const copyHtml = async ($: EngineInterface, key: string, markdown: string) => {
  const ran = await $.process.run(['sh', '-c', HTML_CLIPBOARD_SCRIPT], {
    stdin: markdownToHtml(markdown),
    timeoutMs: 5_000,
  })
  if (ran.exitCode === 0) await confirmCopied($, key)
  else $.ui.toast(`HTML copy failed: no wl-copy or xclip (exit ${ran.exitCode})`)
}

export const partLabels = (parts: Part[]): string[] => {
  const tables = parts.filter(part => part.kind === 'table').length
  const codes = parts.length - tables
  let table = 0
  let code = 0
  return parts.map(part =>
    part.kind === 'table'
      ? `[tsv${tables > 1 ? ` ${++table}` : ''}]`
      : `[${part.language || 'code'}${codes > 1 ? ` ${++code}` : ''}]`,
  )
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
    const isFlipped = (await read($, flippedRows)).includes(id)
    const showsRaw = (await read($, isRaw)) !== isFlipped
    const parts = partsOf(text)
    const labels = partLabels(parts)
    const copied = await read($, copiedKey)
    const label = (key: string, idle: string) => (copied === key ? '[copied]' : idle)

    const flip = () =>
      update($, flippedRows, ids => (ids.includes(id) ? ids.filter(one => one !== id) : [...ids, id].slice(-500)))

    return (
      <Box key={id} flexDirection="column">
        {showsRaw ? <Text>{text}</Text> : await next(e)}
        <Box position="absolute" top={0} right={0} display="none" hover={{ display: 'flex' }}>
          <Button key={`${id}:mode`} plain dimColor label={showsRaw ? '[rendered]' : '[raw]'} onPress={flip} />
          <Text> </Text>
          <Button key={`${id}:md`} plain dimColor label={label(`${id}:md`, '[md]')} onPress={press => copyText($, press, `${id}:md`, text)} />
          <Text> </Text>
          <Button key={`${id}:html`} plain dimColor label={label(`${id}:html`, '[html]')} onPress={() => copyHtml($, `${id}:html`, text)} />
          {parts.flatMap((part, i) => [
            <Text> </Text>,
            <Button
              key={`${id}:part${i}`}
              plain
              dimColor
              label={label(`${id}:part${i}`, labels[i] ?? '[part]')}
              onPress={press => copyText($, press, `${id}:part${i}`, partText(part))}
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

    const { Box, Button } = $.ui.resolve(e)
    const id = e.requestId
    const isCopied = (await read($, copiedKey)) === `${id}:copy`

    return (
      <Box key={id} flexDirection="column">
        {row}
        <Box position="absolute" top={0} right={0} display="none" hover={{ display: 'flex' }}>
          <Button key={`${id}:copy`} plain dimColor label={isCopied ? '[copied]' : '[copy]'} onPress={press => copyText($, press, `${id}:copy`, output)} />
        </Box>
      </Box>
    )
  })
}
