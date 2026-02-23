import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['student', 'faculty', 'admin'],
    default: 'student'
  },
  faceData: {
    type: String,
    default: null
  },
  phone: {
    type: String
  },
  enrollmentNumber: {
    type: String,
    default: null,
    sparse: true
  },
  department: {
    type: String
  },
  course: {
    type: String,
    default: ''
  },
  rollNumber: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Method to compare password
UserSchema.methods.comparePassword = async function(password) {
  return await bcryptjs.compare(password, this.password);
};

export default mongoose.model('User', UserSchema);
