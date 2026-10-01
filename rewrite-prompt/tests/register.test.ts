import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'rewrite-prompt',
  component: 'AbovePrompt',
  surface: 'terminal',
  viewport: { columns: 100, rows: 30 },
  props: { hasSurvey: false, isWorking: false, maxRows: 5, bodyColumns: 100, scroll: { offset: 0, bodyRows: 5 }, view: {} },
} as const

function stubs(on, draft: string, answer: { isAnswered: boolean; text?: string; reason?: string }) {
  const filled: unknown[] = []
  const toasts: string[] = []
  on('ui.render', () => ({ type: 'Text', props: {}, children: [''] }))
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  on('model.complete', () => ({ value: answer }))
  on('prompt.fill', (_$, e) => {
    filled.push(e)
    return { isFilled: true }
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return { filled, toasts }
}

test('pressing the button replaces the draft with the rewrite', async ($, on) => {
  const { filled } = stubs(on, 'fix teh bug in auth.py', { isAnswered: true, text: '  Fix the bug in auth.py.\n' })
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'rewrite' })
  expect(filled).toMatchObject([{ text: 'Fix the bug in auth.py.', mode: 'replace' }])
})

test('an empty draft is left alone', async ($, on) => {
  const { filled, toasts } = stubs(on, '   ', { isAnswered: true, text: 'x' })
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'rewrite' })
  expect(filled).toEqual([])
  expect(toasts).toContain('rewrite: the prompt is empty')
})

test('a failed model call keeps the draft and says why', async ($, on) => {
  const { filled, toasts } = stubs(on, 'do the thing', { isAnswered: false, reason: 'overloaded' })
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'rewrite' })
  expect(filled).toEqual([])
  expect(toasts).toContain('rewrite failed: overloaded')
})
