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
     return res.json({
      ...chef._doc,
      image: `data:${chef.image.contentType};base64,${chef.image.data.toString('base64')}`
    });
  } catch (err) {
    console.error('Chef profile error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// Get All Orders for Chef
router.get('/orders', chefAuth, async (req, res) => {
  try {
    const orders = await Order.find({ chef: req.chefId }).sort({createdAt:-1}).populate('items.food').populate('user', 'name email');
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
      }))
    }));
    return res.json(transformedOrders);
  } catch (err) {
    console.error('Fetch chef orders error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});


async function isOnline() {
  const endpoints = [
    'https://www.google.com?cache_bust=' + Math.random(),
    'https://cloudflare.com?cache_bust=' + Math.random()
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(endpoint, {
        timeout: 3000, // 3-second timeout per endpoint
        headers: { 'Cache-Control': 'no-cache' }, // Avoid caching
        validateStatus: status => status >= 200 && status < 300 // Accept 2xx statuses
      });
      console.log(`isOnline: ${endpoint.split('?')[0]} responded with status ${response.status}`);
      return true;
    } catch (error) {
      console.error(`isOnline: Failed to reach ${endpoint.split('?')[0]}:`, error.message, error.code);
    }
  }
  console.error('isOnline: All endpoints failed. Assuming offline.');
  return false;
}

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

    console.log(isOnline())
    const online = await isOnline();
    if(online){
    // Send out for delivery email with food images and bill
    const itemsList = order.items.map(item => {
      const imageSrc = item.food.image
        ? `data:${item.food.image.contentType};base64,${item.food.image.data.toString('base64')}`
        : 'https://via.placeholder.com/100?text=No+Image';
      const subtotal = (item.quantity * item.food.price).toFixed(2);
      return `
        <tr>
          <td style="padding: 10px; text-align: center;">
            <img src="${imageSrc}" alt="${item.food.name}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 5px;">
          </td>
          <td style="padding: 10px;">${item.food.name}</td>
          <td style="padding: 10px; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px; text-align: right;">$${item.food.price.toFixed(2)}</td>
          <td style="padding: 10px; text-align: right;">$${subtotal}</td>
        </tr>
      `;
    }).join('');

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <h2 style="color: #333;">Your Order is Out for Delivery!</h2>
        <p>Dear ${order.user.name},</p>
        <p>Great news! Your order #${order._id} from Spoke Restaurant is now out for delivery.</p>
        <h3 style="color: #333;">Order Details:</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #f5f5f5;">
              <th style="padding: 10px; text-align: center; border-bottom: 1px solid #ddd;">Image</th>
              <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Item</th>
              <th style="padding: 10px; text-align: center; border-bottom: 1px solid #ddd;">Quantity</th>
              <th style="padding: 10px; text-align: right; border-bottom: 1px solid #ddd;">Price</th>
              <th style="padding: 10px; text-align: right; border-bottom: 1px solid #ddd;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${itemsList}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4" style="padding: 10px; text-align: right; font-weight: bold;">Total:</td>
              <td style="padding: 10px; text-align: right; font-weight: bold;">$${order.total.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        <p>Estimated Delivery: Within the next hour.</p>
        <p>Track your order or contact us at <a href="mailto:support@spoke.com" style="color: #007bff;">support@spoke.com</a>.</p>
        <p style="margin-top: 20px;">Enjoy your meal!<br>Spoke Restaurant Team</p>
      </div>
    `;
    await sendEmail(order.user.email, `Spoke: Order #${order._id} Out for Delivery`, emailHtml);
  }

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
   
    const chefsWithBase64 = chefs.map(chef => ({
      ...chef._doc,
      image: `data:${chef.image.contentType};base64,${chef.image.data.toString('base64')}`
    }));
    res.json(chefsWithBase64);
  } catch (err) {
    console.error('Get chefs error:', err);
    return res.status(500).json({ msg: err.message || 'Server error' });
  }
});

module.exports = router;