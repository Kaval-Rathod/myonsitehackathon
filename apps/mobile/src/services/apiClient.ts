import { VerificationEvent } from '@greenlink/shared';
import { getApiUrl } from '../config/api';

export type ApiResult = 
  | { type: 'success', status: 201 | 200, data: any }
  | { type: 'conflict', error: string }
  | { type: 'failed', error: string }
  | { type: 'transient', error: string };

export interface ApiClient {
  postEvent(event: VerificationEvent): Promise<ApiResult>;
}

export class HttpApiClient implements ApiClient {
  async postEvent(event: VerificationEvent): Promise<ApiResult> {
    try {
      const url = `${getApiUrl()}/events`;
      console.log(`[HttpApiClient] Posting event to ${url}`, event);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event),
      });

      console.log(`[HttpApiClient] Response received: ${response.status}`, response);

      if (response.status === 201 || response.status === 200) {
        const data = await response.json().catch(() => ({}));
        console.log('[HttpApiClient] Success data:', data);
        return { type: 'success', status: response.status as 201 | 200, data };
      }

      const errBody = await response.text().catch(() => '');
      const errMsg = errBody || `HTTP ${response.status}`;
      console.error(`[HttpApiClient] Server returned error: ${response.status} - ${errMsg}`);

      if (response.status === 409) {
        return { type: 'conflict', error: errMsg };
      }

      if (response.status === 400 || response.status === 413) {
        return { type: 'failed', error: errMsg };
      }

      // Treat all other 5xx or unhandled status codes as transient
      return { type: 'transient', error: errMsg };

    } catch (error: any) {
      console.error('[HttpApiClient] Network/Fetch error:', error);
      return { type: 'transient', error: error.message || 'Network error' };
    }
  }
}
