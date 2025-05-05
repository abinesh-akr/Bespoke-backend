const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{
    food: { type: mongoose.Schema.Types.ObjectId, ref: 'Food' },
    quantity: { type: Number, default: 1 },
    bespokeNote: { type: String },
    rating: { type: Number, min: 0, max: 5 } // Added rating field
  }]
});

module.exports = mongoose.model('Cart', cartSchema);