import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeAll } from 'vitest';
import ReasoningDots from '../ReasoningDots';
import { registerDefaultRenderers } from '../defaultRenderers';
import type { DisplayStep } from '../types';

beforeAll(() => {
  registerDefaultRenderers();
});

const makeStep = (step: string, status: 'active' | 'done' | 'error'): DisplayStep => ({
  step,
  status,
  data: {},
  timestamp: Date.now(),
  visibleSince: Date.now(),
});

describe('ReasoningDots', () => {
  it('renders one dot per step', () => {
    const steps: DisplayStep[] = [
      makeStep('router', 'done'),
      makeStep('sql_search', 'done'),
      makeStep('semantic_search', 'active'),
      makeStep('merge', 'active'),
    ];
    const { container } = render(
      <ReasoningDots displaySteps={steps} phase="accumulating" />
    );
    const dots = container.querySelectorAll('[data-testid="reasoning-dot"]');
    expect(dots).toHaveLength(4);
  });

  it('shows active step label from registry', () => {
    const steps: DisplayStep[] = [
      makeStep('router', 'done'),
      makeStep('sql_search', 'active'),
    ];
    render(<ReasoningDots displaySteps={steps} phase="accumulating" />);
    expect(screen.getByText('Durchsuche Karten...')).toBeTruthy();
  });

  it('returns null when no steps', () => {
    const { container } = render(
      <ReasoningDots displaySteps={[]} phase="accumulating" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('hides generating step from dot count', () => {
    const steps: DisplayStep[] = [
      makeStep('router', 'done'),
      makeStep('sql_search', 'done'),
      makeStep('generating', 'active'),
    ];
    const { container } = render(
      <ReasoningDots displaySteps={steps} phase="generating" />
    );
    const dots = container.querySelectorAll('[data-testid="reasoning-dot"]');
    expect(dots).toHaveLength(2);
  });
});
