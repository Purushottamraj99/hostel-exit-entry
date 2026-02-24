const mongoose = require("mongoose");

const exitLogSchema = new mongoose.Schema({
  studentId: String,
  name: String,
  room: String,

  reason: String,
  reasonCategory: String,  

  status: {
    type: String,
    default: "OUT"
  },

  exitTime: {
    type: Date,
    default: Date.now
  },
  
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
