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
// Color: /prompt-color <name|#hex|reset> sets the border and chevron color. The value lives in
// $.state (so the rows redraw at once) and in $.store (so it survives a restart). A name is one of
// the terminal's 16 ANSI colors and follows the terminal's color scheme; a hex value is fixed.
// Constraint: the box costs two extra rows per prompt (top and bottom border), and it also shows in
// the ctrl+o transcript.
// Related: ../types/index.d.ts is the $.state contract.

import { atom, read, update } from 'claude-code'
import type { Engine, Register } from 'claude-code'

const DEFAULT_COLOR = 'cyan'
const BORDER = 'bold' // thick lines
const CHEVRON = '❯'
const STORE_KEY = 'color'

const color = atom({ plugin: 'prompt-box', key: 'color' } as const, DEFAULT_COLOR)

// The 16 ANSI names the terminal draws; the bright ones are Ink's `<name>Bright`.
const BASE = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']
const NAMES = ['gray', ...BASE, ...BASE.filter(n => n !== 'black').map(n => `${n}Bright`)]
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

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
  return NAMES.find(n => n.toLowerCase() === v.toLowerCase()) ?? null
}

// Declared at the top level because `claude plugin validate` only follows `$` into such functions.
async function setColor($: Engine, value: string) {
  await update($, color, () => value)
  if (value === DEFAULT_COLOR) await $.store.delete(STORE_KEY)
  else await $.store.set(STORE_KEY, value)
}

async function run($: Engine, args: string) {
  const arg = args.trim()
  const current = await read($, color)
  if (!arg) {
    return `Prompt color: ${current}. Use /prompt-color <name|#hex|reset>. Names: ${NAMES.join(', ')}.`
  }
  if (arg.toLowerCase() === 'reset') {
    await setColor($, DEFAULT_COLOR)
    return `Prompt color reset to ${DEFAULT_COLOR}.`
  }
  const next = parse(arg)
  if (!next) return `"${arg}" is not a color. Use a name (${NAMES.join(', ')}) or a hex value like #ff8800.`
  await setColor($, next)
  return `Prompt color set to ${next}.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'prompt-color',
      description: 'Set the color of the box around your prompts',
      argumentHint: '<name|#hex|reset>',
    })
    const saved = await $.store.get(STORE_KEY)
    const value = typeof saved === 'string' ? parse(saved) : null
    if (value) await update($, color, () => value)
    return next(e)
  })

  on('command.run', { command: 'prompt-color' }, async ($, e) => ({ text: await run($, e.args) }))

  on('ui.render', { component: 'UserMessage', props: { origin: { kind: 'composer' } } }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const c = await read($, color)
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
