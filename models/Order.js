const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{
    food: { type: mongoose.Schema.Types.ObjectId, ref: 'Food' },
    quantity: { type: Number },
    bespokeNote: { type: String }
  }],
  total: { type: Number, required: true },
  status: { type: String, default: 'Pending' },
  createdAt: { type: Date, default: Date.now },
  chef : {type: mongoose.Schema.Types.ObjectId, ref: 'Chef'}
});

module.exports = mongoose.model('Order', orderSchema);