/**
 * Stands in for `server-only` under vitest.
 *
 * `server-only` exists to fail the build if a server module is pulled into a
 * client bundle. That guard is a build-time concern and Next still applies it;
 * in a jsdom test run it only prevents the module from being imported at all.
 * See the alias in `vitest.config.ts`.
 */
export {};
