import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { Mail, User, Leaf } from 'lucide-react';
import { useAuth } from '@core/hooks/useAuth';
import { registerSchema, type RegisterInput } from '@core/schemas';
import { getService, RouterToken } from '@core/di/container';
import { Input } from '../components/ui/Input';
import { PasswordInput } from '../components/ui/PasswordInput';
import { PasswordStrengthBar } from '../components/ui/PasswordStrengthBar';
import { Button } from '../components/ui/Button';
import { Animated } from '../components/Animated';

export function RegisterPage() {
  const { register: registerUser, isLoading } = useAuth();
  const [shake, setShake] = useState(false);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    mode: 'onChange',
  });

  const passwordValue = watch('password', '');

  const onSubmit = async (data: RegisterInput) => {
    try {
      await registerUser(data);
      setSuccess(true);
      setTimeout(() => {
        const router = getService(RouterToken);
        router.navigate('/login');
      }, 2000);
    } catch {
      setShake(true);
      setTimeout(() => setShake(false), 600);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-base">
        <Animated preset="bounceIn">
          <div className="text-center p-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', bounce: 0.5, duration: 0.8 }}
              className="w-20 h-20 bg-neon-green/20 border-2 border-neon-green rounded-full flex items-center justify-center mx-auto mb-6"
            >
              <Leaf className="w-10 h-10 text-neon-green" />
            </motion.div>
            <h2 className="text-2xl font-semibold text-white mb-2">
              Account created!
            </h2>
            <p className="text-white/50">Redirecting to login...</p>
          </div>
        </Animated>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-base px-6 py-12">
      <div className="w-full max-w-md">
        <Animated preset="slideUp">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-6">
              <Leaf className="w-8 h-8 text-neon-green" />
              <span className="text-xl font-display font-bold text-white">
                PlantDash
              </span>
            </div>
            <h2 className="text-2xl font-semibold text-white mb-2">
              Create your account
            </h2>
            <p className="text-sm text-white/50">
              Start your plant journey today
            </p>
          </div>
        </Animated>

        <motion.div
          animate={shake ? { x: [0, -8, 8, -4, 4, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Animated preset="scaleIn" delay={100}>
            <form
              onSubmit={handleSubmit(onSubmit)}
              noValidate
              className="bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-2xl p-8 flex flex-col gap-5"
            >
              <Input
                label="Full name"
                placeholder="John Doe"
                value={watch('name', '')}
                error={errors.name?.message}
                onChangeValue={(v) =>
                  setValue('name', v, { shouldValidate: true })
                }
                leftIcon={<User size={16} />}
                autoComplete="name"
                required
              />
              <Input
                label="Email"
                type="email"
                placeholder="your@email.com"
                value={watch('email', '')}
                error={errors.email?.message}
                onChangeValue={(v) =>
                  setValue('email', v, { shouldValidate: true })
                }
                leftIcon={<Mail size={16} />}
                autoComplete="email"
                required
              />
              <div className="flex flex-col gap-2">
                <PasswordInput
                  label="Password"
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

              {/* Hidden checkbox to satisfy register hook usage */}
              <input type="hidden" {...register('name')} />

              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={isLoading}
                onAction={handleSubmit(onSubmit)}
              >
                Create account
              </Button>

              <p className="text-center text-sm text-white/50">
                Already have an account?{' '}
                <Link
                  to="/login"
                  className="text-neon-cyan hover:text-neon-cyan/80 transition-colors font-medium"
                >
                  Sign in
                </Link>
              </p>
            </form>
          </Animated>
        </motion.div>
      </div>
    </div>
  );
}
