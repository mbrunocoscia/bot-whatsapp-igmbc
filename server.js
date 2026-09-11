const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// NOME ESATTO del tuo Canale o Gruppo WhatsApp
const TARGET_CHAT_NAME = "IGMBC Community"; 

let targetChatId = null;
const ultimoInvioUtente = {}; 
const COOLDOWN_MINUTI = 30; // Max 1 notifica ogni 30 min per utente

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: "./session" }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('📱 SCANSIONA QUESTO QR CODE CON WHATSAPP:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('✅ Bot WhatsApp collegato e attivo!');
    const chats = await client.getChats();
    const targetChat = chats.find(c => c.name === TARGET_CHAT_NAME);

    if (targetChat) {
        targetChatId = targetChat.id._serialized;
        console.log(`📌 Connesso a "${TARGET_CHAT_NAME}" (ID: ${targetChatId})`);
    } else {
        console.log(`⚠️ ERRORE: Canale/Gruppo "${TARGET_CHAT_NAME}" non trovato su WhatsApp!`);
    }
});

client.initialize();

/* Endpoint chiamato dalla Dashboard Utente */
app.post('/api/notifica-automatica', async (req, res) => {
    const { user, tipo } = req.body;

    if (!user || !tipo) {
        return res.status(400).json({ status: 'error', message: 'Dati mancanti.' });
    }

    // Anti-Spam Check
    const oraAttuale = Date.now();
    const ultimoInvio = ultimoInvioUtente[user] || 0;
    const minutiTrascorsi = (oraAttuale - ultimoInvio) / (1000 * 60);

    if (minutiTrascorsi < COOLDOWN_MINUTI) {
        const attesa = Math.ceil(COOLDOWN_MINUTI - minutiTrascorsi);
        return res.status(429).json({ 
            status: 'error', 
            message: `Attendi ancora ${attesa} minuti prima di inviare un'altra notifica.` 
        });
    }

    if (!targetChatId) {
        return res.status(500).json({ status: 'error', message: 'Bot non ancora pronto su WhatsApp.' });
    }

    const etichette = { 'reel': 'un Reel 🎬', 'storia': 'una Storia 📱', 'carosello': 'un Carosello 📸' };

    const messaggio = `🚀 *NUOVO CONTENUTO COMMUNITY!*\n\n` +
        `L'utente *@${user}* ha appena pubblicato ${etichette[tipo] || tipo} su Instagram!\n\n` +
        `👇 *Supportiamo il post con un like e un commento:*\n` +
        `https://instagram.com/${user}\n\n` +
        `⚡ _IGMBC Growth Community_`;

    try {
        await client.sendMessage(targetChatId, messaggio);
        ultimoInvioUtente[user] = oraAttuale;
        console.log(`⚡ Messaggio inviato per @${user}`);
        return res.json({ status: 'success', message: 'Notifica inviata con successo nel Canale!' });
    } catch (err) {
        console.error('❌ Errore invio:', err);
        return res.status(500).json({ status: 'error', message: 'Errore durante l\'invio del messaggio.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server in ascolto sulla porta ${PORT}`);
});
