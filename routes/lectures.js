import express from 'express';
import Lecture from '../models/Lecture.js';
import LectureAttendance from '../models/LectureAttendance.js';
import User from '../models/User.js';
import { authenticateToken, authorizeRole } from '../middleware/auth.js';
import mongoose from 'mongoose';
import { generateLecturesForDate } from '../utils/lectureTemplates.js';

const router = express.Router();

// Check if MongoDB is connected
const isDbConnected = () => mongoose.connection.readyState === 1;

// Create a new lecture (faculty only)
router.post('/', authenticateToken, authorizeRole(['faculty', 'admin']), async (req, res) => {
  try {
    const { title, date, startTime, endTime, department, subject, description } = req.body;

    if (!title || !date || !startTime || !endTime) {
      return res.status(400).json({ message: 'Title, date, startTime, and endTime are required' });
    }

    const lecture = new Lecture({
      title,
      facultyId: req.user.userId,
      date: new Date(date),
      startTime,
      endTime,
      department: department || '',
      subject: subject || '',
      description: description || '',
      status: 'scheduled'
    });

    await lecture.save();

    res.status(201).json({
      message: 'Lecture created successfully',
      lecture
    });
  } catch (error) {
    console.error('Error creating lecture:', error);
    res.status(500).json({ message: 'Error creating lecture', error: error.message });
  }
});

// Get all lectures for logged-in faculty
router.get('/my-lectures', authenticateToken, authorizeRole(['faculty', 'admin']), async (req, res) => {
  try {
    const { date, status } = req.query;
    
    // If a specific date is provided, generate lectures for that date
    if (date && isDbConnected()) {
      const queryDate = new Date(date);
      
      // Generate lecture instances for this date based on templates
      await generateLecturesForDate(req.user.userId, queryDate);
      
      // Now fetch lectures for this date
      const queryDateStart = new Date(date);
      queryDateStart.setHours(0, 0, 0, 0);
      const nextDay = new Date(queryDateStart);
      nextDay.setDate(nextDay.getDate() + 1);
      
      let filter = { 
        facultyId: req.user.userId,
        date: { $gte: queryDateStart, $lt: nextDay },
        templateId: { $ne: null } // Only get generated instances, not templates
      };

      if (status) {
        filter.status = status;
      }

      const lectures = await Lecture.find(filter)
        .sort({ startTime: 1 })
        .lean();

      return res.json({ lectures });
    }
    
    // If no date specified, return all lecture templates
    let filter = { 
      facultyId: req.user.userId,
      isRecurring: true // Only get templates
    };

    if (status) {
      filter.status = status;
    }

    const lectures = await Lecture.find(filter)
      .sort({ startTime: 1 })
      .lean();

    res.json({ lectures });
  } catch (error) {
    console.error('Error fetching lectures:', error);
    res.status(500).json({ message: 'Error fetching lectures', error: error.message });
  }
});

// Get today's lectures for faculty
router.get('/today', authenticateToken, authorizeRole(['faculty', 'admin']), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Generate instances from templates if using MongoDB
    if (isDbConnected()) {
      await generateLecturesForDate(req.user.userId, today);
    }

    let lectures = await Lecture.find({
      facultyId: req.user.userId,
      date: { $gte: today, $lt: tomorrow },
      isRecurring: false // Exclude templates - only actual lecture instances
    })
      .sort({ startTime: 1 })
      .lean();

    // Deduplicate by title + subject + startTime (each subject appears once per time slot)
    const seen = new Set();
    lectures = lectures.filter((l) => {
      const key = `${l.title}|${l.subject || ''}|${l.startTime}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json({ lectures, date: today.toISOString().split('T')[0] });
  } catch (error) {
    console.error('Error fetching today lectures:', error);
    res.status(500).json({ message: 'Error fetching today lectures', error: error.message });
  }
});

// Get lecture by ID
router.get('/:lectureId', authenticateToken, authorizeRole(['faculty', 'admin']), async (req, res) => {
  try {
    const { lectureId } = req.params;

    const lecture = await Lecture.findById(lectureId).lean();
    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    // Check if the faculty owns this lecture
    if (lecture.facultyId.toString() !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ lecture });
  } catch (error) {
    console.error('Error fetching lecture:', error);
    res.status(500).json({ message: 'Error fetching lecture', error: error.message });
  }
});

// Update lecture
router.put('/:lectureId', authenticateToken, authorizeRole(['faculty', 'admin']), async (req, res) => {
  try {
    const { lectureId } = req.params;
    const { title, date, startTime, endTime, department, subject, description, status } = req.body;

    const lecture = await Lecture.findById(lectureId);
    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    // Check if the faculty owns this lecture
    if (lecture.facultyId.toString() !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Update fields
    if (title) lecture.title = title;
    if (date) lecture.date = new Date(date);
    if (startTime) lecture.startTime = startTime;
    if (endTime) lecture.endTime = endTime;
    if (department !== undefined) lecture.department = department;
    if (subject !== undefined) lecture.subject = subject;
    if (description !== undefined) lecture.description = description;
    if (status) lecture.status = status;

    lecture.updatedAt = new Date();
    await lecture.save();

    res.json({ message: 'Lecture updated successfully', lecture });
  } catch (error) {
    console.error('Error updating lecture:', error);
    res.status(500).json({ message: 'Error updating lecture', error: error.message });
  }
});

// Delete lecture
router.delete('/:lectureId', authenticateToken, authorizeRole(['faculty', 'admin']), async (req, res) => {
  try {
    const { lectureId } = req.params;

    const lecture = await Lecture.findById(lectureId);
    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    // Check if the faculty owns this lecture
    if (lecture.facultyId.toString() !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Delete associated attendance records
    await LectureAttendance.deleteMany({ lectureId });

    // Delete the lecture
    await Lecture.findByIdAndDelete(lectureId);

    res.json({ message: 'Lecture deleted successfully' });
  } catch (error) {
    console.error('Error deleting lecture:', error);
    res.status(500).json({ message: 'Error deleting lecture', error: error.message });
  }
});

// Get all students for lecture attendance marking
router.get('/:lectureId/students', authenticateToken, authorizeRole(['faculty', 'admin']), async (req, res) => {
  try {
    const { lectureId } = req.params;

    const lecture = await Lecture.findById(lectureId);
    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    // Check if the faculty owns this lecture
    if (lecture.facultyId.toString() !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get all students
    const students = await User.find({ role: 'student' })
      .select('_id name email enrollmentNumber department faceData')
      .lean();

    // Get existing attendance records for this lecture
    const attendanceRecords = await LectureAttendance.find({ lectureId })
      .select('userId status markedAt')
      .lean();

    // Map attendance status to students
    const studentsWithStatus = students.map(student => {
      const attendance = attendanceRecords.find(
        record => record.userId.toString() === student._id.toString()
      );
      return {
        ...student,
        attendanceStatus: attendance ? attendance.status : 'absent',
        markedAt: attendance ? attendance.markedAt : null
      };
    });

    res.json({ students: studentsWithStatus, lecture });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ message: 'Error fetching students', error: error.message });
  }
});

// Mark attendance for a student in a lecture
router.post('/:lectureId/attendance', authenticateToken, authorizeRole(['faculty', 'admin']), async (req, res) => {
  try {
    const { lectureId } = req.params;
    const { userId, status, notes } = req.body;

    if (!userId || !status) {
      return res.status(400).json({ message: 'userId and status are required' });
    }

    const lecture = await Lecture.findById(lectureId);
    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    // Check if the faculty owns this lecture
    if (lecture.facultyId.toString() !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check if student exists
    const student = await User.findById(userId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Update or create attendance record
    const attendance = await LectureAttendance.findOneAndUpdate(
      { lectureId, userId },
      {
        status,
        markedBy: req.user.userId,
        markedAt: new Date(),
        notes: notes || ''
      },
      { upsert: true, new: true }
    );

    res.json({
      message: 'Attendance marked successfully',
      attendance: {
        _id: attendance._id,
        userId: attendance.userId,
        status: attendance.status,
        markedAt: attendance.markedAt
      }
    });
  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ message: 'Error marking attendance', error: error.message });
  }
});

// Bulk mark attendance for multiple students
router.post('/:lectureId/attendance/bulk', authenticateToken, authorizeRole(['faculty', 'admin']), async (req, res) => {
  try {
    const { lectureId } = req.params;
    const { attendanceData } = req.body; // Array of { userId, status, notes }

    if (!Array.isArray(attendanceData) || attendanceData.length === 0) {
      return res.status(400).json({ message: 'attendanceData array is required' });
    }

    const lecture = await Lecture.findById(lectureId);
    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    // Check if the faculty owns this lecture
    if (lecture.facultyId.toString() !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const results = [];
    const errors = [];

    for (const data of attendanceData) {
      try {
        const { userId, status, notes } = data;

        const attendance = await LectureAttendance.findOneAndUpdate(
          { lectureId, userId },
          {
            status,
            markedBy: req.user.userId,
            markedAt: new Date(),
            notes: notes || ''
          },
          { upsert: true, new: true }
        );

        results.push({
          userId,
          status: attendance.status,
          success: true
        });
      } catch (err) {
        errors.push({ userId: data.userId, error: err.message });
      }
    }

    res.json({
      message: 'Bulk attendance marked',
      success: results.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error marking bulk attendance:', error);
    res.status(500).json({ message: 'Error marking bulk attendance', error: error.message });
  }
});

// Get attendance summary for a lecture
router.get('/:lectureId/attendance/summary', authenticateToken, authorizeRole(['faculty', 'admin']), async (req, res) => {
  try {
    const { lectureId } = req.params;

    const lecture = await Lecture.findById(lectureId);
    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    // Check if the faculty owns this lecture
    if (lecture.facultyId.toString() !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const attendanceRecords = await LectureAttendance.find({ lectureId }).lean();

    const summary = {
      total: attendanceRecords.length,
      present: attendanceRecords.filter(r => r.status === 'present').length,
      absent: attendanceRecords.filter(r => r.status === 'absent').length,
      late: attendanceRecords.filter(r => r.status === 'late').length,
      leave: attendanceRecords.filter(r => r.status === 'leave').length
    };

    res.json({ summary, lecture });
  } catch (error) {
    console.error('Error fetching attendance summary:', error);
    res.status(500).json({ message: 'Error fetching attendance summary', error: error.message });
  }
});

// Get student's lecture attendance history
router.get('/student/:userId/attendance', authenticateToken, authorizeRole(['faculty', 'admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    let filter = { userId };

    if (startDate && endDate) {
      const lectures = await Lecture.find({
        date: { $gte: new Date(startDate), $lte: new Date(endDate) }
      }).select('_id');
      const lectureIds = lectures.map(l => l._id);
      filter.lectureId = { $in: lectureIds };
    }

    const attendanceRecords = await LectureAttendance.find(filter)
      .populate({
        path: 'lectureId',
        select: 'title date startTime endTime subject facultyId',
        populate: {
          path: 'facultyId',
          select: 'name'
        }
      })
      .sort({ markedAt: -1 })
      .lean();

    res.json({ attendance: attendanceRecords });
  } catch (error) {
    console.error('Error fetching student lecture attendance:', error);
    res.status(500).json({ message: 'Error fetching student lecture attendance', error: error.message });
  }
});

export default router;
