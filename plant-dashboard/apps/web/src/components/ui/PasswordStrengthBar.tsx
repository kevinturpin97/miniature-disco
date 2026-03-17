import { passwordStrength } from '@core/utils/passwordStrength';
import { motion } from 'framer-motion';

interface PasswordStrengthBarProps {
  password: string;
}

export function PasswordStrengthBar({ password }: PasswordStrengthBarProps) {
  if (!password) return null;
  const result = passwordStrength(password);
  return (
    <div className="flex flex-col gap-2">
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${result.percentage}%` }}
          transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
          style={{ backgroundColor: result.color }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: result.color }}>
          {result.label}
        </span>
        {result.feedback.length > 0 && (
          <span className="text-xs text-white/30">{result.feedback[0]}</span>
        )}
      </div>
    </div>
  );
}
