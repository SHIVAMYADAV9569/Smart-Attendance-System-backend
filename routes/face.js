import express from 'express';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import { authenticateToken, getClientIp } from '../middleware/auth.js';
import { UserMock, AttendanceMock, memoryDb } from '../config/memoryDb.js';
import { matchDescriptors } from '../utils/faceDescriptor.js';
import mongoose from 'mongoose';

const router = express.Router();

// Helper function to get IST time (manual timezone conversion)
const getISTTime = () => {
  const now = new Date();
  // IST is UTC+5:30
  const istOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
  const istTime = new Date(now.getTime() + istOffset + (now.getTimezoneOffset() * 60 * 1000));
  return istTime;
};

// Check if MongoDB is connected
const isDbConnected = () => mongoose.connection.readyState === 1;

const getUserModel = () => (isDbConnected() ? User : UserMock);
const getAttendanceModel = () => (isDbConnected() ? Attendance : AttendanceMock);

// Register face - stores faceDescriptor (128-dim) and faceImage (for display)
router.post('/register-face', authenticateToken, async (req, res) => {
  try {
    const { faceImage, faceDescriptor } = req.body;
    if (!faceDescriptor || !Array.isArray(faceDescriptor) || faceDescriptor.length !== 128) {
      return res.status(400).json({ message: 'Valid face descriptor (128 values) is required. Please re-register using the face recognition feature.' });
    }

    const UserModel = getUserModel();
    let user = await UserModel.findById(req.user.userId);
    if (!user && !isDbConnected()) user = memoryDb.users.find(u => u._id === req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const update = { faceDescriptor };
    if (faceImage) update.faceData = faceImage;

    if (isDbConnected()) {
      user = await UserModel.findByIdAndUpdate(req.user.userId, update, { new: true });
    } else {
      user.faceData = update.faceData ?? user.faceData;
      user.faceDescriptor = update.faceDescriptor;
      await UserModel.updateOne({ _id: req.user.userId }, { $set: update });
    }

    res.json({ message: 'Face registered successfully', user: { id: user._id, name: user.name } });
  } catch (error) {
    console.error('❌ Face registration error:', error);
    res.status(500).json({ message: 'Error registering face', error: String(error) });
  }
});

// Recognize and mark attendance - compares face descriptors using Euclidean distance (threshold 0.6)
router.post('/recognize', authenticateToken, async (req, res) => {
  try {
    const { faceDescriptor } = req.body;
    if (!faceDescriptor || !Array.isArray(faceDescriptor) || faceDescriptor.length !== 128) {
      return res.status(400).json({ message: 'Valid face descriptor is required. Ensure your face is clearly visible in the camera.' });
    }

    const UserModel = getUserModel();
    const AttendanceModel = getAttendanceModel();

    let user = await UserModel.findById(req.user.userId);
    if (!user && !isDbConnected()) user = memoryDb.users.find(u => u._id === req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.faceDescriptor) {
      return res.status(400).json({
        message: 'Face not registered with recognition. Please re-register your face at Register Face page.'
      });
    }

    const matchResult = matchDescriptors(user.faceDescriptor, faceDescriptor);

    console.log('🔍 Face Recognition:', {
      userId: req.user.userId,
      distance: matchResult.distance.toFixed(4),
      threshold: matchResult.threshold,
      matched: matchResult.matched
    });

    if (!matchResult.matched) {
      return res.status(400).json({
        message: '❌ Face not matched. Attendance not marked.',
        distance: matchResult.distance,
        threshold: matchResult.threshold,
        details: 'Your face does not match the registered photo. Please ensure good lighting and face the camera directly.'
      });
    }

    const confidence = matchResult.confidence;

    // Use IST time for attendance calculations
    const now = getISTTime();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    // Check if this user already marked attendance today
    let existingForUser = await AttendanceModel.findOne({ userId: req.user.userId, date: today });
    if (!existingForUser && !isDbConnected()) {
      existingForUser = memoryDb.attendanceRecords.find(r => r.userId === req.user.userId && new Date(r.date).toDateString() === today.toDateString());
    }

    if (existingForUser) {
      return res.status(200).json({ message: 'Already checked in today', time: timeString, date: today.toISOString().split('T')[0] });
    }

    // Timing rules for attendance using IST time and minutes for accuracy:
    // - 09:00 - 09:10 => present
    // - >09:10 and before 14:00 => late
    // - >=14:00 => do not allow marking (show already late)
    let status = 'present';
    
    // Convert current time to minutes for accurate comparison
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const presentEnd = 9 * 60 + 10; // 9:10 AM = 550 minutes
    const lateEnd = 14 * 60; // 2:00 PM = 840 minutes
    
    console.log('⏰ Attendance Time Calculation (IST):', {
      currentTime: timeString,
      currentMinutes,
      presentEnd,
      lateEnd,
      timezone: 'Asia/Kolkata'
    });

    if (currentMinutes >= lateEnd) {
      // After 14:00 do not allow marking via face recognition
      return res.status(403).json({ message: 'Attendance closed — already late', status: 'late' });
    }

    if (currentMinutes <= presentEnd) {
      status = 'present';
    } else if (currentMinutes > presentEnd && currentMinutes < lateEnd) {
      status = 'late';
    } else {
      // before 09:00 -> treat as present by default
      status = 'present';
    }

    const attendance = new AttendanceModel({ userId: req.user.userId, date: today, checkInTime: now, status, faceConfidence: confidence, ipAddress: getClientIp(req) });
    await attendance.save();

    res.json({ message: 'Check-in successful', confidence, time: timeString, date: today.toISOString().split('T')[0], checkInTime: attendance.checkInTime, status: attendance.status });
  } catch (error) {
    console.error('❌ Face Recognition Error:', error);
    res.status(500).json({ message: 'Error during face recognition', error: String(error) });
  }
});

// Today's attendance
router.get('/today', authenticateToken, async (req, res) => {
  try {
    const AttendanceModel = getAttendanceModel();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let attendance = await AttendanceModel.findOne({ userId: req.user.userId, date: today });
    if (!attendance && !isDbConnected()) attendance = memoryDb.attendanceRecords.find(r => r.userId === req.user.userId && new Date(r.date).toDateString() === today.toDateString());

    if (!attendance) return res.json({ message: 'No attendance record today', status: 'absent' });
    res.json({ status: attendance.status, checkInTime: attendance.checkInTime, checkOutTime: attendance.checkOutTime, date: attendance.date });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching attendance', error: String(error) });
  }
});

// Debug: test-match
router.post('/debug/test-match', authenticateToken, async (req, res) => {
  try {
    const { faceDescriptor } = req.body;
    if (!faceDescriptor || !Array.isArray(faceDescriptor) || faceDescriptor.length !== 128) {
      return res.status(400).json({ message: 'Face descriptor (128 values) is required' });
    }

    const UserModel = getUserModel();
    let user = await UserModel.findById(req.user.userId);
    if (!user && !isDbConnected()) user = memoryDb.users.find(u => u._id === req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.faceDescriptor) return res.status(400).json({ message: 'User face not registered with descriptor' });

    const matchResult = matchDescriptors(user.faceDescriptor, faceDescriptor);
    res.json({
      matched: matchResult.matched,
      distance: matchResult.distance,
      threshold: matchResult.threshold,
      matchMessage: matchResult.matched ? 'Face matched' : 'Face not matched',
      user: { name: user.name, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error during debug test', error: String(error) });
  }
});

// Debug: list users
router.get('/debug/users', (req, res) => {
  res.json({ totalUsers: memoryDb.users.length, users: memoryDb.users.map(u => ({ _id: u._id, name: u.name, email: u.email, hasFaceData: !!u.faceData })) });
});

export default router;
