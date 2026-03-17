import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Droplets, Check, Calendar } from 'lucide-react';
import { useWatering } from '@core/hooks/useWatering';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/EmptyState';
import { Animated } from '../components/Animated';

export function WateringPage() {
  const { schedule, isLoading, fetchSchedule, markAsDone } = useWatering();

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const pending = schedule.filter((s) => !s.isDone);
  const done = schedule.filter((s) => s.isDone);

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <Animated preset="slideDown">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Watering</h1>
            <p className="text-sm text-white/50 mt-1">
              {pending.length} pending today
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
            <Calendar size={14} className="text-neon-cyan" />
            <span className="text-sm text-white/70">
              {new Date().toLocaleDateString()}
            </span>
          </div>
        </div>
      </Animated>

      {/* Pending */}
      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider">
          To Water
        </h2>
        {isLoading ? (
          <div className="h-20 bg-white/[0.04] rounded-xl animate-pulse" />
        ) : pending.length === 0 ? (
          <EmptyState
            icon={Droplets}
            title="All done!"
            description="No plants need watering today."
          />
        ) : (
          pending.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="p-4 flex items-center gap-4" glassmorphism>
                <div className="w-10 h-10 rounded-xl bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center">
                  <Droplets size={18} className="text-neon-cyan" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">
                    {s.plant?.name ?? 'Plant'}
                  </p>
                  <p className="text-xs text-white/40">
                    {s.plant?.room?.name ?? 'No room'}
                  </p>
                </div>
                <Button
                  variant="success"
                  size="xs"
                  leftIcon={<Check size={12} />}
                  onAction={() => { void markAsDone(s.id); }}
                >
                  Done
                </Button>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      {/* Done */}
      {done.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider">
            Completed today
          </h2>
          {done.slice(0, 3).map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.04 }}
            >
              <div className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5 opacity-60">
                <div className="w-10 h-10 rounded-xl bg-neon-green/10 flex items-center justify-center">
                  <Check size={18} className="text-neon-green" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-white/60 line-through">
                    {s.plant?.name ?? 'Plant'}
                  </p>
                </div>
                <Badge variant="success" size="xs">
                  Done
                </Badge>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
