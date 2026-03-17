import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle } from 'lucide-react';
import { usePlants } from '@core/hooks/usePlants';
import { useRooms } from '@core/hooks/useRooms';
import { plantCreateSchema, type PlantCreateInput } from '@core/schemas';
import { Stepper } from '../components/ui/Stepper';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Animated } from '../components/Animated';

const STEPS = [
  { id: 'basics', label: 'Basics' },
  { id: 'details', label: 'Details' },
  { id: 'confirm', label: 'Confirm' },
];

export function AddPlantPage() {
  const navigate = useNavigate();
  const { createPlant } = usePlants();
  const { rooms } = useRooms();
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const {
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PlantCreateInput>({
    resolver: zodResolver(plantCreateSchema),
    defaultValues: { name: '', notes: '', acquiredAt: '' },
  });

  const formData = watch();

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
  };
  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const onSubmit = async (data: PlantCreateInput) => {
    setIsSubmitting(true);
    try {
      await createPlant(data);
      setDone(true);
      setTimeout(() => navigate('/plants'), 2000);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Animated preset="bounceIn">
          <div className="text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', bounce: 0.5 }}
              className="w-24 h-24 bg-neon-green/15 border-2 border-neon-green rounded-full flex items-center justify-center mx-auto mb-6"
            >
              <CheckCircle className="w-12 h-12 text-neon-green" />
            </motion.div>
            <h2 className="text-2xl font-semibold text-white mb-2">
              Plant added!
            </h2>
            <p className="text-white/50">Redirecting to your garden...</p>
          </div>
        </Animated>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6">
      <Animated preset="slideDown">
        <div>
          <h1 className="text-2xl font-semibold text-white">Add a Plant</h1>
          <p className="text-sm text-white/50 mt-1">
            Tell us about your new plant
          </p>
        </div>
      </Animated>

      <Animated preset="fadeIn" delay={100}>
        <Stepper steps={STEPS} currentStep={step} />
      </Animated>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Card className="p-6" glassmorphism>
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div
                key="step0"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col gap-5"
              >
                <Input
                  label="Plant name *"
                  placeholder="e.g. My Monstera"
                  value={formData.name ?? ''}
                  error={errors.name?.message}
                  onChangeValue={(v) =>
                    setValue('name', v, { shouldValidate: true })
                  }
                  required
                />
                <Select
                  label="Room"
                  options={[
                    { value: '', label: 'No room' },
                    ...rooms.map((r) => ({ value: r.id, label: r.name })),
                  ]}
                  value={formData.roomId ?? ''}
                  onChange={(v) =>
                    setValue('roomId', v || undefined)
                  }
                  className="relative"
                />
              </motion.div>
            )}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col gap-5"
              >
                <Input
                  label="Notes"
                  placeholder="Care notes, observations..."
                  value={formData.notes ?? ''}
                  onChangeValue={(v) => setValue('notes', v)}
                />
                <Input
                  label="Date acquired"
                  type="date"
                  value={formData.acquiredAt ?? ''}
                  onChangeValue={(v) => setValue('acquiredAt', v)}
                />
              </motion.div>
            )}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col gap-4"
              >
                <h3 className="text-sm font-semibold text-white">
                  Confirm your plant details
                </h3>
                <div className="flex flex-col gap-2 p-4 bg-white/[0.04] rounded-xl border border-white/[0.08]">
                  {[
                    { label: 'Name', value: formData.name || '—' },
                    {
                      label: 'Room',
                      value:
                        rooms.find((r) => r.id === formData.roomId)?.name ||
                        'No room',
                    },
                    { label: 'Notes', value: formData.notes || '—' },
                    { label: 'Acquired', value: formData.acquiredAt || '—' },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex justify-between gap-4 text-sm py-2 border-b border-white/5 last:border-0"
                    >
                      <span className="text-white/50">{row.label}</span>
                      <span className="text-white font-medium text-right">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-3 mt-6 pt-5 border-t border-white/[0.08]">
            {step > 0 && (
              <Button variant="ghost" size="md" onAction={handleBack}>
                Back
              </Button>
            )}
            <div className="flex-1" />
            {step < STEPS.length - 1 ? (
              <Button variant="primary" size="md" onAction={handleNext}>
                Next
              </Button>
            ) : (
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={isSubmitting}
                onAction={handleSubmit(onSubmit)}
              >
                Add Plant
              </Button>
            )}
          </div>
        </Card>
      </form>
    </div>
  );
}
