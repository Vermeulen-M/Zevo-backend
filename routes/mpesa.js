// ============================================
// ZEVO — routes/mpesa.js
// Intégration M-Pesa Daraja API
// ============================================

const fetch = require('node-fetch');
const express = require('express');
const router = express.Router();
const pool = require('../db');

// Générer le token d'authentification M-Pesa
async function getToken() {
    const consumerKey = process.env.MPESA_CONSUMER_KEY || 'f08LAgF4rZSrJoV5PKqFQqyxmR98dlHoemJ6ELkW446NoIeO';
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET || 'PBBa7Ne1GO92icGAbOmGMtO0hXUDisLrI5MVevilyCVgaFzdS24NiG1mAlfyhyI8';
    
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

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
                    Amount: montant,
                    PartyA: telephone,
                    PartyB: process.env.MPESA_SHORTCODE,
                    PhoneNumber: telephone,
                    CallBackURL: 'https://floppy-llamas-mate.loca.lt/mpesa/callback',
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
                    CallBackURL: 'https://floppy-llamas-mate.loca.lt/mpesa/callback',
                    AccountReference: 'Verification Zevo',
                    TransactionDesc: 'Verification wallet Zevo - 1 CDF',
                }),
            }
        );

        const data = await response.json();

        if (data.ResponseCode === '0') {
            const expiration = new Date(Date.now() + 2 * 60 * 1000);
            
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
                expireEn: 120,
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

// ============================================
// POST /mpesa/callback
// Recevoir la confirmation de M-Pesa
// ============================================
router.post('/callback', async (req, res) => {
    try {
        const { Body } = req.body;
        const { stkCallback } = Body;

        const checkoutRequestId = stkCallback.CheckoutRequestID;
        const resultCode = stkCallback.ResultCode;

        if (resultCode === 0) {
            const items = stkCallback.CallbackMetadata.Item;
            const montant = items.find(i => i.Name === 'Amount')?.Value;
            const mpesaRef = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
            const telephone = items.find(i => i.Name === 'PhoneNumber')?.Value;

            const verification = await pool.query(
                `SELECT * FROM wallet_verifications 
                 WHERE checkout_request_id = $1 AND statut = 'en_attente'`,
                [checkoutRequestId]
            );

            if (verification.rows.length > 0) {
                const v = verification.rows[0];
                
                await pool.query(
                    `UPDATE wallet_verifications SET statut = 'confirme' WHERE id = $1`,
                    [v.id]
                );

                const existants = await pool.query(
                    'SELECT id FROM wallets WHERE user_id = $1',
                    [v.user_id]
                );
                const estDefaut = existants.rows.length === 0;

                await pool.query(
                    `INSERT INTO wallets (user_id, nom, type_wallet, numero, solde, est_defaut)
                     VALUES ($1, $2, $3, $4, 0, $5)`,
                    [v.user_id, v.nom, v.type_wallet, v.numero, estDefaut]
                );

                console.log('Wallet créé avec succès pour user:', v.user_id);
            } else {
                await pool.query(
                    `INSERT INTO transactions 
                     (montant, devise, type, statut, reference_externe, description)
                     VALUES ($1, 'KES', 'mpesa', 'complete', $2, $3)`,
                    [montant, mpesaRef, `Paiement M-Pesa vers ${telephone}`]
                );

                console.log('Transaction M-Pesa enregistrée:', mpesaRef);
            }

        } else {
            console.log('Paiement M-Pesa échoué:', stkCallback.ResultDesc);
            
            await pool.query(
                `UPDATE wallet_verifications SET statut = 'echoue' 
                 WHERE checkout_request_id = $1`,
                [checkoutRequestId]
            );
        }

        res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    } catch (erreur) {
        console.error('Erreur callback:', erreur.message);
        res.status(500).json({ erreur: 'Erreur serveur' });
    }
});

module.exports = router;