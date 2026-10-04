import { expect, mock, test } from 'claude-code/testing'

const ROW = (origin: object, text = 'fix the login bug') =>
  ({
    component: 'UserMessage',
    surface: 'terminal',
    viewport: { columns: 100, rows: 30 },
    props: { text, origin, isExpanded: false },
  }) as const

const seen = (tree: any): string => JSON.stringify(tree)

test('a typed prompt is drawn in a thick colored box with its text', async ($, on) => {
  on('ui.render', (_$, e) => ({ type: 'Text', props: {}, children: ['engine row'] }))
  const tree = seen(await $.ui.render(ROW({ kind: 'composer' })))
  expect(tree).toContain('fix the login bug')
  expect(tree).toContain('"borderStyle":"bold"')
})

test('a task notification keeps the engine row', async ($, on) => {
  on('ui.render', (_$, e) => ({ type: 'Text', props: {}, children: ['engine row'] }))
  const tree = seen(await $.ui.render(ROW({ kind: 'task-notification' })))
  expect(tree).toContain('engine row')
  expect(tree).not.toContain('borderStyle')
})

test('a long prompt is passed whole and wraps', async ($, on) => {
  on('ui.render', () => ({ type: 'Text', props: {}, children: [''] }))
  const long = 'word '.repeat(80).trim()
  const tree = seen(await $.ui.render(ROW({ kind: 'composer' }, long)))
  expect(tree).toContain(long)
  expect(tree).toContain('"wrap":"wrap"')
})

test('the chevron is drawn once, before the text, and multi-line text stays whole', async ($, on) => {
  on('ui.render', () => ({ type: 'Text', props: {}, children: [''] }))
  const text = 'line one\nline two'
  const tree = seen(await $.ui.render(ROW({ kind: 'composer' }, text)))
  expect(tree).toContain(text.replace('\n', '\\n'))
  expect(tree.split('❯').length - 1).toBe(1)
  expect(tree.indexOf('❯')).toBeLessThan(tree.indexOf('line one'))
})

test('pasted-content tags are removed from the drawn text, the pasted lines stay', async ($, on) => {
  on('ui.render', () => ({ type: 'Text', props: {}, children: [''] }))
  const raw = 'see\n\n<pasted_content id="76e5">\nline 1\nline 2\n</pasted_content id="76e5">\n\n and my words'
  const tree = seen(await $.ui.render(ROW({ kind: 'composer' }, raw)))
  expect(tree).not.toContain('pasted_content')
  expect(tree).toContain('line 1\\nline 2')
  expect(tree).toContain('and my words')
})

const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const

function boot(on, entries: Record<string, unknown> = {}) {
  mock.store(on, entries)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'prompt-color' } }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine row'] }))
}

const border = async ($) => seen(await $.ui.render(ROW({ kind: 'composer' })))

test('/prompt-color sets the border and chevron color and the rows redraw in it', async ($, on) => {
  boot(on)
  await $.session.start(START)
  const ran = await $.command.run({ command: 'prompt-color', args: 'Red' })
  expect(ran.text).toBe('Prompt color set to red.')
  const tree = await border($)
  expect(tree).toContain('"borderColor":"red"')
  expect(tree).toContain('"color":"red"')
})

test('a hex color is accepted and kept lower case', async ($, on) => {
  boot(on)
  await $.session.start(START)
  await $.command.run({ command: 'prompt-color', args: '#FF8800' })
  expect(await border($)).toContain('"borderColor":"#ff8800"')
})

test('an unknown color is refused and the current one stays', async ($, on) => {
  boot(on)
  await $.session.start(START)
  const ran = await $.command.run({ command: 'prompt-color', args: 'orange' })
  expect(ran.text).toContain('"orange" is not a color')
  expect(await border($)).toContain('"borderColor":"cyan"')
})

test('no argument reports the current color, reset goes back to cyan', async ($, on) => {
  boot(on)
  await $.session.start(START)
  await $.command.run({ command: 'prompt-color', args: 'green' })
  expect((await $.command.run({ command: 'prompt-color', args: '' })).text).toContain('Prompt color: green.')
  await $.command.run({ command: 'prompt-color', args: 'reset' })
  expect(await border($)).toContain('"borderColor":"cyan"')
})

test('the saved color is loaded at session start', async ($, on) => {
  boot(on, { color: '#22d3ee' })
  await $.session.start(START)
  expect(await border($)).toContain('"borderColor":"#22d3ee"')
})

test('a bad saved value is ignored', async ($, on) => {
  boot(on, { color: 'not-a-color' })
  await $.session.start(START)
  expect(await border($)).toContain('"borderColor":"cyan"')
})
