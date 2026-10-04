import { expect, test } from 'claude-code/testing'

const ROW = (origin: object, text = 'fix the login bug') =>
  ({
    component: 'UserMessage',
    surface: 'terminal',
    viewport: { columns: 100, rows: 30 },
    props: { text, origin, isExpanded: false },
  }) as const

const seen = (tree: any): string => JSON.stringify(tree)

test('a typed prompt is drawn on a Claude-orange band with black text', async ($, on) => {
  on('ui.render', (_$, e) => ({ type: 'Text', props: {}, children: ['engine row'] }))
  const tree = seen(await $.ui.render(ROW({ kind: 'composer' })))
  expect(tree).toContain('fix the login bug')
  expect(tree).toContain('"backgroundColor":"#D97757"')
  expect(tree).toContain('"color":"black"')
  expect(tree).not.toContain('borderStyle')
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
