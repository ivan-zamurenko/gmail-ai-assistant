/** Static browser configuration: values are embedded in dist, despite gitignore. */
import { LOCAL } from './local.js';
import { parseFolderId } from './folderId.js';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = key => { throw new Error(`Config ${key} invalid — check src/config/local.js`); };
function text(value, key, fallback = '') {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') fail(key);
  return value;
}
function section(key, fields) {
  const value = LOCAL[key];
  if (value === undefined) return undefined;
  if (!record(value)) fail(key);
  return Object.fromEntries(fields.filter(field => value[field] !== undefined).map(field => [field, text(value[field], `${key}.${field}`)]));
}
function checkRoot() {
  if (!record(LOCAL)) fail('shape');
}

export function loadConfig() {
  checkRoot();
  const folder = text(LOCAL.driveFolderId, 'driveFolderId').trim();
  return {
    geminiApiKey: text(LOCAL.geminiApiKey, 'geminiApiKey'),
    driveFolderId: folder ? parseFolderId(folder) : '',
    firebase: section('firebase', ['apiKey', 'projectId']),
    podAuth: section('podAuth', ['basicAuthorization', 'user', 'password', 'type']),
  };
}

export function getContact() {
  checkRoot();
  return { brand: '', email: '', phone: '', ...section('contact', ['brand', 'email', 'phone']) };
}
