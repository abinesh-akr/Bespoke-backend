const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const chefSchema = new mongoose.Schema({
  name: { type: String, required: true },
  image: {
    data: { type: Buffer, required: true },
    contentType: { type: String, required: true }
  },
  rating: { type: Number, default: 0 },
  specialty: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  alloted: { type: Number, default: 0 }
});

chefSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

module.exports = mongoose.model('Chef', chefSchema);