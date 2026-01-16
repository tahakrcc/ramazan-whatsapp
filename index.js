const express = require('express');
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS - Ana uygulamadan gelen isteklere izin ver
app.use(cors({
    origin: process.env.MAIN_APP_URL || '*',
    credentials: true
}));
app.use(express.json());

// API Key doğrulama middleware
const apiKeyAuth = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.API_SECRET_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// ============= WhatsApp Client Setup =============
let qrCode = null;
let clientStatus = 'disconnected';
let clientInfo = null;

// Get Chrome path from environment or use puppeteer's bundled Chrome
const getChromePath = () => {
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    // Try to find Chrome in cache directory
    const cacheDir = process.env.PUPPETEER_CACHE_DIR || '/opt/render/project/src/.cache';
    const possiblePaths = [
        '/opt/render/.cache/puppeteer/chrome/linux-143.0.7499.192/chrome-linux64/chrome',
        `${cacheDir}/puppeteer/chrome/linux-143.0.7499.192/chrome-linux64/chrome`,
        `${cacheDir}/chrome/linux-143.0.7499.192/chrome-linux64/chrome`,
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium'
    ];

    for (const p of possiblePaths) {
        try {
            require('fs').accessSync(p);
            return p;
        } catch (e) { }
    }
    return undefined; // Let puppeteer try to find it
};

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    puppeteer: {
        headless: true,
        executablePath: getChromePath(),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-breakpad',
            '--disable-component-extensions-with-background-pages',
            '--disable-component-update',
            '--disable-default-apps',
            '--disable-domain-reliability',
            '--disable-features=TranslateUI,BlinkGenPropertyTrees,IsolateOrigins,site-per-process',
            '--disable-hang-monitor',
            '--disable-ipc-flooding-protection',
            '--disable-popup-blocking',
            '--disable-prompt-on-repost',
            '--disable-renderer-backgrounding',
            '--disable-sync',
            '--disable-translate',
            '--metrics-recording-only',
            '--mute-audio',
            '--no-pings',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list',
            '--js-flags=--max-old-space-size=256'
        ]
    }
});

// WhatsApp Events
client.on('qr', async (qr) => {
    console.log('QR Code generated');
    try {
        qrCode = await QRCode.toDataURL(qr);
    } catch (err) {
        console.error('QR generation error:', err);
    }
    clientStatus = 'qr';
});

client.on('ready', () => {
    console.log('WhatsApp Client is ready!');
    qrCode = null;
    clientStatus = 'ready';
    clientInfo = client.info;
});

client.on('authenticated', () => {
    console.log('WhatsApp authenticated');
    clientStatus = 'authenticated';
});

client.on('auth_failure', (msg) => {
    console.error('Auth failure:', msg);
    clientStatus = 'auth_failure';
});

client.on('disconnected', (reason) => {
    console.log('WhatsApp disconnected:', reason);
    clientStatus = 'disconnected';
    qrCode = null;
});

// ============= API Routes =============

// Health check (UptimeRobot için)
app.get('/', (req, res) => {
    res.json({ status: 'ok', service: 'whatsapp' });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', whatsapp: clientStatus });
});

// WhatsApp status
app.get('/status', apiKeyAuth, (req, res) => {
    res.json({
        status: clientStatus,
        qr: qrCode,
        info: clientInfo ? {
            number: clientInfo.wid?.user,
            name: clientInfo.pushname
        } : null
    });
});

// Get pairing code
app.post('/pair', apiKeyAuth, async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            return res.status(400).json({ error: 'Phone number required' });
        }

        // Format phone number
        let formattedPhone = phone.replace(/\D/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '90' + formattedPhone.slice(1);
        }
        if (!formattedPhone.startsWith('90')) {
            formattedPhone = '90' + formattedPhone;
        }

        console.log('Requesting pairing code for:', formattedPhone);
        const code = await client.requestPairingCode(formattedPhone);

        res.json({ success: true, code });
    } catch (error) {
        console.error('Pairing error:', error);
        res.json({ success: false, error: error.message });
    }
});

// Send message
app.post('/send', apiKeyAuth, async (req, res) => {
    try {
        const { phone, message } = req.body;
        if (!phone || !message) {
            return res.status(400).json({ error: 'Phone and message required' });
        }

        let formattedPhone = phone.replace(/\D/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '90' + formattedPhone.slice(1);
        }
        if (!formattedPhone.startsWith('90')) {
            formattedPhone = '90' + formattedPhone;
        }

        const chatId = formattedPhone + '@c.us';
        await client.sendMessage(chatId, message);

        res.json({ success: true });
    } catch (error) {
        console.error('Send message error:', error);
        res.json({ success: false, error: error.message });
    }
});

// Logout
app.post('/logout', apiKeyAuth, async (req, res) => {
    try {
        await client.logout();
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ============= Start =============
client.initialize();

app.listen(PORT, () => {
    console.log(`WhatsApp Service running on port ${PORT}`);
});
