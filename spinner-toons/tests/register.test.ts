import { expect, mock, test } from 'claude-code/testing'

const SPINNER = {
  component: 'Spinner',
  surface: 'terminal',
  viewport: { columns: 100, rows: 30 },
  props: { word: 'Sauteing', message: null, suffix: '…', mode: 'tool-use' },
} as const

const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const

// Boots the mod against a mocked clock and a scripted model; `shown` is the spinner message the
// engine would draw, read from what reaches the render hook beneath the mod.
async function boot($, on, replies: Array<{ isAnswered: boolean; text?: string; reason?: string }>) {
  const clock = mock.clock(on)
  const asked: any[] = []
  let shown: string | null = null
  on('model.complete', (_$, e) => {
    asked.push(e)
    return { value: replies.shift() ?? { isAnswered: false, reason: 'empty-reply' } }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: 'done' }))
  on('tool.call', () => ({ result: 'ok' }))
  on('ui.render', (_$, e) => {
    shown = e.props.message
    return { type: 'Text', props: {}, children: [''] }
  })
  await $.session.start(START)
  await $.turn.start({ text: 'go', turnId: 't1' })
  const draw = async () => {
    await $.ui.render(SPINNER)
    return shown
  }
  return { clock, asked, draw }
}

test('a cartoon replaces the spinner word after a tool call and a tick', async ($, on) => {
  const { clock, asked, draw } = await boot($, on, [{ isAnswered: true, text: '🐿️💨📄📄 digging through configs' }])
  await $.tool.call({ tool: 'Grep', pattern: 'TODO' })
  await clock.advance(6000)
  expect(await draw()).toBe('🐿️💨📄📄 digging through configs')
  expect(asked[0].model).toBe('claude-sonnet-5-5')
  expect(asked[0].prompt).toContain('Grep: TODO')
})

test('nothing is asked while the agent has done nothing new', async ($, on) => {
  const { clock, asked, draw } = await boot($, on, [{ isAnswered: true, text: 'x' }])
  await clock.advance(30000)
  expect(asked).toEqual([])
  expect(await draw()).toBe(null)
})

test('subagent tool calls are not drawn', async ($, on) => {
  const { clock, asked } = await boot($, on, [{ isAnswered: true, text: 'x' }])
  await $.tool.call({ tool: 'Read', file_path: '/a', agentId: 'sub1' })
  await clock.advance(6000)
  expect(asked).toEqual([])
})

test('a failed call keeps the previous cartoon', async ($, on) => {
  const { clock, draw } = await boot($, on, [
    { isAnswered: true, text: '🔧 tightening bolts' },
    { isAnswered: false, reason: 'api-error' },
  ])
  await $.tool.call({ tool: 'Edit', file_path: '/a' })
  await clock.advance(6000)
  await $.tool.call({ tool: 'Bash', command: 'make' })
  await clock.advance(6000)
  expect(await draw()).toBe('🔧 tightening bolts')
})

test('a long or multi-line reply is cut to one short line', async ($, on) => {
  const { clock, draw } = await boot($, on, [{ isAnswered: true, text: '\n"' + 'a'.repeat(200) + '"\nsecond line' }])
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await clock.advance(6000)
  const line = (await draw()) as string
  expect(line.length).toBe(80)
  expect(line.endsWith('…')).toBe(true)
})

test('the cartoon is cleared when the turn completes', async ($, on) => {
  const { clock, draw } = await boot($, on, [{ isAnswered: true, text: '🐢 slow and steady' }])
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await clock.advance(6000)
  expect(await draw()).toBe('🐢 slow and steady')
  await $.turn.complete({ reason: 'answer', text: 'done' } as any)
  expect(await draw()).toBe(null)
})
