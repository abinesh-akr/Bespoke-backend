const jwt = require('jsonwebtoken');
const Chef = require('../models/Chef');

module.exports = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    const chef = await Chef.findById(decoded.chefId);
    if (!chef) return res.status(401).json({ msg: 'Chef not found' });

    req.chefId = decoded.chefId;
    next();
  } catch (err) {
    console.error('Chef auth middleware error:', err);
    res.status(401).json({ msg: 'Token is not valid' });
  }
};