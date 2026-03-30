const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();

app.use(express.json());

// VERCEL FIX 1: Correct pathing for the public folder
app.use(express.static(path.join(__dirname, 'public')));

// VERCEL FIX 2: Using the Atlas Environment Variable
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_exam_key_123';
const MONGODB_URI = "mongodb://127.0.0.1:27017/smartfinance";
// ==========================================
// MONGODB CONNECTION
// ==========================================
mongoose.connect(MONGODB_URI)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// ==========================================
// SCHEMAS
// ==========================================
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

const TradeSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    coin: String,
    assetType: String,
    invested: Number,
    current: Number,
    date: { type: Date, default: Date.now }
});
const Trade = mongoose.model('Trade', TradeSchema);

const ExpenseSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    month: String,
    name: String,
    category: String,
    amount: Number,
    date: { type: Date, default: Date.now }
});
const Expense = mongoose.model('Expense', ExpenseSchema);

// ==========================================
// MIDDLEWARE
// ==========================================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 
    if (!token) return res.status(401).json({ error: "Access Denied." });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid Token" });
        req.user = user; 
        next(); 
    });
};

// ==========================================
// AUTH ROUTES
// ==========================================
app.post('/signup', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const user = new User({ username: req.body.username, password: hashedPassword });
        await user.save();
        res.json({ message: "User created successfully!" });
    } catch (err) { 
        res.status(400).json({ error: "Username exists." }); 
    }
});

app.post('/login', async (req, res) => {
    const user = await User.findOne({ username: req.body.username });
    if (!user) return res.status(400).json({ error: "User not found" });
    
    const validPass = await bcrypt.compare(req.body.password, user.password);
    if (!validPass) return res.status(400).json({ error: "Invalid password" });
    
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token, username: user.username });
});

// ==========================================
// FRONTEND ROUTES (Vercel Fixed Paths)
// ==========================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/landing.html')));
app.get('/expense', (req, res) => res.sendFile(path.join(__dirname, 'public/expense.html')));
app.get('/expense.html', (req, res) => res.sendFile(path.join(__dirname, 'public/expense.html')));
app.get('/invest', (req, res) => res.sendFile(path.join(__dirname, 'public/invest.html')));
app.get('/invest.html', (req, res) => res.sendFile(path.join(__dirname, 'public/invest.html')));

// ==========================================
// DATA ROUTES
// ==========================================
app.get('/trades', authenticateToken, async (req, res) => {
    const trades = await Trade.find({ userId: req.user.id }).sort({ date: -1 });
    res.json(trades);
});

app.post('/add', authenticateToken, async (req, res) => {
    const newTrade = new Trade({ ...req.body, userId: req.user.id });
    await newTrade.save();
    res.json(newTrade);
});

app.delete('/delete/:id', authenticateToken, async (req, res) => {
    await Trade.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.json({ message: "Deleted" });
});

app.get('/expenses', authenticateToken, async (req, res) => {
    const expenses = await Expense.find({ userId: req.user.id }).sort({ date: -1 });
    res.json(expenses);
});

app.post('/add-expense', authenticateToken, async (req, res) => {
    const newExp = new Expense({ ...req.body, userId: req.user.id });
    await newExp.save();
    res.json(newExp);
});

app.post('/add-expenses-bulk', authenticateToken, async (req, res) => {
    try {
        const expenses = req.body.expenses.map(exp => ({
            ...exp,
            userId: req.user.id,
            category: exp.category || 'Imported'
        }));
        await Expense.insertMany(expenses);
        res.json({ message: "Bulk import successful" });
    } catch (err) {
        res.status(500).json({ error: "Failed to import expenses" });
    }
});

app.delete('/delete-expense/:id', authenticateToken, async (req, res) => {
    await Expense.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.json({ message: "Deleted" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
module.exports = app;