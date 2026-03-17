import { motion, type MotionProps, type Target } from 'framer-motion';
import { animationPresets, type AnimationPresetKey } from '@ui/animations/presets';
import type { ReactNode } from 'react';

interface AnimatedProps extends Omit<MotionProps, 'initial' | 'animate' | 'exit'> {
  preset?: AnimationPresetKey;
  delay?: number;
  children?: ReactNode;
  className?: string;
  as?: keyof typeof motion;
}

export function Animated({ preset = 'fadeIn', delay = 0, children, className, as = 'div', ...props }: AnimatedProps) {
  const config = animationPresets[preset];
  if (!config || 'keyframes' in config) return <div className={className}>{children}</div>;

  const { duration, ease, from, to } = config as {
    duration: number;
    ease: readonly number[];
    from: Target;
    to: Target;
  };

  const exitTarget: Target = animationPresets.fadeOut
    ? (animationPresets.fadeOut as { from: Target }).from
    : { opacity: 0 };

  const Component = motion[as] as typeof motion.div;

  return (
    <Component
      initial={from}
      animate={to}
      exit={exitTarget}
      transition={{ duration: duration / 1000, ease: [...ease], delay: delay / 1000 }}
      className={className}
      {...props}
    >
      {children}
    </Component>
  );
}
