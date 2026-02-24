const mongoose = require("mongoose");

const StaffSchema = new mongoose.Schema({
  userId: String,   // ⭐ IMPORTANT CHANGE
  password: String,
  name: String,
  mobile: String,
  email: String,
  role: String,
  shift: String,
  address: String,
  joiningDate: String
});

module.exports = mongoose.model(
  "StaffUser",
  StaffSchema,
  "staffusers"
);