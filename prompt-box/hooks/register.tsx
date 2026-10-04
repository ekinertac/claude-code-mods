// prompt-box: draws the prompts you typed in a thick-bordered Claude-orange box in the scrollback.
//
// Why: the engine draws a typed prompt as one `> text` line, which is easy to lose when you scroll
// back through long agent output. A full-width filled box is visible at scroll speed.
// How: a ui.render hook on the UserMessage row, matched on origin.kind 'composer', so task
// notifications, peer messages and plugin prompts keep the engine's own rows.
// The chevron sits in its own column, so wrapped and multi-line prompts line up under the first
// character of the text instead of under the chevron.
// The text is drawn as given and wraps; the stored message and what the model reads do not change.
// Pasted text is stored wrapped in <pasted_content id="..."> tags for the model; they are noise to
// a reader, so they are removed from the drawn text only.
// Constraint: the box costs two extra rows per prompt (the borders), and it also shows in the
// ctrl+o transcript. Black text on the orange is fixed, not theme-aware, so it stays readable on
// light and dark themes alike.

import type { Register } from 'claude-code'

const BACKGROUND = '#D97757' // Claude orange
const BORDER = 'bold' // thick lines, drawn in the same orange as the fill
const TEXT = 'black'
const CHEVRON = '❯'

const PASTE_TAG = /<\/?pasted_content[^>]*>/g

// Tags out, then the blank lines they leave: trim the ends and keep at most one empty line between.
function readable(text: string): string {
  return text.replace(PASTE_TAG, '').trim().replace(/\n{3,}/g, '\n\n')
}

export const register: Register = on => {
  on('ui.render', { component: 'UserMessage', props: { origin: { kind: 'composer' } } }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box borderStyle={BORDER} borderColor={BACKGROUND} backgroundColor={BACKGROUND} paddingX={1} width="100%">
        <Box marginRight={1}>
          <Text color={TEXT} bold>
            {CHEVRON}
          </Text>
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          <Text color={TEXT} wrap="wrap">{readable(e.props.text)}</Text>
        </Box>
      </Box>
    )
  })
}
