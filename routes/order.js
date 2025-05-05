const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const User = require('../models/User');
const Chef = require('../models/Chef');
const Food = require('../models/Food');
const { sendEmail } = require('../utils/email');
const auth = require('../middleware/auth');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load local dataset
const locationsDataset = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/tamilnadu_locations.json'), 'utf8')
);

// Haversine distance function (returns distance in km)
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

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


router.post('/checkout', auth, async (req, res) => {
  const { userLocation } = req.body; // Expecting city/village name (e.g., "Virudhunagar")
  const restaurantLocation = '9.4650,77.7978'; // Sivakasi, Tamil Nadu
  const restaurantLat = 9.4650;
  const restaurantLng = 77.7978;
  const osrmUrl = 'http://router.project-osrm.org/route/v1/driving/';
  const nominatimUrl = 'https://nominatim.openstreetmap.org/search';

  try {
    // Validate userLocation
    if (!userLocation || typeof userLocation !== 'string' || userLocation.trim().length === 0) {
      return res.status(400).json({ msg: 'User location (city/village name) is required' });
    }

    let lat, lng, distanceKm = 0;
    const normalizedUserLocation = userLocation.trim().toLowerCase();
    const online = await isOnline();

    if (online) {
      // Online mode: Use Nominatim and OSRM
      console.log('Running in online mode');
      const axiosNominatim = axios.create({
        httpsAgent: new https.Agent({
          rejectUnauthorized: false // Temporary for development
        })
      });
      console.log(`Warning: SSL validation disabled for Nominatim request to ${nominatimUrl}`);

      // Geocode userLocation
      const nominatimResponse = await axiosNominatim.get(nominatimUrl, {
        params: {
          q: `${userLocation}, Tamil Nadu, India`,
          format: 'json',
          limit: 1,
          addressdetails: 1
        },
        headers: {
          'User-Agent': 'SpokeRestaurant/1.0 (support@spoke.com)'
        }
      });

      if (!nominatimResponse.data || nominatimResponse.data.length === 0) {
        return res.status(400).json({ msg: `No location found for "${userLocation}" in Tamil Nadu` });
      }

      lat = parseFloat(nominatimResponse.data[0].lat);
      lng = parseFloat(nominatimResponse.data[0].lon);
      const userCoords = `${lat},${lng}`;
      console.log(`Geocoded ${userLocation} to coords: ${userCoords}`);

      // Validate coordinates
      if (lat < 8 || lat > 13.5 || lng < 76 || lng > 80.5) {
        console.log(`Invalid coordinates for ${userLocation}: lat=${lat}, lng=${lng}`);
        return res.status(400).json({ msg: `Location "${userLocation}" is outside Tamil Nadu` });
      }

      // Verify state
      const state = nominatimResponse.data[0].address.state;
      if (state !== 'Tamil Nadu') {
        console.log(`Location ${userLocation} resolved to state: ${state}`);
        return res.status(400).json({ msg: `Location "${userLocation}" is not in Tamil Nadu` });
      }

      // Calculate delivery fee with OSRM
      try {
        const coords = `${userCoords};${restaurantLocation}`;
        const response = await axios.get(`${osrmUrl}${coords}?overview=false`);
        console.log(`OSRM response for ${coords}:`, response.data);

        const waypointDistances = response.data.waypoints?.map(wp => wp.distance) || [];
        console.log(`Waypoint distances: ${waypointDistances.join(', ')} meters`);
        if (waypointDistances.some(dist => dist > 5000)) {
          console.warn(`Warning: Coordinates far from routable roads for ${userLocation}`);
        }

        if (response.data.code === 'Ok' && response.data.routes[0]?.distance > 0) {
          distanceKm = response.data.routes[0].distance / 1000;
          console.log(`Calculated distance: ${distanceKm} km`);
        } else {
          console.log(`OSRM returned invalid distance: code=${response.data.code}, distance=${response.data.routes[0]?.distance || 0}`);
          distanceKm = haversineDistance(lat, lng, restaurantLat, restaurantLng) * 1.4;
          console.log(`Using Haversine distance: ${distanceKm.toFixed(2)} km`);
        }
      } catch (osrmError) {
        console.error(`OSRM request failed for ${userCoords}:`, osrmError.message);
        distanceKm = haversineDistance(lat, lng, restaurantLat, restaurantLng) * 1.4;
        console.log(`Using Haversine distance due to OSRM error: ${distanceKm.toFixed(2)} km`);
      }
    } else {
      // Offline mode: Use local dataset
      console.log('Running in offline mode');
      const locationData = locationsDataset.find(
        loc => loc.name.toLowerCase() === normalizedUserLocation
      );

      if (!locationData) {
        console.log(`Location "${userLocation}" not found in dataset`);
        return res.status(400).json({ msg: `Location "${userLocation}" not found in local dataset` });
      }

      lat = locationData.lat;
      lng = locationData.lon;
      distanceKm = locationData.distance_km;
      console.log(`Offline: Found ${userLocation} at (${lat}, ${lng}), distance: ${distanceKm} km`);
    }

    // Calculate delivery fee
    let deliveryFee = distanceKm * 42.5; // ₹42.5/km
    if (deliveryFee < 50) {
      deliveryFee = 50; // Minimum ₹50
      console.log(`Applied minimum delivery fee: ₹${deliveryFee}`);
    }

    // Find the user's cart
    const cart = await Cart.findOne({ user: req.userId }).populate('items.food', 'name image price quantityAvailable');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ msg: 'Cart is empty' });
    }

    // Calculate food total and quantity
    const foodTotal = cart.items.reduce((sum, item) => sum + item.food.price * item.quantity, 0);
    const totalQuantity = cart.items.reduce((sum, item) => sum + item.quantity, 0);

    // Total including delivery fee
    const total = foodTotal + deliveryFee;

    // Find chef
    const chef = await Chef.findOne().sort('alloted').exec();
    if (!chef) {
      return res.status(400).json({ msg: 'No chefs available' });
    }

    // Create order
    const order = new Order({
      user: req.userId,
      items: cart.items.map(item => ({
        food: item.food._id,
        name: item.food.name,
        price: item.food.price,
        quantity: item.quantity
      })),
      total,
      chef: chef._id,
      status: 'pending',
      paymentStatus: 'completed',
      deliveryFee,
      userLocation: userLocation.trim()
    });
    await order.save();
    console.log(`Order created: ${order._id}`);

    // Update food quantities
    for (const item of cart.items) {
      const food = await Food.findById(item.food._id);
      if (!food) {
        return res.status(404).json({ msg: `Food item ${item.food._id} not found` });
      }
      if (food.quantityAvailable < item.quantity) {
        return res.status(400).json({ msg: `Insufficient quantity available for ${food.name}` });
      }
      food.quantityAvailable -= item.quantity;
      await food.save();
      console.log(`Decremented quantityAvailable for ${food.name} by ${item.quantity}`);
    }

    // Clear cart
    const deletedCart = await Cart.findOneAndDelete({ user: req.userId });
    if (deletedCart) {
      console.log(`Cleared cart for user ${req.userId}`);
    }

    // Update chef
    chef.alloted += 30 * totalQuantity;
    await chef.save();
    console.log(`Updated chef ${chef._id} alloted to ${chef.alloted}`);

    // Update user loyalty points
    const user = await User.findById(req.userId);
    user.loyaltyPoints += Math.floor(total / 100); // 1 point per ₹100
    await user.save();
    console.log(`Updated user ${user._id} loyalty points to ${user.loyaltyPoints}`);

    // Prepare email (store offline, send later if needed)
    const itemsList = cart.items.map(item => {
      let imageSrc = 'https://via.placeholder.com/100?text=No+Image';
      if (item.food.image && item.food.image.data && item.food.image.contentType) {
        imageSrc = `data:${item.food.image.contentType};base64,${item.food.image.data.toString('base64')}`;
      }
      const subtotal = (item.quantity * item.food.price).toFixed(2);
      return `
        <tr>
          <td style="padding: 10px; text-align: center;">
            <img src="${imageSrc}" alt="${item.food.name}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 5px;">
          </td>
          <td style="padding: 10px;">${item.food.name}</td>
          <td style="padding: 10px; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px; text-align: right;">₹${item.food.price.toFixed(2)}</td>
          <td style="padding: 10px; text-align: right;">₹${subtotal}</td>
        </tr>
      `;
    }).join('');

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <h2 style="color: #333;">Payment Successful!</h2>
        <p>Dear ${user.name},</p>
        <p>Thank you for your order at Spoke Restaurant! Your payment of ₹${total.toFixed(2)} for Order #${order._id} has been successfully processed.</p>
        <h3 style="color: #333;">Order Details</h3>
        <p><strong>Delivery Location:</strong> ${userLocation}</p>
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
              <td colspan="4" style="padding: 10px; text-align: right;">Food Total:</td>
              <td style="padding: 10px; text-align: right;">₹${foodTotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="4" style="padding: 10px; text-align: right;">Delivery Fee:</td>
              <td style="padding: 10px; text-align: right;">₹${deliveryFee.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="4" style="padding: 10px; text-align: right; font-weight: bold;">Total:</td>
              <td style="padding: 10px; text-align: right; font-weight: bold;">₹${total.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        <p>We’re preparing your order and will notify you when it’s out for delivery.</p>
        <p>Questions? Contact us at <a href="mailto:support@spoke.com" style="color: #007bff;">support@spoke.com</a>.</p>
        <p style="margin-top: 20px;">Best regards,<br>Spoke Restaurant Team</p>
      </div>
    `;

    // Send email if online, otherwise log for later
    if (online) {
      await sendEmail(user.email, `Spoke: Payment Confirmation for Order #${order._id}`, emailHtml);
      console.log(`Email sent to ${user.email}`);
    } else {
      console.log(`Offline: Email queued for ${user.email}`);
      // Optionally store email for later sending
      fs.appendFileSync(
        path.join(__dirname, '../data/queued_emails.txt'),
        `${user.email}|Spoke: Payment Confirmation for Order #${order._id}|${emailHtml}\n`
      );
    }

    return res.status(200).json({
      msg: 'Checkout successful',
      order,
      deliveryFee,
      userCoords: { lat, lng }
    });
  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ msg: err.message || 'Server error' });
  }
});

router.get('/history', auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.userId }).sort({createdAt:-1}).populate('items.food');
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
    console.error('History error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;