const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const OrderSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{
    food: { type: Schema.Types.ObjectId, ref: 'Food' },
    name: String,
    price: Number,
    quantity: Number
  }],
  total: { type: Number, required: true },
  chef: { type: Schema.Types.ObjectId, ref: 'Chef' },
  status: { type: String, default: 'pending' },
  paymentStatus: { type: String, default: 'completed' },
  deliveryFee: { type: Number, default: 0 }, // New field
  userLocation: { type: String }, // New field: stores lat,lng
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', OrderSchema);