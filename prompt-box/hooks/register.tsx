// prompt-box: draws the prompts you typed in a thick colored box in the scrollback.
//
// Why: the engine draws a typed prompt as one `> text` line, which is easy to lose when you scroll
// back through long agent output. A full-width bordered box is visible at scroll speed.
// How: a ui.render hook on the UserMessage row, matched on origin.kind 'composer', so task
// notifications, peer messages and plugin prompts keep the engine's own rows.
// The chevron sits in its own column, so wrapped and multi-line prompts line up under the first
// character of the text instead of under the chevron.
// The text is drawn as given and wraps; the stored message and what the model reads do not change.
// Pasted text is stored wrapped in <pasted_content id="..."> tags for the model; they are noise to
// a reader, so they are removed from the drawn text only.
// Color: /prompt-color <name|#hex|default|reset> sets the border and chevron color; `default` and
// `reset` both go back to gray. The value lives in $.state (so the rows redraw at once) and in
// $.store (so it survives a restart). Most names are the terminal's ANSI colors and follow its
// color scheme; purple, orange, pink and any #hex are fixed colors, because ANSI has no such hue.
// Global: the store is one file per user, but each session keeps its own copy in $.state, so a
// change made in one session reaches the others when they next submit a prompt (syncColor).
// Constraint: the box costs two extra rows per prompt (top and bottom border), and it also shows in
// the ctrl+o transcript.
// Related: ../types/index.d.ts is the $.state contract.

import { atom, read, update } from 'claude-code'
import type { Engine, Register } from 'claude-code'

const DEFAULT_COLOR = 'gray'
const BORDER = 'bold' // thick lines
const CHEVRON = '❯'
const STORE_KEY = 'color'

const color = atom({ plugin: 'prompt-box', key: 'color' } as const, DEFAULT_COLOR)

// The 16 ANSI names the terminal draws; the bright ones are Ink's `<name>Bright`.
const BASE = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']
const NAMES = ['gray', ...BASE, ...BASE.filter(n => n !== 'black').map(n => `${n}Bright`)]
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

// Hues the 16 ANSI colors lack, stored by name and resolved to their hex when drawn.
const FIXED: Record<string, string> = { purple: '#a855f7', orange: '#f97316', pink: '#ec4899' }

// What the command shows as the choices: the common names first, as people type them.
const HINT = 'red|blue|green|yellow|purple|orange|pink|cyan|default|#hex|reset'

const PASTE_TAG = /<\/?pasted_content[^>]*>/g

// Tags out, then the blank lines they leave: trim the ends and keep at most one empty line between.
function readable(text: string): string {
  return text.replace(PASTE_TAG, '').trim().replace(/\n{3,}/g, '\n\n')
}

// A name is matched case-insensitively and returned in its canonical spelling; null when the input
// is neither a known name nor a hex color.
function parse(input: string): string | null {
  const v = input.trim()
  if (HEX.test(v)) return v.toLowerCase()
  const all = [...NAMES, ...Object.keys(FIXED)]
  return all.find(n => n.toLowerCase() === v.toLowerCase()) ?? null
}

// Declared at the top level because `claude plugin validate` only follows `$` into such functions.
async function setColor($: Engine, value: string) {
  await update($, color, () => value)
  if (value === DEFAULT_COLOR) await $.store.delete(STORE_KEY)
  else await $.store.set(STORE_KEY, value)
}

// Takes the saved color into this session's state, so a color set in another session shows here at
// the next prompt without a restart. One small file read per prompt. An unset or invalid value means
// the default.
async function syncColor($: Engine) {
  const saved = await $.store.get(STORE_KEY)
  const value = (typeof saved === 'string' ? parse(saved) : null) ?? DEFAULT_COLOR
  if (value !== (await read($, color))) await update($, color, () => value)
}

async function run($: Engine, args: string) {
  const arg = args.trim()
  await syncColor($)
  const current = await read($, color)
  if (!arg) {
    return `Prompt color: ${current}. Use /prompt-color [${HINT}]. Also: ${NAMES.join(', ')}.`
  }
  if (['reset', 'default'].includes(arg.toLowerCase())) {
    await setColor($, DEFAULT_COLOR)
    return `Prompt color reset to ${DEFAULT_COLOR}.`
  }
  const next = parse(arg)
  if (!next) return `"${arg}" is not a color. Use [${HINT}].`
  await setColor($, next)
  return `Prompt color set to ${next}.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'prompt-color',
      description: 'Set the color of the box around your prompts',
      argumentHint: `[${HINT}]`,
    })
    await syncColor($)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await syncColor($)
    return next(e)
  })

  on('command.run', { command: 'prompt-color' }, async ($, e) => ({ text: await run($, e.args) }))

  on('ui.render', { component: 'UserMessage', props: { origin: { kind: 'composer' } } }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const name = await read($, color)
    const c = FIXED[name] ?? name
    return (
      <Box borderStyle={BORDER} borderColor={c} paddingX={1} width="100%">
        <Box marginRight={1}>
          <Text color={c} bold>
            {CHEVRON}
          </Text>
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="wrap">{readable(e.props.text)}</Text>
        </Box>
      </Box>
    )
  })
}
