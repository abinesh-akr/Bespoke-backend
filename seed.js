const mongoose = require('mongoose');
const Food = require('./models/Food');
const Chef = require('./models/Chef');
const dotenv = require('dotenv');

dotenv.config();

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB for seeding'))
  .catch(err => console.error('MongoDB connection error:', err));

const seedData = async () => {
  try {
    await Chef.deleteMany({});
    await Food.deleteMany({});

    const chefs = await Chef.insertMany([
      { name: 'Chef Gordon', image: 'https://images.unsplash.com/photo-1583394293214-28ded15f4d79', rating: 4.8, specialty: 'Italian' },
      { name: 'Chef Maria', image: 'https://images.unsplash.com/photo-1577215199220-38b44e88a42f', rating: 4.5, specialty: 'Indian' },
      { name: 'Chef Li', image: 'https://images.unsplash.com/photo-1595475038784-9edcc41d6e3e', rating: 4.7, specialty: 'Chinese' }
    ]);

    await Food.insertMany([
      { name: 'Margherita Pizza', price: 12, image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd', rating: 4.5, chef: chefs[0]._id, bespokeOption: 'Extra cheese', tags: ['Italian', 'Pizza'] },
      { name: 'Butter Chicken', price: 15, image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c', rating: 4.7, chef: chefs[1]._id, bespokeOption: 'Spice level', tags: ['Indian', 'Curry'] },
      { name: 'Kung Pao Chicken', price: 14, image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38', rating: 4.6, chef: chefs[2]._id, bespokeOption: 'Nut-free', tags: ['Chinese', 'Stir-fry'] }
    ]);

    console.log('Data seeded successfully');
    mongoose.connection.close();
  } catch (err) {
    console.error('Seeding error:', err);
  }
};

seedData();