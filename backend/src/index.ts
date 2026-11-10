import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { testConnection } from './db/connection';

// Routes
import authRoutes      from './routes/auth';
import menuRoutes      from './routes/menu';
import ordersRoutes    from './routes/orders';
import dashboardRoutes from './routes/dashboard';
import employeeRoutes  from './routes/employees';
import tablesRoutes from './routes/tables';
import eodRoutes       from './routes/eod';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security & Middleware ─────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

// Rate limit auth endpoint
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts, please try again later' },
}));

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/menu',      menuRoutes);
app.use('/api/orders',    ordersRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/eod',       eodRoutes);
app.use('/api/tables',    tablesRoutes);

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// 404 handler
app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} not found` }));

// Global error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────
async function main() {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`\n🚀 iMenu25 API running on http://localhost:${PORT}`);
    console.log(`   Accepting requests from: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);
  });
}

main().catch(console.error);

export default app;
