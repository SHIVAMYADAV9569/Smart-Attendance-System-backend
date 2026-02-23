# Face Attendance System - Backend

## Setup Instructions

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` file:
   ```bash
   cp .env.example .env
   ```

3. Update `.env` with your MongoDB connection string and JWT secret

4. Start the development server:
   ```bash
   npm run dev
   ```

## Server Details

- **Default Port:** `3001`
- **API Base URL:** `http://localhost:3001/api`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (requires token)

### Face Recognition
- `POST /api/face/register-face` - Register user face data
- `POST /api/face/recognize` - Mark attendance with face recognition
- `GET /api/face/today` - Get today's attendance

### Attendance
- `GET /api/attendance/my-records` - Get user's attendance records
- `GET /api/attendance/all` - Get all attendance (faculty/admin only)
- `GET /api/attendance/summary` - Get attendance summary
- `GET /api/attendance/today-records` - Get today's attendance
- `GET /api/attendance/stats/:userId` - Get user statistics

### Dashboard
- `GET /api/dashboard/overview` - Dashboard overview
- `GET /api/dashboard/report` - Detailed report
- `GET /api/dashboard/live-feed` - Real-time feed
- `GET /api/dashboard/heatmap` - Attendance heatmap

## Database Schema

### User Model
- Basic info: name, email, password, phone
- Role: student, faculty, admin
- Face data: base64 encoded face image
- Academic info: enrollmentNumber, department

### Attendance Model
- userId, checkInTime, checkOutTime
- date, status (present/absent/late/leave)
- faceConfidence, ipAddress
