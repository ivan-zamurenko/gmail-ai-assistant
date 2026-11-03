import { fetchApi } from '../shared/apiErrors.js';

/** Gmail JSON boundary. Only reads may retry; writes require reconciliation. */
export const request = {
  get(url, { headers, ...options } = {}) {
    return fetchApi(url, {
      ...options, method: 'GET', readOnly: true,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  },
  post(url, { headers, body, ...options } = {}) {
    return fetchApi(url, {
      ...options, method: 'POST', readOnly: false,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body ?? {}),
    });
  },
};
