import express from 'express';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { authenticateToken, authorizeRole } from '../middleware/auth.js';
import { memoryDb } from '../config/memoryDb.js';
import { isDbConnected } from '../config/db.js';

const router = express.Router();

// Dashboard overview
router.get('/overview', authenticateToken, authorizeRole(['faculty', 'admin']), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Today's statistics
    let presentToday = 0;
    let absentToday = 0;
    let todayAttendance = [];

    if (isDbConnected()) {
      todayAttendance = await Attendance.find({ date: { $gte: today, $lt: tomorrow } });
      presentToday = todayAttendance.filter(a => a.checkInTime).length;
      absentToday = todayAttendance.filter(a => !a.checkInTime).length;
    } else {
      // Fallback to in-memory DB
      todayAttendance = memoryDb.attendanceRecords.filter(r => {
        const d = new Date(r.date);
        d.setHours(0,0,0,0);
        return d.getTime() === today.getTime();
      });
      presentToday = todayAttendance.filter(a => a.checkInTime).length;
      absentToday = todayAttendance.filter(a => !a.checkInTime).length;
    }

    // This month statistics
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    let thisMonthAttendance = [];
    let totalUsers = 0;
    let recentActivity = [];

    if (isDbConnected()) {
      thisMonthAttendance = await Attendance.find({ date: { $gte: monthStart, $lte: monthEnd } });
      totalUsers = await User.countDocuments({ role: { $in: ['student', 'faculty'] } });
      recentActivity = await Attendance.find({ date: { $gte: today, $lt: tomorrow } })
        .populate('userId', 'name email enrollmentNumber role')
        .sort({ checkInTime: -1 })
        .limit(10)
        .lean();
    } else {
      thisMonthAttendance = memoryDb.attendanceRecords.filter(r => {
        const d = new Date(r.date);
        return d >= monthStart && d <= monthEnd;
      });
      totalUsers = memoryDb.users.filter(u => ['student','faculty'].includes(u.role)).length;
      recentActivity = memoryDb.attendanceRecords
        .filter(r => {
          const d = new Date(r.date);
          d.setHours(0,0,0,0);
          return d.getTime() === today.getTime();
        })
        .slice(-10)
        .reverse();
      // map to match mongoose lean structure
      recentActivity = recentActivity.map(r => ({ ...r, userId: memoryDb.users.find(u => u._id === r.userId) }));
    }

    res.json({
      today: {
        date: today.toISOString().split('T')[0],
        present: presentToday,
        absent: absentToday,
        totalUsers
      },
      thisMonth: {
        totalRecords: thisMonthAttendance.length,
        average: ((presentToday / totalUsers) * 100).toFixed(2) + '%'
      },
      recentActivity
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching dashboard', error: error.message });
  }
});

// Get detailed attendance report for date range
router.get('/report', authenticateToken, authorizeRole(['faculty', 'admin']), async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'date' } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'startDate and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    let attendance = [];
    if (isDbConnected()) {
      attendance = await Attendance.find({ date: { $gte: start, $lte: end } });
    } else {
      attendance = memoryDb.attendanceRecords.filter(r => {
        const d = new Date(r.date);
        return d >= start && d <= end;
      });
    }

    let groupedData = {};

    if (groupBy === 'date') {
      attendance.forEach(record => {
        const date = new Date(record.date).toISOString().split('T')[0];
        const status = record.status || 'absent';
        if (!groupedData[date]) {
          groupedData[date] = { present: 0, absent: 0, late: 0, leave: 0 };
        }
        groupedData[date][status] = (groupedData[date][status] || 0) + 1;
      });
    } else if (groupBy === 'status') {
      groupedData = {
        present: 0,
        absent: 0,
        late: 0,
        leave: 0
      };
      attendance.forEach(record => {
        const status = record.status || 'absent';
        groupedData[status] = (groupedData[status] || 0) + 1;
      });
    }

    res.json({
      dateRange: { startDate, endDate },
      totalRecords: attendance.length,
      groupBy,
      data: groupedData
    });
  } catch (error) {
    res.status(500).json({ message: 'Error generating report', error: error.message });
  }
});

// Get real-time attendance stream (who came in/out today)
router.get('/live-feed', authenticateToken, authorizeRole(['faculty', 'admin']), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let feed = [];
    if (isDbConnected()) {
      feed = await Attendance.find({ date: { $gte: today, $lt: tomorrow } })
        .populate('userId', 'name email enrollmentNumber role department')
        .sort({ checkInTime: -1 })
        .limit(20)
        .lean();
    } else {
      feed = memoryDb.attendanceRecords.filter(r => {
        const d = new Date(r.date);
        d.setHours(0,0,0,0);
        return d.getTime() === today.getTime();
      }).slice(-20).reverse();
      // attach user objects
      feed = feed.map(r => ({ ...r, userId: memoryDb.users.find(u => u._id === r.userId) }));
    }

    const data = feed.map(record => ({
      userId: record.userId?._id || null,
      name: record.userId?.name || 'Unknown',
      email: record.userId?.email || null,
      enrollment: record.userId?.enrollmentNumber || null,
      role: record.userId?.role || null,
      department: record.userId?.department || null,
      checkInTime: record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : null,
      checkOutTime: record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : null,
      status: record.status,
      confidence: record.faceConfidence
    }));

    res.json({
      date: today.toISOString().split('T')[0],
      totalCheckedIn: data.filter(d => d.checkInTime).length,
      feed: data
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching live feed', error: error.message });
  }
});

// Get attendance heat map data
router.get('/heatmap', authenticateToken, authorizeRole(['faculty', 'admin']), async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    let data = [];
    if (isDbConnected()) {
      data = await Attendance.aggregate([
      {
        $match: {
          date: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            date: '$date',
            status: '$status'
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.date': 1 }
      }
    ]);

    }
    const heatmapData = {};
    if (isDbConnected()) {
      data.forEach(item => {
        const date = new Date(item._id.date).toISOString().split('T')[0];
        if (!heatmapData[date]) {
          heatmapData[date] = { present: 0, absent: 0, late: 0, leave: 0 };
        }
        heatmapData[date][item._id.status] = item.count;
      });
    } else {
      // build heatmap from memoryDb
      memoryDb.attendanceRecords.forEach(r => {
        const d = new Date(r.date).toISOString().split('T')[0];
        if (!heatmapData[d]) heatmapData[d] = { present: 0, absent: 0, late: 0, leave: 0 };
        heatmapData[d][r.status] = (heatmapData[d][r.status] || 0) + 1;
      });
    }

    res.json({
      days,
      data: heatmapData
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching heatmap data', error: error.message });
  }
});

export default router;

// Admin endpoints: users list and manual marking
router.get('/users-list', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0,0,0,0);

    let users = [];
    if (isDbConnected()) {
      users = await User.find({}).select('name email faceData role');
    } else {
      users = memoryDb.users.map(u => ({ _id: u._id, name: u.name, email: u.email, faceData: u.faceData, role: u.role }));
    }

    // Attach today's attendance status for each user
    const result = await Promise.all(users.map(async user => {
      let att = null;
      if (isDbConnected()) {
        att = await Attendance.findOne({ userId: user._id, date: today });
      } else {
        att = memoryDb.attendanceRecords.find(r => r.userId === user._id && new Date(r.date).toDateString() === today.toDateString());
      }
      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        faceData: user.faceData || null,
        role: user.role,
        status: att ? att.status : 'absent',
        checkInTime: att ? att.checkInTime : null
      };
    }));

    // totals
    const totals = result.reduce((acc, u) => {
      acc[u.status] = (acc[u.status] || 0) + 1;
      return acc;
    }, { present: 0, late: 0, absent: 0, leave: 0 });

    res.json({ users: result, totals });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users list', error: error.message });
  }
});

// Admin manual mark attendance
router.post('/mark-attendance', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const { userId, status } = req.body;
    if (!userId || !status) return res.status(400).json({ message: 'userId and status required' });

    const today = new Date();
    today.setHours(0,0,0,0);
    const now = new Date();

    const AttendanceModel = isDbConnected() ? Attendance : (await import('../config/memoryDb.js')).AttendanceMock;

    if (isDbConnected()) {
      let att = await Attendance.findOne({ userId, date: today });
      if (att) {
        att.status = status;
        if (status === 'present' || status === 'late') att.checkInTime = now;
        await att.save();
      } else {
        att = new Attendance({ userId, date: today, status, checkInTime: (status === 'present' || status === 'late') ? now : null });
        await att.save();
      }
      return res.json({ message: 'Attendance marked', userId, status });
    }

    // memoryDb path
    const existing = memoryDb.attendanceRecords.find(r => r.userId === userId && new Date(r.date).toDateString() === today.toDateString());
    if (existing) {
      existing.status = status;
      if (status === 'present' || status === 'late') existing.checkInTime = now;
    } else {
      const rec = { _id: Math.random().toString(36).substr(2,9), userId, date: today.toISOString(), checkInTime: (status === 'present' || status === 'late') ? now.toISOString() : null, status };
      memoryDb.attendanceRecords.push(rec);
    }
    return res.json({ message: 'Attendance marked (memory)', userId, status });
  } catch (error) {
    res.status(500).json({ message: 'Error marking attendance', error: error.message });
  }
});

// Mark absent users as late after 14:00 (can be called by cron)
router.post('/mark-absent-late', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const now = new Date();
    const cutoff = new Date();
    cutoff.setHours(14,0,0,0);
    if (now < cutoff) return res.status(400).json({ message: 'Too early to mark absentees as late' });

    const today = new Date();
    today.setHours(0,0,0,0);

    let users = [];
    if (isDbConnected()) users = await User.find({ role: { $in: ['student','faculty'] } }).select('_id');
    else users = memoryDb.users.filter(u => ['student','faculty'].includes(u.role)).map(u => ({ _id: u._id }));

    const updated = [];
    for (const u of users) {
      let att = null;
      if (isDbConnected()) att = await Attendance.findOne({ userId: u._id, date: today });
      else att = memoryDb.attendanceRecords.find(r => r.userId === u._id && new Date(r.date).toDateString() === today.toDateString());

      if (!att) {
        // create late record
        if (isDbConnected()) {
          const a = new Attendance({ userId: u._id, date: today, status: 'late', checkInTime: null });
          await a.save();
        } else {
          memoryDb.attendanceRecords.push({ _id: Math.random().toString(36).substr(2,9), userId: u._id, date: today.toISOString(), checkInTime: null, status: 'late' });
        }
        updated.push(u._id);
      }
    }

    res.json({ message: 'Marked absent users as late', count: updated.length, updated });
  } catch (error) {
    res.status(500).json({ message: 'Error marking absent as late', error: error.message });
  }
});
