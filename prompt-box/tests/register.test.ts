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
  const ran = await $.command.run({ command: 'prompt-color', args: 'teal' })
  expect(ran.text).toContain('"teal" is not a color')
  expect(await border($)).toContain('"borderColor":"gray"')
})

test('no argument reports the current color, reset and default go back to gray', async ($, on) => {
  boot(on)
  await $.session.start(START)
  await $.command.run({ command: 'prompt-color', args: 'green' })
  expect((await $.command.run({ command: 'prompt-color', args: '' })).text).toContain('Prompt color: green.')
  await $.command.run({ command: 'prompt-color', args: 'reset' })
  expect(await border($)).toContain('"borderColor":"gray"')
  await $.command.run({ command: 'prompt-color', args: 'blue' })
  await $.command.run({ command: 'prompt-color', args: 'default' })
  expect(await border($)).toContain('"borderColor":"gray"')
})

test('the default color is gray', async ($, on) => {
  boot(on)
  await $.session.start(START)
  expect(await border($)).toContain('"borderColor":"gray"')
})

test('purple, orange and pink are drawn as fixed hex colors but kept by name', async ($, on) => {
  boot(on)
  await $.session.start(START)
  expect((await $.command.run({ command: 'prompt-color', args: 'Orange' })).text).toBe('Prompt color set to orange.')
  expect(await border($)).toContain('"borderColor":"#f97316"')
  expect((await $.command.run({ command: 'prompt-color', args: '' })).text).toContain('Prompt color: orange.')
})

test('the saved color is loaded at session start', async ($, on) => {
  boot(on, { color: '#22d3ee' })
  await $.session.start(START)
  expect(await border($)).toContain('"borderColor":"#22d3ee"')
})

test('a bad saved value is ignored', async ($, on) => {
  boot(on, { color: 'not-a-color' })
  await $.session.start(START)
  expect(await border($)).toContain('"borderColor":"gray"')
})

test('a color saved by another session shows here at the next prompt', async ($, on) => {
  // A store the test can change from outside, as another session's /prompt-color does.
  const file: Record<string, unknown> = {}
  on('store.get', (_$, e) => ({ value: file[e.key] }))
  on('store.set', (_$, e) => {
    file[e.key] = e.value
    return { value: undefined }
  })
  on('store.delete', (_$, e) => {
    delete file[e.key]
    return { value: undefined }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'prompt-color' } }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine row'] }))
  on('prompt.submit', () => ({ text: 'ok' }))
  await $.session.start(START)
  expect(await border($)).toContain('"borderColor":"gray"')
  file.color = 'blue'
  await $.prompt.submit({ text: 'hello' } as any)
  expect(await border($)).toContain('"borderColor":"blue"')
  delete file.color
  await $.prompt.submit({ text: 'again' } as any)
  expect(await border($)).toContain('"borderColor":"gray"')
})

test('the row is still passed down, so other mods see the prompt rows', async ($, on) => {
  const beneath: string[] = []
  on('ui.render', (_$, e) => {
    beneath.push(e.component)
    return { type: 'Text', props: {}, children: ['engine row'] }
  })
  const tree = seen(await $.ui.render(ROW({ kind: 'composer' })))
  expect(beneath).toEqual(['UserMessage'])
  expect(tree).toContain('borderStyle')
})
