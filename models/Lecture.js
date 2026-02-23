import mongoose from 'mongoose';

const LectureSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  facultyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  department: {
    type: String,
    default: ''
  },
  subject: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['scheduled', 'ongoing', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  description: {
    type: String,
    default: ''
  },
  // For recurring lectures
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringDays: {
    type: [String], // ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  },
  // Template lecture ID (for recurring instances)
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecture',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for better query performance
LectureSchema.index({ facultyId: 1, date: 1 });
LectureSchema.index({ date: 1 });

export default mongoose.model('Lecture', LectureSchema);
