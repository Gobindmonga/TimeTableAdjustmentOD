import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';

// Load environment variables from .env file
dotenv.config();

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
    date: String,
    day: String,
    timestamp: Number,
    totalTeachers: Number,
    totalSubstitutes: Number,
    columns: [{
        id: Number,
        selectedTeacher: String,
        substituteTeacher: [String],
        classValues: [String]
    }]
});

const Adjustment = mongoose.model('Adjustment', AdjustmentSchema);

// --- ROUTES ---

// Save Adjustment
app.post('/api/adjustments', async (req, res) => {
    try {
        const data = req.body;
        // Use date as unique identifier to update or insert
        const updated = await Adjustment.findOneAndUpdate(
            { date: data.date }, 
            { ...data, timestamp: Date.now() }, 
            { new: true, upsert: true }
        );
        res.status(200).json({ success: true, data: updated });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get Adjustments
app.get('/api/adjustments', async (req, res) => {
    try {
        const records = await Adjustment.find().sort({ timestamp: -1 });
        res.status(200).json({ success: true, data: records });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete Adjustment
app.delete('/api/adjustments/:date', async (req, res) => {
    try {
        await Adjustment.findOneAndDelete({ date: req.params.date });
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
