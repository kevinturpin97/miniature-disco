import Lottie, { type LottieComponentProps } from 'lottie-react';
import type { CSSProperties } from 'react';

interface LottieAnimationProps {
  source: object;
  autoPlay?: boolean;
  loop?: boolean;
  speed?: number;
  onComplete?: () => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * Cross-platform Lottie wrapper — web uses lottie-react.
 * On React Native, swap for lottie-react-native.
 */
export function LottieAnimation({
  source,
  autoPlay = true,
  loop = true,
  onComplete,
  className,
  style,
}: LottieAnimationProps) {
  const props: LottieComponentProps = {
    animationData: source,
    autoplay: autoPlay,
    loop,
    onComplete,
    className,
    style,
  };
  return <Lottie {...props} />;
}
