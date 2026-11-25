import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const
const REPLY = '| a | b |\n|---|---|\n| **1** | 2 |\n\n```sh\nls -la\n```'

const message = (requestId: string, text = REPLY) =>
  ({
    plugin: 'copy-as',
    component: 'AssistantMessage',
    surface: 'terminal',
    requestId,
    props: { text, isFirstOfReply: true },
  }) as const

const start = async (...[$, on]: Parameters<TestBody>) => {
  const copied: string[] = []
  on('command.register', () => ({ value: { command: 'raw' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.copy', (_, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  return copied
}

test('/raw toggles replies between rendered and raw markdown source', async ($, on) => {
  await start($, on)

  const rendered = await $.ui.mount(message('m1'))
  expect(await rendered.find({ type: 'Text', text: REPLY })).toBeUndefined()
  await rendered.unmount()

  await $.command.run({ command: 'raw', args: '', ...RUN })
  const raw = await $.ui.mount(message('m1'))
  expect((await raw.find({ type: 'Text', text: REPLY }))?.text).toBe(REPLY)
  await raw.unmount()

  await $.command.run({ command: 'raw', args: 'off', ...RUN })
  const back = await $.ui.mount(message('m1'))
  expect(await back.find({ type: 'Text', text: REPLY })).toBeUndefined()
})

test('the [raw] button flips its own row only, even when another row has the same text', async ($, on) => {
  await start($, on)

  const ui = await $.ui.mount(message('m1'))
  await ui.press({ key: 'm1:mode' })
  expect((await ui.find({ type: 'Text', text: REPLY }))?.text).toBe(REPLY)
  expect(await ui.find({ type: 'Button', text: '[rendered]' })).toBeDefined()

  const twin = await $.ui.mount(message('m2'))
  expect(await twin.find({ type: 'Text', text: REPLY })).toBeUndefined()
})

test('each table and code block gets a button copying its TSV or code', async ($, on) => {
  const copied = await start($, on)

  const ui = await $.ui.mount(message('m1'))
  expect(await ui.find({ type: 'Button', text: '[tsv]' })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: '[sh]' })).toBeDefined()
  await ui.press({ key: 'm1:part0' })
  expect(await ui.find({ type: 'Button', text: '[copied]' })).toBeDefined()
  await ui.press({ key: 'm1:part1' })
  expect(copied).toEqual(['a\tb\n1\t2', 'ls -la'])
})

test('a Bash result row copies its output; a result with no text gets no button', async ($, on) => {
  const copied = await start($, on)
  const result = (requestId: string, output: unknown) =>
    ({
      plugin: 'copy-as',
      component: 'ToolResult',
      surface: 'terminal',
      requestId,
      props: { tool_use_id: requestId, tool: 'Bash', output, isErrored: false },
    }) as const

  const bash = await $.ui.mount(result('t1', { stdout: 'total 0', stderr: '', interrupted: false }))
  await bash.press({ key: 't1:copy' })
  expect(copied).toEqual(['total 0'])

  const empty = await $.ui.mount(result('t2', { stdout: '', stderr: '', interrupted: false }))
  expect(await empty.find({ type: 'Button' })).toBeUndefined()
})
