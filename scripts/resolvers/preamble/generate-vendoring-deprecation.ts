import type { TemplateContext } from '../types';

export function generateVendoringDeprecation(ctx: TemplateContext): string {
  return `If \`VENDORED_CGSTACK\` is \`yes\`, warn once via AskUserQuestion unless \`~/.cgstack/.vendoring-warned-$SLUG\` exists:

> This project has cgstack vendored in \`.agents/skills/cgstack/\`. Vendoring is deprecated.
> Migrate to team mode?

Options:
- A) Yes, migrate to team mode now
- B) No, I'll handle it myself

If A:
1. Run \`git rm -r .agents/skills/cgstack/\`
2. Run \`echo '.agents/skills/cgstack/' >> .gitignore\`
3. Run \`${ctx.paths.binDir}/cgstack-team-init required\` (or \`optional\`)
4. Run \`git add .codex/ .gitignore AGENTS.md && git commit -m "chore: migrate cgstack from vendored to team mode"\`
5. Tell the user: "Done. Each developer now runs: \`cd ~/.codex/skills/cgstack && ./setup --team\`"

If B: say "OK, you're on your own to keep the vendored copy up to date."

Always run (regardless of choice):
\`\`\`bash
eval "$(${ctx.paths.binDir}/cgstack-slug 2>/dev/null)" 2>/dev/null || true
touch ~/.cgstack/.vendoring-warned-\${SLUG:-unknown}
\`\`\`

If marker exists, skip.`;
}
