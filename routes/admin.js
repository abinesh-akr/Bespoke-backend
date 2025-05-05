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
  const { name, price, quantityAvailable, bespokeOption, tags } = req.body;
  try {
    // Validate required fields
    if (!req.file) {
      return res.status(400).json({ msg: 'Image is required' });
    }
    if (!name || !price || !quantityAvailable) {
      return res.status(400).json({ msg: 'Missing required fields: name, price, and quantityAvailable are required' });
    }
    const parsedPrice = parseFloat(price);
    const parsedQuantity = parseInt(quantityAvailable);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ msg: 'Price must be a non-negative number' });
    }
    if (isNaN(parsedQuantity) || parsedQuantity < 0) {
      return res.status(400).json({ msg: 'Quantity available must be a non-negative number' });
    }

    const food = new Food({
      name,
      price: parsedPrice,
      quantityAvailable: parsedQuantity,
      image: {
        data: req.file.buffer,
        contentType: req.file.mimetype
      },
      bespokeOption: bespokeOption || '',
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
  const { name, price, quantityAvailable, bespokeOption, tags } = req.body;
  try {
    // Validate required fields
    if (!name || !price || !quantityAvailable) {
      return res.status(400).json({ msg: 'Missing required fields: name, price, and quantityAvailable are required' });
    }
    const parsedPrice = parseFloat(price);
    const parsedQuantity = parseInt(quantityAvailable);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ msg: 'Price must be a non-negative number' });
    }
    if (isNaN(parsedQuantity) || parsedQuantity < 0) {
      return res.status(400).json({ msg: 'Quantity available must be a non-negative number' });
    }

    const updateData = {
      name,
      price: parsedPrice,
      quantityAvailable: parsedQuantity,
      bespokeOption: bespokeOption || '',
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
    const orders = await Order.find()
      .populate('items.food')
      .populate('user', 'name email')
      .populate('chef', 'name image');
    const transformedOrders = orders.map(order => ({
      ...order._doc,
      items: order.items.map(item => ({
        ...item._doc,
        food: item.food ? {
          ...item.food._doc,
          image: item.food.image
            ? `data:${item.food.image.contentType};base64,${item.food.image.data.toString('base64')}`
            : null
        } : {
          price: 0,
          quantity: 0,
          image: null,
          name: "DeletedItem"
        }
      })),
      chef: {
        ...order.chef._doc,
        image: order.chef.image
          ? `data:${order.chef.image.contentType};base64,${order.chef.image.data.toString('base64')}`
          : null
      }
    }));
    return res.json(transformedOrders);
  } catch (err) {
    console.error('Fetch orders error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// Add Chef
router.post('/chef', admin, upload.single('image'), async (req, res) => {
  const { name, email, password, specialty, rating, alloted } = req.body;
  try {
    if (!req.file || !name || !email || !password || !specialty) {
      return res.status(400).json({ msg: 'Missing required fields: name, email, password, specialty, and image are required' });
    }

    const existingChef = await Chef.findOne({ email });
    if (existingChef) {
      return res.status(400).json({ msg: 'Chef with this email already exists' });
    }

    const chef = new Chef({
      name,
      email,
      password,
      specialty,
      rating: parseFloat(rating) || 0,
      alloted: parseInt(alloted) || 0,
      image: {
        data: req.file.buffer,
        contentType: req.file.mimetype
      }
    });
    await chef.save();
    res.json({ msg: 'Chef added successfully', chef });
  } catch (err) {
    console.error('Add chef error:', err);
    res.status(500).json({ msg: err.message || 'Server error' });
  }
});

// Delete Chef
router.delete('/chef/:id', admin, async (req, res) => {
  try {
    const chefId = req.params.id;

    // Find the chef to be deleted
    const chef = await Chef.findById(chefId);
    if (!chef) {
      return res.status(404).json({ msg: 'Chef not found' });
    }

    // Find all orders assigned to this chef
    const orders = await Order.find({ chef: chefId });
    if (orders.length > 0) {
      // Check if there are other chefs available
      const otherChefs = await Chef.find({ _id: { $ne: chefId } });
      if (otherChefs.length === 0) {
        return res.status(400).json({ msg: 'Cannot delete chef: No other chefs available to reassign orders' });
      }

      // Reassign each order to the chef with the lowest alloted value
      for (const order of orders) {
        const newChef = await Chef.findOne({ _id: { $ne: chefId } }).sort('alloted').exec();
        if (!newChef) {
          return res.status(400).json({ msg: 'No available chefs to reassign order' });
        }

        // Calculate total quantity for the order
        const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);

        // Update the order's chef
        order.chef = newChef._id;
        await order.save();
        console.log(`Reassigned order ${order._id} to chef ${newChef._id}`);

        // Update the new chef's alloted value (30 per quantity)
        newChef.alloted += 30 * totalQuantity;
        await newChef.save();
        console.log(`Updated chef ${newChef._id} alloted to ${newChef.alloted}`);
      }
    }

    // Delete the chef
    await Chef.findByIdAndDelete(chefId);
    console.log(`Deleted chef ${chefId}`);

    return res.json({ msg: 'Chef deleted and orders reassigned' });
  } catch (err) {
    console.error('Delete chef error:', err);
    return res.status(500).json({ msg: err.message || 'Server error' });
  }
});

// Get All Chefs
router.get('/chefs', admin, async (req, res) => {
  try {
    const chefs = await Chef.find({}, 'name _id'); // Only fetch name and _id
    return res.json(chefs);
  } catch (err) {
    console.error('Fetch chefs error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;