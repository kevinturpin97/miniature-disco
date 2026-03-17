import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { authService } from '@core/services/AuthService';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@core/schemas';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Animated } from '../components/Animated';

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordInput) => {
    setIsLoading(true);
    try {
      await authService.forgotPassword(data.email);
      setSent(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-base px-6">
      <div className="w-full max-w-md">
        <Animated preset="slideUp">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-white/50 hover:text-white mb-8 transition-colors"
          >
            <ArrowLeft size={16} />
            <span className="text-sm">Back to login</span>
          </Link>

          {sent ? (
            <Animated preset="scaleIn">
              <div className="bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-2xl p-8 text-center">
                <CheckCircle className="w-12 h-12 text-neon-green mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-white mb-2">
                  Check your email
                </h2>
                <p className="text-sm text-white/50">
                  We've sent a password reset link to your email address.
                </p>
              </div>
            </Animated>
          ) : (
            <Animated preset="scaleIn">
              <div className="bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-2xl p-8">
                <h2 className="text-2xl font-semibold text-white mb-2">
                  Forgot password?
                </h2>
                <p className="text-sm text-white/50 mb-6">
                  Enter your email to receive a reset link.
                </p>
                <form
                  onSubmit={handleSubmit(onSubmit)}
                  noValidate
                  className="flex flex-col gap-5"
                >
                  <Input
                    label="Email"
                    type="email"
                    placeholder="your@email.com"
                    value={watch('email', '')}
                    error={errors.email?.message}
                    onChangeValue={(v) => setValue('email', v)}
                    leftIcon={<Mail size={16} />}
                    autoComplete="email"
                    required
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    fullWidth
                    loading={isLoading}
                    onAction={handleSubmit(onSubmit)}
                  >
                    Send reset link
                  </Button>
                </form>
              </div>
            </Animated>
          )}
        </Animated>
      </div>
    </div>
  );
}
