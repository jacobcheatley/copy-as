import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { HTML_CLIPBOARD_SCRIPT, markdownToHtml } from './html'

const isRaw = atom({ plugin: 'raw-markdown', key: 'isRaw' } as const, false)
// Blocks drawn opposite to the global mode, by text hash: a reply block carries no id.
const flippedBlocks = atom({ plugin: 'raw-markdown', key: 'flippedBlocks' } as const, [] as string[])

export const blockId = (text: string) => {
  let hash = 5381
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
  return `b${(hash >>> 0).toString(36)}`
}

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
    await update($, flippedBlocks, () => [])
    $.ui.status(now ? 'raw md' : undefined)

    return { text: now ? 'Replies shown as raw markdown.' : 'Replies rendered.' }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const { text } = e.props
    const id = blockId(text)
    const isFlipped = (await read($, flippedBlocks)).includes(id)
    const showsRaw = (await read($, isRaw)) !== isFlipped

    const flip = () =>
      update($, flippedBlocks, ids =>
        ids.includes(id) ? ids.filter(one => one !== id) : [...ids, id].slice(-500),
      )
    const copy = async (press: { surface: Parameters<typeof $.ui.copy>[0]['surface'] }) => {
      const copied = await $.ui.copy({ text, surface: press.surface })
      $.ui.toast(copied.isCopied ? 'Markdown copied' : `Copy failed: ${copied.reason}`)
    }
    const copyHtml = async () => {
      const ran = await $.process.run(['sh', '-c', HTML_CLIPBOARD_SCRIPT], {
        stdin: markdownToHtml(text),
        timeoutMs: 5_000,
      })
      $.ui.toast(ran.exitCode === 0 ? 'HTML copied' : `HTML copy failed: no wl-copy or xclip (exit ${ran.exitCode})`)
    }

    return (
      <Box key={id} flexDirection="column">
        {showsRaw ? <Text>{text}</Text> : await next(e)}
        <Box position="absolute" top={0} right={0} display="none" hover={{ display: 'flex' }}>
          <Button key={`${id}:mode`} plain dimColor label={showsRaw ? '[rendered]' : '[raw]'} onPress={flip} />
          <Text> </Text>
          <Button key={`${id}:copy`} plain dimColor label="[copy md]" onPress={copy} />
          <Text> </Text>
          <Button key={`${id}:html`} plain dimColor label="[copy html]" onPress={copyHtml} />
        </Box>
      </Box>
    )
  })
}
