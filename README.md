# claude-code-mods

Claude Code mods I use daily. `rewrite-prompt`: press Ctrl+P and the draft in the prompt box is rewritten in place by a model (Sonnet, on your plan). Nothing is sent until you press Enter, and Ctrl+_ undoes it.

## Setup

```
claude plugin marketplace add ekinertac/claude-code-mods
claude plugin install rewrite-prompt@ekinertac-mods
```

Then bind the key. Add this to the `Global` block of `~/.claude/keybindings.json` and start a new session:

```
"ctrl+p": "app:toggleDiffNoiseFilter"
```

## How the shortcut works

No keybinding action runs a mod command. The mod draws a zero-size button above the prompt whose `action` is `app:toggleDiffNoiseFilter` (inert outside the diff panel), and the chord you bind to that action presses it. Nothing shows on screen.

## Limits

- Tested on Claude Code 2.1.287. Mod events and methods can change between releases.
- The rewrite replaces the draft. It keeps the intent, language and concrete details, and adds no requirements.
- Not checked in every terminal: if you see a blank row above the prompt, open an issue.
- Tests: `claude plugin test rewrite-prompt` (stubs the model, no network).
