// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.json()); // To parse JSON bodies

 
// Ensure this middleware is set to serve static files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// Use the MongoDB connection string for local server
const uri = 'mongodb://localhost:27017/';
const client = new MongoClient(uri, 
    // { useUnifiedTopology: true }
);
const dbName = 'socialMediaPlatform';
let db;

// Connect to MongoDB
const connectDB = async () => {
  try {
    await client.connect();
    db = client.db(dbName);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Failed to connect to MongoDB', error);
  }
};



// Middleware for JWT authentication
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization && req.headers.authorization.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token, authorization denied' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};
 

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Append file extension
  },
});

// Initialize upload variable with multer settings
const upload = multer({ storage });

// Create uploads directory if it does not exist
const fs = require('fs');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}


// Authentication routes

app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;
    console.log('Received data:', req.body); // Log the received data
  
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }
  
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await db.collection('users').insertOne({ username, email, password: hashedPassword });
      res.status(201).json({ message: 'User registered', userId: user.insertedId });
    } catch (error) {
      console.error('Error registering user:', error); // Log the error
      res.status(500).json({ message: 'Error registering user' });
    }
  });
  
 

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await db.collection('users').findOne({ username });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '10h' });
    res.status(200).json({ token });
  } catch (error) {
    res.status(500).json({ message: 'Error logging in' });
  }
});

// Post routes

app.post('/api/posts/create', authMiddleware, upload.single('image'), async (req, res) => {
  const { text, youtube } = req.body; // 'text' and 'youtube' are optional
  const userId = req.user.id;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : ''; // Ensure the path starts with /uploads/
  //const imageUrl = req.file ? `/uploads/${req.file.filename}` : '';


  try {
    const post = {
      text: text || '', // Default to empty string if not provided
      imageUrl: imageUrl || '', // Default to empty string if not provided
      youtube: youtube || '', // Default to empty string if not provided
      userId,
      date: new Date(),
    };

    const result = await db.collection('posts').insertOne(post);
    
    if (result.acknowledged) {
      const insertedPost = await db.collection('posts').findOne({ _id: result.insertedId });
      res.status(201).json(insertedPost);
    } else {
      throw new Error('Post insertion not acknowledged by MongoDB');
    }
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ message: 'Error creating post', error: error.message });
  }
});


 
// Add a comment to a post

 
app.post('/api/posts/:postId/comments', authMiddleware, async (req, res) => {
  const { postId } = req.params;
  const { commentText } = req.body;
  const userId = req.user.id;

  try {
    if (!commentText) {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    const comment = {
      text: commentText,
      userId,
      postId: new ObjectId(postId), // Ensure postId is converted to ObjectId
      date: new Date(),
    };

    const result = await db.collection('comments').insertOne(comment);

    // Fetch the newly inserted comment to return it with its full structure
    const newComment = await db.collection('comments').findOne({ _id: result.insertedId });

    res.status(201).json(newComment); // Return the newly inserted comment
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ message: 'Error adding comment' });
  }
});


 

// Get all comments for a specific post
app.get('/api/posts/:postId/comments', async (req, res) => {
  const { postId } = req.params;

  try {
   // const comments = await db.collection('comments').find({ postId }).sort({ date: -1 }).toArray();
   const comments = await db.collection('comments').find({ postId: new ObjectId(postId) }).sort({ date: -1 }).toArray();
    res.status(200).json(comments);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching comments' });
  }
});




app.get('/api/posts/posts', async (req, res) => {
  try {
    const posts = await db.collection('posts').find().sort({ date: -1 }).limit(20).toArray();
    res.status(200).json(posts);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching posts' });
  }
});

// Admin routes
app.get('/api/admin/posts', authMiddleware, async (req, res) => {
  try {
    const posts = await db.collection('posts').find().toArray();
    res.status(200).json(posts);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching posts' });
  }
});

app.delete('/api/admin/posts/:postId', authMiddleware, async (req, res) => {
  const { postId } = req.params;

  try {
    await db.collection('posts').deleteOne({ _id: new ObjectId(postId) });
    res.status(200).json({ message: 'Post deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting post' });
  }
});

app.delete('/api/admin/comments/:commentId', authMiddleware, async (req, res) => {
  const { commentId } = req.params;

  try {
    await db.collection('comments').deleteOne({ _id: new ObjectId(commentId) });
    res.status(200).json({ message: 'Comment deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting comment' });
  }
});

app.get('/api/admin/users', authMiddleware, async (req, res) => {
  try {
    const users = await db.collection('users').find().toArray();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users' });
  }
});
 

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});


 