// write-for-me: Ctrl+Y writes the next prompt for you, from the conversation so far, into the prompt box.
//
// Empty box: the model proposes the most likely next message. Text in the box: it is treated as a
// hint ("tests too", "do the second option") and expanded into a full prompt using the conversation.
// Nothing is sent; the result lands in the box for editing, and ctrl+_ (chat:undo) restores the hint.
//
// Why a Button: no keybinding action runs a mod command. A Button's `action` is pressed by whatever
// chord the person bound to that engine action, so keybindings.json maps ctrl+y to
// app:toggleDiffPreSession (inert outside the diff panel) and this Button answers it. rewrite-prompt
// uses app:toggleDiffNoiseFilter the same way; the two must not share an action.
// Setup: keybindings.json (Global: "ctrl+y": "app:toggleDiffPreSession") and the plugin loaded.
// Depends on: $.session.messages, $.prompt.read/fill, $.model.complete (the session's plan), $.ui.

const SYSTEM =
  'You write the next message a developer will send to their coding agent, in their voice, ' +
  'from the conversation so far. Pick the single most useful next step the conversation points to ' +
  '(a follow-up, a fix for what just failed, the next item of a plan). Be specific: reuse the ' +
  'paths, names and numbers already in the conversation, in the language the developer writes in. ' +
  'If a hint is given, it is what the developer wants; expand it into a full prompt and add nothing ' +
  'it does not imply. Never invent requirements. Reply with the message text only, no quotes, no preamble.'

const MESSAGES = 12 // recent turns are enough to know the next step; older ones only cost tokens
const PER_MESSAGE = 1500 // chars; keeps one huge tool dump from crowding out the rest

// One write at a time, so a second press can't fill the box with a stale answer.
// Declared at the top level because `claude plugin validate` only follows `$` into such functions.
let busy = false

function transcript(messages) {
  return messages
    .slice(-MESSAGES)
    .map(m => `${m.role === 'user' ? 'Developer' : 'Agent'}: ${(m.text || '').slice(0, PER_MESSAGE)}`)
    .join('\n\n')
}

async function write($) {
  if (busy) return
  const [{ text: hint }, messages] = await Promise.all([$.prompt.read(), $.session.messages()])
  if (!messages.length) {
    $.ui.toast('write-for-me: nothing to go on yet, start the conversation first')
    return
  }
  busy = true
  $.ui.toast('writing…')
  try {
    const r = await $.model.complete({
      model: 'sonnet',
      system: SYSTEM,
      prompt: transcript(messages) + (hint.trim() ? `\n\nHint from the developer: ${hint.trim()}` : ''),
      maxTokens: 1024,
      timeoutMs: 60000,
    })
    if (!r.isAnswered) {
      $.ui.toast('write-for-me failed: ' + r.reason)
      return
    }
    await $.prompt.fill({ text: r.text.trim(), mode: 'replace' })
  } finally {
    busy = false
  }
}

export function register(on) {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { Box, Button } = $.ui.resolve(e)
    // Keep what other mods draw in the band
    const rest = await next(e)
    // Zero-size and out of the layout: the Button must be mounted for its chord to fire, but it
    // should not take a row or show a label
    const mine = Box({
      position: 'absolute',
      width: 0,
      height: 0,
      children: [
        Button({
          key: 'write',
          label: ' ',
          plain: true,
          action: 'app:toggleDiffPreSession',
          onPress: () => write($),
        }),
      ],
    })
    return Box({ flexDirection: 'column', children: rest ? [rest, mine] : [mine] })
  })
}
