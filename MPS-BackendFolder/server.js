require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors({
  origin: ['http://localhost:3000', 'http://admirable-semifreddo-f54e91.netlify.app'],
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
  phone: String,
  password: String,
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
  stats: {
    totalStudents: Number,
    totalVideos: Number,
    totalHours: Number,
    totalNotes: Number
  }
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

const User = mongoose.model('User', UserSchema);
const Course = mongoose.model('Course', CourseSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);

// Routes

// Course Purchase Endpoint
app.post('/api/purchase', async (req, res) => {
  try {
    const { name, email, phone, txnId, paymentMethod, courseId, amount } = req.body;
    
    // Validate required fields
    if (!name || !email || !txnId || !paymentMethod || !courseId) {
      return res.status(400).json({ message: 'অনুগ্রহ করে সকল তথ্য প্রদান করুন' });
    }
    
    // Verify course exists
    const course = await Course.findOne({ courseId });
    if (!course) {
      return res.status(404).json({ message: 'কোর্সটি পাওয়া যায়নি' });
    }
    
    // Check if user exists or create new
    let user = await User.findOne({ email });
    if (!user) {
      user = new User({ 
        name, 
        email, 
        phone,
        password: 'temp' + Math.random().toString(36).slice(2) // Temporary password
      });
      await user.save();
    }
    
    // Check if transaction ID already exists
    const existingTransaction = await Transaction.findOne({ transactionId: txnId });
    if (existingTransaction) {
      return res.status(400).json({ message: 'এই ট্রানজেকশন আইডি ইতিমধ্যে ব্যবহৃত হয়েছে' });
    }
    
    // Create transaction
    const transaction = new Transaction({
      transactionId: txnId,
      userId: user._id,
      courseId,
      amount: amount || course.discountedPrice,
      paymentMethod,
      status: 'pending',
      paymentDetails: {
        name,
        email,
        phone
      }
    });
    
    await transaction.save();
    
    // Add course to user's account (pending status)
    await User.findByIdAndUpdate(user._id, {
      $push: {
        courses: {
          courseId,
          purchaseDate: new Date(),
          status: 'pending',
          transactionId: txnId,
          accessExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year access
        }
      }
    }, { new: true });
    
    // In production: Verify payment with payment gateway
    // For demo: Auto-activate after delay
    setTimeout(async () => {
      try {
        await Transaction.findByIdAndUpdate(transaction._id, { status: 'completed' });
        await User.updateOne(
          { _id: user._id, 'courses.transactionId': txnId },
          { $set: { 'courses.$.status': 'active' } }
        );
        
        // In production: Send email notification
      } catch (err) {
        console.error('Error activating course:', err);
      }
    }, 10000); // 10 seconds for demo
    
    res.json({ 
      success: true, 
      message: 'পেমেন্ট সফলভাবে গৃহীত হয়েছে। কোর্সটি শীঘ্রই সক্রিয় হবে।',
      transactionId: transaction._id
    });
    
  } catch (error) {
    console.error('Purchase error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'পেমেন্ট প্রক্রিয়াকরণে সমস্যা হয়েছে'
    });
  }
});

// Get Course Details
app.get('/api/courses/:courseId', async (req, res) => {
  try {
    const course = await Course.findOne({ courseId: req.params.courseId });
    if (!course) {
      return res.status(404).json({ message: 'কোর্সটি পাওয়া যায়নি' });
    }
    
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Check Course Access
app.get('/api/check-access/:courseId', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ message: 'ইমেইল প্রয়োজন' });
    }
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ hasAccess: false });
    }
    
    const course = user.courses.find(c => c.courseId === req.params.courseId);
    if (!course) {
      return res.json({ hasAccess: false });
    }
    
    res.json({
      hasAccess: course.status === 'active',
      status: course.status,
      purchaseDate: course.purchaseDate
    });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Initialize Sample Data
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
      }
    });
    
    await course.save();
    console.log('Sample course created');
  }
}

// Initialize sample data in development
if (process.env.NODE_ENV !== 'production') {
  initializeSampleData();
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));