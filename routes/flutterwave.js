// ============================================
// ZEVO — routes/flutterwave.js
// Intégration Flutterwave API
// ============================================

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { envoyerNotification } = require('../firebase');
const Flutterwave = require('flutterwave-node-v3');

const flw = new Flutterwave(
    process.env.FLUTTERWAVE_PUBLIC_KEY,
    process.env.FLUTTERWAVE_SECRET_KEY
);

// ============================================
// POST /flutterwave/mobile-money
// Paiement via Mobile Money (Orange, MTN...)
// ============================================
router.post('/mobile-money', async (req, res) => {
    try {
        const { telephone, montant, reseau, user_id, reference } = req.body;

        if (!telephone || !montant || !reseau) {
            return res.status(400).json({ erreur: 'Champs obligatoires manquants' });
        }

        // Calcul des frais Zevo (0.3% local, minimum 50 XOF)
        const frais = Math.max(Math.round(montant * 0.003), 50);
        const montantNet = montant - frais;

        const payload = {
            phone_number: telephone,
            amount: montant,
            currency: 'XOF',
            network: reseau,
            email: 'user@zevo.app',
            tx_ref: reference || `ZEVO-${Date.now()}`,
        };

        const response = await flw.MobileMoney.franco_phone(payload);

        if (response.status === 'success') {
            
            // Enregistrer la transaction avec les frais
            await pool.query(
                `INSERT INTO transactions 
                (expediteur_id, montant, devise, type, statut, frais, description, reference_externe)
                VALUES ($1, $2, 'XOF', 'mobile_money', 'en_attente', $3, $4, $5)`,
                [user_id, montantNet, frais, `Transfert vers ${telephone}`, reference || `ZEVO-${Date.now()}`]
            );

            // Créditer le wallet central Zevo avec les frais
            await pool.query(
                `UPDATE wallets SET solde = solde + $1 
                WHERE user_id = (SELECT id FROM users WHERE email = 'system@zevo.app')`,
                [frais]
            );

            res.json({
                succes: true,
                message: 'Paiement initié',
                montant_net: montantNet,
                frais: frais,
                data: response.data,
            });
        } else {
            res.status(400).json({
                succes: false,
                erreur: response.message || 'Erreur Flutterwave',
            });
        }

    } catch (erreur) {
        console.error('Erreur Flutterwave mobile money:', erreur.message);
        res.status(500).json({ erreur: 'Erreur serveur' });
    }
});
// ============================================
// POST /flutterwave/transfert
// Transfert vers un numéro mobile money
// ============================================
router.post('/transfert', async (req, res) => {
    try {
        const { telephone, montant, reseau, reference } = req.body;

        const payload = {
            account_bank: reseau,
            account_number: telephone,
            amount: montant,
            narration: 'Transfert Zevo',
            currency: 'XOF',
            reference: reference || `ZEVO-${Date.now()}`,
            callback_url: 'https://zevo.app/flutterwave/callback',
        };

        const response = await flw.Transfer.initiate(payload);

        if (response.status === 'success') {
            res.json({
                succes: true,
                message: 'Transfert initié',
                data: response.data,
            });
        } else {
            res.status(400).json({
                succes: false,
                erreur: response.message,
            });
        }

    } catch (erreur) {
        console.error('Erreur transfert Flutterwave:', erreur.message);
        res.status(500).json({ erreur: 'Erreur serveur' });
    }
});

// ============================================
// POST /flutterwave/callback
// Recevoir les confirmations Flutterwave
// ============================================
router.post('/callback', async (req, res) => {
    try {
        const { status, tx_ref, amount, currency } = req.body;

        if (status === 'successful') {
            await pool.query(
                `INSERT INTO transactions 
                 (montant, devise, type, statut, reference_externe, description)
                 VALUES ($1, $2, 'flutterwave', 'complete', $3, $4)`,
                [amount, currency, tx_ref, `Paiement Flutterwave ${tx_ref}`]
            );
            console.log('Transaction Flutterwave enregistrée:', tx_ref);
            // Envoyer notification
const userFlw = await pool.query(
    'SELECT fcm_token, nom FROM users WHERE id = (SELECT user_id FROM wallets WHERE id = $1 LIMIT 1)',
    [tx_ref]
);
if (userFlw.rows[0]?.fcm_token) {
    await envoyerNotification(
        userFlw.rows[0].fcm_token,
        '💸 Argent reçu !',
        `Vous avez reçu ${amount} ${currency}`,
        { type: 'transaction' }
    );
}
        }

        res.json({ status: 'ok' });

    } catch (erreur) {
        console.error('Erreur callback Flutterwave:', erreur.message);
        res.status(500).json({ erreur: 'Erreur serveur' });
    }
   
});
// ============================================
// GET /flutterwave/banques/:pays
// Liste des banques disponibles par pays
// ============================================
router.get('/banques/:pays', async (req, res) => {
    try {
        const { pays } = req.params;
        const response = await flw.Bank.country({ country: pays });

        res.json({
            succes: true,
            banques: response.data,
        });

    } catch (erreur) {
        console.error('Erreur liste banques:', erreur.message);
        res.status(500).json({ erreur: 'Erreur serveur' });
    }
});

module.exports = router;
//