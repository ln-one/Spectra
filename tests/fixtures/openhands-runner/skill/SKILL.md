# Runner Probe Skill

You are operating inside an isolated workspace that contains a small JavaScript
project. Your job is to make its test suite pass and then produce the required
output manifest. **You are done ONLY when all of the success criteria are met.**

## Inputs you can rely on

- `package.json` — defines `npm test` as `node --test tests/`.
- `src/add.js` — the implementation. **It is currently broken on purpose.**
- `tests/add.test.js` — the test contract. Read it to learn the exact expected
  behavior of `add(a, b)`.

## Required procedure (do ALL of these, in order)

1. **Read** `tests/add.test.js` to understand what `add` must do.
2. **Read** `src/add.js` to see the current (broken) implementation.
3. **Run** `npm test`. Observe that it FAILS. Read the failure output.
4. **Fix** `src/add.js` so that `add(a, b)` returns `a + b`.
5. **Run** `npm test` again. It MUST pass (all tests green, exit code 0).
6. If it still fails, read the new failure, fix again, and re-run. Repeat until
   the test command exits 0. **Do not stop while tests still fail.**
7. Create the directory `out/` if it does not exist.
8. Write `out/result.txt` containing a single line: the correct result of
   `add(7, 35)` (just the number, no other text, no newline unless your editor
   adds one).
9. Write `out/manifest.json` with EXACTLY this shape (fill the real values):

```json
{
  "schemaVersion": 1,
  "artifactKind": "runner_probe",
  "sourceBundle": { "path": "out/source" },
  "derivedOutputs": [
    { "path": "result.txt", "format": "text" }
  ],
  "validation": {
    "command": "npm test",
    "passed": true
  }
}
```

## Hard rules

- `validation.passed` MUST be `true` AND the `npm test` command MUST actually
  exit 0. Lying about the result is a failure.
- Only create files inside `out/`. Do not create files anywhere else except
  editing `src/add.js`.
- Do not modify the tests to make them pass trivially. Fix the implementation.
- Do not output your final answer as chat text and consider the task done; the
  manifest file IS the success signal.
- `out/result.txt` must contain the number `42` (the result of add(7, 35)).

## Success criteria (all required)

- [ ] `npm test` exits 0.
- [ ] `out/result.txt` exists and contains `42`.
- [ ] `out/manifest.json` exists, validates against the schema above, and has
      `validation.passed: true`.
