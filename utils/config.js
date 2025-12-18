const https = require('https');
const http = require('http');
const { URL } = require('url');
const vm = require('vm');
const cheerio = require('cheerio');

// Dynamic configuration (obfuscated gC from ytmp3.as)
let gC = null;
let gCLoadedAt = 0;
const GC_TTL_MS = 60 * 60 * 1000; // 1 hour

// Helper functions
function getTimestamp() {
    return Math.floor(Date.now() / 1000);
}

function decodeBin(binStr) {
    return binStr.split(' ').map(b => parseInt(b, 2));
}

function decodeHex(hexStr) {
    const matches = hexStr.match(/0x[a-fA-F0-9]{2}/gi);
    if (!matches) return '';
    return matches.map(m => String.fromCharCode(parseInt(m, 16))).join('');
}

function base64Decode(str) {
    return Buffer.from(str, 'base64').toString('utf-8');
}

function base64Encode(str) {
    return Buffer.from(str, 'utf-8').toString('base64');
}

function gC_d(index) {
    if (!gC) return null;
    if (!/^[0-3]$/.test(index.toString())) return null;

    // Support both old (AWF) and new (Zdy) config tables
    const table = gC.AWF || gC.Zdy;
    if (!table) return null;

    const key = base64Decode(table[index]);
    return gC[key];
}

// Simple HTML fetcher (no JSON parsing)
function fetchHtml(url) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const protocol = urlObj.protocol === 'https:' ? https : http;

        const req = protocol.get(url, {
            headers: {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'accept-language': 'en-US,en;q=0.8',
                'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
            }
        }, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                // Follow redirect (support absolute and relative URLs)
                const nextUrl = new URL(res.headers.location, url).toString();
                resolve(fetchHtml(nextUrl));
                return;
            }

            let data = '';
            res.on('data', chunk => { data += chunk.toString('utf-8'); });
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
    });
}

// Fetch and evaluate obfuscated config (gC) from ytmp3.as
async function ensureConfigLoaded() {
    const now = Date.now();
    if (gC && (now - gCLoadedAt) < GC_TTL_MS) {
        return;
    }

    const html = await fetchHtml('https://ytmp3.as/AOPR/');
    const $ = cheerio.load(html);

    let scriptContent = null;
    $('script').each((_, el) => {
        const content = $(el).html() || '';
        // Be tolerant to formatting/minification changes
        if (content.includes('var gC') && content.includes('Object.defineProperty(gC')) {
            scriptContent = content;
        }
    });

    if (!scriptContent) {
        throw new Error('Failed to locate gC config script on ytmp3.as');
    }

    // Execute the script in a sandbox to populate gC
    const sandbox = {
        gC: {},
        atob: (str) => Buffer.from(str, 'base64').toString('utf-8'),
        Object,
        console
    };
    vm.createContext(sandbox);

    const wrappedScript = scriptContent.includes('var gC = {}') || scriptContent.includes('var gC={')
        ? scriptContent
        : `var gC = {}; ${scriptContent}`;

    vm.runInContext(wrappedScript, sandbox);

    if (!sandbox.gC) {
        throw new Error('Failed to load gC config from script');
    }

    gC = sandbox.gC;
    gCLoadedAt = now;
}

function authorization() {
    const binArray = decodeBin(gC_d(1)[0]);
    const base64Str = gC_d(1)[1];
    const rjm = gC_d(2);

    let t = '';
    const decodedStr = base64Decode(base64Str);
    const sourceStr = rjm[0] > 0 ? decodedStr.split('').reverse().join('') : decodedStr;

    for (let i = 0; i < binArray.length; i++) {
        t += sourceStr[binArray[i] - rjm[1]];
    }

    if (rjm[2] > 0) {
        t = t.substring(0, rjm[2]);
    }

    const hexPart = decodeHex(gC_d(3)[0]);
    let result;

    switch (rjm[3]) {
        case 0:
            result = t + '_' + hexPart;
            break;
        case 1:
            result = t.toLowerCase() + '_' + hexPart;
            break;
        case 2:
            result = t.toUpperCase() + '_' + hexPart;
            break;
        default:
            result = t + '_' + hexPart;
    }

    return base64Encode(result);
}

module.exports = {
    ensureConfigLoaded,
    gC_d,
    authorization,
    getTimestamp,
    decodeHex
};


