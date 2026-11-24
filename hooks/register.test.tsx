import { expect, test } from 'claude-code/testing'
import { blockId } from './register'

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const
const REPLY = '| a | b |\n|---|---|\n| 1 | 2 |'

const message = (surface: 'terminal') => ({
  plugin: 'raw-markdown',
  component: 'AssistantMessage',
  surface,
  props: { text: REPLY, isFirstOfReply: true },
} as const)

test('/raw toggles replies between rendered and raw markdown source', async ($, on) => {
  on('command.register', () => ({ value: { command: 'raw' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const rendered = await $.ui.mount(message('terminal'))
  expect(await rendered.find({ type: 'Text', text: REPLY })).toBeUndefined()
  await rendered.unmount()

  await $.command.run({ command: 'raw', args: '', origin: RUN.origin, presentation: RUN.presentation })
  const raw = await $.ui.mount(message('terminal'))
  expect((await raw.find({ type: 'Text', text: REPLY }))?.text).toBe(REPLY)
  await raw.unmount()

  await $.command.run({ command: 'raw', args: 'off', origin: RUN.origin, presentation: RUN.presentation })
  const back = await $.ui.mount(message('terminal'))
  expect(await back.find({ type: 'Text', text: REPLY })).toBeUndefined()
})

test('the [raw] button flips one block and leaves the others rendered', async ($, on) => {
  on('command.register', () => ({ value: { command: 'raw' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const other = { ...message('terminal'), props: { text: 'other **block**', isFirstOfReply: false } }
  const ui = await $.ui.mount(message('terminal'))
  expect(await ui.find({ type: 'Button', text: '[raw]' })).toBeDefined()
  await ui.press({ key: `${blockId(REPLY)}:mode` })
  expect((await ui.find({ type: 'Text', text: REPLY }))?.text).toBe(REPLY)
  expect(await ui.find({ type: 'Button', text: '[rendered]' })).toBeDefined()

  const untouched = await $.ui.mount(other)
  expect(await untouched.find({ type: 'Text', text: 'other **block**' })).toBeUndefined()
})
