import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFile } from 'node:fs/promises';

// No implicit emulator discovery: never accept production hosts/projects.
export function emulatorConfig(environment = process.env) {
  const match = /^127\.0\.0\.1:([1-9][0-9]{0,4})$/.exec(environment.FIRESTORE_EMULATOR_HOST ?? '');
  const projectId = environment.DPD_RULES_PROJECT;
  if (!match || Number(match[1]) > 65535 || !/^demo-dpd-rules-[a-z0-9-]{1,40}$/.test(projectId ?? '')) {
    throw new Error('Rules tests require an explicit loopback emulator and isolated demo-dpd-rules project');
  }
  return { projectId, firestore: { host: '127.0.0.1', port: Number(match[1]) } };
}

export async function createRulesEnvironment({ suffix = '', rules } = {}) {
  const config = emulatorConfig();
  if (suffix && !/^[a-z0-9-]{1,15}$/.test(suffix)) throw new Error('Invalid rules test project suffix');
  return initializeTestEnvironment({
    ...config,
    projectId: `${config.projectId}${suffix}`,
    firestore: {
      ...config.firestore,
      rules: rules ?? await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
}
