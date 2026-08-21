import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock window to be global
global.window = global;

describe('AppState Store (store.js)', () => {
  beforeEach(() => {
    // Reset global state definitions
    delete global.AppState;
    delete global.isCctvLayerOn;
    delete global.isEventLayerOn;
    delete global.isSharedPmLayerOn;

    // Load and execute store.js script inside global scope
    const filePath = path.resolve(__dirname, '../js/store.js');
    const code = fs.readFileSync(filePath, 'utf8');
    const executeScript = new Function(code);
    executeScript();
  });

  it('should initialize with default states', () => {
    expect(window.AppState).toBeDefined();
    expect(window.AppState.get('map.zoom')).toBe(15);
    expect(window.AppState.get('map.center')).toEqual({ lat: 36.1284, lng: 128.3284 });
    expect(window.AppState.get('layers.cctv')).toBe(false);
  });

  it('should get and set values nested deeply', () => {
    window.AppState.set('map.zoom', 17);
    expect(window.AppState.get('map.zoom')).toBe(17);

    window.AppState.set('layers.cctv', true);
    expect(window.AppState.get('layers.cctv')).toBe(true);
  });

  it('should notify listener on state change', () => {
    const listener = vi.fn();
    window.AppState.on('layers.traffic', listener);

    window.AppState.set('layers.traffic', true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(true);
  });

  it('should not notify listener if value remains the same (deduplication)', () => {
    const listener = vi.fn();
    window.AppState.on('layers.traffic', listener);

    window.AppState.set('layers.traffic', true);
    window.AppState.set('layers.traffic', true); // same value
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should handle backward compatibility via defineProperty getters/setters', () => {
    // Assigning to legacy variable should update AppState
    window.isCctvLayerOn = true;
    expect(window.AppState.get('layers.cctv')).toBe(true);

    // Modifying AppState should update legacy variable
    window.AppState.set('layers.cctv', false);
    expect(window.isCctvLayerOn).toBe(false);
  });

  it('should not break chain if listener throws an error', () => {
    const brokenListener = vi.fn(() => { throw new Error('broken'); });
    const healthyListener = vi.fn();

    window.AppState.on('map.zoom', brokenListener);
    window.AppState.on('map.zoom', healthyListener);

    // Call console.error spy to prevent cluttering the test logs
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    window.AppState.set('map.zoom', 18);

    expect(brokenListener).toHaveBeenCalledTimes(1);
    expect(healthyListener).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
