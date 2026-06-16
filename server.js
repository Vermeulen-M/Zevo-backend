// ============================================
// ZEVO — server.js
// ============================================

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

require('./firebase');

const app = express();

app.use(cors());
app.use(express.json());

const pool = require('./db');

// Routes
const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

const walletRoutes = require('./routes/wallets');
app.use('/wallets', walletRoutes);

const transactionRoutes = require('./routes/transactions');
app.use('/transactions', transactionRoutes);

const mpesaRoutes = require('./routes/mpesa');
app.use('/mpesa', mpesaRoutes);

const flutterwaveRoutes = require('./routes/flutterwave');
app.use('/flutterwave', flutterwaveRoutes);

// Route de test
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Zevo API is running',
        version: '1.0.0'
    });
});

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur Zevo démarré sur le port ${PORT}`);
});