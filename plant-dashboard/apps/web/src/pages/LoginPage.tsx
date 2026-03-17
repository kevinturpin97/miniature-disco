import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { Mail, Leaf } from 'lucide-react';
import { useAuth } from '@core/hooks/useAuth';
import { loginSchema, type LoginInput } from '@core/schemas';
import { getService, RouterToken } from '@core/di/container';
import { Input } from '../components/ui/Input';
import { PasswordInput } from '../components/ui/PasswordInput';
import { Button } from '../components/ui/Button';
import { Animated } from '../components/Animated';

export function LoginPage() {
  const { login, isLoading } = useAuth();
  const [shake, setShake] = useState(false);

  const {
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    register,
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: false },
  });

  const onSubmit = async (data: LoginInput) => {
    try {
      await login(data);
      const router = getService(RouterToken);
      router.navigate('/dashboard');
    } catch {
      setShake(true);
      setTimeout(() => setShake(false), 600);
    }
  };

  const emailValue = watch('email');
  const passwordValue = watch('password');

  return (
    <div className="min-h-screen flex bg-dark-base">
      {/* Left — Decorative */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-dark-overlay via-dark-base to-dark-surface" />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 30% 50%, rgba(57,255,20,0.08) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(0,240,255,0.06) 0%, transparent 50%)',
          }}
        />
        <div className="relative z-10 flex flex-col justify-center px-16">
          <Animated preset="slideInLeft" delay={200}>
            <div className="flex items-center gap-4 mb-12">
              <div className="w-14 h-14 rounded-2xl bg-neon-green/20 border border-neon-green/30 flex items-center justify-center">
                <Leaf className="w-7 h-7 text-neon-green" />
              </div>
              <div>
                <h1 className="text-2xl font-display font-bold text-white">
                  PlantDash
                </h1>
                <p className="text-sm text-white/50">
                  Your smart plant companion
                </p>
              </div>
            </div>
          </Animated>
          <Animated preset="slideInLeft" delay={400}>
            <h2 className="text-4xl font-display font-bold text-white mb-4 leading-tight">
              Grow smarter,
              <br />
              <span className="text-neon-green">not harder</span>
            </h2>
            <p className="text-lg text-white/50 max-w-md">
              Track all your plants, automate watering schedules, and get
              personalized care tips — all in one place.
            </p>
          </Animated>
          <div className="mt-16 flex gap-8">
            {[
              { label: '1,200+', desc: 'Plants tracked' },
              { label: '98%', desc: 'Survival rate' },
              { label: '5min', desc: 'Setup time' },
            ].map((stat, i) => (
              <Animated key={stat.label} preset="slideUp" delay={600 + i * 100}>
                <div>
                  <div className="text-2xl font-bold text-neon-cyan">
                    {stat.label}
                  </div>
                  <div className="text-sm text-white/50">{stat.desc}</div>
                </div>
              </Animated>
            ))}
          </div>
        </div>
      </div>

      {/* Right — Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Animated preset="slideUp">
            <div className="text-center mb-8">
              <div className="lg:hidden flex items-center justify-center gap-3 mb-6">
                <Leaf className="w-8 h-8 text-neon-green" />
                <span className="text-xl font-display font-bold text-white">
                  PlantDash
                </span>
              </div>
              <h2 className="text-2xl font-semibold text-white mb-2">
                Welcome back
              </h2>
              <p className="text-sm text-white/50">
                Sign in to continue to your dashboard
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
                  label="Email"
                  type="email"
                  placeholder="your@email.com"
                  value={emailValue}
                  error={errors.email?.message}
                  onChangeValue={(v) => setValue('email', v)}
                  leftIcon={<Mail size={16} />}
                  autoComplete="email"
                  required
                />
                <PasswordInput
                  label="Password"
                  value={passwordValue}
                  error={errors.password?.message}
                  onChangeValue={(v) => setValue('password', v)}
                  autoComplete="current-password"
                />

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      {...register('rememberMe')}
                      className="w-4 h-4 rounded border-white/20 bg-white/5 text-neon-cyan focus:ring-neon-cyan/30 focus:ring-2 focus:ring-offset-0"
                    />
                    <span className="text-sm text-white/60">Remember me</span>
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-sm text-neon-cyan hover:text-neon-cyan/80 transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  loading={isLoading}
                  onAction={handleSubmit(onSubmit)}
                >
                  Sign in
                </Button>

                <p className="text-center text-sm text-white/50">
                  No account?{' '}
                  <Link
                    to="/register"
                    className="text-neon-cyan hover:text-neon-cyan/80 transition-colors font-medium"
                  >
                    Create one
                  </Link>
                </p>
              </form>
            </Animated>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
