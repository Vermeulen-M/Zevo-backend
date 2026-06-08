// ============================================
// ZEVO — routes/wallets.js
// Routes pour les wallets
// ============================================

const express = require('express');
const pool = require('../db');
const router = express.Router();

// ============================================
// GET /wallets/:user_id
// Récupérer tous les wallets d'un utilisateur
// ============================================
router.get('/:user_id', async (req, res) => {
    try {
        const { user_id } = req.params;

        const result = await pool.query(
            `SELECT * FROM wallets WHERE user_id = $1 AND actif = true ORDER BY est_defaut DESC, created_at ASC`,
            [user_id]
        );

        res.json({ wallets: result.rows });

    } catch (erreur) {
        console.error('Erreur wallets:', erreur.message);
        res.status(500).json({ erreur: 'Erreur serveur' });
    }
});

// ============================================
// POST /wallets/ajouter
// Ajouter un nouveau wallet
// ============================================
router.post('/ajouter', async (req, res) => {
    try {
        const { user_id, nom, type_wallet, numero } = req.body;

        if (!user_id || !nom || !type_wallet) {
            return res.status(400).json({ erreur: 'Champs obligatoires manquants' });
        }

        // Vérifier si c'est le premier wallet → le mettre par défaut
        const existants = await pool.query(
            'SELECT id FROM wallets WHERE user_id = $1',
            [user_id]
        );
        const estDefaut = existants.rows.length === 0;

        const result = await pool.query(
            `INSERT INTO wallets (user_id, nom, type_wallet, numero, solde, est_defaut)
             VALUES ($1, $2, $3, $4, 0, $5)
             RETURNING *`,
            [user_id, nom, type_wallet, numero, estDefaut]
        );

        res.status(201).json({ wallet: result.rows[0] });

    } catch (erreur) {
        console.error('Erreur ajout wallet:', erreur.message);
        res.status(500).json({ erreur: 'Erreur serveur' });
    }
});

// ============================================
// PUT /wallets/defaut
// Changer le wallet par défaut
// ============================================
router.put('/defaut', async (req, res) => {
    try {
        const { user_id, wallet_id } = req.body;

        // Retirer le défaut de tous les wallets
        await pool.query(
            'UPDATE wallets SET est_defaut = false WHERE user_id = $1',
            [user_id]
        );

        // Mettre ce wallet comme défaut
        await pool.query(
            'UPDATE wallets SET est_defaut = true WHERE id = $1',
            [wallet_id]
        );

        res.json({ message: 'Wallet par défaut mis à jour' });

    } catch (erreur) {
        console.error('Erreur défaut wallet:', erreur.message);
        res.status(500).json({ erreur: 'Erreur serveur' });
    }
});

module.exports = router;