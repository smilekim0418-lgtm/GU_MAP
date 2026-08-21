import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock window to be global
global.window = global;

describe('API Client (api-client.js)', () => {
  beforeEach(() => {
    // Reset global state
    delete global.fetchWithRetry;

    // Load and execute api-client.js
    const filePath = path.resolve(__dirname, '../js/utils/api-client.js');
    const code = fs.readFileSync(filePath, 'utf8');
    const executeScript = new Function(code);
    executeScript();

    // Use fake timers to fast-forward timeouts in exponential backoff
    vi.useFakeTimers();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should return parsed json on successful first fetch', async () => {
    const mockData = { success: true, payload: 'data' };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData
    });

    const result = await window.fetchWithRetry('http://example.com/api');

    expect(result).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const mockData = { success: true };
    
    // First attempt: Fail with status 500
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    });
    
    // Second attempt: Succeed
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData
    });

    // We need to run the promise in the background because of wait delays
    const promise = window.fetchWithRetry('http://example.com/api', {}, 2);

    // Fast-forward timer by 1000ms (1000 * Math.pow(2, 0)) to trigger retry
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;

    expect(result).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should fail after max retries are exhausted', async () => {
    // Mock 3 consecutive failures (1 initial + 2 retries)
    global.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable'
    });

    const promise = window.fetchWithRetry('http://example.com/api', {}, 2);

    // Attach dummy catch to avoid unhandled promise rejection in node process
    promise.catch(() => {});

    // Fast-forward all async timers to clear out exponential backoff timeouts
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow('HTTP 503 Service Unavailable');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
