import type { HostConfig } from '../scripts/host-config';

const codex: HostConfig = {
  name: 'codex',
  displayName: 'OpenAI Codex CLI',
  cliCommand: 'codex',
  cliAliases: ['agents'],

  globalRoot: '.codex/skills/cgstack',
  localSkillRoot: '.agents/skills/cgstack',
  hostSubdir: '.agents',
  usesEnvVars: true,

  frontmatter: {
    mode: 'allowlist',
    keepFields: ['name', 'description'],
    descriptionLimit: 1024,
    descriptionLimitBehavior: 'error',
  },

  generation: {
    generateMetadata: true,
    metadataFormat: 'openai.yaml',
    skipSkills: [],
  },

  pathRewrites: [],

  suppressedResolvers: [
    'DESIGN_OUTSIDE_VOICES',  // design.ts:485 — Codex can't invoke itself
    'ADVERSARIAL_STEP',       // review.ts:408 — Codex can't invoke itself
    'CODEX_SECOND_OPINION',   // review.ts:257 — Codex can't invoke itself
    'CODEX_PLAN_REVIEW',      // review.ts:541 — Codex can't invoke itself
    'REVIEW_ARMY',            // review-army.ts:180 — Codex shouldn't orchestrate
    'GBRAIN_CONTEXT_LOAD',
    'GBRAIN_SAVE_RESULTS',
  ],

  runtimeRoot: {
    globalSymlinks: ['bin', 'browse/dist', 'browse/bin', 'cgstack-upgrade', 'ETHOS.md'],
    globalFiles: {
      'review': ['checklist.md', 'TODOS-format.md'],
    },
  },
  sidecar: {
    path: '.agents/skills/cgstack',
    symlinks: ['bin', 'browse', 'review', 'qa', 'ETHOS.md'],
  },

  install: {
    prefixable: false,
    linkingStrategy: 'symlink-generated',
  },

  coAuthorTrailer: 'Co-Authored-By: OpenAI Codex <noreply@openai.com>',
  learningsMode: 'basic',
  boundaryInstruction: 'IMPORTANT: Do NOT wander into generated skill installs under ~/.codex/skills/ or .agents/skills/ while solving ordinary repository tasks. They contain generated prompt artifacts and runtime symlinks. Edit source templates in the cgstack repo instead. Do NOT modify agents/openai.yaml unless the task is explicitly about OpenAI skill metadata.',
};

export default codex;
