// ============================================
// ZEVO — routes/mpesa.js
// Intégration M-Pesa Daraja API
// ============================================
const fetch = require('node-fetch');
const pool = require('../db');
const express = require('express');
const router = express.Router();

// Générer le token d'authentification M-Pesa
async function getToken() {
    const auth = Buffer.from(
        `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
    ).toString('base64');

    const response = await fetch(
        'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
        {
            headers: {
                Authorization: `Basic ${auth}`,
            },
        }
    );

    const data = await response.json();
    return data.access_token;
}

// ============================================
// POST /mpesa/stkpush
// Déclencher un paiement M-Pesa (STK Push)
// ============================================
router.post('/stkpush', async (req, res) => {
    try {
        const { telephone, montant, reference } = req.body;

        if (!telephone || !montant) {
            return res.status(400).json({ erreur: 'Téléphone et montant obligatoires' });
        }

        // Générer le timestamp
        const now = new Date();
        const timestamp = now.getFullYear().toString() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0') +
            String(now.getSeconds()).padStart(2, '0');

        // Générer le mot de passe
        const password = Buffer.from(
            `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
        ).toString('base64');

        // Obtenir le token
        const token = await getToken();

        // Envoyer la requête STK Push
        const response = await fetch(
            'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    BusinessShortCode: process.env.MPESA_SHORTCODE,
                    Password: password,
                    Timestamp: timestamp,
                    TransactionType: 'CustomerPayBillOnline',
                    Amount: montant,
                    PartyA: telephone,
                    PartyB: process.env.MPESA_SHORTCODE,
                    PhoneNumber: telephone,
                    CallBackURL: 'https://zevo.app/mpesa/callback',
                    AccountReference: reference || 'Zevo',
                    TransactionDesc: 'Paiement Zevo',
                }),
            }
        );

        const data = await response.json();

        if (data.ResponseCode === '0') {
            res.json({
                succes: true,
                message: 'Demande de paiement envoyée',
                checkoutRequestId: data.CheckoutRequestID,
            });
        } else {
            res.status(400).json({
                succes: false,
                erreur: data.errorMessage || 'Erreur M-Pesa',
            });
        }

    } catch (erreur) {
        console.error('Erreur STK Push:', erreur.message);
        res.status(500).json({ erreur: 'Erreur serveur' });
    }
});

// ============================================
// POST /mpesa/callback
// Recevoir la confirmation de M-Pesa
// ============================================
router.post('/callback', async (req, res) => {
    try {
        const { Body } = req.body;
        const { stkCallback } = Body;

        console.log('M-Pesa Callback reçu:', JSON.stringify(stkCallback));

        if (stkCallback.ResultCode === 0) {
            // Paiement réussi !
            console.log('Paiement M-Pesa réussi !');
        } else {
            console.log('Paiement M-Pesa échoué:', stkCallback.ResultDesc);
        }

        res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    } catch (erreur) {
        console.error('Erreur callback:', erreur.message);
        res.status(500).json({ erreur: 'Erreur serveur' });
    }
});
// ============================================
// POST /mpesa/verifier-wallet
// STK Push de vérification wallet (1 CDF)
// ============================================
router.post('/verifier-wallet', async (req, res) => {
    try {
        const { telephone, user_id, nom, type_wallet, numero } = req.body;

        if (!telephone) {
            return res.status(400).json({ erreur: 'Téléphone obligatoire' });
        }

        const now = new Date();
        const timestamp = now.getFullYear().toString() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0') +
            String(now.getSeconds()).padStart(2, '0');

        const password = Buffer.from(
            `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
        ).toString('base64');

        const token = await getToken();

        const response = await fetch(
            'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    BusinessShortCode: process.env.MPESA_SHORTCODE,
                    Password: password,
                    Timestamp: timestamp,
                    TransactionType: 'CustomerPayBillOnline',
                    Amount: 1,
                    PartyA: telephone,
                    PartyB: process.env.MPESA_SHORTCODE,
                    PhoneNumber: telephone,
                    CallBackURL: 'https://zevo.app/mpesa/callback',
                    AccountReference: 'Verification Zevo',
                    TransactionDesc: 'Verification wallet Zevo - 1 CDF',
                }),
            }
        );

        const data = await response.json();

        if (data.ResponseCode === '0') {
            // Sauvegarder les infos du wallet en attente
            const expiration = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes
            
            await pool.query(
                `INSERT INTO wallet_verifications 
                (user_id, telephone, nom, type_wallet, numero, checkout_request_id, expire_a)
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [user_id, telephone, nom, type_wallet, numero, data.CheckoutRequestID, expiration]
            );

            res.json({
                succes: true,
                message: 'Vérification envoyée — confirmez sur votre téléphone',
                checkoutRequestId: data.CheckoutRequestID,
                expireEn: 120, // secondes
            });
        } else {
            res.status(400).json({
                succes: false,
                erreur: data.errorMessage || 'Erreur M-Pesa',
            });
        }

    } catch (erreur) {
        console.error('Erreur vérification wallet:', erreur.message);
        res.status(500).json({ erreur: 'Erreur serveur' });
    }
});

module.exports = router;