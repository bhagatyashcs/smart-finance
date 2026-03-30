require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // Using bcryptjs as it's easier for Vercel
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 1. MONGODB CONNECTION (Bulletproof)
// ==========================================
const dbURI = process.env.MONGODB_URI;

if (!dbURI) {
    console.error("🚨 CRITICAL ERROR: MONGODB_URI is not defined in Vercel environment variables!");
} else {
    mongoose.connect(dbURI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    })
    .then(() => console.log("✅ Successfully connected to MongoDB Atlas!"))
    .catch((err) => console.error("❌ MongoDB connection error:", err));
}

// ==========================================
// 2. DATABASE SCHEMAS (Tables)
// ==========================================
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

const expenseSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    name: String,
    category: String,
    amount: Number,
    month: String
});
const Expense = mongoose.model('Expense', expenseSchema);

const tradeSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    coin: String,
    assetType: String,
    invested: Number,
    current: Number
});
const Trade = mongoose.model('Trade', tradeSchema);

// ==========================================
// 3. SECURITY BOUNCER (Middleware)
// ==========================================
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_123';

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer <token>"

    if (!token) return res.status(401).json({ error: "Access Denied: No Token" });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid or Expired Token" });
        req.user = user; // Attach user info to the request
        next();
    });
};

// ==========================================
// 4. AUTHENTICATION ROUTES
// ==========================================

// SIGNUP
app.post('/signup', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Missing fields" });

        // Check if user already exists to give a clear error
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ error: "Username already taken." });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        
        res.status(201).json({ message: "Account created successfully!" });
    } catch (err) { 
        console.error("🚨 REAL SIGNUP ERROR:", err);
        res.status(500).json({ error: "Database Error: " + err.message }); 
    }
});

// LOGIN
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        
        if (!user) return res.status(400).json({ error: "User not found." });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: "Incorrect password." });

        const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, username: user.username });
    } catch (err) {
        console.error("🚨 REAL LOGIN ERROR:", err);
        res.status(500).json({ error: "Database Error: " + err.message });
    }
});

// ==========================================
// 5. EXPENSE TRACKER ROUTES
// ==========================================

// Get all expenses for logged-in user
app.get('/expenses', authenticateToken, async (req, res) => {
    try {
        const expenses = await Expense.find({ userId: req.user.userId }).sort({ _id: -1 });
        res.json(expenses);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add a single expense
app.post('/add-expense', authenticateToken, async (req, res) => {
    try {
        const newExpense = new Expense({ ...req.body, userId: req.user.userId });
        await newExpense.save();
        res.status(201).json(newExpense);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Bulk import CSV expenses
app.post('/add-expenses-bulk', authenticateToken, async (req, res) => {
    try {
        const expensesToInsert = req.body.expenses.map(exp => ({
            ...exp,
            userId: req.user.userId
        }));
        await Expense.insertMany(expensesToInsert);
        res.status(201).json({ message: "Bulk import successful" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete an expense
app.delete('/delete-expense/:id', authenticateToken, async (req, res) => {
    try {
        await Expense.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
        res.json({ message: "Expense deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 6. PORTFOLIO / TRADE ROUTES
// ==========================================

// Get all trades
app.get('/trades', authenticateToken, async (req, res) => {
    try {
        const trades = await Trade.find({ userId: req.user.userId }).sort({ _id: -1 });
        res.json(trades);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add a trade
app.post('/add', authenticateToken, async (req, res) => {
    try {
        const newTrade = new Trade({ ...req.body, userId: req.user.userId });
        await newTrade.save();
        res.status(201).json(newTrade);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a trade
app.delete('/delete/:id', authenticateToken, async (req, res) => {
    try {
        await Trade.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
        res.json({ message: "Trade deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 7. HTML PAGE ROUTES (Frontend Navigation)
// ==========================================
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'landing.html')); });
app.get('/expense', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'expense.html')); });
app.get('/invest', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'invest.html')); });

// Start the Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
