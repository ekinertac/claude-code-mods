// spinner-toons: replaces the spinner word ("Sauteing…") with a one-line emoji cartoon of what the
// main agent is doing right now, e.g. "🐿️💨 📄📄📄 digging through the config pile".
//
// How: tool.call (main loop only) appends a short summary of each call to a small ring; a timer
// started at session.start wakes every PERIOD_MS, and if the turn is running and there is news since
// the last cartoon it asks a model for one line and stores it in $.state; the Spinner hook reads it.
// Why a timer: a model call started inside a tool.call hook is abandoned when that dispatch ends,
// while $.clock timers outlive dispatches (they run until cancelled or the module reloads).
// Cost: one small completion per PERIOD_MS while a turn runs and the agent is active, on the
// session's own plan; nothing is sent when the agent is idle or has done nothing new.
// Privacy: each tool call is summarised to its first ~60 chars (a Bash command, a path) and sent to
// the model as context, the same provider the session already talks to.
// Related: ../types/index.d.ts holds the $.state contract that `claude plugin validate` checks.

import { atom, read, update } from 'claude-code'
import type { Engine, Register } from 'claude-code'

const toon = atom({ plugin: 'spinner-toons', key: 'toon' } as const, null)

const MODEL = 'claude-sonnet-5-5'
const PERIOD_MS = 6000 // a new cartoon at most this often; also the cap on spend per active minute
const RING = 8 // events the model sees; older ones are scene-setting nobody will notice missing
const ARG_CHARS = 60
const MAX_TOON_CHARS = 80 // a spinner line, not a paragraph; longer is cut so it never wraps

const SYSTEM =
  'You are a cartoonist for a coding agent. Given its latest actions, reply with ONE line: ' +
  '2 to 5 emoji acting out a tiny scene of what it is doing, then 3 to 6 words of caption in ' +
  'present tense. Playful, never mean, no quotes. Example: "🐿️💨📄📄📄 digging through the config pile". ' +
  'Never copy commands, paths or secrets into the caption. Reply with the line only.'

// Declared at the top level because `claude plugin validate` only follows `$` into such functions.
let events: string[] = []
let fresh = false // true when events changed since the last cartoon
let isWorking = false
let busy = false

function summarize(e: Record<string, unknown>): string {
  const arg = [e.command, e.file_path, e.pattern, e.url, e.query, e.description, e.prompt, e.path].find(
    v => typeof v === 'string' && v.trim(),
  ) as string | undefined
  return `${String(e.tool)}${arg ? ': ' + arg.replace(/\s+/g, ' ').slice(0, ARG_CHARS) : ''}`
}

function clean(text: string): string {
  const line = text.split('\n').find(l => l.trim()) ?? ''
  const t = line.trim().replace(/^["'`]+|["'`]+$/g, '')
  return t.length > MAX_TOON_CHARS ? t.slice(0, MAX_TOON_CHARS - 1) + '…' : t
}

async function tick($: Engine) {
  if (busy || !isWorking || !fresh) return
  busy = true
  fresh = false
  try {
    const r = await $.model.complete({
      model: MODEL,
      system: SYSTEM,
      prompt: 'Latest actions, oldest first:\n' + events.map(s => '- ' + s).join('\n'),
      maxTokens: 100,
      effort: 'low',
      timeoutMs: 10000,
    })
    // On failure keep the previous cartoon; a flaky call should not blank the spinner.
    if (r.isAnswered && isWorking) {
      const line = clean(r.text)
      if (line) await update($, toon, () => line)
    }
  } finally {
    busy = false
  }
}

export const register: Register = on => {
  on('session.start', ($, e, next) => {
    $.clock.every(PERIOD_MS, () => tick($))
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    events = []
    fresh = false
    isWorking = true
    await update($, toon, () => null)
    return next(e)
  })

  on('tool.call', ($, e, next) => {
    if (e.agentId === undefined) {
      events = [...events, summarize(e as Record<string, unknown>)].slice(-RING)
      fresh = true
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      isWorking = false
      await update($, toon, () => null)
    }
    return next(e)
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const line = await read($, toon)
    return line ? next({ ...e, props: { ...e.props, message: line } }) : next(e)
  })
}
