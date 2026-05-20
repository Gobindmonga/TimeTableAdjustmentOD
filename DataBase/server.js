import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from DataBase/.env file regardless of cwd
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing in .env file");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB Connected Successfully");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error.message);
    process.exit(1);
  }
};

// Start Server & Connect to DB
app.listen(PORT, async () => {
  await connectDB();
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// --- MODELS ---
const AdjustmentSchema = new mongoose.Schema({
  id: String,
  date: String,
  day: String,
  timestamp: Number,
  totalTeachers: Number,
  totalSubstitutes: Number,
  columns: [
    {
      id: Number,
      selectedTeacher: String,
      substituteTeacher: [String],
      classValues: [String],
    },
  ],
});

const Adjustment = mongoose.model("Adjustment", AdjustmentSchema);

// --- ROUTES ---

// Save Adjustment
app.post("/api/adjustments", async (req, res) => {
  try {
    const data = req.body;
    const payload = {
      ...data,
      id: data.date,
      timestamp: Date.now(),
    };
    const updated = await Adjustment.findOneAndUpdate(
      { date: data.date },
      payload,
      { returnDocument: "after", upsert: true },
    );
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Adjustments
app.get("/api/adjustments", async (req, res) => {
  try {
    const records = await Adjustment.find().sort({ timestamp: -1 }).lean();
    res.status(200).json({
      success: true,
      data: records.map((record) => ({
        ...record,
        id: record.id || record.date,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete Adjustment
app.delete("/api/adjustments/:date", async (req, res) => {
  try {
    await Adjustment.findOneAndDelete({ date: req.params.date });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete("/api/adjustments", async (req, res) => {
  try {
    const date = req.query.date || req.body?.date;
    if (!date) {
      return res.status(400).json({ success: false, message: "Missing date" });
    }
    await Adjustment.findOneAndDelete({ date: date.toString() });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
