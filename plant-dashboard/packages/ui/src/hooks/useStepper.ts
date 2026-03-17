import { useState, useCallback } from 'react';

export type StepStatus = 'upcoming' | 'current' | 'completed';

export interface Step { id: string; label: string; }

export function useStepper(steps: Step[], initialStep = 0) {
  const [currentIndex, setCurrentIndex] = useState(initialStep);

  const next = useCallback(() => { if (currentIndex < steps.length - 1) setCurrentIndex(i => i + 1); }, [currentIndex, steps.length]);
  const prev = useCallback(() => { if (currentIndex > 0) setCurrentIndex(i => i - 1); }, [currentIndex]);
  const goTo = useCallback((index: number) => { if (index >= 0 && index < steps.length) setCurrentIndex(index); }, [steps.length]);

  const getStatus = (index: number): StepStatus => {
    if (index < currentIndex) return 'completed';
    if (index === currentIndex) return 'current';
    return 'upcoming';
  };

  const progressPercent = ((currentIndex) / (steps.length - 1)) * 100;

  return {
    currentIndex, currentStep: steps[currentIndex],
    isFirst: currentIndex === 0, isLast: currentIndex === steps.length - 1,
    next, prev, goTo, getStatus, progressPercent,
    steps: steps.map((s, i) => ({ ...s, status: getStatus(i), index: i })),
  };
}
