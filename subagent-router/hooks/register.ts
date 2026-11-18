// subagent-router: picks a model for each subagent from its task, like Cursor's Auto does per request.
//
// Why: the main thread keeps the long context and one model, and the work goes to subagents. A
// subagent that greps for a file does not need the model that designs a migration, and the reverse
// wastes the answer. Subagents have their own context, so a different model costs no prompt cache
// of the main thread. The main thread's model is never touched.
// How: an `agent.spawn` hook fires before a subagent starts, its model not yet resolved. It asks a
// small model to pick one of three tier labels for the task ($.model.classify, so the answer is one
// of the labels or nothing), maps the tier to the model set in the options and returns it with
// `next({ ...e, model })`. A dim notice under the Agent row says what was picked.
// Left alone (the engine decides, as without this mod):
//   - a call that names its own `model` (the main model chose on purpose),
//   - agent types outside the `types` option, because an agent definition may set its own model
//     and a hook cannot see it (Explore already runs a small one),
//   - forks, teammates, resumes and workflow agents,
//   - any failure of the classifier, so a bug here never blocks or delays a subagent for long.
// Cost: one short classify call (Haiku) per routed subagent, about a second before it starts.
// Switch, two levels: /subagent-router [on|off|status|here on|here off|here reset].
//   global default  `on` / `off` (no argument toggles it). Saved in $.store, so it is shared by every
//                   session and project and survives a restart, like /prompt-color in prompt-box.
//   session override  `here on` / `here off`. Held in $.state, so it ends with the session (a restart
//                   or a resume starts with none) and never leaks into the other open sessions.
// The override wins when set. Both are read at each spawn, so a global change made in one session
// applies to the others at their next subagent. A subagent already running keeps its model.
// Related: tool-oneline folds the Agent row, the notice shows in the expanded transcript too.

import { atom, read, update } from 'claude-code'
import type { Engine, Register } from 'claude-code'
import type { Override } from '../types'

// Only "off" is stored. Unset means on, so a fresh install routes without any setup.
const STORE_KEY = 'enabled'

const override = atom({ plugin: 'subagent-router', key: 'override' } as const, 'none' as Override)

// The labels are the whole prompt the classifier sees besides the task, so each says what its tier
// is for. The answer is one of them or undefined, never free text.
const LABELS = {
  small: 'small: search, read, list, summarize, or a mechanical edit whose answer is obvious',
  medium: 'medium: implement or fix a well-scoped change, write tests, review a diff',
  large: 'large: design, hard debugging, security review, or a change needing judgment across many files',
} as const

type Tier = keyof typeof LABELS

const TIERS = Object.keys(LABELS) as Tier[]
const LABEL_LIST = TIERS.map(t => LABELS[t])

// The prompt of a subagent can be long; the start says what the task is, and the classifier is meant
// to be cheap.
const MAX_TASK_CHARS = 4000

const text = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : fallback)

// Declared at the top level because `claude plugin validate` only follows `$` into such functions.
async function isGlobalOn($: Engine): Promise<boolean> {
  return (await $.store.get(STORE_KEY)) !== false
}

async function setGlobal($: Engine, value: boolean) {
  if (value) await $.store.delete(STORE_KEY)
  else await $.store.set(STORE_KEY, false)
}

// The state this session routes by: its own override when set, else the global default.
async function isOn($: Engine): Promise<boolean> {
  const o = await read($, override)
  return o === 'none' ? isGlobalOn($) : o === 'on'
}

const USAGE = 'Use /subagent-router [on|off|status|here on|here off|here reset].'

async function report($: Engine, said = ''): Promise<string> {
  const o = await read($, override)
  const global = (await isGlobalOn($)) ? 'on' : 'off'
  const here = (await isOn($)) ? 'on' : 'off'
  return `${said}Subagent routing in this session: ${here}. Global default: ${global}. Session override: ${o}. ${USAGE}`
}

async function run($: Engine, args: string): Promise<string> {
  const words = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const [first, second] = words
  const isOnOff = (w?: string) => w === 'on' || w === 'off'

  if (words.length === 0) {
    const next = !(await isGlobalOn($))
    await setGlobal($, next)
    return report($, `Global default set to ${next ? 'on' : 'off'}. `)
  }
  if (first === 'status' && words.length === 1) return report($)
  if (isOnOff(first) && words.length === 1) {
    await setGlobal($, first === 'on')
    return report($, `Global default set to ${first}. `)
  }
  if (first === 'here' && words.length === 1) {
    const next = (await isOn($)) ? 'off' : 'on'
    await update($, override, () => next)
    return report($, `This session set to ${next}. `)
  }
  if (first === 'here' && words.length === 2 && (isOnOff(second) || second === 'reset')) {
    const next: Override = second === 'reset' ? 'none' : (second as Override)
    await update($, override, () => next)
    return report($, next === 'none' ? 'This session follows the global default. ' : `This session set to ${next}. `)
  }
  return `"${args.trim()}" is not an option. ${await report($)}`
}

export const register: Register = (on, options) => {
  const models: Record<Tier, string> = {
    small: text(options.small, 'haiku'),
    medium: text(options.medium, 'sonnet'),
    large: text(options.large, 'opus'),
  }
  const classifier = text(options.classifier, 'haiku')
  const types = new Set(text(options.types, 'general-purpose').split(',').map(t => t.trim()).filter(Boolean))

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'subagent-router',
      description: 'Turn the choice of a model for each subagent on or off, for all sessions or for this one',
      argumentHint: '[on|off|status|here on|here off|here reset]',
    })
    return next(e)
  })

  on('command.run', { command: 'subagent-router' }, async ($, e) => ({ text: await run($, e.args) }))

  on('agent.spawn', async ($, e, next) => {
    if (!(await isOn($))) return next(e)
    const isLeftAlone =
      e.model !== undefined || e.fork || e.isTeammate || e.resume !== undefined || e.workflow !== undefined || !types.has(e.subagentType)
    if (isLeftAlone) return next(e)

    let label: string | undefined
    try {
      label = await $.model.classify(`${e.description}\n\n${e.prompt}`.slice(0, MAX_TASK_CHARS), LABEL_LIST, { model: classifier })
    } catch {
      return next(e)
    }
    const tier = TIERS.find(t => LABELS[t] === label)
    if (!tier) return next(e)

    if (e.tool_use_id) $.ui.notice(e.tool_use_id, `subagent-router: ${tier} task, running on ${models[tier]}`)
    return next({ ...e, model: models[tier] })
  }).catch(($, e, next) => next(e))
}
