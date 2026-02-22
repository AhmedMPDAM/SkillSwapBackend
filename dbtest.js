const mongoose = require('mongoose');
require('dotenv').config();

console.log('URI:', process.env.MONGO_URI);
console.log(process.env); // add this temporarily to testdb.js
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected!'))
  .catch(err => console.log('❌ Error:', err));