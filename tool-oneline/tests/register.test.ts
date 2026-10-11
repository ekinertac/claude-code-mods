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

const result = (id: string, isErrored = false, tool = 'Bash') =>
  ({
    component: 'ToolResult',
    surface: 'terminal',
    requestId: id,
    viewport: VP,
    props: { tool_use_id: id, tool, output: { stdout: 'x' }, isErrored },
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

// Transcript builders: the engine keeps each text block and each tool call as its own message.
const say = (text: string) => ({ role: 'assistant', text, toolUses: [] })
const ask = (text: string) => ({ role: 'user', text, toolUses: [] })
const call = (id: string, tool: string) => ({ role: 'assistant', text: '', toolUses: [{ tool_use_id: id, tool, input: {} }] })
const back = () => ({ role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'x', text: 'ok', isError: false }] })

function boot(on, transcript: unknown[] = []) {
  on('ui.render', () => ENGINE)
  on('tool.call', () => ({ result: 'ok' }))
  on('session.messages', () => ({ value: transcript }))
}

const RUNS = { options: { detail: 'runs' } }

test('a call is drawn as one line with its subject, and its result is hidden', async ($, on) => {
  boot(on)
  const row = seen(await $.ui.render(use('t1', 'Bash', { command: 'echo hi\nsecond line' })))
  expect(row).toContain('Bash')
  expect(row).toContain('(echo hi)')
  expect(row).not.toContain('second line')
  expect(seen(await $.ui.render(result('t1')))).toContain('"display":"none"')
})

test('a failed result keeps the engine row', async ($, on) => {
  boot(on)
  expect(seen(await $.ui.render(result('t1', true)))).toContain('engine row')
})

test('the expanded transcript passes every row to the engine', async ($, on) => {
  boot(on)
  await $.ui.render(user(true))
  expect(seen(await $.ui.render(use('t1', 'Bash', { command: 'ls' })))).toContain('engine row')
  expect(seen(await $.ui.render(result('t1')))).toContain('engine row')
  await $.ui.render(user(false))
  expect(seen(await $.ui.render(use('t1', 'Bash', { command: 'ls' })))).not.toContain('engine row')
})

test('runs: calls with no text between fold into one summary line on the first row', RUNS, async ($, on) => {
  boot(on, [ask('go'), call('c1', 'Bash'), back(), call('c2', 'Read')])
  const first = seen(await $.ui.render(use('c1', 'Bash', { command: 'a' })))
  expect(first).toContain('Ran 2 tools: Bash, Read')
  expect(first).toContain('"dimColor":true')
  expect(seen(await $.ui.render(use('c2', 'Read', { file_path: '/b' })))).toContain('"display":"none"')
})

test('runs: a transcript the mod never watched folds the same way, as after a resume', RUNS, async ($, on) => {
  // No tool.call ran in this test: the runs come from the stored transcript alone.
  boot(on, [ask('old prompt'), call('c1', 'Bash'), back(), call('c2', 'Bash'), back(), call('c3', 'Bash')])
  expect(seen(await $.ui.render(use('c1', 'Bash', {})))).toContain('Ran 3 tools: Bash ×3')
  expect(seen(await $.ui.render(use('c3', 'Bash', {})))).toContain('"display":"none"')
})

test('runs: assistant text between two calls starts a new run', RUNS, async ($, on) => {
  boot(on, [ask('go'), call('c1', 'Bash'), back(), say('step one done'), call('c2', 'Bash')])
  expect(seen(await $.ui.render(use('c1', 'Bash', {})))).toContain('Ran 1 tool: Bash')
  expect(seen(await $.ui.render(use('c2', 'Bash', {})))).toContain('Ran 1 tool: Bash')
})

test('runs: a new prompt from you starts a new run', RUNS, async ($, on) => {
  boot(on, [ask('one'), call('c1', 'Bash'), back(), ask('two'), call('c2', 'Bash')])
  expect(seen(await $.ui.render(use('c1', 'Bash', {})))).toContain('Ran 1 tool: Bash')
  expect(seen(await $.ui.render(use('c2', 'Bash', {})))).toContain('Ran 1 tool: Bash')
})

test('runs: a call the transcript does not hold yet is drawn as its own line', RUNS, async ($, on) => {
  boot(on, [ask('go')])
  expect(seen(await $.ui.render(use('new', 'Grep', { pattern: 'TODO' })))).toContain('(TODO)')
})

test('a shown tool keeps the engine row and its result, in both levels', async ($, on) => {
  boot(on)
  expect(seen(await $.ui.render(use('s1', 'SendUserFile', { file_path: '/tmp/a.png' })))).toContain('engine row')
  expect(seen(await $.ui.render(result('s1', false, 'SendUserFile')))).toContain('engine row')
})

test('runs: a shown tool is not counted and ends the run', RUNS, async ($, on) => {
  boot(on, [ask('go'), call('c1', 'Bash'), back(), call('s1', 'SendUserFile'), back(), call('c2', 'Bash'), back(), call('c3', 'Read')])
  expect(seen(await $.ui.render(use('c1', 'Bash', {})))).toContain('Ran 1 tool: Bash')
  expect(seen(await $.ui.render(use('s1', 'SendUserFile', {})))).toContain('engine row')
  expect(seen(await $.ui.render(use('c2', 'Bash', {})))).toContain('Ran 2 tools: Bash, Read')
  expect(seen(await $.ui.render(use('c3', 'Read', {})))).toContain('"display":"none"')
})

test('the show option adds tools to the shown set', { options: { show: 'Read, Edit' } }, async ($, on) => {
  boot(on)
  expect(seen(await $.ui.render(use('r1', 'Read', { file_path: '/b' })))).toContain('engine row')
  expect(seen(await $.ui.render(use('s1', 'SendUserFile', {})))).not.toContain('engine row')
})
