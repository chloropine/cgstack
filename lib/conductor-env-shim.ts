/**
 * Conductor workspaces don't inherit the user's interactive shell env, so the
 * canonical OPENAI_API_KEY may be missing while Conductor's
 * CGSTACK_OPENAI_API_KEY form is present. Promote the CGSTACK_ form to
 * canonical when canonical is empty, so subprocesses that call OpenAI APIs
 * can pick it up.
 *
 * Import this for its side effect: `import "../lib/conductor-env-shim";`
 */
export function promoteConductorEnv(): void {
  for (const key of ["OPENAI_API_KEY"] as const) {
    if (!process.env[key] && process.env[`CGSTACK_${key}`]) {
      process.env[key] = process.env[`CGSTACK_${key}`];
    }
  }
}

promoteConductorEnv();
