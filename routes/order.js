const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const User = require('../models/User');
const Chef = require('../models/Chef');
const { sendEmail } = require('../utils/email');
const auth = require('../middleware/auth');

router.get('/checkout', auth, async (req, res) => {
  try {
    // Find the user's cart and populate food items
    const cart = await Cart.findOne({ user: req.userId }).populate('items.food');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ msg: 'Cart is empty' });
    }

    // Calculate total price and total quantity
    const total = cart.items.reduce((sum, item) => sum + item.food.price * item.quantity, 0);
    const totalQuantity = cart.items.reduce((sum, item) => sum + item.quantity, 0);

    // Find the chef with the lowest 'alloted' value
    const chef = await Chef.findOne().sort('alloted').exec();
    if (!chef) {
      return res.status(400).json({ msg: 'No chefs available' });
    }

    // Create new order with chef ID
    const order = new Order({
      user: req.userId,
      items: cart.items.map(item => ({
        food: item.food._id,
        quantity: item.quantity
      })),
      total,
      chef: chef._id,
      status: 'pending',
      paymentStatus: 'completed'
    });
    await order.save();

    // Update chef's alloted attribute (add 30 per quantity)
    chef.alloted += 30 * totalQuantity;
    await chef.save();

    // Clear the cart
    cart.items = [];
    await cart.save();

    // Update user's loyalty points
    const user = await User.findById(req.userId);
    user.loyaltyPoints += Math.floor(total / 10);
    await user.save();

    // Send payment confirmation email
    const itemsList = cart.items.map(item => `<li>${item.food.name} - $${item.food.price.toFixed(2)} x ${item.quantity}</li>`).join('');
    const emailHtml = `
      <h2>Payment Successful!</h2>
      <p>Dear ${user.name},</p>
      <p>Thank you for your order at Spoke Restaurant! Your payment of $${total.toFixed(2)} for Order #${order._id} has been successfully processed.</p>
      <h3>Order Details:</h3>
      <ul>${itemsList}</ul>
      <p>Total: $${total.toFixed(2)}</p>
      <p>We’re preparing your order and will notify you when it’s out for delivery.</p>
      <p>Questions? Contact us at support@spoke.com.</p>
      <p>Best regards,<br>Spoke Restaurant Team</p>
    `;
    await sendEmail(user.email, `Spoke: Payment Confirmation for Order #${order._id}`, emailHtml);

    return res.status(200).json({ msg: 'Checkout successful', order });
  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ msg: err.message || 'Server error' });
  }
});

router.get('/history', auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.userId }).populate('items.food');
    return res.json(orders);
  } catch (err) {
    console.error('History error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;