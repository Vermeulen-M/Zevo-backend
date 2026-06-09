// ============================================
// ZEVO — server.js
// ============================================

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Charger les variables d'environnement EN PREMIER
dotenv.config();

// Créer l'application Express
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Connexion base de données
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