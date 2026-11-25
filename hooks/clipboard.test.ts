import { expect, test } from 'claude-code/testing'

import { htmlClipboardRun, utf8Hex } from './clipboard'

test('utf8Hex encodes ASCII and multi-byte characters as UTF-8 bytes', async () => {
  expect(utf8Hex('<b>a%</b>')).toBe('3C623E61253C2F623E')
  expect(utf8Hex('\u00e9\u2713')).toBe('C3A9E29C93')
})

test('each platform gets its own clipboard tool', async () => {
  expect(htmlClipboardRun('macos', '<b>x</b>')).toEqual({
    argv: ['osascript', '-e', 'set the clipboard to \u00abdata HTML3C623E783C2F623E\u00bb'],
  })
  expect(htmlClipboardRun('windows', '<b>x</b>').argv[0]).toBe('powershell.exe')
  expect(htmlClipboardRun('wsl', '<b>x</b>').stdin).toBe('<b>x</b>')
  expect(htmlClipboardRun('linux', '<b>x</b>').argv.slice(0, 2)).toEqual(['sh', '-c'])
})
