/**
 * Host config registry.
 *
 * cgstack is Codex-only. Keep this registry intentionally narrow so install,
 * generation, and tests cannot drift back into multi-host behavior.
 */

import type { HostConfig } from '../scripts/host-config';
import codex from './codex';

/** All registered host configs. */
export const ALL_HOST_CONFIGS: HostConfig[] = [codex];

/** Map from host name to config. */
export const HOST_CONFIG_MAP: Record<string, HostConfig> = Object.fromEntries(
  ALL_HOST_CONFIGS.map(c => [c.name, c])
);

/** Union type of all host names, derived from configs. */
export type Host = (typeof ALL_HOST_CONFIGS)[number]['name'];

/** All host names as a string array (for CLI arg validation, etc.). */
export const ALL_HOST_NAMES: string[] = ALL_HOST_CONFIGS.map(c => c.name);

/** Get a host config by name. Throws if not found. */
export function getHostConfig(name: string): HostConfig {
  const config = HOST_CONFIG_MAP[name];
  if (!config) {
    throw new Error(`Unknown host '${name}'. Valid hosts: ${ALL_HOST_NAMES.join(', ')}`);
  }
  return config;
}

/**
 * Resolve a host name from a CLI argument, handling aliases.
 */
export function resolveHostArg(arg: string): string {
  // Direct name match
  if (HOST_CONFIG_MAP[arg]) return arg;

  // Alias match
  for (const config of ALL_HOST_CONFIGS) {
    if (config.cliAliases?.includes(arg)) return config.name;
  }

  throw new Error(`Unknown host '${arg}'. Valid hosts: ${ALL_HOST_NAMES.join(', ')}`);
}

/**
 * Compatibility helper for older tests/scripts. There are no external hosts in
 * the Codex-only fork.
 */
export function getExternalHosts(): HostConfig[] {
  return [];
}

export { codex };
