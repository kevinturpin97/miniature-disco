import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { User, Palette, Bell, Shield, Database, Info } from 'lucide-react';
import { useAuthStore } from '@core/stores/useAuthStore';
import { useSettingsStore } from '@core/stores/useSettingsStore';
import { settingsProfileSchema, type SettingsProfileInput } from '@core/schemas';
import { Tabs } from '../components/ui/Tabs';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { Avatar } from '../components/ui/Avatar';
import { Animated } from '../components/Animated';
import { ThemeToggle } from '../components/ThemeToggle';

const TABS = [
  { id: 'profile', label: 'Profile', icon: <User size={14} /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette size={14} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={14} /> },
  { id: 'rooms', label: 'Rooms', icon: <Database size={14} /> },
  { id: 'security', label: 'Security', icon: <Shield size={14} /> },
  { id: 'about', label: 'About', icon: <Info size={14} /> },
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const user = useAuthStore((s) => s.user);
  const { language, setLanguage } = useSettingsStore();

  const {
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SettingsProfileInput>({
    resolver: zodResolver(settingsProfileSchema),
    defaultValues: { name: user?.name ?? '', email: user?.email ?? '' },
  });

  const onSaveProfile = async (data: SettingsProfileInput) => {
    // In real app: await settingsService.updateProfile(data);
    void data;
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <Animated preset="slideDown">
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
      </Animated>

      <Animated preset="fadeIn" delay={100}>
        <Tabs tabs={TABS} defaultTab="profile" onChange={setActiveTab} />
      </Animated>

      {activeTab === 'profile' && (
        <Animated preset="slideUp" delay={150}>
          <Card className="p-6" glassmorphism>
            <h2 className="text-sm font-semibold text-white mb-6">Profile</h2>
            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-white/[0.08]">
              <Avatar name={user?.name} src={user?.avatar} size="xl" />
              <div>
                <p className="text-base font-semibold text-white">
                  {user?.name}
                </p>
                <p className="text-sm text-white/50">{user?.email}</p>
                <Button
                  variant="ghost"
                  size="xs"
                  className="mt-2"
                  onAction={() => {
                    /* change avatar */
                  }}
                >
                  Change photo
                </Button>
              </div>
            </div>
            <form onSubmit={handleSubmit(onSaveProfile)} noValidate className="flex flex-col gap-4">
              <Input
                label="Full name"
                value={watch('name', '')}
                error={errors.name?.message}
                onChangeValue={(v) =>
                  setValue('name', v, { shouldValidate: true })
                }
                required
              />
              <Input
                label="Email"
                type="email"
                value={watch('email', '')}
                error={errors.email?.message}
                onChangeValue={(v) =>
                  setValue('email', v, { shouldValidate: true })
                }
                required
              />
              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={isSubmitting}
                  onAction={handleSubmit(onSaveProfile)}
                >
                  Save changes
                </Button>
              </div>
            </form>
          </Card>
        </Animated>
      )}

      {activeTab === 'appearance' && (
        <Animated preset="slideUp" delay={150}>
          <Card className="p-6" glassmorphism>
            <h2 className="text-sm font-semibold text-white mb-6">
              Appearance
            </h2>
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Theme</p>
                  <p className="text-xs text-white/50 mt-0.5">
                    Choose your preferred colour scheme
                  </p>
                </div>
                <ThemeToggle />
              </div>
              <div>
                <p className="text-sm font-medium text-white mb-2">Language</p>
                <Select
                  options={[
                    { value: 'fr', label: 'Français' },
                    { value: 'en', label: 'English' },
                  ]}
                  value={language}
                  onChange={(v) => setLanguage(v as 'fr' | 'en')}
                  className="w-48 relative"
                />
              </div>
            </div>
          </Card>
        </Animated>
      )}

      {activeTab === 'notifications' && (
        <Animated preset="slideUp" delay={150}>
          <Card className="p-6" glassmorphism>
            <h2 className="text-sm font-semibold text-white mb-6">
              Notifications
            </h2>
            <div className="flex flex-col gap-4">
              {[
                {
                  label: 'Watering reminders',
                  desc: 'Get notified when plants need water',
                  defaultOn: true,
                },
                {
                  label: 'Health alerts',
                  desc: 'Alerts when plant health drops below 50%',
                  defaultOn: true,
                },
                {
                  label: 'Weekly report',
                  desc: 'Summary of your garden every Monday',
                  defaultOn: false,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between p-4 rounded-xl bg-white/[0.04] border border-white/[0.08]"
                >
                  <div>
                    <p className="text-sm font-medium text-white">
                      {item.label}
                    </p>
                    <p className="text-xs text-white/40 mt-0.5">{item.desc}</p>
                  </div>
                  <button
                    className={`relative w-12 h-6 rounded-full border transition-colors ${item.defaultOn ? 'bg-neon-cyan/30 border-neon-cyan/50' : 'bg-white/10 border-white/20'}`}
                    role="switch"
                    aria-checked={item.defaultOn}
                    aria-label={item.label}
                    onClick={() => {
                      /* toggle notification */
                    }}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full shadow transition-transform ${item.defaultOn ? 'left-1 translate-x-6 bg-neon-cyan' : 'left-1 bg-white/40'}`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </Animated>
      )}

      {activeTab === 'rooms' && (
        <Animated preset="slideUp" delay={150}>
          <Card className="p-6" glassmorphism>
            <h2 className="text-sm font-semibold text-white mb-6">Rooms</h2>
            <p className="text-sm text-white/50">
              Manage the rooms where your plants live.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {['Living Room', 'Bedroom', 'Kitchen', 'Office'].map((room) => (
                <div
                  key={room}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] border border-white/[0.08]"
                >
                  <span className="text-sm text-white">{room}</span>
                  <Button
                    variant="ghost"
                    size="xs"
                    onAction={() => {
                      /* delete room */
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 w-full"
                onAction={() => {
                  /* add room */
                }}
              >
                + Add room
              </Button>
            </div>
          </Card>
        </Animated>
      )}

      {activeTab === 'security' && (
        <Animated preset="slideUp" delay={150}>
          <Card className="p-6" glassmorphism>
            <h2 className="text-sm font-semibold text-white mb-6">Security</h2>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                <div>
                  <p className="text-sm font-medium text-white">
                    Change password
                  </p>
                  <p className="text-xs text-white/40 mt-0.5">
                    Update your password regularly
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onAction={() => {
                    /* open change password modal */
                  }}
                >
                  Change
                </Button>
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                <div>
                  <p className="text-sm font-medium text-red-400">
                    Delete account
                  </p>
                  <p className="text-xs text-red-400/60 mt-0.5">
                    Permanently delete your account and all data
                  </p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onAction={() => {
                    /* confirm delete account */
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        </Animated>
      )}

      {activeTab === 'about' && (
        <Animated preset="slideUp" delay={150}>
          <Card className="p-6" glassmorphism>
            <h2 className="text-sm font-semibold text-white mb-6">About</h2>
            <div className="flex flex-col gap-3 text-sm text-white/60">
              <div className="flex justify-between">
                <span>Version</span>
                <span className="text-white font-mono">1.0.0</span>
              </div>
              <div className="flex justify-between">
                <span>Platform</span>
                <span className="text-white">Web</span>
              </div>
              <div className="flex justify-between">
                <span>Built with</span>
                <span className="text-white">React 18 + Vite</span>
              </div>
            </div>
          </Card>
        </Animated>
      )}
    </div>
  );
}
