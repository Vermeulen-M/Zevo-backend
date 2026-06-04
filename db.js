// ============================================
// ZEVO — db.js
// Connexion à la base de données PostgreSQL
// ============================================

// 'pg' = librairie PostgreSQL pour Node.js
const { Pool } = require('pg');

// 'dotenv' = charge les variables du fichier .env
require('dotenv').config();

// Pool = groupe de connexions à la base de données
// Plus efficace qu'une seule connexion — gère plusieurs requêtes simultanées
const pool = new Pool({
    host:     process.env.DB_HOST,     // localhost
    port:     process.env.DB_PORT,     // 5432
    database: process.env.DB_NAME,     // zevo
    user:     process.env.DB_USER,     // postgres
    password: process.env.DB_PASSWORD, // ton mot de passe
});

// Tester la connexion au démarrage
pool.connect((err, client, release) => {
    if (err) {
        console.error('Erreur connexion PostgreSQL:', err.message);
    } else {
        console.log('PostgreSQL connecté avec succès !');
        release();
    }
});

// Exporter le pool pour l'utiliser dans d'autres fichiers
module.exports = pool;