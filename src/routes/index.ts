import { Router } from 'express';
import proposalRoutes from './proposals';
import vaultRoutes from './vaults';
import swapRoutes from './swap';
import historyRoutes from './history';
import poolRoutes from './pools';
import routerRoutes from './router';
import leaderboardRoutes from './leaderboard';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'OK' });
});

router.use('/proposals', proposalRoutes);
router.use('/vaults', vaultRoutes);
router.use('/swap', swapRoutes);
router.use('/history', historyRoutes);
router.use('/pools', poolRoutes);
router.use('/router', routerRoutes);
router.use('/leaderboard', leaderboardRoutes);

export default router;