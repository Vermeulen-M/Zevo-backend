// ============================================
// ZEVO — routes/transactions.js
// ============================================

const express = require('express');
const pool = require('../db');
const router = express.Router();

// GET /transactions/:user_id
// Récupérer les transactions récentes
router.get('/:user_id', async (req, res) => {
    try {
        const { user_id } = req.params;
        const { limit = 10 } = req.query;

        const result = await pool.query(
            `SELECT t.*, 
                u_exp.nom as nom_expediteur,
                u_dest.nom as nom_destinataire
             FROM transactions t
             LEFT JOIN users u_exp ON t.expediteur_id = u_exp.id
             LEFT JOIN users u_dest ON t.destinataire_id = u_dest.id
             WHERE t.expediteur_id = $1 OR t.destinataire_id = $1
             ORDER BY t.created_at DESC
             LIMIT $2`,
            [user_id, limit]
        );

        res.json({ transactions: result.rows });

    } catch (erreur) {
        console.error('Erreur transactions:', erreur.message);
        res.status(500).json({ erreur: 'Erreur serveur' });
    }
});

// GET /transactions/solde/:user_id
// Calculer le solde total
router.get('/solde/:user_id', async (req, res) => {
    try {
        const { user_id } = req.params;

        const result = await pool.query(
            `SELECT COALESCE(SUM(solde), 0) as solde_total
             FROM wallets
             WHERE user_id = $1 AND actif = true`,
            [user_id]
        );

        res.json({ solde_total: result.rows[0].solde_total });

    } catch (erreur) {
        console.error('Erreur solde:', erreur.message);
        res.status(500).json({ erreur: 'Erreur serveur' });
    }
});

module.exports = router;