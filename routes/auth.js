// ============================================
// ZEVO — routes/auth.js
// Routes d'authentification
// ============================================

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

// Router = mini serveur pour les routes d'auth
const router = express.Router();

// ============================================
// POST /auth/inscription
// Créer un nouveau compte utilisateur
// ============================================
router.post('/inscription', async (req, res) => {
    try {
        // Récupérer les données envoyées par l'app mobile
        const { nom, email, telephone, mot_de_passe } = req.body;

        // Vérifier que les champs obligatoires sont présents
        if (!nom || !mot_de_passe || (!email && !telephone)) {
            return res.status(400).json({ 
                erreur: 'Nom, mot de passe et email ou téléphone sont obligatoires' 
            });
        }

        // Vérifier si l'utilisateur existe déjà
        const existeDeja = await pool.query(
            'SELECT id FROM users WHERE email = $1 OR telephone = $2',
            [email, telephone]
        );

        if (existeDeja.rows.length > 0) {
            return res.status(400).json({ 
                erreur: 'Un compte existe déjà avec cet email ou ce numéro' 
            });
        }

        // Chiffrer le mot de passe — jamais stocker en clair !
        // '10' = niveau de complexité du chiffrement
        const motDePasseChiffre = await bcrypt.hash(mot_de_passe, 10);

        // Créer l'utilisateur dans la base de données
        const nouvelUser = await pool.query(
            `INSERT INTO users (nom, email, telephone, mot_de_passe) 
             VALUES ($1, $2, $3, $4) 
             RETURNING id, nom, email, telephone`,
            [nom, email, telephone, motDePasseChiffre]
        );

        const user = nouvelUser.rows[0];

        // Créer un token JWT — permet à l'app de rester connectée
        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' } // token valide 7 jours
        );

        // Répondre avec le token et les infos de l'utilisateur
        res.status(201).json({
            message: 'Compte créé avec succès',
            token,
            user: {
                id: user.id,
                nom: user.nom,
                email: user.email,
                telephone: user.telephone,
            }
        });

    } catch (erreur) {
        console.error('Erreur inscription:', erreur.message);
        res.status(500).json({ erreur: 'Erreur serveur' });
    }
});

// ============================================
// POST /auth/connexion
// Connecter un utilisateur existant
// ============================================
router.post('/connexion', async (req, res) => {
    try {
        const { identifiant, mot_de_passe } = req.body;

        if (!identifiant || !mot_de_passe) {
            return res.status(400).json({ 
                erreur: 'Identifiant et mot de passe obligatoires' 
            });
        }

        // Chercher l'utilisateur par email OU téléphone
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

        // Vérifier le mot de passe
        const motDePasseValide = await bcrypt.compare(mot_de_passe, user.mot_de_passe);

        if (!motDePasseValide) {
            return res.status(401).json({ 
                erreur: 'Identifiant ou mot de passe incorrect' 
            });
        }

        // Créer le token JWT
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

module.exports = router;