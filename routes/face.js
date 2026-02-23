import express from 'express';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import { authenticateToken, getClientIp } from '../middleware/auth.js';
import { UserMock, AttendanceMock, memoryDb } from '../config/memoryDb.js';
import { matchFaces } from '../utils/faceMatching.js';
import mongoose from 'mongoose';

const router = express.Router();

// Check if MongoDB is connected
const isDbConnected = () => mongoose.connection.readyState === 1;

const getUserModel = () => (isDbConnected() ? User : UserMock);
const getAttendanceModel = () => (isDbConnected() ? Attendance : AttendanceMock);

// Register face
router.post('/register-face', authenticateToken, async (req, res) => {
  try {
    const { faceImage } = req.body;
    if (!faceImage) return res.status(400).json({ message: 'Face image is required' });

    const UserModel = getUserModel();
    let user = await UserModel.findById(req.user.userId);
    if (!user && !isDbConnected()) user = memoryDb.users.find(u => u._id === req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (isDbConnected()) {
      user = await UserModel.findByIdAndUpdate(req.user.userId, { faceData: faceImage }, { new: true });
    } else {
      user.faceData = faceImage;
      await UserModel.updateOne({ _id: req.user.userId }, { $set: { faceData: faceImage } });
    }

    res.json({ message: 'Face data registered successfully', user: { id: user._id, name: user.name } });
  } catch (error) {
    console.error('❌ Face registration error:', error);
    res.status(500).json({ message: 'Error registering face', error: String(error) });
  }
});

// Recognize and mark attendance
router.post('/recognize', authenticateToken, async (req, res) => {
  try {
    const { faceImage } = req.body;
    if (!faceImage) return res.status(400).json({ message: 'Face image is required' });

    const UserModel = getUserModel();
    const AttendanceModel = getAttendanceModel();

    let user = await UserModel.findById(req.user.userId);
    if (!user && !isDbConnected()) user = memoryDb.users.find(u => u._id === req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.faceData) return res.status(400).json({ message: 'User face not registered' });

    const matchResult = matchFaces(user.faceData, faceImage);
    if (!matchResult.matched) return res.status(401).json({ message: matchResult.message, confidence: matchResult.confidence, threshold: matchResult.threshold });

    const confidence = matchResult.confidence;
    if (confidence < 0.35) return res.status(401).json({ message: 'Face not matched. Low confidence', confidence });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    // Check if this user already marked attendance today
    let existingForUser = await AttendanceModel.findOne({ userId: req.user.userId, date: today });
    if (!existingForUser && !isDbConnected()) {
      existingForUser = memoryDb.attendanceRecords.find(r => r.userId === req.user.userId && new Date(r.date).toDateString() === today.toDateString());
    }

    if (existingForUser) {
      return res.status(200).json({ message: 'Already checked in today', time: timeString, date: today.toISOString().split('T')[0] });
    }

    // Timing rules for attendance (applies to students & faculty):
    // - 09:00 - 09:10 => present
    // - >09:10 and before 14:00 => late
    // - >=14:00 => do not allow marking (show already late)
    let status = 'present';
    const presentStart = new Date(now);
    presentStart.setHours(9, 0, 0, 0);
    const presentEnd = new Date(now);
    presentEnd.setHours(9, 10, 59, 999);
    const cutoff = new Date(now);
    cutoff.setHours(14, 0, 0, 0);

    if (now >= cutoff) {
      // After 14:00 do not allow marking via face recognition
      return res.status(403).json({ message: 'Attendance closed — already late', status: 'late' });
    }

    if (now >= presentStart && now <= presentEnd) {
      status = 'present';
    } else if (now > presentEnd && now < cutoff) {
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
    const { faceImage } = req.body;
    if (!faceImage) return res.status(400).json({ message: 'Face image is required' });

    const UserModel = getUserModel();
    let user = await UserModel.findById(req.user.userId);
    if (!user && !isDbConnected()) user = memoryDb.users.find(u => u._id === req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.faceData) return res.status(400).json({ message: 'User face not registered' });

    const matchResult = matchFaces(user.faceData, faceImage);
    res.json({ matched: matchResult.matched, confidence: matchResult.confidence, confidencePercentage: (matchResult.confidence * 100).toFixed(2), threshold: (matchResult.threshold * 100).toFixed(0), matchMessage: matchResult.message, user: { name: user.name, email: user.email, hasFaceData: !!user.faceData } });
  } catch (error) {
    res.status(500).json({ message: 'Error during debug test', error: String(error) });
  }
});

// Debug: list users
router.get('/debug/users', (req, res) => {
  res.json({ totalUsers: memoryDb.users.length, users: memoryDb.users.map(u => ({ _id: u._id, name: u.name, email: u.email, hasFaceData: !!u.faceData })) });
});

export default router;
