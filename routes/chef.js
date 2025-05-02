const express = require('express');
const router = express.Router();
const Chef = require('../models/Chef');
const Order = require('../models/Order');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const chefAuth = require('../middleware/chefAuth');
const { sendEmail } = require('../utils/email');

// Chef Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const chef = await Chef.findOne({ email });
    if (!chef) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, chef.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    const token = jwt.sign({ chefId: chef._id }, process.env.JWT_SECRET || 'your_jwt_secret');
    return res.json({ token });
  } catch (err) {
    console.error('Chef login error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// Get Chef Profile
router.get('/profile', chefAuth, async (req, res) => {
  try {
    const chef = await Chef.findById(req.chefId).select('-password');
    if (!chef) {
      return res.status(404).json({ msg: 'Chef not found' });
    }
    return res.json(chef);
  } catch (err) {
    console.error('Chef profile error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// Get All Orders for Chef
router.get('/orders', chefAuth, async (req, res) => {
  try {
    const orders = await Order.find({ chef: req.chefId }).populate('items.food').populate('user', 'name email');
    return res.json(orders);
  } catch (err) {
    console.error('Fetch chef orders error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// Mark Order as Completed
router.put('/orders/:id/complete', chefAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('items.food').populate('user', 'name email');
    if (!order) {
      return res.status(404).json({ msg: 'Order not found' });
    }
    if (order.chef.toString() !== req.chefId) {
      return res.status(403).json({ msg: 'Not authorized' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ msg: 'Order is not pending' });
    }

    // Calculate total quantity
    const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);

    // Update order status
    order.status = 'out_for_delivery';
    await order.save();

    // Decrement chef's alloted attribute
    const chef = await Chef.findById(req.chefId);
    chef.alloted = Math.max(0, chef.alloted - 30 * totalQuantity);
    await chef.save();

    // Send out for delivery email
    const itemsList = order.items.map(item => `<li>${item.food.name} - $${item.food.price.toFixed(2)} x ${item.quantity}</li>`).join('');
    const emailHtml = `
      <h2>Your Order is Out for Delivery!</h2>
      <p>Dear ${order.user.name},</p>
      <p>Great news! Your order #${order._id} from Spoke Restaurant is now out for delivery.</p>
      <h3>Order Details:</h3>
      <ul>${itemsList}</ul>
      <p>Total: $${order.total.toFixed(2)}</p>
      <p>Estimated Delivery: Within the next hour.</p>
      <p>Track your order or contact us at support@spoke.com if you have questions.</p>
      <p>Enjoy your meal!<br>Spoke Restaurant Team</p>
    `;
    await sendEmail(order.user.email, `Spoke: Order #${order._id} Out for Delivery`, emailHtml);

    return res.json(order);
  } catch (err) {
    console.error('Complete order error:', err);
    return res.status(500).json({ msg: err.message || 'Server error' });
  }
});

// Get all chefs
router.get('/', async (req, res) => {
  try {
    const chefs = await Chef.find();
    return res.json(chefs);
  } catch (err) {
    console.error('Get chefs error:', err);
    return res.status(500).json({ msg: err.message || 'Server error' });
  }
});

module.exports = router;