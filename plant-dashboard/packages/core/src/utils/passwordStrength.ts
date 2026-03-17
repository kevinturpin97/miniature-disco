export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong';

export interface PasswordStrengthResult {
  strength: PasswordStrength;
  score: number; // 0–4
  label: string;
  color: string;
  percentage: number;
  feedback: string[];
}

export function passwordStrength(password: string): PasswordStrengthResult {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) score++;
  else feedback.push('Use at least 8 characters');
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  else feedback.push('Add uppercase letters');
  if (/[0-9]/.test(password)) score++;
  else feedback.push('Add numbers');
  if (/[^A-Za-z0-9]/.test(password)) score++;
  else feedback.push('Add special characters');

  const map: Record<number, Omit<PasswordStrengthResult, 'score' | 'feedback' | 'percentage'>> = {
    0: { strength: 'weak',   label: 'Weak',   color: '#FF4757' },
    1: { strength: 'weak',   label: 'Weak',   color: '#FF4757' },
    2: { strength: 'fair',   label: 'Fair',   color: '#FFD600' },
    3: { strength: 'good',   label: 'Good',   color: '#00F0FF' },
    4: { strength: 'strong', label: 'Strong', color: '#39FF14' },
    5: { strength: 'strong', label: 'Strong', color: '#39FF14' },
  };

  return { ...map[Math.min(score, 5)], score, feedback, percentage: (score / 5) * 100 };
}
