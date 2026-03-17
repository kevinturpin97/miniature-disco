import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Leaf, Home } from 'lucide-react';
import { Button } from '../components/ui/Button';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-base px-6">
      <div className="text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', bounce: 0.4, duration: 0.8 }}
          className="text-8xl font-bold text-neon-cyan/20 mb-4 tabular-nums"
          style={{ textShadow: '0 0 40px rgba(0,240,255,0.2)' }}
        >
          404
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Leaf className="w-12 h-12 text-neon-green/40 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-white mb-2">
            Page not found
          </h2>
          <p className="text-white/50 mb-6">
            The page you&apos;re looking for doesn&apos;t exist or has been
            moved.
          </p>
          <Button
            variant="primary"
            leftIcon={<Home size={16} />}
            onAction={() => navigate('/dashboard')}
          >
            Back to Dashboard
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
