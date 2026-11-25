# copy-as

A Claude Code mod for getting replies out of the terminal with their formatting.
Hover a reply to copy it as markdown, Teams-ready HTML, a table as TSV, or a code
block alone; hover a tool result to copy its output. `/raw` switches replies between
rendered and raw markdown source, so a plain mouse copy gives markdown too.

## Use

```
/raw        toggle
/raw on     show replies as raw markdown
/raw off    back to rendered
```

Hover a reply block to show its buttons:

- `[raw]` / `[rendered]`: flip that block only
- `[md]`: its markdown to the clipboard
- `[html]`: inline-styled HTML that pastes formatted into Teams, Outlook and Google Docs
- `[tsv]`, one per table: the table as tab-separated cells, which paste into a
  spreadsheet as cells, markdown marks stripped
- `[sh]`, `[ts]`, `[code]`..., one per fenced block: the code alone, no fences

Hover a tool result (Bash output, a file read) for `[copy]`: its text without the
transcript's gutter and indent.

Hover and clicks need the fullscreen layout; in the classic scrollback layout, use
`/raw` and `/copy`.

`/raw` redraws every reply already in the transcript, not only new ones, and resets
per-block flips. The status line shows `raw md` while it is on. The stored transcript is never changed.

Related built-in: `/copy` puts the last reply's markdown on the clipboard without
touching the display.

`[html]` converts in the mod itself (`hooks/html.ts`: pipe tables with
alignment, nested lists, headings, quotes, fences, inline marks). Writing `text/html`
to the clipboard needs `wl-copy` (Wayland) or `xclip` (X11); a toast says when
neither is there.

## Install

From this repository (private: needs a git credential for github.com on the machine):

```
/plugin install copy-as --marketplace jacobcheatley/copy-as
```

or from a shell, `claude plugin install copy-as --marketplace jacobcheatley/copy-as`.

To run a working copy instead, so edits load without an update, name its folder in
`CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`, or pass
`claude --plugin-dir <folder>` for one session. Use one route, not both, or the mod
loads twice.

## Develop

```sh
claude plugin validate .
claude plugin test .
```
