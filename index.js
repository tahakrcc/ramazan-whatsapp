const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Global Client Instance
let client;
let qrCodeData = null;
let connectionStatus = 'INITIALIZING'; // INITIALIZING, QR_READY, CONNECTED

const stringSimilarity = require('string-similarity');

const initializeClient = () => {
    console.log('Initializing WhatsApp Client...');
    connectionStatus = 'INITIALIZING';
    qrCodeData = null;

    client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process', // Critical for RAM
                '--disable-gpu',
                '--disable-features=site-per-process', // Huge RAM saver
                '--disable-extensions',
                '--disable-audio',
                '--disable-default-apps',
                '--disable-sync',
                '--disable-translate',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-default-browser-check'
            ],
        },
        webVersionCache: {
            type: 'none'
        }
    });

    client.on('qr', (qr) => {
        console.log('QR Code received');
        qrCodeData = qr;
        connectionStatus = 'QR_READY';
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log('WhatsApp Client is Ready!');
        connectionStatus = 'CONNECTED';
        qrCodeData = null;
    });

    client.on('message', async msg => {
        try {
            console.log('Message received:', msg.body);
            const chat = await msg.getChat();
            const contact = await msg.getContact();
            const rawMessage = msg.body.toLowerCase().trim();

            if (rawMessage === 'ping') return await msg.reply('pong');

            // --- SMART LOGIC ---
            const commands = {
                'merhaba': ['merhaba', 'selam', 'mrb', 'slm', 'gunaydin', 'iyi gunler'],
                'randevu': ['randevu', 'rndvu', 'randevü', 'yer ayirt', 'rezervasyon'],
                'adres': ['adres', 'konum', 'yeriniz', 'neredesiniz', 'map'],
                'iletisim': ['iletisim', 'telefon', 'tel', 'numara', 'ulasim'],
                'geri': ['geri', 'menu', 'basa don', 'cikis', 'iptal']
            };

            // Check matches
            let matchedCommand = null;
            let bestScore = 0;

            for (const [cmd, variations] of Object.entries(commands)) {
                const match = stringSimilarity.findBestMatch(rawMessage, variations);
                if (match.bestMatch.rating > 0.4 && match.bestMatch.rating > bestScore) {
                    bestScore = match.bestMatch.rating;
                    matchedCommand = cmd;
                }
            }

            const mainMenuFooter = `\n\n_Yardımcı olabileceğim diğer konular:_\n- *Randevu*\n- *Adres*\n- *İletişim*`;
            const backFooter = `\n\n📌 _Ana menüye dönmek için *Geri* yazabilirsiniz._`;

            if (matchedCommand === 'merhaba') {
                await client.sendMessage(msg.from, `Merhaba ${contact.pushname || 'Misafir'}! 👋\n\n*By Ramazan* Asistanı'na hoş geldiniz.\n\nSize nasıl yardımcı olabilirim?` + mainMenuFooter);
            }
            else if (matchedCommand === 'adres') {
                await client.sendMessage(msg.from, `📍 *Adresimiz:*\nMovenpick Hotel -1 Kat - Malatya\n\n🗺️ *Harita:* https://www.google.com/maps?q=38.351147,38.285103` + backFooter);
            }
            else if (matchedCommand === 'randevu') {
                await client.sendMessage(msg.from, `📅 *Randevu Oluşturma*\n\nLütfen web sitemizi ziyaret ederek veya 0532 123 45 67 numarasını arayarak randevunuzu planlayın.\n\nwww.byramazan.com` + backFooter);
            }
            else if (matchedCommand === 'iletisim') {
                await client.sendMessage(msg.from, `📞 *İletişim Bilgilerimiz:*\nTelefon: 0532 123 45 67\nWeb: www.byramazan.com` + backFooter);
            }
            else if (matchedCommand === 'geri') {
                await client.sendMessage(msg.from, `🔄 Ana menüye dönüldü.\n\nSize nasıl yardımcı olabilirim?` + mainMenuFooter);
            }
            // else: If no match and not very cryptic, maybe show help? 
            // Disabling default fallback to avoid spamming groups.

        } catch (err) {
            console.error('Error handling message:', err);
        }
    });

    client.on('authenticated', () => {
        console.log('WhatsApp Authenticated');
    });

    client.on('auth_failure', (msg) => {
        console.error('WhatsApp Auth Failure:', msg);
        connectionStatus = 'AUTH_FAILED';
    });

    client.on('disconnected', (reason) => {
        console.log('WhatsApp Disconnected:', reason);
        connectionStatus = 'DISCONNECTED';
        // Re-initialize after delay?
        setTimeout(initializeClient, 5000);
    });

    client.initialize().catch(err => {
        console.error('Initialization failed:', err);
    });
};

// Start the client
initializeClient();

// --- API Endpoints ---

// 1. Check Status
app.get('/status', (req, res) => {
    res.json({
        status: connectionStatus === 'CONNECTED' ? 'ready' : (connectionStatus === 'QR_READY' ? 'qr' : connectionStatus),
        qr: qrCodeData
    });
});

// 2. Get Pairing Code (Phone Number)
app.post('/pair', async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });

    if (connectionStatus === 'CONNECTED') {
        return res.status(400).json({ error: 'Already connected' });
    }

    try {
        console.log(`Requesting pairing code for ${phone}`);
        // Ensure client is in a state to accept pairing
        // Note: requestPairingCode is available in recent versions of whatsapp-web.js
        const code = await client.requestPairingCode(phone);
        res.json({ code });
    } catch (error) {
        console.error('Pairing failed:', error);
        res.status(500).json({ error: error.message || 'Pairing failed' });
    }
});

// 3. Logout
app.post('/logout', async (req, res) => {
    try {
        await client.logout();
        res.json({ message: 'Logged out' });
        // Client might emit 'disconnected' event which triggers re-init
    } catch (error) {
        console.error('Logout failed:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`WhatsApp Microservice running on port ${PORT}`);
});
