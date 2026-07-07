Address the following inline review comment on a pull request.

PR #{{prNumber}}: {{prTitle}}
Head branch: {{headRef}} (base: {{baseRef}}){{forkNotice}}

## Code section under review

### `{{filePath}}`{{lineInfo}}

```diff
{{diffHunk}}
```
{{threadSection}}{{triggerSection}}

Focus ONLY on this code section and what the comment asks. Do not review or rework the rest of the pull request. If the comment carries a ```suggestion block, apply it verbatim unless it is clearly broken - and say so if it is. Run `git diff origin/{{baseRef}}...HEAD` if you need the surrounding changes for context.
