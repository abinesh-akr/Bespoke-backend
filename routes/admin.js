const express = require('express');
const router = express.Router();
const Food = require('../models/Food');
const Order = require('../models/Order');
const Chef = require('../models/Chef');
const admin = require('../middleware/admin');
const multer = require('multer');

// Configure multer for in-memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(file.originalname.split('.').pop().toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only JPEG/PNG images are allowed'));
  }
});

// Add Food
router.post('/food', admin, upload.single('image'), async (req, res) => {
  const { name, price, rating, chef, bespokeOption, tags } = req.body;
  try {
    if (!req.file) {
      return res.status(400).json({ msg: 'Image is required' });
    }
    const food = new Food({
      name,
      price,
      image: {
        data: req.file.buffer,
        contentType: req.file.mimetype
      },
      rating: rating || 0,
      chef,
      bespokeOption,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : []
    });
    await food.save();
    res.json(food);
  } catch (err) {
    console.error('Add food error:', err);
    res.status(500).json({ msg: err.message || 'Server error' });
  }
});

// Modify Food (Update)
router.put('/food/:id', admin, upload.single('image'), async (req, res) => {
  const { name, price, rating, chef, bespokeOption, tags } = req.body;
  try {
    const updateData = {
      name,
      price,
      rating: rating || 0,
      chef,
      bespokeOption,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : []
    };
    if (req.file) {
      updateData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype
      };
    }
    const food = await Food.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!food) {
      return res.status(404).json({ msg: 'Food not found' });
    }
    res.json(food);
  } catch (err) {
    console.error('Update food error:', err);
    res.status(500).json({ msg: err.message || 'Server error' });
  }
});

// Delete Food
router.delete('/food/:id', admin, async (req, res) => {
  try {
    const food = await Food.findByIdAndDelete(req.params.id);
    if (!food) {
      return res.status(404).json({ msg: 'Food not found' });
    }
    return res.json({ msg: 'Food deleted' });
  } catch (err) {
    console.error('Delete food error:', err);
    return res.status(500).json({ msg: err.message || 'Server error' });
  }
});

// Get All Orders
router.get('/orders', admin, async (req, res) => {
  try {
    const orders = await Order.find().populate('items.food').populate('user', 'name email').populate('chef', 'name');
    return res.json(orders);
  } catch (err) {
    console.error('Fetch orders error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// Add Chef
router.post('/chef', admin, async (req, res) => {
  const { name, image, rating, specialty, email, password, alloted } = req.body;
  try {
    const chef = new Chef({
      name,
      image,
      rating: rating || 0,
      specialty,
      email,
      password,
      alloted: alloted || 0
    });
    await chef.save();
    res.json(chef);
  } catch (err) {
    console.error('Add chef error:', err);
    res.status(500).json({ msg: err.message || 'Server error' });
  }
});

// Delete Chef
router.delete('/chef/:id', admin, async (req, res) => {
  try {
    const chef = await Chef.findByIdAndDelete(req.params.id);
    if (!chef) {
      return res.status(404).json({ msg: 'Chef not found' });
    }
    return res.json({ msg: 'Chef deleted' });
  } catch (err) {
    console.error('Delete chef error:', err);
    return res.status(500).json({ msg: err.message || 'Server error' });
  }
});

module.exports = router;