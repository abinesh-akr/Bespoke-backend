const mongoose = require('mongoose');

const foodSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  image: { 
    data: { type: Buffer, required: true }, // Store image binary data
    contentType: { type: String, required: true } // e.g., image/jpeg
  },
  rating: { type: Number, default: 0 },
  chef: { type: mongoose.Schema.Types.ObjectId, ref: 'Chef', required: true },
  bespokeOption: { type: String },
  tags: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Food', foodSchema);