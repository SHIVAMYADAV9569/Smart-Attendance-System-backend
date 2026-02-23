import Lecture from '../models/Lecture.js';

// Default lecture templates for faculty
const DEFAULT_LECTURES = [
  {
    title: 'Mobile Computer',
    subject: 'Computer Science',
    startTime: '09:10',
    endTime: '10:00',
    description: 'Introduction to mobile computing concepts and applications'
  },
  {
    title: 'Multimedia',
    subject: 'Computer Science',
    startTime: '10:10',
    endTime: '11:00',
    description: 'Multimedia systems, design, and development'
  },
  {
    title: 'Machine Learning',
    subject: 'Computer Science',
    startTime: '11:10',
    endTime: '12:00',
    description: 'Fundamentals of machine learning algorithms and applications'
  },
  {
    title: 'Software Project Management System',
    subject: 'Management',
    startTime: '12:10',
    endTime: '13:00',
    description: 'Project planning, execution, and monitoring techniques'
  }
];

/**
 * Create default recurring lecture templates for a faculty member
 * @param {string} facultyId - The faculty user ID
 * @param {string} department - The department name
 * @returns {Promise<Array>} - Array of created lecture templates
 */
export const createDefaultLecturesForFaculty = async (facultyId, department = '') => {
  try {
    const createdLectures = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const template of DEFAULT_LECTURES) {
      // Create the template lecture (recurring master)
      const lectureTemplate = new Lecture({
        ...template,
        facultyId,
        department,
        date: today, // Template date
        isRecurring: true,
        recurringDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        status: 'scheduled'
      });

      await lectureTemplate.save();
      createdLectures.push(lectureTemplate);
      
      console.log(`✅ Created lecture template: ${template.title}`);
    }

    console.log(`✅ Created ${createdLectures.length} default lectures for faculty`);
    return createdLectures;
  } catch (error) {
    console.error('❌ Error creating default lectures:', error);
    throw error;
  }
};

/**
 * Generate lecture instances for a specific date based on templates
 * @param {string} facultyId - The faculty user ID
 * @param {Date} date - The date to generate lectures for
 * @returns {Promise<Array>} - Array of lecture instances for the date
 */
export const generateLecturesForDate = async (facultyId, date) => {
  try {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[targetDate.getDay()];

    // Find all recurring templates for this faculty
    const templates = await Lecture.find({
      facultyId,
      isRecurring: true,
      recurringDays: { $in: [dayName] }
    });

    // Check if instances already exist for this date
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);
    
    const existingLectures = await Lecture.find({
      facultyId,
      date: { $gte: targetDate, $lt: nextDay },
      templateId: { $ne: null }
    });

    // If lectures already exist for this date, return them
    if (existingLectures.length > 0) {
      return existingLectures;
    }

    // Generate new instances from templates
    const newLectures = [];
    for (const template of templates) {
      const lectureInstance = new Lecture({
        title: template.title,
        facultyId: template.facultyId,
        date: new Date(targetDate),
        startTime: template.startTime,
        endTime: template.endTime,
        department: template.department,
        subject: template.subject,
        description: template.description,
        status: 'scheduled',
        isRecurring: false,
        templateId: template._id
      });

      await lectureInstance.save();
      newLectures.push(lectureInstance);
    }

    return newLectures;
  } catch (error) {
    console.error('❌ Error generating lectures for date:', error);
    throw error;
  }
};

export default {
  createDefaultLecturesForFaculty,
  generateLecturesForDate,
  DEFAULT_LECTURES
};
