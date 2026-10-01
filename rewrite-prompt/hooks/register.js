// rewrite-prompt: Ctrl+P rewrites the draft in the prompt box, in place, without sending it.
//
// Why a Button: no keybinding action runs a mod command. A Button's `action` is pressed by
// whatever chord the person bound to that engine action, so keybindings.json maps ctrl+p to
// app:toggleDiffNoiseFilter (inert outside the diff panel) and this Button answers it.
// Setup: keybindings.json (Global: "ctrl+p": "app:toggleDiffNoiseFilter") and
// CLAUDE_CODE_PLUGIN_DIRS in settings.json pointing at this folder.
// Depends on: $.prompt.read/fill, $.model.complete (uses the session's plan), $.ui.
// Constraint: the model reply replaces the draft, so the original is lost; ctrl+_ (chat:undo) restores it.

const SYSTEM =
  "Rewrite the user's draft as a prompt for a coding agent. Keep the intent, the language and " +
  'every concrete detail (paths, names, numbers, flags). Make it clearer and more specific and ' +
  'cut filler. Do not add requirements the draft does not state. Reply with the rewritten prompt only.'

// One rewrite at a time, so a second press can't overwrite the draft with a stale answer.
// Declared at the top level because `claude plugin validate` only follows `$` into such functions.
let busy = false

async function rewrite($) {
  if (busy) return
  const { text } = await $.prompt.read()
  if (!text.trim()) {
    $.ui.toast('rewrite: the prompt is empty')
    return
  }
  busy = true
  $.ui.toast('rewriting…')
  try {
    const r = await $.model.complete({
      model: 'sonnet',
      system: SYSTEM,
      prompt: text,
      maxTokens: 2048,
      timeoutMs: 60000,
    })
    if (!r.isAnswered) {
      $.ui.toast('rewrite failed: ' + r.reason)
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
          key: 'rewrite',
          label: ' ',
          plain: true,
          action: 'app:toggleDiffNoiseFilter',
          onPress: () => rewrite($),
        }),
      ],
    })
    return Box({ flexDirection: 'column', children: rest ? [rest, mine] : [mine] })
  })
}
