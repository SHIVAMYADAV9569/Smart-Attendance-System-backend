import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDb from './config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import authRoutes from './routes/auth.js';
import faceRoutes from './routes/face.js';
import attendanceRoutes from './routes/attendance.js';
import dashboardRoutes from './routes/dashboard.js';
import lectureRoutes from './routes/lectures.js';

dotenv.config();

const port = process.env.PORT || 3001;
const app = express();

// Middleware
app.use(cors());
app.use('/models', express.static(path.join(__dirname, '..', 'models')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/face', faceRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/lectures', lectureRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  console.error('❌ Stack:', err.stack);
  console.error('❌ Request body:', req.body);
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

// Connect to database first, then start server (ensures MongoDB is ready before handling login/register)
const startServer = async () => {
  await connectDb();
  app.listen(port, () => {
    console.log(`🚀 Server started on port ${port}`);
  });
};
startServer().catch((err) => {
  console.error('❌ Failed to start server:', err.message);
  process.exit(1);
});