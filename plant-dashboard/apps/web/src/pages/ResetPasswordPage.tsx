import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle } from 'lucide-react';
import { authService } from '@core/services/AuthService';
import { resetPasswordSchema, type ResetPasswordInput } from '@core/schemas';
import { getService, RouterToken } from '@core/di/container';
import { PasswordInput } from '../components/ui/PasswordInput';
import { PasswordStrengthBar } from '../components/ui/PasswordStrengthBar';
import { Button } from '../components/ui/Button';
import { Animated } from '../components/Animated';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });

  const passwordValue = watch('password', '');

  const onSubmit = async (data: ResetPasswordInput) => {
    setIsLoading(true);
    try {
      await authService.resetPassword(data.token, data.password);
      setDone(true);
      setTimeout(() => {
        const router = getService(RouterToken);
        router.navigate('/login');
      }, 2000);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-base px-6">
      <div className="w-full max-w-md">
        {done ? (
          <Animated preset="scaleIn">
            <div className="bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-2xl p-8 text-center">
              <CheckCircle className="w-12 h-12 text-neon-green mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-white mb-2">
                Password updated!
              </h2>
              <p className="text-sm text-white/50">Redirecting to login...</p>
            </div>
          </Animated>
        ) : (
          <Animated preset="scaleIn">
            <div className="bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-2xl p-8">
              <h2 className="text-2xl font-semibold text-white mb-2">
                Reset password
              </h2>
              <p className="text-sm text-white/50 mb-6">
                Choose a new password for your account.
              </p>
              <form
                onSubmit={handleSubmit(onSubmit)}
                noValidate
                className="flex flex-col gap-5"
              >
                <div className="flex flex-col gap-2">
                  <PasswordInput
                    label="New password"
                    value={passwordValue}
                    error={errors.password?.message}
                    onChangeValue={(v) =>
                      setValue('password', v, { shouldValidate: true })
                    }
                    autoComplete="new-password"
                  />
                  {passwordValue && (
                    <PasswordStrengthBar password={passwordValue} />
                  )}
                </div>
                <PasswordInput
                  label="Confirm password"
                  value={watch('confirmPassword', '')}
                  error={errors.confirmPassword?.message}
                  onChangeValue={(v) =>
                    setValue('confirmPassword', v, { shouldValidate: true })
                  }
                  autoComplete="new-password"
                />
                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  loading={isLoading}
                  onAction={handleSubmit(onSubmit)}
                >
                  Reset password
                </Button>
              </form>
            </div>
          </Animated>
        )}
      </div>
    </div>
  );
}
