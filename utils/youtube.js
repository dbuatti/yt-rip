// Extract YouTube video ID from various URL formats
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

module.exports = {
    extractVideoId
};


