import express from 'express';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { authenticateToken, authorizeRole } from '../middleware/auth.js';
import { AttendanceMock, UserMock } from '../config/memoryDb.js';
import mongoose from 'mongoose';

const router = express.Router();

// Check if MongoDB is connected
const isDbConnected = () => {
  return mongoose.connection.readyState === 1;
};

// Use mock database if MongoDB is not connected
const getAttendanceModel = () => {
  return isDbConnected() ? Attendance : AttendanceMock;
};

const getUserModel = () => {
  return isDbConnected() ? User : UserMock;
};

// Get user's attendance records
router.get('/my-records', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, limit = 30, page = 1 } = req.query;
    const AttendanceModel = getAttendanceModel();
    const UserModel = getUserModel();

    let records;
    let total;

    if (isDbConnected()) {
      let filter = { userId: req.user.userId };

      if (startDate && endDate) {
        filter.date = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }

      const skip = (page - 1) * limit;

      records = await AttendanceModel.find(filter)
        .sort({ date: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean();

      total = await AttendanceModel.countDocuments(filter);
    } else {
      // For in-memory database
      let allRecords = await AttendanceModel.find({ userId: req.user.userId });

      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        allRecords = allRecords.filter(r => r.date >= start && r.date <= end);
      }

      // Sort by date descending
      allRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

      total = allRecords.length;
      const skip = (page - 1) * parseInt(limit);
      records = allRecords.slice(skip, skip + parseInt(limit));
    }

    // Fetch user data to include face image and name
    let user = await UserModel.findById(req.user.userId);
    if (!user && !isDbConnected()) {
      user = memoryDb.users.find(u => u._id === req.user.userId);
    }

    // Add user info to response
    const enrichedRecords = records.map(record => ({
      ...record,
      userName: user?.name || 'Unknown',
      userEmail: user?.email || 'Unknown',
      faceImage: user?.faceData || null
    }));

    res.json({
      records: enrichedRecords,
      user: {
        name: user?.name,
        email: user?.email,
        faceImage: user?.faceData || null
      },
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching attendance records', error: error.message });
  }
});

// Get all attendance (admin/faculty only)
router.get('/all', authenticateToken, authorizeRole(['faculty', 'admin']), async (req, res) => {
  try {
    const { startDate, endDate, userId, status, limit = 50, page = 1 } = req.query;
    const AttendanceModel = getAttendanceModel();
    const UserModel = getUserModel();

    let records;
    let total;

    if (isDbConnected()) {
      let filter = {};

      if (startDate && endDate) {
        filter.date = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }

      if (userId) filter.userId = userId;
      if (status) filter.status = status;

      const skip = (page - 1) * limit;

      records = await AttendanceModel.find(filter)
        .populate('userId', 'name email enrollmentNumber')
        .sort({ date: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean();

      total = await AttendanceModel.countDocuments(filter);
    } else {
      // For in-memory database
      let allRecords = await AttendanceModel.find({});

      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        allRecords = allRecords.filter(r => r.date >= start && r.date <= end);
      }

      if (userId) allRecords = allRecords.filter(r => r.userId === userId);
      if (status) allRecords = allRecords.filter(r => r.status === status);

      // Sort by date descending
      allRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

      total = allRecords.length;
      const skip = (page - 1) * parseInt(limit);
      records = allRecords.slice(skip, skip + parseInt(limit));

      // Populate user info for in-memory records
      for (let record of records) {
        const user = await UserModel.findById(record.userId);
        if (user) {
          record.userId = {
            _id: user._id,
            name: user.name,
            email: user.email,
            enrollmentNumber: user.enrollmentNumber
          };
        }
      }
    }

    res.json({
      records,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching attendance', error: error.message });
  }
});

// Get attendance summary for dashboard
router.get('/summary', authenticateToken, authorizeRole(['faculty', 'admin']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const AttendanceModel = getAttendanceModel();
    const UserModel = getUserModel();

    let records;
    let totalUsers;

    if (isDbConnected()) {
      let filter = {};

      if (startDate && endDate) {
        filter.date = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }

      records = await AttendanceModel.find(filter);
      totalUsers = await UserModel.countDocuments({ role: { $in: ['student', 'faculty'] } });
    } else {
      // For in-memory database
      let allRecords = await AttendanceModel.find({});

      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        allRecords = allRecords.filter(r => r.date >= start && r.date <= end);
      }

      records = allRecords;
      
      // Count users for in-memory database
      const allUsers = await UserModel.find({});
      totalUsers = allUsers.filter(u => u.role === 'student' || u.role === 'faculty').length;
    }

    // Calculate summary
    const summary = {};
    records.forEach(r => {
      summary[r.status] = (summary[r.status] || 0) + 1;
    });

    const statusSummary = Object.entries(summary).map(([status, count]) => ({
      _id: status,
      count
    }));

    // Calculate daily summary
    const dailySummary = {};
    records.forEach(r => {
      const dateKey = new Date(r.date).toISOString().split('T')[0];
      if (!dailySummary[dateKey]) {
        dailySummary[dateKey] = { _id: dateKey, present: 0, absent: 0 };
      }
      if (r.checkInTime) {
        dailySummary[dateKey].present += 1;
      } else {
        dailySummary[dateKey].absent += 1;
      }
    });

    res.json({
      statusSummary,
      totalUsers,
      dailySummary: Object.values(dailySummary).sort((a, b) => new Date(b._id) - new Date(a._id)),
      dateRange: {
        start: startDate,
        end: endDate
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching summary', error: error.message });
  }
});

// Get today's attendance
router.get('/today-records', authenticateToken, authorizeRole(['faculty', 'admin']), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const AttendanceModel = getAttendanceModel();
    const UserModel = getUserModel();

    let records;

    if (isDbConnected()) {
      records = await AttendanceModel.find({
        date: { $gte: today, $lt: tomorrow }
      })
        .populate('userId', 'name email enrollmentNumber role')
        .sort({ checkInTime: -1 })
        .lean();
    } else {
      // For in-memory database
      let allRecords = await AttendanceModel.find({});
      records = allRecords.filter(r => {
        const recordDate = new Date(r.date);
        recordDate.setHours(0, 0, 0, 0);
        return recordDate.getTime() === today.getTime();
      });

      records.sort((a, b) => {
        const timeA = a.checkInTime ? new Date(a.checkInTime).getTime() : 0;
        const timeB = b.checkInTime ? new Date(b.checkInTime).getTime() : 0;
        return timeB - timeA;
      });

      // Populate user info for in-memory records
      for (let record of records) {
        const user = await UserModel.findById(record.userId);
        if (user) {
          record.userId = {
            _id: user._id,
            name: user.name,
            email: user.email,
            enrollmentNumber: user.enrollmentNumber,
            role: user.role
          };
        }
      }
    }

    res.json({
      date: today.toISOString().split('T')[0],
      totalPresent: records.filter(r => r.checkInTime).length,
      totalAbsent: records.filter(r => !r.checkInTime).length,
      records
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching today records', error: error.message });
  }
});

// Get user's monthly statistics
router.get('/monthly-stats', authenticateToken, async (req, res) => {
  try {
    const { month, year } = req.query;
    const AttendanceModel = getAttendanceModel();

    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    const currentMonth = month ? parseInt(month) : new Date().getMonth();

    const startDate = new Date(currentYear, currentMonth, 1);
    const endDate = new Date(currentYear, currentMonth + 1, 0);
    
    // Get total working days in month (excluding weekends)
    let workingDays = 0;
    for (let i = 1; i <= endDate.getDate(); i++) {
      const date = new Date(currentYear, currentMonth, i);
      const dayOfWeek = date.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Exclude Sunday and Saturday
        workingDays++;
      }
    }

    let records;
    if (isDbConnected()) {
      records = await AttendanceModel.find({
        userId: req.user.userId,
        date: { $gte: startDate, $lte: endDate }
      });
    } else {
      // For in-memory database
      let allRecords = await AttendanceModel.find({});
      records = allRecords.filter(r => {
        const recordDate = new Date(r.date);
        return r.userId === req.user.userId && recordDate >= startDate && recordDate <= endDate;
      });
    }

    const presentDays = records.filter(r => r.status === 'present').length;
    const lateDays = records.filter(r => r.status === 'late').length;
    const absentDays = records.filter(r => r.status === 'absent').length;
    const totalRecordedDays = records.length;

    // Calculate percentage (present + late counted as attended)
    const attendedDays = presentDays + lateDays;
    const attendancePercentage = totalRecordedDays > 0 ? ((attendedDays / workingDays) * 100).toFixed(2) : 0;

    // Get daily breakdown
    const dailyData = [];
    for (let i = 1; i <= endDate.getDate(); i++) {
      const date = new Date(currentYear, currentMonth, i);
      const dateStr = date.toISOString().split('T')[0];
      const dayOfWeek = date.getDay();
      
      const record = records.find(r => new Date(r.date).toISOString().split('T')[0] === dateStr);
      
      dailyData.push({
        date: dateStr,
        day: dateStr.split('-')[2],
        status: record ? record.status : (dayOfWeek === 0 || dayOfWeek === 6 ? 'weekend' : 'absent'),
        checkInTime: record ? record.checkInTime : null,
        checkOutTime: record ? record.checkOutTime : null
      });
    }

    // Get chart data (weekly summary)
    const weeklyData = [];
    let weekStart = 1;
    for (let weekNum = 0; weekNum < 5; weekNum++) {
      const weekEnd = Math.min(weekStart + 6, endDate.getDate());
      let weekPresent = 0;
      let weekAbsent = 0;
      
      for (let i = weekStart; i <= weekEnd; i++) {
        const date = new Date(currentYear, currentMonth, i);
        const dateStr = date.toISOString().split('T')[0];
        const record = records.find(r => new Date(r.date).toISOString().split('T')[0] === dateStr);
        
        if (record && (record.status === 'present' || record.status === 'late')) {
          weekPresent++;
        } else if (record && record.status === 'absent') {
          weekAbsent++;
        }
      }
      
      if (weekPresent > 0 || weekAbsent > 0) {
        weeklyData.push({
          week: `Week ${weekNum + 1}`,
          present: weekPresent,
          absent: weekAbsent
        });
      }
      
      weekStart = weekEnd + 1;
    }

    res.json({
      month: currentMonth + 1,
      year: currentYear,
      presentDays,
      lateDays,
      absentDays,
      workingDays,
      totalRecordedDays,
      attendancePercentage,
      dailyData,
      weeklyData
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching monthly statistics', error: error.message });
  }
});

// Get user statistics
router.get('/stats/:userId', authenticateToken, authorizeRole(['faculty', 'admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { month, year } = req.query;
    const AttendanceModel = getAttendanceModel();

    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    const currentMonth = month ? parseInt(month) : new Date().getMonth();

    const startDate = new Date(currentYear, currentMonth, 1);
    const endDate = new Date(currentYear, currentMonth + 1, 0);

    let records;

    if (isDbConnected()) {
      records = await AttendanceModel.find({
        userId,
        date: { $gte: startDate, $lte: endDate }
      });
    } else {
      // For in-memory database
      let allRecords = await AttendanceModel.find({});
      records = allRecords.filter(r => {
        const recordDate = new Date(r.date);
        return r.userId === userId && recordDate >= startDate && recordDate <= endDate;
      });
    }

    const presentDays = records.filter(r => r.status === 'present').length;
    const lateDays = records.filter(r => r.status === 'late').length;
    const absentDays = records.filter(r => r.status === 'absent').length;

    res.json({
      userId,
      month: currentMonth + 1,
      year: currentYear,
      presentDays,
      lateDays,
      absentDays,
      totalDays: records.length,
      percentage: records.length > 0 ? ((presentDays / records.length) * 100).toFixed(2) : 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching statistics', error: error.message });
  }
});

// Get all students with today's attendance status (for faculty/admin)
router.get('/students-status/today', authenticateToken, authorizeRole(['faculty', 'admin']), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const UserModel = getUserModel();
    const AttendanceModel = getAttendanceModel();
    
    let students;
    let attendanceRecords;

    if (isDbConnected()) {
      // Get all students
      students = await UserModel.find({ role: 'student' })
        .select('_id name email enrollmentNumber department faceData')
        .lean();

      // Get today's attendance
      attendanceRecords = await AttendanceModel.find({
        date: { $gte: today, $lt: tomorrow }
      }).lean();
    } else {
      // For in-memory database
      students = (await UserModel.find({}))
        .filter(u => u.role === 'student')
        .map(u => ({
          _id: u._id,
          name: u.name,
          email: u.email,
          enrollmentNumber: u.enrollmentNumber,
          department: u.department,
          faceData: u.faceData
        }));

      let allRecords = await AttendanceModel.find({});
      attendanceRecords = allRecords.filter(r => {
        const recordDate = new Date(r.date);
        recordDate.setHours(0, 0, 0, 0);
        return recordDate.getTime() === today.getTime();
      });
    }

    // Get current time for status determination
    const now = new Date();
    const presentStart = new Date();
    presentStart.setHours(9, 0, 0, 0);
    const presentEnd = new Date();
    presentEnd.setHours(9, 10, 59, 999);
    const cutoff = new Date();
    cutoff.setHours(14, 0, 0, 0);

    // Build student status list
    const studentStatuses = students.map(student => {
      const attendanceRecord = attendanceRecords.find(r => r.userId.toString() === student._id.toString());
      
      let status = 'absent'; // Default status

      if (attendanceRecord && attendanceRecord.checkInTime) {
        const checkInTime = new Date(attendanceRecord.checkInTime);
        
        if (checkInTime >= presentStart && checkInTime <= presentEnd) {
          status = 'present';
        } else if (checkInTime > presentEnd && checkInTime < cutoff) {
          status = 'late';
        } else if (checkInTime >= cutoff) {
          status = 'absent';
        }
      } else {
        // Check if it's already past 2 PM - mark as absent
        if (now >= cutoff) {
          status = 'absent';
        }
      }

      return {
        _id: student._id,
        name: student.name,
        email: student.email,
        enrollmentNumber: student.enrollmentNumber,
        department: student.department,
        faceData: student.faceData,
        status: status,
        checkInTime: attendanceRecord?.checkInTime || null
      };
    });

    // Sort by name
    studentStatuses.sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      date: today.toISOString().split('T')[0],
      students: studentStatuses,
      summary: {
        total: studentStatuses.length,
        present: studentStatuses.filter(s => s.status === 'present').length,
        late: studentStatuses.filter(s => s.status === 'late').length,
        absent: studentStatuses.filter(s => s.status === 'absent').length
      }
    });
  } catch (error) {
   res.status(500).json({ message: 'Error fetching students status', error: error.message });
  }
});

// Manually mark/update student attendance (for faculty/admin)
router.post('/mark-attendance', authenticateToken, authorizeRole(['faculty', 'admin']), async (req, res) => {
  try {
   const { studentId, status, lectureId } = req.body;

   if (!studentId || !status) {
     return res.status(400).json({ message: 'Student ID and status are required' });
    }

   if (!['present', 'late', 'absent'].includes(status)) {
     return res.status(400).json({ message: 'Invalid status. Must be present, late, or absent' });
    }

   const AttendanceModel = getAttendanceModel();
   const UserModel = getUserModel();

    // Verify student exists
   const student = await UserModel.findById(studentId);
   if (!student) {
     return res.status(404).json({ message: 'Student not found' });
    }

   const today = new Date();
    today.setHours(0, 0, 0, 0);
   const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Check if attendance already exists for today
   let existingRecord;
   if (isDbConnected()) {
      existingRecord = await AttendanceModel.findOne({
        userId: studentId,
        date: { $gte: today, $lt: tomorrow }
      });
    } else {
     const allRecords = await AttendanceModel.find({ userId: studentId });
      existingRecord = allRecords.find(r => {
       const recordDate = new Date(r.date);
       recordDate.setHours(0, 0, 0, 0);
       return recordDate.getTime() === today.getTime();
      });
    }

   if (existingRecord) {
      // Update existing record
      existingRecord.status = status;
      
      // If marking as present or late, set check-in time if not already set
     if ((status === 'present' || status === 'late') && !existingRecord.checkInTime) {
        existingRecord.checkInTime = new Date().toISOString();
      }
      
      // If marking as absent, clear check-in time
     if (status === 'absent') {
        existingRecord.checkInTime = null;
        existingRecord.checkOutTime = null;
      }

      await existingRecord.save();

     res.json({
       message: 'Attendance updated successfully',
       record: existingRecord
      });
    } else {
      // Create new attendance record
     const attendanceData = {
        userId: studentId,
        date: today,
        status: status,
        markedBy: req.user.userId // Faculty who marked it
      };

      // If marking as present or late, set check-in time
     if (status === 'present' || status === 'late') {
        attendanceData.checkInTime = new Date().toISOString();
      }

      // Add lecture reference if provided
     if (lectureId) {
        attendanceData.lectureId = lectureId;
      }

     const newRecord = new AttendanceModel(attendanceData);
      await newRecord.save();

     res.json({
       message: 'Attendance marked successfully',
       record: newRecord
      });
    }
  } catch (error) {
   console.error('Error marking attendance:', error);
   res.status(500).json({ message: 'Error marking attendance', error: error.message });
  }
});

export default router;
