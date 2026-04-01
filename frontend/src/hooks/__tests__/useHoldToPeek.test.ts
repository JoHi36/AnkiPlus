import { renderHook, act } from '@testing-library/react';
import { useHoldToPeek } from '../useHoldToPeek';

describe('useHoldToPeek', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('calls onPeekStart after hold threshold', () => {
    const onPeekStart = vi.fn();
    const onPeekEnd = vi.fn();
    const { result } = renderHook(() => useHoldToPeek({ onPeekStart, onPeekEnd, threshold: 300 }));

    act(() => { result.current.handlers.onPointerDown({ preventDefault: vi.fn() } as any); });
    expect(onPeekStart).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(300); });
    expect(onPeekStart).toHaveBeenCalledTimes(1);
  });

  it('does not call onPeekStart if released before threshold', () => {
    const onPeekStart = vi.fn();
    const onPeekEnd = vi.fn();
    const { result } = renderHook(() => useHoldToPeek({ onPeekStart, onPeekEnd, threshold: 300 }));

    act(() => { result.current.handlers.onPointerDown({ preventDefault: vi.fn() } as any); });
    act(() => { vi.advanceTimersByTime(100); });
    act(() => { result.current.handlers.onPointerUp(); });
    act(() => { vi.advanceTimersByTime(300); });

    expect(onPeekStart).not.toHaveBeenCalled();
  });

  it('calls onPeekEnd when pointer released after peek started', () => {
    const onPeekStart = vi.fn();
    const onPeekEnd = vi.fn();
    const { result } = renderHook(() => useHoldToPeek({ onPeekStart, onPeekEnd, threshold: 300 }));

    act(() => { result.current.handlers.onPointerDown({ preventDefault: vi.fn() } as any); });
    act(() => { vi.advanceTimersByTime(300); });
    act(() => { result.current.handlers.onPointerUp(); });

    expect(onPeekEnd).toHaveBeenCalledTimes(1);
  });
});
