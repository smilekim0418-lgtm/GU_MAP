import { vi } from 'vitest';

// Mock window to be global in Node environment
global.window = global;

// Mock document and DOM APIs
global.document = {
  getElementById: vi.fn(),
  createElement: vi.fn(() => ({
    style: {},
    appendChild: vi.fn(),
    remove: vi.fn(),
    textContent: ''
  })),
  body: {
    appendChild: vi.fn()
  }
};

// Mock fetch globally
global.fetch = vi.fn();
