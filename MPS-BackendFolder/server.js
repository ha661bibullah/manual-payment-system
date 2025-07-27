require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const app = express();

// উন্নত সিকিউরিটি মিডলওয়্যার
app.use(helmet());
app.use(morgan('dev'));

// রেট লিমিটার (প্রতি 15 মিনিটে 100 রিকোয়েস্ট)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// বডি পার্সার কনফিগারেশন
app.use(bodyParser.json({ limit: '10kb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10kb' }));

// CORS কনফিগারেশন
const corsOptions = {
  origin: [
    'http://localhost:3000', 
    'http://admirable-semifreddo-f54e91.netlify.app',
    'https://your-production-domain.com' // আপনার প্রোডাকশন ডোমেইন যোগ করুন
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};
app.use(cors(corsOptions));

// MongoDB কানেকশন (অ্যাডভান্সড কনফিগারেশন)
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true,
  useFindAndModify: false
})
.then(() => console.log('✅ MongoDB-তে সফলভাবে সংযুক্ত হয়েছে'))
.catch(err => {
  console.error('❌ MongoDB সংযোগে ব্যর্থ:', err);
  process.exit(1);
});

// MongoDB কানেকশন ইভেন্ট লিস্টেনার
mongoose.connection.on('connected', () => {
  console.log('Mongoose ডিফল্ট কানেকশন খোলা হয়েছে');
});

mongoose.connection.on('error', (err) => {
  console.log('Mongoose ডিফল্ট কানেকশনে এরর:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose ডিফল্ট কানেকশন বিচ্ছিন্ন হয়েছে');
});

// মডেল ডিফিনিশন
const UserSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'নাম আবশ্যক'] },
  email: { 
    type: String, 
    required: [true, 'ইমেইল আবশ্যক'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: props => `${props.value} সঠিক ইমেইল নয়`
    }
  },
  phone: { 
    type: String,
    validate: {
      validator: function(v) {
        return /^(?:\+88|01)?\d{11}$/.test(v);
      },
      message: props => `${props.value} সঠিক মোবাইল নম্বর নয়`
    }
  },
  password: { type: String, select: false },
  courses: [{
    courseId: { type: String, required: true },
    purchaseDate: { type: Date, default: Date.now },
    status: { 
      type: String, 
      enum: ['pending', 'active', 'expired'], 
      default: 'pending' 
    },
    transactionId: String,
    accessExpiry: Date
  }]
}, { timestamps: true });

const CourseSchema = new mongoose.Schema({
  courseId: { 
    type: String, 
    unique: true,
    required: [true, 'কোর্স আইডি আবশ্যক']
  },
  title: { type: String, required: [true, 'শিরোনাম আবশ্যক'] },
  description: { type: String, required: [true, 'বিবরণ আবশ্যক'] },
  price: { 
    type: Number, 
    required: [true, 'মূল্য আবশ্যক'],
    min: [0, 'মূল্য শূন্য থেকে কম হতে পারবে না']
  },
  discountedPrice: { 
    type: Number,
    validate: {
      validator: function(v) {
        return v <= this.price;
      },
      message: props => `ডিসকাউন্ট মূল্য (${props.value}) নিয়মিত মূল্য থেকে বেশি হতে পারবে না`
    }
  },
  instructor: { type: String, required: [true, 'প্রশিক্ষক নাম আবশ্যক'] },
  duration: String,
  lessons: { type: Number, min: [1, 'অন্তত ১টি লেসন থাকতে হবে'] },
  thumbnail: {
    type: String,
    validate: {
      validator: function(v) {
        return /^(http|https):\/\/[^ "]+$/.test(v);
      },
      message: props => `${props.value} সঠিক URL নয়`
    }
  },
  stats: {
    totalStudents: { type: Number, default: 0 },
    totalVideos: Number,
    totalHours: Number,
    totalNotes: Number
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const TransactionSchema = new mongoose.Schema({
  transactionId: { 
    type: String, 
    unique: true,
    required: [true, 'ট্রানজেকশন আইডি আবশ্যক']
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true
  },
  courseId: { 
    type: String, 
    required: [true, 'কোর্স আইডি আবশ্যক']
  },
  amount: { 
    type: Number, 
    required: [true, 'পরিমাণ আবশ্যক'],
    min: [0, 'পরিমাণ শূন্য থেকে কম হতে পারবে না']
  },
  paymentMethod: { 
    type: String, 
    required: [true, 'পেমেন্ট পদ্ধতি আবশ্যক'],
    enum: ['bkash', 'nagad', 'bank', 'card', 'other']
  },
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'failed', 'refunded'], 
    default: 'pending' 
  },
  paymentDetails: {
    name: String,
    email: String,
    phone: String,
    bankName: String,
    cardLast4: String
  }
}, { timestamps: true });

// মডেল এক্সপোর্ট
const User = mongoose.model('User', UserSchema);
const Course = mongoose.model('Course', CourseSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);

// রাউট হ্যান্ডলার
// কোর্স ক্রয় এন্ডপয়েন্ট (উন্নত ভার্সন)
app.post('/api/purchase', async (req, res) => {
  try {
    const { name, email, phone, txnId, paymentMethod, courseId, amount } = req.body;
    
    // ভ্যালিডেশন
    if (!name || !email || !txnId || !paymentMethod || !courseId) {
      return res.status(400).json({ 
        success: false,
        error: 'MISSING_FIELDS',
        message: 'নাম, ইমেইল, ট্রানজেকশন আইডি, পেমেন্ট পদ্ধতি এবং কোর্স আইডি আবশ্যক'
      });
    }

    // কোর্স খুঁজুন
    const course = await Course.findOne({ courseId, isActive: true });
    if (!course) {
      return res.status(404).json({ 
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: 'কোর্সটি পাওয়া যায়নি বা নিষ্ক্রিয় করা হয়েছে'
      });
    }

    // ব্যবহারকারী খুঁজুন বা তৈরি করুন
    let user = await User.findOne({ email });
    if (!user) {
      user = new User({ 
        name, 
        email, 
        phone,
        password: require('crypto').randomBytes(16).toString('hex') // আরও সুরক্ষিত র‍্যান্ডম পাসওয়ার্ড
      });
      await user.save();
    }

    // ট্রানজেকশন আইডি চেক করুন
    const existingTransaction = await Transaction.findOne({ transactionId: txnId });
    if (existingTransaction) {
      return res.status(400).json({ 
        success: false,
        error: 'DUPLICATE_TRANSACTION',
        message: 'এই ট্রানজেকশন আইডি ইতিমধ্যে ব্যবহৃত হয়েছে'
      });
    }

    // ট্রানজেকশন তৈরি করুন
    const transaction = new Transaction({
      transactionId: txnId,
      userId: user._id,
      courseId,
      amount: amount || course.discountedPrice || course.price,
      paymentMethod,
      status: 'pending',
      paymentDetails: { name, email, phone }
    });

    await transaction.save();

    // ব্যবহারকারীর কোর্স তালিকায় যোগ করুন
    const courseData = {
      courseId,
      purchaseDate: new Date(),
      status: 'pending',
      transactionId: txnId,
      accessExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // ১ বছর এক্সেস
    };

    await User.findByIdAndUpdate(
      user._id,
      { $push: { courses: courseData } },
      { new: true, runValidators: true }
    );

    // ডেমো: ১০ সেকেন্ড পর স্বয়ংক্রিয়ভাবে সক্রিয় করুন
    if (process.env.NODE_ENV !== 'production') {
      setTimeout(async () => {
        try {
          await Transaction.findByIdAndUpdate(transaction._id, { status: 'completed' });
          await User.updateOne(
            { _id: user._id, 'courses.transactionId': txnId },
            { $set: { 'courses.$.status': 'active' } }
          );
          
          // কোর্সের মোট শিক্ষার্থী সংখ্যা আপডেট করুন
          await Course.updateOne(
            { courseId },
            { $inc: { 'stats.totalStudents': 1 } }
          );
        } catch (err) {
          console.error('কোর্স সক্রিয়করণে ব্যর্থ:', err);
        }
      }, 10000);
    }

    res.json({ 
      success: true, 
      message: 'পেমেন্ট সফলভাবে গৃহীত হয়েছে। কোর্সটি শীঘ্রই সক্রিয় হবে।',
      data: {
        transactionId: transaction._id,
        courseTitle: course.title,
        amount: transaction.amount,
        paymentMethod: transaction.paymentMethod
      }
    });

  } catch (error) {
    console.error('ক্রয় প্রক্রিয়ায় ত্রুটি:', error);
    
    // Mongoose validation error
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(el => el.message);
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'ডেটা ভ্যালিডেশন ব্যর্থ',
        details: errors
      });
    }

    // অন্যান্য এরর
    res.status(500).json({ 
      success: false,
      error: 'SERVER_ERROR',
      message: error.message || 'সার্ভারে অপ্রত্যাশিত ত্রুটি ঘটেছে'
    });
  }
});

// কোর্স ডিটেইলস এন্ডপয়েন্ট
app.get('/api/courses/:courseId', async (req, res) => {
  try {
    const course = await Course.findOne({ 
      courseId: req.params.courseId,
      isActive: true
    }).select('-__v');

    if (!course) {
      return res.status(404).json({ 
        success: false,
        error: 'NOT_FOUND',
        message: 'কোর্সটি পাওয়া যায়নি'
      });
    }

    res.json({
      success: true,
      data: course
    });

  } catch (error) {
    console.error('কোর্স ডিটেইলস ত্রুটি:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'কোর্স তথ্য পাওয়ার সময় ত্রুটি ঘটেছে'
    });
  }
});

// কোর্স এক্সেস চেক এন্ডপয়েন্ট
app.get('/api/check-access/:courseId', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ 
        success: false,
        error: 'EMAIL_REQUIRED',
        message: 'ইমেইল প্রদান করুন'
      });
    }

    const user = await User.findOne({ email }).select('courses');
    if (!user) {
      return res.json({ 
        success: true,
        data: { hasAccess: false }
      });
    }

    const courseAccess = user.courses.find(c => c.courseId === req.params.courseId);
    if (!courseAccess) {
      return res.json({ 
        success: true,
        data: { hasAccess: false }
      });
    }

    res.json({
      success: true,
      data: {
        hasAccess: courseAccess.status === 'active',
        status: courseAccess.status,
        purchaseDate: courseAccess.purchaseDate,
        accessExpiry: courseAccess.accessExpiry
      }
    });

  } catch (error) {
    console.error('এক্সেস চেক ত্রুটি:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'এক্সেস চেক করতে ব্যর্থ'
    });
  }
});

// হেলথ চেক এন্ডপয়েন্ট
app.get('/api/health', (req, res) => {
  res.json({
    status: 'UP',
    timestamp: new Date(),
    dbStatus: mongoose.connection.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED'
  });
});

// 404 হ্যান্ডলার
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'ENDPOINT_NOT_FOUND',
    message: 'এন্ডপয়েন্ট পাওয়া যায়নি'
  });
});

// গ্লোবাল এরর হ্যান্ডলার
app.use((err, req, res, next) => {
  console.error('গ্লোবাল এরর:', err.stack);
  
  res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: 'সার্ভারে অপ্রত্যাশিত ত্রুটি ঘটেছে'
  });
});

// নমুনা ডেটা ইনিশিয়ালাইজেশন
async function initializeSampleData() {
  try {
    const count = await Course.countDocuments();
    if (count === 0) {
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
      console.log('✅ নমুনা কোর্স তৈরি করা হয়েছে');
    }
  } catch (err) {
    console.error('নমুনা ডেটা ইনিশিয়ালাইজেশনে ব্যর্থ:', err);
  }
}

// ডেভেলপমেন্টে নমুনা ডেটা লোড করুন
if (process.env.NODE_ENV !== 'production') {
  initializeSampleData();
}

// সার্ভার শুরু করুন
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 সার্ভার চলছে http://localhost:${PORT} এ`);
});

// গ্রেসফুল শাটডাউন হ্যান্ডলার
process.on('SIGTERM', () => {
  console.log('SIGTERM প্রাপ্ত. সার্ভার বন্ধ করা হচ্ছে...');
  server.close(() => {
    console.log('সার্ভার বন্ধ হয়েছে');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT প্রাপ্ত. সার্ভার বন্ধ করা হচ্ছে...');
  server.close(() => {
    console.log('সার্ভার বন্ধ হয়েছে');
    process.exit(0);
  });
});