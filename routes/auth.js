import express from 'express';
import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import { UserMock, memoryDb } from '../config/memoryDb.js';
import mongoose from 'mongoose';
import { createDefaultLecturesForFaculty } from '../utils/lectureTemplates.js';

const router = express.Router();

// Check if MongoDB is connected
const isDbConnected = () => {
  return mongoose.connection.readyState === 1;
};

// Use mock database if MongoDB is not connected
const getUserModel = () => {
  return isDbConnected() ? User : UserMock;
};

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, enrollmentNumber, department, course, rollNumber } = req.body;

    console.log('📝 Register Request:', { name, email, role });
    console.log('📦 Request body:', req.body);

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const UserModel = getUserModel();
    console.log('💾 Using database:', isDbConnected() ? 'MongoDB' : 'In-Memory');
    
    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();
    console.log('🔍 Checking for existing user with email:', normalizedEmail);
    
    // Check if user exists
    let existingUser;
    try {
      existingUser = await UserModel.findOne({ email: normalizedEmail });
    } catch (findError) {
      console.error('❌ Error finding user:', findError.message);
      throw new Error('Database error while checking existing user');
    }

    if (existingUser) {
      console.log('❌ Registration blocked - email already exists:', normalizedEmail);
      return res.status(400).json({ message: 'Email already registered' });
    }
    console.log('✅ Email is available:', normalizedEmail);

    // Hash password
    let hashedPassword;
    try {
      hashedPassword = await bcryptjs.hash(password, 10);
    } catch (hashError) {
      console.error('❌ Error hashing password:', hashError.message);
      throw new Error('Error processing password');
    }

    // Create new user - only include fields that have values
    const userData = {
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: role || 'student'
    };
    
    // Only add optional fields if they have values
    if (enrollmentNumber && enrollmentNumber.trim() !== '') {
      userData.enrollmentNumber = enrollmentNumber.trim();
    }
    if (rollNumber && rollNumber.trim() !== '') {
      userData.rollNumber = rollNumber.trim();
    }
    if (department && department.trim() !== '') {
      userData.department = department.trim();
    }
    if (course && course.trim() !== '') {
      userData.course = course.trim();
    }
    
    console.log('📝 Creating user with data:', { ...userData, password: '***' });
    
    const newUser = new UserModel(userData);

    try {
      await newUser.save();
    } catch (saveError) {
      console.error('❌ Error saving user:', saveError.message);
      if (saveError.code === 11000) {
        // Check if it's enrollmentNumber or email duplicate
        if (saveError.message.includes('enrollmentNumber')) {
          return res.status(400).json({ message: 'Enrollment number already registered' });
        }
        return res.status(400).json({ message: 'Email already registered' });
      }
      throw new Error('Error saving user to database');
    }

    console.log('✅ User created:', newUser.email);
    console.log(`👤 User ID: ${newUser._id}`);

    // Create default lectures for faculty
    if (newUser.role === 'faculty' && isDbConnected()) {
      try {
        await createDefaultLecturesForFaculty(newUser._id, department || '');
        console.log(`✅ Default lectures created for faculty: ${newUser.email}`);
      } catch (lectureError) {
        console.error('⚠️ Error creating default lectures:', lectureError.message);
        // Don't fail registration if lecture creation fails
      }
    }

    // Create token
    const token = jwt.sign(
      { userId: newUser._id, email: newUser.email, role: newUser.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    console.log(`🔑 Token created with userId: ${newUser._id}`);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (error) {
    console.error('❌ Registration Error:', error.message);
    console.error('❌ Full error:', error);
    console.error('❌ Stack trace:', error.stack);
    res.status(500).json({ 
      message: 'Registration failed', 
      error: error.message,
      details: error.toString()
    });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const UserModel = getUserModel();
    console.log('🔑 Login attempt for:', email.toLowerCase().trim());
    console.log('💾 Using database:', isDbConnected() ? 'MongoDB' : 'In-Memory');
    
    // Search by lowercase email (consistent with registration)
    const user = await UserModel.findOne({ email: email.toLowerCase().trim() });
    
    if (!user) {
      console.log('❌ User not found');
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    console.log('✅ User found:', user.email);

    // Check if comparePassword method exists
    if (typeof user.comparePassword !== 'function') {
      console.error('❌ comparePassword method not found on user object');
      return res.status(500).json({ message: 'Authentication error' });
    }

    const isPasswordValid = await user.comparePassword(password);
    console.log('🔐 Password valid:', isPasswordValid);
    
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        hasFaceData: !!user.faceData,
        faceData: user.faceData || null,
        course: user.course || null,
        department: user.department || null,
        rollNumber: user.rollNumber || user.enrollmentNumber || null
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const UserModel = getUserModel();
    let user;
    
    if (isDbConnected()) {
      user = await UserModel.findById(req.user.userId).select('-password');
    } else {
      // For in-memory database
      user = await UserModel.findById(req.user.userId);
      if (user) {
        // Remove sensitive fields
        delete user.password;
      }
    }
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user', error: error.message });
  }
});

// Debug endpoint - clear all users (remove in production)
router.post('/debug/clear', async (req, res) => {
  try {
    if (isDbConnected()) {
      // For MongoDB, we won't clear - too dangerous
      return res.status(400).json({ message: 'Cannot clear MongoDB via this endpoint' });
    } else {
      // Clear in-memory database
      memoryDb.users = [];
      memoryDb.attendanceRecords = [];
      memoryDb.saveToFile();
      console.log('🗑️ Memory database cleared');
      return res.json({ message: 'Memory database cleared successfully' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error clearing database', error: error.message });
  }
});

// Debug endpoint - list all users (remove in production)
router.get('/debug/users', async (req, res) => {
  try {
    const UserModel = getUserModel();
    let allUsers;
    
    if (isDbConnected()) {
      allUsers = await UserModel.find({}).select('-password');
    } else {
      // For in-memory, manually exclude password
      allUsers = memoryDb.users.map(u => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt
      }));
    }
    
    res.json({
      dbType: isDbConnected() ? 'MongoDB' : 'In-Memory',
      userCount: allUsers.length,
      users: allUsers
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users', error: error.message });
  }
});

export default router;
