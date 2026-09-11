const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const cors = require('cors');
const pino = require('pino');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

// --- INSERISCI QUI IL TUO NUMERO WHATSAPP CON PREFISSO 39 SENZA '+' O SPAZI ---
const NUMERO_TELEFONO = "393331234567"; // <--- CAMBIA QUESTO NUMERO!

const TARGET_CHAT_NAME = "IGMBC Community"; 
let sock = null;
let targetChatId = null;
const ultimoInvioUtente = {}; 
const COOLDOWN_MINUTI = 30;

async function connectToWhatsApp() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    sock.ev.on('creds.update', saveCreds);

    // Se non siamo registrati, richiediamo il Pairing Code a 8 cifre
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(NUMERO_TELEFONO);
                console.log('\n==================================================');
                console.log(`🔑 IL TUO CODICE DI ACCOPPIAMENTO: ${code}`);
                console.log('==================================================\n');
            } catch (err) {
                console.error('❌ Errore generazione Pairing Code:', err.message);
            }
        }, 5000);
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log('\n========================================');
            console.log('✅ BOT WHATSAPP COLLEGATO E PRONTO!');
            console.log('========================================\n');
            
            try {
                const groupList = await sock.groupFetchAllParticipating();
                for (const id in groupList) {
                    if (groupList[id].subject === TARGET_CHAT_NAME) {
                        targetChatId = id;
                        console.log(`📌 Connesso a "${TARGET_CHAT_NAME}" (ID: ${targetChatId})`);
                        break;
                    }
                }
            } catch (err) {
                console.log('⚠️ Errore recupero gruppi:', err.message);
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const isLoggedOut = statusCode === DisconnectReason.loggedOut;
            
            console.log(`🔌 Connessione chiusa (Status: ${statusCode}). Riconnessione...`);

            if (isLoggedOut) {
                fs.rmSync('auth_info_baileys', { recursive: true, force: true });
            }
            
            setTimeout(connectToWhatsApp, 3000);
        }
    });
}

connectToWhatsApp();

app.post('/api/notifica-automatica', async (req, res) => {
    const { user, tipo } = req.body;

    if (!user || !tipo) {
        return res.status(400).json({ status: 'error', message: 'Dati mancanti.' });
    }

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
        return res.status(500).json({ status: 'error', message: 'Bot non ancora pronto o Chat non trovata.' });
    }

    const etichette = { 'reel': 'un Reel 🎬', 'storia': 'una Storia 📱', 'carosello': 'un Carosello 📸' };

    const messaggio = `🚀 *NUOVO CONTENUTO COMMUNITY!*\n\n` +
        `L'utente *@${user}* ha appena pubblicato ${etichette[tipo] || tipo} su Instagram!\n\n` +
        `👇 *Supportiamo il post con un like e un commento:*\n` +
        `https://instagram.com/${user}\n\n` +
        `⚡ _IGMBC Growth Community_`;

    try {
        await sock.sendMessage(targetChatId, { text: messaggio });
        ultimoInvioUtente[user] = oraAttuale;
        console.log(`⚡ Messaggio inviato per @${user}`);
        return res.json({ status: 'success', message: 'Notifica inviata con successo nel Canale!' });
    } catch (err) {
        console.error('❌ Errore invio:', err);
        return res.status(500).json({ status: 'error', message: 'Errore durante l\'invio del messaggio.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server in ascolto sulla porta ${PORT}`));
