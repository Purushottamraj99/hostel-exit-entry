const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
  studentId: {
    type: String,
    unique: true
  },
  name: String,
  room: String,
  phone: String,
  password: String,
  role: {
    type: String,
    default: "student"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Student = mongoose.model("Student", studentSchema);

module.exports = Student;
