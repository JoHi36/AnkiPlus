import { renderHook, act } from '@testing-library/react';
import { useLidLift } from '../../hooks/useLidLift';

describe('useLidLift', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useLidLift());
    expect(result.current.state).toBe('idle');
    expect(result.current.isOpen).toBe(false);
  });

  it('transitions to animating then open on trigger', () => {
    const { result } = renderHook(() => useLidLift());
    act(() => result.current.trigger());
    expect(result.current.state).toBe('animating');
    act(() => result.current.onAnimationComplete());
    expect(result.current.state).toBe('open');
    expect(result.current.isOpen).toBe(true);
  });

  it('reverse morphs from open to idle when no messages', () => {
    const { result } = renderHook(() => useLidLift());
    act(() => result.current.trigger());
    act(() => result.current.onAnimationComplete());
    expect(result.current.state).toBe('open');
    act(() => result.current.close(false));
    expect(result.current.state).toBe('reversing');
    act(() => result.current.onAnimationComplete());
    expect(result.current.state).toBe('idle');
  });

  it('cuts to idle when closing with messages (no reverse morph)', () => {
    const { result } = renderHook(() => useLidLift());
    act(() => result.current.trigger());
    act(() => result.current.onAnimationComplete());
    act(() => result.current.close(true));
    expect(result.current.state).toBe('idle');
  });

  it('does not trigger when already animating', () => {
    const { result } = renderHook(() => useLidLift());
    act(() => result.current.trigger());
    expect(result.current.state).toBe('animating');
    act(() => result.current.trigger());
    expect(result.current.state).toBe('animating');
  });
});
