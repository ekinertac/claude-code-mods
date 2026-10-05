import { expect, test } from 'claude-code/testing'

const VP = { columns: 100, rows: 30 }

const use = (id: string, tool: string, input: object, extra: object = {}) =>
  ({
    component: 'ToolUse',
    surface: 'terminal',
    requestId: id,
    viewport: VP,
    props: { tool_use_id: id, tool, input, isRunning: false, isErrored: false, isInterrupted: false, ...extra },
  }) as const

const result = (id: string, isErrored = false) =>
  ({
    component: 'ToolResult',
    surface: 'terminal',
    requestId: id,
    viewport: VP,
    props: { tool_use_id: id, tool: 'Bash', output: { stdout: 'x' }, isErrored },
  }) as const

const user = (isExpanded: boolean) =>
  ({
    component: 'UserMessage',
    surface: 'terminal',
    requestId: 'u1',
    viewport: VP,
    props: { text: 'hi', origin: { kind: 'composer' }, isExpanded },
  }) as const

const ENGINE = { type: 'Text', props: {}, children: ['engine row'] }
const seen = (tree: unknown) => JSON.stringify(tree)

// Scripts the transcript the tool.call hook reads: each entry is one assistant message.
function boot(on, transcript: Array<{ role: string; text: string }>) {
  on('ui.render', () => ENGINE)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: 'ok' }))
  on('session.messages', () => ({ value: transcript }))
}

test('a call is drawn as one line with its subject, and its result is hidden', async ($, on) => {
  boot(on, [])
  const row = seen(await $.ui.render(use('t1', 'Bash', { command: 'echo hi\nsecond line' })))
  expect(row).toContain('Bash')
  expect(row).toContain('(echo hi)')
  expect(row).not.toContain('"wrap":"truncate-end","dimColor":true')
  expect(row).not.toContain('second line')
  expect(seen(await $.ui.render(result('t1')))).toContain('"display":"none"')
})

test('a failed result keeps the engine row', async ($, on) => {
  boot(on, [])
  expect(seen(await $.ui.render(result('t1', true)))).toContain('engine row')
})

test('the expanded transcript passes every row to the engine', async ($, on) => {
  boot(on, [])
  await $.ui.render(user(true))
  expect(seen(await $.ui.render(use('t1', 'Bash', { command: 'ls' })))).toContain('engine row')
  expect(seen(await $.ui.render(result('t1')))).toContain('engine row')
  await $.ui.render(user(false))
  expect(seen(await $.ui.render(use('t1', 'Bash', { command: 'ls' })))).not.toContain('engine row')
})

test('runs: calls with no text between fold into one summary line on the first row', { options: { detail: 'runs' } }, async ($, on) => {
  boot(on, [{ role: 'assistant', text: '' }])
  await $.turn.start({ text: 'go', turnId: 't' })
  await $.tool.call({ tool: 'Bash', command: 'a', tool_use_id: 'c1' } as any)
  await $.tool.call({ tool: 'Read', file_path: '/b', tool_use_id: 'c2' } as any)
  const first = seen(await $.ui.render(use('c1', 'Bash', { command: 'a' })))
  const second = seen(await $.ui.render(use('c2', 'Read', { file_path: '/b' })))
  expect(first).toContain('Ran 2 tools: Bash, Read')
  expect(first).toContain('"dimColor":true')
  expect(second).toContain('"display":"none"')
})

test('runs: assistant text between two calls starts a new run', { options: { detail: 'runs' } }, async ($, on) => {
  const transcript = [{ role: 'assistant', text: '' }]
  boot(on, transcript)
  await $.turn.start({ text: 'go', turnId: 't' })
  await $.tool.call({ tool: 'Bash', command: 'a', tool_use_id: 'c1' } as any)
  transcript.push({ role: 'assistant', text: 'step one done' }, { role: 'assistant', text: '' })
  await $.tool.call({ tool: 'Bash', command: 'b', tool_use_id: 'c2' } as any)
  expect(seen(await $.ui.render(use('c1', 'Bash', { command: 'a' })))).toContain('Ran 1 tool: Bash')
  expect(seen(await $.ui.render(use('c2', 'Bash', { command: 'b' })))).toContain('Ran 1 tool: Bash')
})

test('runs: a call this module never saw is drawn as its own line', { options: { detail: 'runs' } }, async ($, on) => {
  boot(on, [])
  expect(seen(await $.ui.render(use('old', 'Grep', { pattern: 'TODO' })))).toContain('(TODO)')
})
