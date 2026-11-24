import { expect, test } from 'claude-code/testing'

import { markdownToHtml } from './html'

test('pipe table keeps escaped pipes and column alignment', async () => {
  const out = markdownToHtml('| a | b |\n|---|:-:|\n| 1 | x \\| y |\n')
  expect(out).toContain('text-align:left">a</th>')
  expect(out).toContain('text-align:center">x | y</td>')
})

test('nested mixed lists join wrapped items', async () => {
  const out = markdownToHtml('- one\n  wrapped\n- two\n  1. first\n  2. second\n- three\n')
  expect(out).toBe(
    '<meta charset="utf-8"><ul><li>one wrapped</li><li>two' +
      '<ol><li>first</li><li>second</li></ol></li><li>three</li></ul>',
  )
})

test('numbered list keeps its start number', async () => {
  expect(markdownToHtml('3. three\n4. four')).toContain('<ol start="3">')
})

test('headings and inline marks convert, code spans stay literal', async () => {
  const out = markdownToHtml('# Title\n**bold** *it* `a*b*c` [link](https://x.y)')
  expect(out).toContain('<h1>Title</h1>')
  expect(out).toContain('<b>bold</b> <i>it</i> <code>a*b*c</code> <a href="https://x.y">link</a>')
})

test('code fence is kept verbatim and escaped', async () => {
  expect(markdownToHtml('```ts\n- not a list\n  <tag>\n```')).toContain(
    '<pre><code>- not a list\n  &lt;tag&gt;</code></pre>',
  )
})

test('blockquote holds its own blocks', async () => {
  const out = markdownToHtml('> **note**\n> - item')
  expect(out).toMatch(/<blockquote [^>]+><p><b>note<\/b><\/p>\n<ul><li>item<\/li><\/ul><\/blockquote>/)
})
