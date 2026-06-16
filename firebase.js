const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const serviceAccount = require('./firebase-key.json');

initializeApp({
    credential: cert(serviceAccount),
});

async function envoyerNotification(fcmToken, titre, message, data = {}) {
    try {
        const notification = {
            token: fcmToken,
            notification: {
                title: titre,
                body: message,
            },
            data: data,
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                },
            },
        };

        const response = await getMessaging().send(notification);
        console.log('Notification envoyée:', response);
        return { succes: true, response };
    } catch (erreur) {
        console.error('Erreur notification:', erreur.message);
        return { succes: false, erreur: erreur.message };
    }
}

module.exports = { envoyerNotification };