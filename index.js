const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Configuration from the obfuscated code
const gC = {
    PRz: [1, 9, 3],
    ADK: [
        "111111 1001 110111 10000 10000 100010 101000 1111 110000 101000 100110 100001 100100 1110 111011 1100 10100 100001 101100 101110 101000 101110 1000 1000011 10011 10001 110010 110000 100000 1000 101000 1000011 11101 101001 10101 111011 11100 11010 101010 1000011 11110 101001 10011 1100 11110 1000100 111101 110000 111010 100011 101110 1000011 1000001",
        "dWZBSzNtYkUwanE0aWw1b3NNSlhPeDFhTFJTV3B5VjJCRFl0ZDk4WmVuVXd2SUdoems3SFFyVE5jNlBnRkM="
    ],
    Rjm: [0, 8, 0, 0],
    stz: [
        "0x340x720x440x300x4f0x340x620x490x350x4b0x380x390x6c0x300x630x6d0x520x610x690x560x520x610x310x700x4b0x350x300x790x66",
        "0x70"
    ],
    AWF: ["UFJ6", "QURL", "Umpt", "c3R6"]
};

// Helper functions
function getTimestamp() {
    return Math.floor(Date.now() / 1000);
}

function decodeBin(binStr) {
    return binStr.split(" ").map(b => parseInt(b, 2));
}

function decodeHex(hexStr) {
    const matches = hexStr.match(/0x[a-fA-F0-9]{2}/gi);
    if (!matches) return "";
    return matches.map(m => String.fromCharCode(parseInt(m, 16))).join("");
}

function base64Decode(str) {
    return Buffer.from(str, 'base64').toString('utf-8');
}

function base64Encode(str) {
    return Buffer.from(str, 'utf-8').toString('base64');
}

function gC_d(index) {
    if (/^[0-3]$/.test(index.toString())) {
        const key = base64Decode(gC.AWF[index]);
        return gC[key];
    }
    return null;
}

function authorization() {
    const binArray = decodeBin(gC_d(1)[0]);
    const base64Str = gC_d(1)[1];
    const rjm = gC_d(2);
    
    let t = "";
    const decodedStr = base64Decode(base64Str);
    const sourceStr = rjm[0] > 0 ? decodedStr.split("").reverse().join("") : decodedStr;
    
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
            result = t + "_" + hexPart;
            break;
        case 1:
            result = t.toLowerCase() + "_" + hexPart;
            break;
        case 2:
            result = t.toUpperCase() + "_" + hexPart;
            break;
        default:
            result = t + "_" + hexPart;
    }
    
    return base64Encode(result);
}

// HTTP request helper
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const protocol = urlObj.protocol === 'https:' ? https : http;
        
        const requestOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: {
                'accept': '*/*',
                'accept-language': 'en-US,en;q=0.8',
                'origin': 'https://ytmp3.as',
                'referer': 'https://ytmp3.as/',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                ...options.headers
            }
        };
        
        const req = protocol.request(requestOptions, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve({ status: res.statusCode, data: jsonData });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.end();
    });
}

// Extract video ID from YouTube URL
function extractVideoId(url) {
    let match;
    
    if (url.includes('youtu.be')) {
        match = url.match(/\/([a-zA-Z0-9\-_]{11})/);
    } else if (url.includes('youtube.com')) {
        if (url.includes('/shorts/')) {
            match = url.match(/\/([a-zA-Z0-9\-_]{11})/);
        } else {
            match = url.match(/v=([a-zA-Z0-9\-_]{11})/);
        }
    }
    
    return match ? match[1] : null;
}

// Initialize API call
async function initialize(videoId, format) {
    const paramName = decodeHex(gC_d(3)[1]); // Should be "p"
    const auth = authorization();
    const timestamp = getTimestamp();
    const initUrl = `https://gamma.gammacloud.net/api/v1/init?${paramName}=${encodeURIComponent(auth)}&t=${timestamp}`;
    
    console.log('Initializing...');
    const response = await makeRequest(initUrl);
    
    if (response.status !== 200) {
        throw new Error(`Init failed with status ${response.status}`);
    }
    
    if (response.data.error && response.data.error !== "0" && response.data.error !== 0) {
        throw new Error(`Init error: ${response.data.error}`);
    }
    
    return response.data.convertURL;
}

// Convert API call
async function convert(convertUrl, videoId, format, isRedirect = false) {
    // Remove existing v= parameter if present
    if (convertUrl.includes('&v=')) {
        convertUrl = convertUrl.split('&v=')[0];
    }
    
    const timestamp = getTimestamp();
    const url = `${convertUrl}&v=${videoId}&f=${format}&t=${timestamp}`;
    
    console.log('Converting...');
    const response = await makeRequest(url);
    
    if (response.status !== 200) {
        throw new Error(`Convert failed with status ${response.status}`);
    }
    
    if (response.data.error && response.data.error !== 0) {
        const errorCode = response.data.error;
        if (/^215|243|244|245$/.test(errorCode.toString())) {
            throw new Error(`Conversion error: ${errorCode}`);
        }
        throw new Error(`Convert error: ${errorCode}`);
    }
    
    // Handle redirect
    if (response.data.redirect === 1 && response.data.redirectURL) {
        console.log('Following redirect...');
        return convert(response.data.redirectURL, videoId, format, true);
    }
    
    return {
        progressURL: response.data.progressURL,
        downloadURL: response.data.downloadURL,
        title: response.data.title
    };
}

// Poll progress
async function pollProgress(progressUrl, downloadUrl, videoId, format) {
    const timestamp = getTimestamp();
    const url = `${progressUrl}&t=${timestamp}`;
    
    const response = await makeRequest(url);
    
    if (response.status !== 200) {
        throw new Error(`Progress check failed with status ${response.status}`);
    }
    
    if (response.data.error && response.data.error > 0) {
        throw new Error(`Progress error: ${response.data.error}`);
    }
    
    // Progress values: 0 = checking, 1 = extracting, 2 = converting, 3 = completed
    const progress = response.data.progress;
    const statuses = ["checking video", "extracting video", "converting video", "completed"];
    
    if (progress < 3) {
        console.log(`Status: ${statuses[progress] || 'processing'}...`);
        // Wait 3 seconds before polling again
        await new Promise(resolve => setTimeout(resolve, 3000));
        return pollProgress(progressUrl, downloadUrl, videoId, format);
    }
    
    return downloadUrl;
}

// Download file
async function downloadFile(downloadUrl, videoId, format, title) {
    const finalUrl = `${downloadUrl}&s=1&v=${videoId}&f=${format}`;
    
    console.log('Downloading file...');
    
    return new Promise((resolve, reject) => {
        const urlObj = new URL(finalUrl);
        const protocol = urlObj.protocol === 'https:' ? https : http;
        
        const filename = title 
            ? `${title.replace(/[^a-z0-9]/gi, '_')}.${format}`
            : `${videoId}.${format}`;
        
        const filepath = path.join(process.cwd(), filename);
        const file = fs.createWriteStream(filepath);
        
        const req = protocol.get(finalUrl, {
            headers: {
                'accept': '*/*',
                'referer': 'https://ytmp3.as/',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                // Follow redirect
                file.close();
                fs.unlinkSync(filepath);
                return downloadFile(res.headers.location, videoId, format, title)
                    .then(resolve)
                    .catch(reject);
            }
            
            res.pipe(file);
            
            file.on('finish', () => {
                file.close();
                console.log(`\nDownload complete: ${filename}`);
                resolve(filepath);
            });
        });
        
        req.on('error', (error) => {
            file.close();
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
            }
            reject(error);
        });
        
        file.on('error', (error) => {
            file.close();
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
            }
            reject(error);
        });
    });
}

// Main function
async function downloadYouTubeVideo(youtubeUrl, format = 'mp3') {
    try {
        // Extract video ID
        const videoId = extractVideoId(youtubeUrl);
        if (!videoId) {
            throw new Error('Invalid YouTube URL');
        }
        
        console.log(`Video ID: ${videoId}`);
        console.log(`Format: ${format}\n`);
        
        // Initialize
        const convertUrl = await initialize(videoId, format);
        
        // Convert
        const { progressURL, downloadURL, title } = await convert(convertUrl, videoId, format);
        
        if (title) {
            console.log(`Title: ${title}\n`);
        }
        
        // Poll progress if progressURL exists
        let finalDownloadUrl = downloadURL;
        if (progressURL) {
            finalDownloadUrl = await pollProgress(progressURL, downloadURL, videoId, format);
        }
        
        // Download
        const filepath = await downloadFile(finalDownloadUrl, videoId, format, title);
        
        return filepath;
    } catch (error) {
        console.error('Error:', error.message);
        throw error;
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node index.js <youtube-url> [format]');
        console.log('Example: node index.js https://www.youtube.com/watch?v=dQw4w9WgXcQ mp3');
        console.log('Formats: mp3, mp4');
        process.exit(1);
    }
    
    const youtubeUrl = args[0];
    const format = args[1] || 'mp3';
    
    if (!['mp3', 'mp4'].includes(format.toLowerCase())) {
        console.error('Invalid format. Use mp3 or mp4');
        process.exit(1);
    }
    
    downloadYouTubeVideo(youtubeUrl, format.toLowerCase())
        .then(filepath => {
            console.log(`\nSuccess! File saved to: ${filepath}`);
            process.exit(0);
        })
        .catch(error => {
            console.error(`\nFailed: ${error.message}`);
            process.exit(1);
        });
}

// Get download URL without downloading (for web UI)
async function getDownloadUrl(youtubeUrl, format = 'mp3') {
    try {
        // Extract video ID
        const videoId = extractVideoId(youtubeUrl);
        if (!videoId) {
            throw new Error('Invalid YouTube URL');
        }
        
        // Initialize
        const convertUrl = await initialize(videoId, format);
        
        // Convert
        const { progressURL, downloadURL, title } = await convert(convertUrl, videoId, format);
        
        // Poll progress if progressURL exists
        let finalDownloadUrl = downloadURL;
        if (progressURL) {
            finalDownloadUrl = await pollProgress(progressURL, downloadURL, videoId, format);
        }
        
        // Build final download URL
        const finalUrl = `${finalDownloadUrl}&s=1&v=${videoId}&f=${format}`;
        
        // Generate filename
        const filename = title 
            ? `${title.replace(/[^a-z0-9]/gi, '_')}.${format}`
            : `${videoId}.${format}`;
        
        return { downloadUrl: finalUrl, filename, title };
    } catch (error) {
        console.error('Error:', error.message);
        throw error;
    }
}

module.exports = { downloadYouTubeVideo, extractVideoId, getDownloadUrl };

