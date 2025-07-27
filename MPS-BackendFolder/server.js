require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors({
  origin: ['http://localhost:3000', 'admirable-semifreddo-f54e91.netlify.app'],
  credentials: true
}));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Models
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  phone: String,
  courses: [{
    courseId: String,
    purchaseDate: Date,
    status: { type: String, enum: ['pending', 'active', 'expired'], default: 'pending' },
    transactionId: String,
    accessExpiry: Date
  }]
});

const CourseSchema = new mongoose.Schema({
  courseId: { type: String, unique: true },
  title: String,
  description: String,
  price: Number,
  discountedPrice: Number,
  instructor: String,
  duration: String,
  lessons: Number,
  thumbnail: String,
  createdAt: { type: Date, default: Date.now },
  stats: {
    totalStudents: Number,
    totalVideos: Number,
    totalHours: Number,
    totalNotes: Number
  },
  whatYouLearn: [String],
  requirements: [String]
});

const TransactionSchema = new mongoose.Schema({
  transactionId: { type: String, unique: true },
  userId: mongoose.Schema.Types.ObjectId,
  courseId: String,
  amount: Number,
  paymentMethod: String,
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  paymentDetails: Object,
  createdAt: { type: Date, default: Date.now }
});

const ReviewSchema = new mongoose.Schema({
  courseId: String,
  userId: mongoose.Schema.Types.ObjectId,
  userName: String,
  userEmail: String,
  rating: { type: Number, min: 1, max: 5 },
  review: String,
  createdAt: { type: Date, default: Date.now }
});

const VideoSchema = new mongoose.Schema({
  courseId: String,
  videoId: { type: String, unique: true },
  title: String,
  duration: String,
  isFree: Boolean,
  videoUrl: String,
  order: Number
});

const NoteSchema = new mongoose.Schema({
  courseId: String,
  noteId: { type: String, unique: true },
  title: String,
  isFree: Boolean,
  noteUrl: String,
  order: Number
});

const User = mongoose.model('User', UserSchema);
const Course = mongoose.model('Course', CourseSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);
const Review = mongoose.model('Review', ReviewSchema);
const Video = mongoose.model('Video', VideoSchema);
const Note = mongoose.model('Note', NoteSchema);

// Authentication Middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Utility function to check course access
const checkCourseAccess = async (userId, courseId) => {
  const user = await User.findById(userId);
  if (!user) return { hasAccess: false };
  
  const course = user.courses.find(c => c.courseId === courseId);
  if (!course) return { hasAccess: false };
  
  // Check if course access has expired
  if (course.accessExpiry && new Date(course.accessExpiry) < new Date()) {
    return { 
      hasAccess: false,
      status: 'expired',
      message: 'Course access has expired'
    };
  }
  
  return { 
    hasAccess: course.status === 'active',
    status: course.status,
    purchaseDate: course.purchaseDate,
    accessExpiry: course.accessExpiry
  };
};

// Routes

// User Registration
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const user = new User({ name, email, password, phone });
    await user.save();
    
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    
    res.json({ 
      success: true, 
      token,
      user: { 
        id: user._id,
        name: user.name, 
        email: user.email, 
        phone: user.phone 
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// User Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    
    if (!user || user.password !== password) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    
    res.json({ 
      success: true, 
      token,
      user: { 
        id: user._id,
        name: user.name, 
        email: user.email, 
        phone: user.phone 
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Course Details
app.get('/api/courses/:courseId', async (req, res) => {
  try {
    const course = await Course.findOne({ courseId: req.params.courseId });
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }
    
    res.json(course);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Course Videos
app.get('/api/courses/:courseId/videos', async (req, res) => {
  try {
    const videos = await Video.find({ courseId: req.params.courseId })
                            .sort({ order: 1 });
    res.json(videos);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Course Notes
app.get('/api/courses/:courseId/notes', async (req, res) => {
  try {
    const notes = await Note.find({ courseId: req.params.courseId })
                           .sort({ order: 1 });
    res.json(notes);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Course Reviews
app.get('/api/courses/:courseId/reviews', async (req, res) => {
  try {
    const reviews = await Review.find({ courseId: req.params.courseId })
                               .sort({ createdAt: -1 })
                               .limit(50);
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Check Course Access
app.get('/api/check-access/:courseId', authenticate, async (req, res) => {
  try {
    const access = await checkCourseAccess(req.user.userId, req.params.courseId);
    res.json(access);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Course Purchase
app.post('/api/purchase', authenticate, async (req, res) => {
  try {
    const { courseId, paymentMethod, transactionId, amount } = req.body;
    
    // Verify course exists
    const course = await Course.findOne({ courseId });
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }
    
    // Create transaction
    const transaction = new Transaction({
      transactionId,
      userId: req.user.userId,
      courseId,
      amount,
      paymentMethod,
      status: 'pending'
    });
    
    await transaction.save();
    
    // Add course to user's account (pending status)
    await User.findByIdAndUpdate(req.user.userId, {
      $push: {
        courses: {
          courseId,
          purchaseDate: new Date(),
          status: 'pending',
          transactionId,
          accessExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year access
        }
      }
    });
    
    // In production: Verify payment with payment gateway
    // For demo: Auto-activate after delay
    setTimeout(async () => {
      await Transaction.findByIdAndUpdate(transaction._id, { status: 'completed' });
      await User.updateOne(
        { _id: req.user.userId, 'courses.transactionId': transactionId },
        { $set: { 'courses.$.status': 'active' } }
      );
    }, 10000); // 10 seconds for demo
    
    res.json({ 
      success: true, 
      message: 'Payment received. Course will be activated shortly.',
      transactionId: transaction._id
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Manual Payment Verification
app.post('/api/verify-payment', authenticate, async (req, res) => {
  try {
    const { transactionId, paymentMethod, amount, courseId } = req.body;
    
    // Verify transaction exists
    const transaction = await Transaction.findOne({ transactionId });
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    
    // Update transaction status
    transaction.status = 'completed';
    await transaction.save();
    
    // Update user's course access
    await User.updateOne(
      { _id: req.user.userId, 'courses.transactionId': transactionId },
      { $set: { 'courses.$.status': 'active' } }
    );
    
    res.json({ 
      success: true,
      message: 'Payment verified and course activated'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Submit Review
app.post('/api/reviews', authenticate, async (req, res) => {
  try {
    const { courseId, rating, review } = req.body;
    
    // Check if user has purchased the course
    const access = await checkCourseAccess(req.user.userId, courseId);
    if (!access.hasAccess) {
      return res.status(403).json({ message: 'You must purchase the course to submit a review' });
    }
    
    // Get user details
    const user = await User.findById(req.user.userId);
    
    // Create review
    const newReview = new Review({
      courseId,
      userId: req.user.userId,
      userName: user.name,
      userEmail: user.email,
      rating,
      review
    });
    
    await newReview.save();
    
    res.json({ 
      success: true,
      message: 'Review submitted successfully',
      review: newReview
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get User Courses
app.get('/api/user/courses', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).populate({
      path: 'courses.courseId',
      model: 'Course',
      select: 'title thumbnail duration'
    });
    
    res.json(user.courses);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin Route - Get All Transactions
app.get('/api/admin/transactions', authenticate, async (req, res) => {
  try {
    // In production, verify admin role here
    const transactions = await Transaction.find()
                                         .populate('userId', 'name email')
                                         .sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Initialize Sample Data (for development)
async function initializeSampleData() {
  if (await Course.countDocuments() === 0) {
    const course = new Course({
      courseId: 'practical-ibarot',
      title: 'প্রাকটিকাল ইবারত শিক্ষা',
      description: 'আরবি ইবারত সহজে পড়া ও বুঝার কোর্স',
      price: 3000,
      discountedPrice: 1500,
      instructor: 'মাওলানা মুনতাহা আহমদ',
      duration: '৮ ঘন্টা',
      lessons: 10,
      thumbnail: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&h=250&fit=crop',
      stats: {
        totalStudents: 12500,
        totalVideos: 10,
        totalHours: 8,
        totalNotes: 8
      },
      whatYouLearn: [
        'আরবি ইবারত সঠিকভাবে পড়ার কৌশল',
        'ইবারত বিশ্লেষণ ও অনুবাদের নিয়মাবলী',
        'নাহু-সরফের প্রয়োগিক ব্যবহার',
        'কুরআন-হাদিসের ইবারত বুঝার কৌশল',
        'শিক্ষকতার দক্ষতা বৃদ্ধি'
      ]
    });
    
    await course.save();
    
    // Add sample videos
    const videos = [
      { courseId: 'practical-ibarot', videoId: 'lesson-1', title: 'ইবারত শিক্ষার গুরুত্ব ও প্রয়োজনীয়তা', duration: '৪৫ মিনিট', isFree: true, order: 1 },
      { courseId: 'practical-ibarot', videoId: 'lesson-2', title: 'আরবি বর্ণমালা ও উচ্চারণ', duration: '৫৫ মিনিট', isFree: false, order: 2 },
      { courseId: 'practical-ibarot', videoId: 'lesson-3', title: 'নাহু (ব্যাকরণ) এর মৌলিক ধারণা', duration: '১ ঘন্টা', isFree: false, order: 3 },
      { courseId: 'practical-ibarot', videoId: 'lesson-4', title: 'সরফ (শব্দতত্ত্ব) এর মৌলিক ধারণা', duration: '১ ঘন্টা ১৫ মিনিট', isFree: false, order: 4 },
      { courseId: 'practical-ibarot', videoId: 'lesson-5', title: 'বাক্য গঠন ও বিশ্লেষণ', duration: '৫০ মিনিট', isFree: false, order: 5 },
      { courseId: 'practical-ibarot', videoId: 'lesson-6', title: 'ইবারত পড়ার কৌশল', duration: '৪০ মিনিট', isFree: false, order: 6 },
      { courseId: 'practical-ibarot', videoId: 'lesson-7', title: 'ইবারত অনুবাদের নিয়মকানুন', duration: '১ ঘন্টা ১০ মিনিট', isFree: false, order: 7 },
      { courseId: 'practical-ibarot', videoId: 'lesson-8', title: 'কুরআনের ইবারত বিশ্লেষণ', duration: '১ ঘন্টা ২০ মিনিট', isFree: false, order: 8 },
      { courseId: 'practical-ibarot', videoId: 'lesson-9', title: 'হাদিসের ইবারত বিশ্লেষণ', duration: '১ ঘন্টা ৩০ মিনিট', isFree: false, order: 9 },
      { courseId: 'practical-ibarot', videoId: 'lesson-10', title: 'ইবারত শিক্ষার প্রায়োগিক কৌশল', duration: '৫৫ মিনিট', isFree: false, order: 10 }
    ];
    
    await Video.insertMany(videos);
    
    // Add sample notes
    const notes = [
      { courseId: 'practical-ibarot', noteId: 'note-1', title: 'ইবারত শিক্ষার মৌলিক ধারণা', isFree: true, order: 1 },
      { courseId: 'practical-ibarot', noteId: 'note-2', title: 'আরবি ব্যাকরণের মূল নিয়মাবলী', isFree: false, order: 2 },
      { courseId: 'practical-ibarot', noteId: 'note-3', title: 'নাহু শিক্ষার ধাপসমূহ', isFree: false, order: 3 },
      { courseId: 'practical-ibarot', noteId: 'note-4', title: 'সরফ শিক্ষার ধাপসমূহ', isFree: false, order: 4 },
      { courseId: 'practical-ibarot', noteId: 'note-5', title: 'ইবারত বিশ্লেষণের কৌশল', isFree: false, order: 5 },
      { courseId: 'practical-ibarot', noteId: 'note-6', title: 'অনুবাদের নীতিমালা', isFree: false, order: 6 },
      { courseId: 'practical-ibarot', noteId: 'note-7', title: 'কুরআনি ইবারতের বৈশিষ্ট্য', isFree: false, order: 7 },
      { courseId: 'practical-ibarot', noteId: 'note-8', title: 'হাদিসি ইবারতের বৈশিষ্ট্য', isFree: false, order: 8 }
    ];
    
    await Note.insertMany(notes);
    
    // Add sample reviews
    const reviews = [
      { 
        courseId: 'practical-ibarot', 
        userName: 'আবু বকর সিদ্দিক', 
        userEmail: 'user1@example.com',
        rating: 5, 
        review: 'অসাধারণ কোর্স! মাওলানা মুনতাহা আহমদ সাহেবের শিক্ষা পদ্ধতি অত্যন্ত কার্যকর। আমি এখন আরবি ইবারত সহজেই পড়তে ও বুঝতে পারি। আল্লাহ তাঁর উত্তম প্রতিদান দিন।' 
      },
      { 
        courseId: 'practical-ibarot', 
        userName: 'মুহাম্মদ কাসেম', 
        userEmail: 'user2@example.com',
        rating: 5, 
        review: 'দীর্ঘদিন ধরে আরবি ইবারত নিয়ে সমস্যায় ছিলাম। এই কোর্সটি আমার সমস্যার সমাধান করে দিয়েছে। প্রতিটি লেসন অত্যন্ত সুন্দরভাবে সাজানো।' 
      },
      { 
        courseId: 'practical-ibarot', 
        userName: 'ফাতিমা খাতুন', 
        userEmail: 'user3@example.com',
        rating: 5, 
        review: 'মা হিসেবে আমি আমার সন্তানদের আরবি শেখাতে চাইছিলাম। এই কোর্সটি আমাকে সেই যোগ্যতা দিয়েছে। খুবই উপকারী কোর্স।' 
      },
      { 
        courseId: 'practical-ibarot', 
        userName: 'আব্দুল্লাহ আল মামুন', 
        userEmail: 'user4@example.com',
        rating: 5, 
        review: 'মাদরাসার শিক্ষক হিসেবে এই কোর্সটি আমার শিক্ষকতার মান অনেক বৃদ্ধি করেছে। ছাত্রদের কাছে এখন আরো সহজভাবে বিষয়টি উপস্থাপন করতে পারি।' 
      }
    ];
    
    await Review.insertMany(reviews);
    
    console.log('Sample data initialized');
  }
}

// Initialize sample data in development
if (process.env.NODE_ENV !== 'production') {
  initializeSampleData();
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));