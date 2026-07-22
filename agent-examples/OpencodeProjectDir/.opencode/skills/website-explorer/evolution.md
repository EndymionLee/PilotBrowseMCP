# 5.Skill Evolution Process

After task completion, review the execution trace and decide whether the Skill needs improvement.

## 1. Identify Improvement

Find:

- Missing instructions
- Inefficient steps
- Repeated failures
- New successful strategies

## 2. Generate Patch

Do not rewrite the whole Skill.

Generate a small patch:

- Add new rule
- Modify existing instruction
- Remove outdated guidance
- Add new example

## 3. Apply Update

Update the Skill file with the patch.

Example:

Before:

"Use API when possible."

After:

"Use API when possible. For SPA websites, inspect network requests before parsing DOM."

## 4. Verify

Run similar tasks to check:

- Did success rate improve?
- Did execution become shorter?
- Did token usage decrease?

Keep the change only if it improves performance.
