import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Leaf,
  Droplets,
  Activity,
  Thermometer,
  Edit,
  Trash2,
} from 'lucide-react';
import { usePlantsStore } from '@core/stores/usePlantsStore';
import { plantService } from '@core/services/PlantService';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Animated } from '../components/Animated';
import type { PlantHealthStatus } from '@core/types';

const healthBadgeVariant: Record<
  PlantHealthStatus,
  'success' | 'primary' | 'warning' | 'danger' | 'ghost'
> = {
  excellent: 'success',
  good: 'success',
  fair: 'primary',
  poor: 'warning',
  critical: 'danger',
};

export function PlantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { plants, setSelectedPlant, selectedPlant } = usePlantsStore();

  useEffect(() => {
    const plant = plants.find((p) => p.id === id);
    if (plant) {
      setSelectedPlant(plant);
    } else if (id) {
      plantService
        .getById(id)
        .then((p) => setSelectedPlant(p))
        .catch(() => navigate('/plants'));
    }
    return () => setSelectedPlant(null);
  }, [id, plants, setSelectedPlant, navigate]);

  if (!selectedPlant) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin" />
      </div>
    );
  }

  const p = selectedPlant;
  const healthColor =
    p.healthScore >= 80
      ? '#39FF14'
      : p.healthScore >= 60
        ? '#00F0FF'
        : p.healthScore >= 40
          ? '#FFD600'
          : '#FF4757';

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* Back */}
      <Animated preset="fadeIn">
        <button
          onClick={() => navigate('/plants')}
          className="flex items-center gap-2 text-white/50 hover:text-white transition-colors w-fit"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back to Plants</span>
        </button>
      </Animated>

      {/* Hero */}
      <Animated preset="slideUp" delay={100}>
        <div className="relative h-64 rounded-2xl overflow-hidden bg-gradient-to-br from-neon-green/8 to-neon-cyan/8 border border-white/[0.08]">
          {p.imageUrl ? (
            <img
              src={p.imageUrl}
              alt={p.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Leaf className="w-20 h-20 text-white/10" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-dark-base/80 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-white">{p.name}</h1>
              {p.species && (
                <p className="text-sm text-white/60 italic">
                  {p.species.commonName}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Edit size={14} />}
                onAction={() => navigate(`/plants/${p.id}/edit`)}
              >
                Edit
              </Button>
              <Button
                variant="danger"
                size="sm"
                leftIcon={<Trash2 size={14} />}
                onAction={() => {
                  /* confirm delete */
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      </Animated>

      {/* Health badge */}
      <Animated preset="fadeIn" delay={150}>
        <div className="flex items-center gap-3">
          <Badge variant={healthBadgeVariant[p.healthStatus]} size="md">
            {p.healthStatus}
          </Badge>
          <div
            className="text-sm font-semibold"
            style={{ color: healthColor }}
          >
            {p.healthScore}% health
          </div>
          <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${p.healthScore}%` }}
              transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
              style={{ backgroundColor: healthColor }}
            />
          </div>
        </div>
      </Animated>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: 'Health Score',
            value: `${p.healthScore}%`,
            icon: <Activity size={18} />,
            color: healthColor,
          },
          {
            label: 'Room',
            value: p.room?.name ?? 'No room',
            icon: <Leaf size={18} />,
            color: '#00F0FF',
          },
          {
            label: 'Last Watered',
            value: p.lastWateredAt
              ? new Date(p.lastWateredAt).toLocaleDateString()
              : 'Unknown',
            icon: <Droplets size={18} />,
            color: '#7B2FBE',
          },
          {
            label: 'Species',
            value: p.species?.scientificName ?? 'Unknown',
            icon: <Thermometer size={18} />,
            color: '#FFD600',
          },
        ].map((stat, i) => (
          <Animated key={stat.label} preset="slideUp" delay={200 + i * 60}>
            <Card className="p-4" glassmorphism>
              <div
                className="flex items-center gap-2 mb-2"
                style={{ color: stat.color }}
              >
                {stat.icon}
                <span className="text-xs font-medium text-white/50">
                  {stat.label}
                </span>
              </div>
              <p className="text-sm font-semibold text-white truncate">
                {stat.value}
              </p>
            </Card>
          </Animated>
        ))}
      </div>

      {/* Notes */}
      {p.notes && (
        <Animated preset="slideUp" delay={400}>
          <Card className="p-5" glassmorphism>
            <h3 className="text-sm font-semibold text-white mb-3">Notes</h3>
            <p className="text-sm text-white/60 leading-relaxed">{p.notes}</p>
          </Card>
        </Animated>
      )}

      {/* Next watering */}
      {p.nextWateringAt && (
        <Animated preset="slideUp" delay={450}>
          <Card className="p-4 flex items-center gap-3" glassmorphism>
            <div className="w-10 h-10 rounded-xl bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center">
              <Droplets size={18} className="text-neon-cyan" />
            </div>
            <div>
              <p className="text-xs text-white/50 uppercase tracking-wider">
                Next watering
              </p>
              <p className="text-sm font-semibold text-white">
                {new Date(p.nextWateringAt).toLocaleDateString('en-US', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </p>
            </div>
          </Card>
        </Animated>
      )}
    </div>
  );
}
