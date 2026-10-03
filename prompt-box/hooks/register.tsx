// prompt-box: draws the prompts you typed in a thick colored box in the scrollback.
//
// Why: the engine draws a typed prompt as one `> text` line, which is easy to lose when you scroll
// back through long agent output. A full-width bordered box is visible at scroll speed.
// How: a ui.render hook on the UserMessage row, matched on origin.kind 'composer', so task
// notifications, peer messages and plugin prompts keep the engine's own rows.
// The chevron sits in its own column, so wrapped and multi-line prompts line up under the first
// character of the text instead of under the chevron.
// The text is drawn as given and wraps; the stored message and what the model reads do not change.
// Constraint: the box costs two extra rows per prompt (top and bottom border), and it also shows in
// the ctrl+o transcript.

import type { Register } from 'claude-code'

const BORDER = 'bold' // thick lines
const COLOR = 'cyan'
const CHEVRON = '❯'

export const register: Register = on => {
  on('ui.render', { component: 'UserMessage', props: { origin: { kind: 'composer' } } }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box borderStyle={BORDER} borderColor={COLOR} paddingX={1} width="100%">
        <Box marginRight={1}>
          <Text color={COLOR} bold>
            {CHEVRON}
          </Text>
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="wrap">{e.props.text}</Text>
        </Box>
      </Box>
    )
  })
}
