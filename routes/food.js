const express = require('express');
const router = express.Router();
const Food = require('../models/Food');
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

// Get All Foods
router.get('/', async (req, res) => {
  try {
    const foods = await Food.find();
    // Convert image Buffer to base64 for frontend
    const foodsWithBase64 = foods.map(food => ({
      ...food._doc,
      image: `data:${food.image.contentType};base64,${food.image.data.toString('base64')}`
    }));
    res.json(foodsWithBase64);
  } catch (err) {
    console.error('Get foods error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Add Food
router.post('/', upload.single('image'), async (req, res) => {
  const { name, price, quantityAvailable, bespokeOption, tags } = req.body;
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
      quantityAvailable: quantityAvailable || 0,
      bespokeOption,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : []
    });
    await food.save();
    res.json({
      ...food._doc,
      image: `data:${food.image.contentType};base64,${food.image.data.toString('base64')}`
    });
  } catch (err) {
    console.error('Add food error:', err);
    res.status(500).json({ msg: err.message || 'Server error' });
  }
});

module.exports = router;