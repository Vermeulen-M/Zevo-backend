// ============================================
// ZEVO — routes/auth.js
// Routes d'authentification
// ============================================

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

// ============================================
// POST /auth/inscription
// ============================================
router.post('/inscription', async (req, res) => {
    try {
        const { nom, email, telephone, mot_de_passe, calling_code } = req.body;

        if (!nom || !mot_de_passe || (!email && !telephone)) {
            return res.status(400).json({ 
                erreur: 'Nom, mot de passe et email ou téléphone sont obligatoires' 
            });
        }

        const existeDeja = await pool.query(
            'SELECT id FROM users WHERE email = $1 OR telephone = $2',
            [email, telephone]
        );

        if (existeDeja.rows.length > 0) {
            return res.status(400).json({ 
                erreur: 'Un compte existe déjà avec cet email ou ce numéro' 
            });
        }

        const motDePasseChiffre = await bcrypt.hash(mot_de_passe, 10);

        const nouvelUser = await pool.query(
            `INSERT INTO users (nom, email, telephone, mot_de_passe, calling_code) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING id, nom, email, telephone, calling_code`,
            [nom, email, telephone, motDePasseChiffre, calling_code || '225']
        );

        const user = nouvelUser.rows[0];

        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'Compte créé avec succès',
            token,
            user: {
                id: user.id,
                nom: user.nom,
                email: user.email,
                telephone: user.telephone,
                calling_code: user.calling_code,
            }
        });

    } catch (erreur) {
        console.error('Erreur inscription:', erreur.message);
        res.status(500).json({ erreur: 'Erreur serveur' });
    }
});

// ============================================
// POST /auth/connexion
// ============================================
router.post('/connexion', async (req, res) => {
    try {
        const { identifiant, mot_de_passe } = req.body;

        if (!identifiant || !mot_de_passe) {
            return res.status(400).json({ 
                erreur: 'Identifiant et mot de passe obligatoires' 
            });
        }

        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1 OR telephone = $1',
            [identifiant]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ 
                erreur: 'Identifiant ou mot de passe incorrect' 
            });
        }

        const user = result.rows[0];

        const motDePasseValide = await bcrypt.compare(mot_de_passe, user.mot_de_passe);

        if (!motDePasseValide) {
            return res.status(401).json({ 
                erreur: 'Identifiant ou mot de passe incorrect' 
            });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Connexion réussie',
            token,
            user: {
                id: user.id,
                nom: user.nom,
                email: user.email,
                telephone: user.telephone,
            }
        });

    } catch (erreur) {
        console.error('Erreur connexion:', erreur.message);
        res.status(500).json({ erreur: 'Erreur serveur' });
    }
});

// ============================================
// POST /auth/pin/creer
// ============================================
router.post('/pin/creer', async (req, res) => {
    try {
        const { user_id, pin } = req.body;

        if (!pin || pin.length !== 6) {
            return res.status(400).json({ erreur: 'Le PIN doit contenir 6 chiffres' });
        }

        const pinChiffre = await bcrypt.hash(pin, 10);

        await pool.query(
            'UPDATE users SET pin = $1 WHERE id = $2',
            [pinChiffre, user_id]
        );

        res.json({ message: 'PIN créé avec succès' });

    } catch (erreur) {
        console.error('Erreur création PIN:', erreur.message);
        res.status(500).json({ erreur: 'Erreur serveur' });
    }
});

// ============================================
// POST /auth/pin/verifier
// ============================================
router.post('/pin/verifier', async (req, res) => {
    try {
        const { user_id, pin } = req.body;

        const result = await pool.query(
            'SELECT pin FROM users WHERE id = $1',
            [user_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ erreur: 'Utilisateur non trouvé' });
        }

        if (!result.rows[0].pin) {
            return res.status(400).json({ erreur: 'Aucun PIN défini' });
        }

        const pinValide = await bcrypt.compare(pin, result.rows[0].pin);

        if (!pinValide) {
            return res.status(401).json({ erreur: 'PIN incorrect' });
        }

        res.json({ message: 'PIN correct' });

    } catch (erreur) {
        console.error('Erreur vérification PIN:', erreur.message);
        res.status(500).json({ erreur: 'Erreur serveur' });
    }
});
// ============================================
// GET /auth/chercher/:telephone
// Rechercher un utilisateur par téléphone
// ============================================
router.get('/chercher/:telephone', async (req, res) => {
    try {
        const { telephone } = req.params;

        const result = await pool.query(
            'SELECT id, nom, telephone FROM users WHERE telephone = $1',
            [telephone]
        );

        if (result.rows.length > 0) {
            res.json({
                trouve: true,
                user: result.rows[0],
            });
        } else {
            res.json({
                trouve: false,
            });
        }

    } catch (erreur) {
        console.error('Erreur recherche utilisateur:', erreur.message);
        res.status(500).json({ erreur: 'Erreur serveur' });
    }
});

// PUT /auth/modifier-profil
router.put('/modifier-profil', async (req, res) => {
    try {
        const { user_id, nom } = req.body;
        await pool.query('UPDATE users SET nom = $1 WHERE id = $2', [nom, user_id]);
        res.json({ succes: true });
    } catch (erreur) {
        res.status(500).json({ erreur: 'Erreur serveur' });
    }
});
module.exports = router;