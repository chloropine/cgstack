/**
 * Tool compatibility map for Codex CLI benchmark runs.
 */

export type ToolName =
  | 'Read'
  | 'Write'
  | 'Edit'
  | 'Bash'
  | 'Agent'
  | 'Glob'
  | 'Grep'
  | 'AskUserQuestion'
  | 'WebSearch'
  | 'WebFetch';

export const TOOL_COMPATIBILITY: Record<'codex', Record<ToolName, boolean>> = {
  codex: {
    Read: true,
    Write: false,
    Edit: false,
    Bash: true,
    Agent: false,
    Glob: false,
    Grep: false,
    AskUserQuestion: false,
    WebSearch: true,
    WebFetch: false,
  },
};

export function missingTools(
  provider: 'codex',
  requiredTools: ToolName[]
): ToolName[] {
  const map = TOOL_COMPATIBILITY[provider];
  return requiredTools.filter(t => !map[t]);
}
