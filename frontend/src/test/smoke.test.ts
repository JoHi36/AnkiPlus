import { describe, it, expect } from 'vitest';

describe('Test infrastructure', () => {
  it('vitest runs', () => {
    expect(1 + 1).toBe(2);
  });

  it('jsdom is available', () => {
    expect(document).toBeDefined();
    expect(window).toBeDefined();
  });

  it('ankiBridge mock is available', () => {
    expect((window as any).ankiBridge).toBeDefined();
    expect((window as any).ankiBridge.addMessage).toBeInstanceOf(Function);
  });
});
