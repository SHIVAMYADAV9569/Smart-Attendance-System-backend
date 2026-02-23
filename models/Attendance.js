import mongoose from 'mongoose';

const AttendanceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  checkInTime: {
    type: Date,
    default: null
  },
  checkOutTime: {
    type: Date,
    default: null
  },
  date: {
    type: Date,
    default: () => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      return date;
    }
  },
  status: {
    type: String,
    enum: ['present', 'absent', 'late', 'leave'],
    default: 'absent'
  },
  faceConfidence: {
    type: Number,
    default: 0
  },
  ipAddress: {
    type: String
  },
  location: {
    type: String
  },
  notes: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for better query performance
AttendanceSchema.index({ userId: 1, date: 1 }, { unique: true });
AttendanceSchema.index({ date: 1 });

export default mongoose.model('Attendance', AttendanceSchema);
