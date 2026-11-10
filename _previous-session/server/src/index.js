require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const db = require('./config/db');

// Routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const posRoutes = require('./routes/pos');
const backofficeRoutes = require('./routes/backoffice');
const eodRoutes = require('./routes/eod');
const employeeRoutes = require('./routes/employees');

const app = express();
const httpServer = createServer(app);

// WebSocket setup
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL, methods: ['GET', 'POST'] }
});

// Make io accessible in routes
app.set('io', io);

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), version: '1.0.0' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/backoffice', backofficeRoutes);
app.use('/api/eod', eodRoutes);
app.use('/api/employees', employeeRoutes);

// WebSocket events
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('join:terminal', (terminalId) => {
    socket.join(`terminal:${terminalId}`);
    console.log(`Socket ${socket.id} joined terminal:${terminalId}`);
  });

  socket.on('join:kitchen', () => {
    socket.join('kitchen');
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// Start server
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, async () => {
  console.log(`\n🚀 iMenu25 Server running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket ready`);
  try {
    await db.query('SELECT 1');
    console.log(`✅ MySQL connected (${process.env.DB_NAME})\n`);
  } catch (err) {
    console.error(`❌ MySQL connection failed: ${err.message}\n`);
  }
});
