const mongoose = require("mongoose");

const exitLogSchema = new mongoose.Schema({
  studentId: String,
  name: String,
  room: String,

  reason: String,
  reasonCategory: String,

  // NEW
  approvalStatus: {
    type: String,
    enum: ["PENDING", "APPROVED", "REJECTED"],
    default: "PENDING"
  },

  status: {
    type: String,
    enum: ["PENDING", "OUT", "IN"],
    default: "PENDING"
  },

  exitTime: Date,

  entryTime: Date,

  allowedMinutes: {
    type: Number,
    default: 120
  },

  lateReturn: {
    type: Boolean,
    default: false
  }

}, { timestamps: true });

module.exports = mongoose.model("ExitLog", exitLogSchema);