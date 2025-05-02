const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const User = require('../models/User');
const { sendEmail } = require('../utils/email');
const mongoose = require('mongoose');

router.post('/', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { userId, orderId, amount } = req.body;

    // Validate inputs
    if (!userId || !orderId || !amount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ msg: 'Missing required fields' });
    }

    // Find order and user
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ msg: 'Order not found' });
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ msg: 'User not found' });
    }

    // Simulate payment processing (replace with actual payment gateway logic)
    // Assume payment is successful
    order.status = 'pending';
    order.paymentStatus = 'completed';
    order.paymentDetails = { amount, date: new Date() };
    await order.save({ session });

    // Prepare email content
    const itemsList = order.items.map(item => `<li>${item.name} - $${item.price.toFixed(2)}</li>`).join('');
    const emailHtml = `
      <h2>Payment Successful!</h2>
      <p>Dear ${user.name},</p>
      <p>Thank you for your order at Spoke Restaurant! Your payment of $${amount.toFixed(2)} for Order #${order._id} has been successfully processed.</p>
      <h3>Order Details:</h3>
      <ul>${itemsList}</ul>
      <p>Total: $${order.total.toFixed(2)}</p>
      <p>We’re preparing your order and will notify you when it’s out for delivery.</p>
      <p>Questions? Contact us at support@spoke.com.</p>
      <p>Best regards,<br>Spoke Restaurant Team</p>
    `;

    // Send email
    await sendEmail(user.email, `Spoke: Payment Confirmation for Order #${order._id}`, emailHtml);

    await session.commitTransaction();
    session.endSession();
    res.status(200).json({ msg: 'Payment processed successfully', order });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Payment error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;