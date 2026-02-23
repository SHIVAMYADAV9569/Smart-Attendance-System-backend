import mongoose from 'mongoose';

const LectureAttendanceSchema = new mongoose.Schema({
  lectureId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecture',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['present', 'absent', 'late', 'leave'],
    default: 'absent'
  },
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  markedAt: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index to ensure one attendance record per student per lecture
LectureAttendanceSchema.index({ lectureId: 1, userId: 1 }, { unique: true });
LectureAttendanceSchema.index({ lectureId: 1 });
LectureAttendanceSchema.index({ userId: 1 });

export default mongoose.model('LectureAttendance', LectureAttendanceSchema);
