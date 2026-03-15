require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const QRCode = require("qrcode");
const PDFDocument = require("pdfkit");

const Student = require("./models/Student");
const ExitLog = require("./models/ExitLog");
const StaffUser = require("./models/StaffUser");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: [
    "https://hostel-gatepass.vercel.app"
  ],
  credentials: true
}));
// ** MONGOOSE SETUP *//
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log("Mongo Error:", err.message));

// ** REASON CLASSIFICATION *//

function classifyReason(reason = "") {
  const r = reason.toLowerCase();

  if (r.includes("medical,hospital,doctor,")) return { category: "MEDICAL", allowedMinutes: 180 };
  if (r.includes("exam,class,college,library")) return { category: "ACADEMIC", allowedMinutes: 240 };
  if (r.includes("home")) return { category: "HOME", allowedMinutes: 300 };
  if (r.includes("market,shopping,")) return { category: "PERSONAL", allowedMinutes: 300 };
  if (r.includes("emergency")) return { category: "EMERGENCY", allowedMinutes: 240 };

  return { category: "OTHER", allowedMinutes: 60 };
}

function genId(prefix) {
  return prefix + Math.floor(1000 + Math.random() * 9000);
}

function genPassword() {
  return "PW" + Math.floor(1000 + Math.random() * 9000);
}

/* ==============================
   ROOT
============================== */
app.get("/", (req, res) => {
  res.send("Backend running");
});

/* ==============================
   STUDENT APIs
============================== */

app.post("/api/student/add", async (req, res) => {
  try {
    const { name, room, phone } = req.body;

    if (!name || !room)
      return res.json({ success: false, message: "Name & Room required" });

    const studentId = genId("STU");
    const rawPassword = genPassword();

    const hashed = await bcrypt.hash(rawPassword, 10);

    const student = await Student.create({
      studentId,
      name,
      room,
      phone,
      password: hashed
    });

    res.json({
      success: true,
      login: {
        studentId,
        password: rawPassword
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});
// Student list
app.get("/api/student/list", async (req, res) => {
  const list = await Student.find().select("-password");
  res.json(list);
});

app.delete("/api/student/:id", async (req, res) => {
  const deleted = await Student.findOneAndDelete({
    studentId: req.params.id
  });

  res.json({
    success: !!deleted,
    message: deleted ? "Student deleted" : "Not found"
  });
});

// Edit student (name, room, phone)

app.put("/api/student/:id", async (req, res) => {
  try {

    const { id } = req.params;

    const updated = await Student.findOneAndUpdate(
      { studentId: id },
      req.body,
      { new: true }
    );

    if (!updated) {
      return res.json({
        success: false,
        message: "Student not found"
      });
    }

    res.json({
      success: true,
      data: updated
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

/* ==============================
   STAFF APIs
============================== */
app.post("/api/staff/add", async (req, res) => {
  try {

    const {
      name,
      mobile,
      email,
      role,
      shift,
      address,
      joiningDate
    } = req.body;

    const staffId =
      (role === "guard" ? "GRD" : "WRD") +
      Math.floor(1000 + Math.random() * 9000);

    const rawPassword =
      "PW" + Math.floor(1000 + Math.random() * 9000);

    const hashed = await bcrypt.hash(rawPassword, 10);

    const staff = new StaffUser({
      userId: staffId,
      password: hashed,
      name,
      mobile,
      email,
      role,
      shift,
      address,
      joiningDate
    });

    await staff.save();

    res.json({
      success: true,
      login: {
        staffId,
        password: rawPassword
      }
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Staff list//
app.get("/api/staff/list", async (req, res) => {
  const data = await StaffUser.find()
    .select("-password");

  res.json(data);
});

// delete staff//
app.delete("/api/staff/:id", async (req, res) => {

  await StaffUser.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: "Deleted"
  });
});

// edit staff// (name, role)
app.put("/api/staff/:id", async (req, res) => {

  const { name, role } = req.body;

  await StaffUser.findByIdAndUpdate(
    req.params.id,
    { name, role }
  );

  res.json({ success: true });
});

/* ==============================
   LOGIN (STUDENT + STAFF)
============================== */
app.post("/api/login", async (req, res) => {

  const { id, password } = req.body;

  // Student check//
  const student = await Student.findOne({ studentId: id });

  if (student) {
    const ok = await bcrypt.compare(password, student.password);

    if (!ok)
      return res.json({ success: false, message: "Wrong password" });

    return res.json({
      success: true,
      user: {
        id: student.studentId,
        name: student.name,
        role: "student"
      }
    });
  }

  // Staff check//
  const staff = await StaffUser.findOne({ userId: id });

  if (staff) {
    const ok = await bcrypt.compare(password, staff.password);

    if (!ok)
      return res.json({ success: false, message: "Wrong password" });

    return res.json({
      success: true,
      user: {
        id: staff.userId,
        name: staff.name,
        role: staff.role
      }
    });
  }

  // Not found//
  res.json({ success: false, message: "User not found" });

});

/* ==============================
   EXIT / ENTRY
============================== */
app.post("/api/exit", async (req, res) => {

  const { studentId, reason } = req.body;

  const student = await Student.findOne({ studentId });

  if (!student)
    return res.json({ success: false, message: "Student not found" });

  // CHECK pending approval
  const active = await ExitLog.findOne({
    studentId,
    approvalStatus: "PENDING"
  });

  if (active)
    return res.json({
      success: false,
      message: "You already have an active exit request"
    });

  if (active)
    return res.json({
      success: false,
      message: "You already have an active exit request"
    });

  const smart = classifyReason(reason);

  const log = await ExitLog.create({
    studentId,
    name: student.name,
    room: student.room,
    reason,
    reasonCategory: smart.category,
    allowedMinutes: smart.allowedMinutes,
    status: "PENDING",
    approvalStatus: "PENDING"
  });
  io.emit("new-exit-request", {
    name: student.name,
    room: student.room,
    reason
  });

  res.json({
    success: true,
    message: "Exit request sent to warden",
    log
  });

});

// APPROVAL WORKFLOW: PENDING -> APPROVED/REJECTED -> OUT (if approved) -> IN (on entry)  
app.post("/api/approve-exit/:id", async (req, res) => {

  const log = await ExitLog.findById(req.params.id);

  if (!log)
    return res.json({ success: false });

  log.approvalStatus = "APPROVED";
  log.status = "OUT";
  log.exitTime = new Date();

  await log.save();

  res.json({ success: true, log });

});
// REJECT API
app.post("/api/reject-exit/:id", async (req, res) => {

  const log = await ExitLog.findById(req.params.id);

  if (!log)
    return res.json({ success: false });

  log.approvalStatus = "REJECTED";

  await log.save();

  res.json({ success: true });

});

// WARDEN: GET PENDING EXIT REQUESTS
app.get("/api/exit-requests", async (req, res) => {

  try {

    const data = await ExitLog.find({
      approvalStatus: "PENDING"
    }).sort({ createdAt: -1 });

    res.json({
      data
    });

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});

// MY REQUESTS API
app.get("/api/my-requests/:studentId", async (req, res) => {

  const data = await ExitLog.find({
    studentId: req.params.studentId
  }).sort({ createdAt: -1 });

  res.json({
    data
  });

});

// ENTRY API
app.post("/api/entry", async (req, res) => {
  const { studentId } = req.body;

  const log = await ExitLog.findOne({
    studentId,
    status: "OUT"
  }).sort({ exitTime: -1 });

  if (!log)
    return res.json({ success: false, message: "No active exit" });

  log.status = "IN";
  log.entryTime = new Date();

  const mins =
    (log.entryTime - log.exitTime) / (1000 * 60);

  if (mins > log.allowedMinutes)
    log.lateReturn = true;

  await log.save();

  res.json({ success: true, log });
});

/* ==============================
   OUTSIDE + STATS
============================== */

app.get("/api/outside", async (req, res) => {
  try {

    const list = await ExitLog.find({ status: "OUT" })
      .sort({ exitTime: -1 });

    res.json({
      count: list.length,
      data: list
    });

  } catch (err) {
    console.log("OUTSIDE ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});
// Today's stats//
app.get("/api/stats/today", async (req, res) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const count = await ExitLog.countDocuments({
    exitTime: { $gte: start }
  });

  res.json({ todayExits: count });
});

/* ==============================
   VERIFY PASS
============================== */

app.get("/api/verify-pass/:id", async (req, res) => {
  const log = await ExitLog.findById(req.params.id);

  if (!log) return res.json({ valid: false });

  res.json({
    valid: true,
    student: log.name,
    room: log.room,
    status: log.status,
    exitTime: log.exitTime
  });
});

/* ==============================
   PDF PASS
============================== */
app.get("/api/pass/:logId", async (req, res) => {
  try {

    const log = await ExitLog.findById(req.params.logId);

    if (!log) {
      return res.status(404).json({ error: "Log not found" });
    }

    const doc = new PDFDocument({
      size: "A4",
      margin: 50
    });

    // headers for PDF response//
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename=gatepass_${log.studentId}.pdf`
    );

    doc.pipe(res);

    // header box//
    doc.lineWidth(1.5);
    doc.roundedRect(40, 40, 520, 100, 20).stroke();

    // ===== LOGO =====
    const path = require("path");

    doc.image(
      path.join(__dirname, "assets", "logo.png"),
      55,
      50,
      { width: 110 }
    );
    // Title//
    doc
      .fillColor("#0f172a")
      .fontSize(26)
      .text("AGC HOSTEL GATE PASS", 200, 80, {
        width: 320,
        align: "left"
      });

    // QR CODE //
    const verifyUrl =
      `${process.env.BASE_URL}/api/verify-pass/${log._id}`;

    const qrData = await QRCode.toDataURL(verifyUrl);

    const qrBuffer = Buffer.from(
      qrData.replace(/^data:image\/png;base64,/, ""),
      "base64"
    );

    doc.image(qrBuffer, 400, 220, { width: 130 });

    // Details section//
    let y = 170;
    const x = 60;
    const w = 300;

    doc.fillColor("black");
    doc.fontSize(15);

    doc.text(`Student: ${log.name}`, x, y, { width: w });
    y += 26;

    doc.text(`Room: ${log.room}`, x, y, { width: w });
    y += 26;

    doc.text(`Reason: ${log.reason}`, x, y, { width: w });
    y = doc.y + 10;

    doc.text(`Category: ${log.reasonCategory}`, x, y, { width: w });
    y += 26;

    doc.text(
      `Exit Time: ${new Date(log.exitTime).toLocaleString("en-IN")}`,
      x,
      y,
      { width: w }
    );

    if (log.entryTime) {
      y += 26;
      doc.text(
        `Entry Time: ${new Date(log.entryTime).toLocaleString("en-IN")}`,
        x,
        y,
        { width: w }
      );
    }

    // QR code label//
    doc.fontSize(11).text("Scan to Verify", 400, 360, {
      width: 130,
      align: "center"
    });

    // Footer//
    doc.fontSize(12).text("Authorized Gate Pass", 0, 500, {
      align: "right"
    });

    // Finalize PDF //
    doc.end();

  } catch (err) {

    console.log("PDF Error:", err.message);

    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});
//* SERVER & SOCKET.IO SETUP *//
const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

io.on("connection", (socket) => {
  console.log("Client connected");
});

server.listen(5000, () => {
  console.log("Server started");
});