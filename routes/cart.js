const express = require('express');
const Cart = require('../models/Cart');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    console.log('Fetching cart for user:', req.userId);
    const cart = await Cart.findOne({ user: req.userId }).populate('items.food', 'name image price rating');
    console.log('Cart found:', JSON.stringify(cart, null, 2));
    if (!cart) {
      return res.status(404).json({ msg: 'Cart not found' });
    }

    // Process cart items to convert image Buffer to base64 string
    const processedCart = {
      ...cart._doc,
      items: cart.items.map(item => ({
        ...item._doc,
        food: {
          ...item.food._doc,
          image: item.food.image
            ? `data:${item.food.image.contentType};base64,${item.food.image.data.toString('base64')}`
            : null
        }
      }))
    };

    res.json(processedCart);
  } catch (err) {
    console.error('Error fetching cart:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.post('/add', auth, async (req, res) => {
  const { foodId, quantity, bespokeNote } = req.body;
  try {
    console.log('Adding to cart for user:', req.userId, 'Food ID:', foodId);
    let cart = await Cart.findOne({ user: req.userId });
    if (!cart) {
      cart = new Cart({ user: req.userId, items: [] });
    }

    const itemIndex = cart.items.findIndex(item => item.food.toString() === foodId);
    if (itemIndex > -1) {
      cart.items[itemIndex].quantity += quantity || 1;
    } else {
      cart.items.push({ food: foodId, quantity: quantity || 1, bespokeNote });
    }

    await cart.save();
    console.log('Cart updated:', cart);
    res.json(cart);
  } catch (err) {
    console.error('Error adding to cart:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.put('/update', auth, async (req, res) => {
  const { foodId, quantity, bespokeNote, rating } = req.body;
  try {
    console.log('Updating cart item for user:', req.userId, 'Food ID:', foodId);
    const cart = await Cart.findOne({ user: req.userId });
    if (!cart) return res.status(404).json({ msg: 'Cart not found' });

    const itemIndex = cart.items.findIndex(item => item.food.toString() === foodId);
    if (itemIndex > -1) {
      cart.items[itemIndex].quantity = quantity || cart.items[itemIndex].quantity;
      cart.items[itemIndex].bespokeNote = bespokeNote || cart.items[itemIndex].bespokeNote;
      cart.items[itemIndex].rating = rating || cart.items[itemIndex].rating;
      await cart.save();
      console.log('Cart updated:', cart);
      res.json(cart);
    } else {
      res.status(404).json({ msg: 'Item not found in cart' });
    }
  } catch (err) {
    console.error('Error updating cart:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;