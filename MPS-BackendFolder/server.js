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
  origin: ['http://localhost:3000', 'https://688528cbe97060f3af3f2df7--zesty-stroopwafel-b30f2b.netlify.app/coursedetails#'],
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
    transactionId: String
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
  createdAt: { type: Date, default: Date.now }
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

// Routes

// User Registration
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    const user = new User({ name, email, password, phone });
    await user.save();
    
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    
    res.json({ 
      success: true, 
      token,
      user: { name: user.name, email: user.email, phone: user.phone }
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
      user: { name: user.name, email: user.email, phone: user.phone }
    });
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
          transactionId
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

// Check Course Access
app.get('/api/check-access/:courseId', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const course = user.courses.find(c => c.courseId === req.params.courseId);
    
    if (!course) {
      return res.json({ hasAccess: false });
    }
    
    res.json({ 
      hasAccess: course.status === 'active',
      purchaseDate: course.purchaseDate,
      status: course.status
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

// Get User Courses
app.get('/api/user/courses', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).populate({
      path: 'courses.courseId',
      model: 'Course'
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
    const transactions = await Transaction.find().populate('userId', 'name email');
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));