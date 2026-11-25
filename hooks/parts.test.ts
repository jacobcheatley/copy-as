import { expect, test } from 'claude-code/testing'

import { partsOf, sourceOfSelection, tableToTsv, toolOutputText } from './parts'

const REPLY = [
  'Intro',
  '',
  '| Host | **Status** |',
  '|---|---|',
  '| `alpha` | [up](https://x.y) \\| ok |',
  '',
  '```ts',
  '| not | a table |',
  '|---|---|',
  '```',
].join('\n')

test('tables and fenced code are found in order, a table inside a fence is code', async () => {
  const parts = partsOf(REPLY)
  expect(parts.map(part => part.kind)).toEqual(['table', 'code'])
  expect(parts[1]).toEqual({ kind: 'code', language: 'ts', code: '| not | a table |\n|---|---|' })
})

test('a table copies as TSV with markdown marks stripped from its cells', async () => {
  const [table] = partsOf(REPLY)
  expect(table?.kind === 'table' && tableToTsv(table.rows)).toBe('Host\tStatus\nalpha\tup | ok')
})

test('tool output text comes from Bash stdout and stderr, a string, or file content', async () => {
  expect(toolOutputText({ stdout: 'out', stderr: 'err', interrupted: false })).toBe('out\nerr')
  expect(toolOutputText({ stdout: '', stderr: '' })).toBeUndefined()
  expect(toolOutputText('plain')).toBe('plain')
  expect(toolOutputText({ type: 'text', file: { content: 'file body' } })).toBe('file body')
  expect(toolOutputText({ matches: 3 })).toBeUndefined()
})

test('a rendered selection maps back to the markdown lines behind it', async () => {
  const markdown = 'Intro **bold** and [a link](https://x.y)\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |'
  expect(sourceOfSelection(markdown, 'bold and a link\n\none\ntwo')).toBe(
    'Intro **bold** and [a link](https://x.y)\n\n- one\n- two',
  )
  expect(sourceOfSelection(markdown, '1\t2')).toBe('| 1 | 2 |')
  expect(sourceOfSelection(markdown, 'not in the reply')).toBeUndefined()
})
