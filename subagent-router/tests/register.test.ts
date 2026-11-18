import { expect, mock, test } from 'claude-code/testing'

// What reaches the engine is the stub beneath the mod: it answers with the model the spawn carries,
// so `ran.model` says what the engine would have started the subagent on.
const INHERITED = 'inherited'

// A classifier stub that answers with the label of `seen.tier`, and counts its calls. Hooks beneath
// the mod must be registered before the first call on `$`, so the tier is a variable the test sets.
function boot(on, tier: string | undefined | 'throw', stored: Record<string, unknown> = {}) {
  const seen = { tier, classifyCalls: 0, classifierModel: undefined as string | undefined, text: '' }
  mock.store(on, stored)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'subagent-router' } }))
  on('agent.spawn', (_$, e) => ({ model: e.model ?? INHERITED }))
  on('model.classify', (_$, e) => {
    seen.classifyCalls++
    seen.classifierModel = e.options?.model
    seen.text = e.text
    if (seen.tier === 'throw') throw new Error('classifier down')
    // A call on `$` is answered as { value }, not as the bare value.
    return { value: e.labels.find(l => l.startsWith(`${seen.tier}:`)) }
  })
  return seen
}

// The fields the engine sets on every spawn; the test kit raises the whole input.
const task = (extra: object = {}) => ({
  tool_use_id: 'tu1',
  provider: { plugin: 'engine', tier: 'core' as const },
  parentModel: 'fable',
  background: false,
  fork: false,
  prompt: 'find where the config is loaded',
  description: 'find config',
  subagentType: 'general-purpose',
  ...extra,
})

test('a small task runs on the small model, a medium one on the medium, a large one on the large', async ($, on) => {
  const seen = boot(on, 'small')
  for (const [tier, model] of [['small', 'haiku'], ['medium', 'sonnet'], ['large', 'opus']] as const) {
    seen.tier = tier
    expect((await $.agent.spawn(task())).model).toBe(model)
  }
})

test('a fork, a teammate and a workflow agent keep the engine choice', async ($, on) => {
  const seen = boot(on, 'small')
  expect((await $.agent.spawn(task({ fork: true }))).model).toBe(INHERITED)
  expect((await $.agent.spawn(task({ isTeammate: true }))).model).toBe(INHERITED)
  expect((await $.agent.spawn(task({ workflow: { runId: 'wf_1', agentIndex: 1 } }))).model).toBe(INHERITED)
  expect(seen.classifyCalls).toBe(0)
})

test('the classifier reads the description and the prompt, on the classifier model', async ($, on) => {
  const seen = boot(on, 'small')
  await $.agent.spawn(task())
  expect(seen.classifierModel).toBe('haiku')
  expect(seen.text).toContain('find config')
  expect(seen.text).toContain('where the config is loaded')
})

test('a call that names its own model keeps it and never asks the classifier', async ($, on) => {
  const seen = boot(on, 'small')
  expect((await $.agent.spawn(task({ model: 'opus' }))).model).toBe('opus')
  expect(seen.classifyCalls).toBe(0)
})

test('an agent type outside the types option keeps the engine choice', async ($, on) => {
  const seen = boot(on, 'small')
  expect((await $.agent.spawn(task({ subagentType: 'Explore' }))).model).toBe(INHERITED)
  expect(seen.classifyCalls).toBe(0)
})

test('a classifier that names no label leaves the engine choice', async ($, on) => {
  boot(on, undefined)
  expect((await $.agent.spawn(task())).model).toBe(INHERITED)
})

test('a classifier that fails leaves the engine choice and the subagent still starts', async ($, on) => {
  boot(on, 'throw')
  expect((await $.agent.spawn(task())).model).toBe(INHERITED)
})

test(
  'the options set the models, the classifier and the routed types',
  { options: { small: 'sonnet', classifier: 'sonnet', types: 'general-purpose, Plan' } },
  async ($, on) => {
    const seen = boot(on, 'small')
    expect((await $.agent.spawn(task({ subagentType: 'Plan' }))).model).toBe('sonnet')
    expect(seen.classifierModel).toBe('sonnet')
  },
)

const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const
const say = async ($, args: string) => (await $.command.run({ command: 'subagent-router', args })).text

test('switched off in the store, nothing is routed and the classifier is never asked', async ($, on) => {
  const seen = boot(on, 'small', { enabled: false })
  expect((await $.agent.spawn(task())).model).toBe(INHERITED)
  expect(seen.classifyCalls).toBe(0)
})

test('the command with no argument toggles the global default, and it takes effect at the next spawn', async ($, on) => {
  const seen = boot(on, 'small')
  await $.session.start(START)
  expect((await $.agent.spawn(task())).model).toBe('haiku')
  expect(await say($, '')).toContain('Global default set to off.')
  expect((await $.agent.spawn(task())).model).toBe(INHERITED)
  expect(await say($, '')).toContain('Global default set to on.')
  expect((await $.agent.spawn(task())).model).toBe('haiku')
  expect(seen.classifyCalls).toBe(2)
})

test('on, off and status say the state, and an unknown argument changes nothing', async ($, on) => {
  boot(on, 'small')
  await $.session.start(START)
  expect(await say($, 'off')).toContain('Subagent routing in this session: off. Global default: off.')
  expect(await say($, 'off')).toContain('Global default: off.')
  expect(await say($, 'status')).toContain('Subagent routing in this session: off.')
  expect(await say($, 'maybe')).toContain('"maybe" is not an option. Subagent routing in this session: off.')
  expect(await say($, 'here nope')).toContain('"here nope" is not an option.')
  expect(await say($, 'ON')).toContain('Subagent routing in this session: on. Global default: on.')
})

test('here off stops routing in this session only, the global default stays on', async ($, on) => {
  const seen = boot(on, 'small')
  await $.session.start(START)
  const said = await say($, 'here off')
  expect(said).toContain('This session set to off.')
  expect(said).toContain('Subagent routing in this session: off. Global default: on. Session override: off.')
  expect((await $.agent.spawn(task())).model).toBe(INHERITED)
  expect(seen.classifyCalls).toBe(0)
})

test('here on routes this session although the global default is off, and a global change does not undo it', async ($, on) => {
  boot(on, 'small', { enabled: false })
  await $.session.start(START)
  expect((await $.agent.spawn(task())).model).toBe(INHERITED)
  await say($, 'here on')
  expect((await $.agent.spawn(task())).model).toBe('haiku')
  await say($, 'off')
  expect((await $.agent.spawn(task())).model).toBe('haiku')
})

test('here reset ends the override, and here alone toggles what this session does', async ($, on) => {
  boot(on, 'small')
  await $.session.start(START)
  expect(await say($, 'here')).toContain('This session set to off.')
  expect((await $.agent.spawn(task())).model).toBe(INHERITED)
  expect(await say($, 'here')).toContain('This session set to on.')
  expect(await say($, 'here reset')).toContain('This session follows the global default. ')
  expect(await say($, 'status')).toContain('Session override: none.')
  expect((await $.agent.spawn(task())).model).toBe('haiku')
})
