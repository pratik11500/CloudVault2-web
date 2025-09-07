const express = require('express');
const path = require('path');
const axios = require('axios');
const { Pool } = require('pg');
const app = express();
const PORT = process.env.PORT || 5000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://your-vercel-app.vercel.app';

// Initialize PostgreSQL pool
const pool = process.env.DATABASE_URL ? new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
}) : null;

// Queue system for Discord operations
const discordQueue = [];
let isProcessingQueue = false;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS configuration
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// In-memory storage (fallback if no database)
let messages = [];

// Load messages from database
async function loadMessages() {
    if (!pool) {
        console.error('❌ DATABASE_URL not set; cannot load messages (Vercel filesystem is read-only)');
        messages = [];
        return;
    }
    try {
        const result = await pool.query('SELECT * FROM posts ORDER BY timestamp DESC');
        messages = result.rows;
        console.log(`📝 Loaded ${messages.length} messages from PostgreSQL`);
    } catch (error) {
        console.error('Error loading messages from PostgreSQL:', error.message);
        messages = [];
    }
}

// Save a single message to database
async function saveMessage(post) {
    if (!pool) {
        console.error('❌ DATABASE_URL not set; cannot save message (Vercel filesystem is read-only)');
        return;
    }
    try {
        await pool.query(
            'INSERT INTO posts (id, topic, description, link, tag, source, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [post.id, post.topic, post.description, post.link, post.tag, post.source, post.timestamp]
        );
        console.log(`💾 Saved post to PostgreSQL: [${post.tag}] ${post.topic || post.description}`);
    } catch (error) {
        console.error('Error saving post to PostgreSQL:', error.message);
    }
}

// Discord configuration
const CATEGORY_CHANNELS = {
    'Entertainment': 1413856614510755880,
    'Education': 1413881799322636319,
    'Website': 1413881852451885266,
    'Hack': 1413881887428055193,
    'Others': 1413881920248615143
};

// Send post to Discord
async function sendToDiscordChannel(postData) {
    const { topic, description, link, tag } = postData;
    const channelId = CATEGORY_CHANNELS[tag];
    
    if (!channelId) {
        console.error(`❌ No Discord channel configured for category: ${tag}`);
        return false;
    }

    const discordToken = process.env.DISCORD_TOKEN;
    if (!discordToken) {
        console.error('❌ DISCORD_TOKEN environment variable is not set');
        return false;
    }

    let messageContent = `# ${topic}\n> ${description}`;
    if (link && link.trim()) {
        messageContent += `\n${link}`;
    }

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempting to send post to Discord channel ${channelId} (attempt ${attempt}/${maxRetries})`);
            const response = await axios.post(
                `https://discord.com/api/v10/channels/${channelId}/messages`,
                { content: messageContent },
                {
                    headers: {
                        'Authorization': `Bot ${discordToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );
            console.log(`✅ Successfully sent post to Discord channel #${tag}: [${tag}] ${topic || description}`);
            return true;
        } catch (error) {
            const errorDetails = error.response?.data || error.message;
            console.error(`❌ Failed to send to Discord (attempt ${attempt}/${maxRetries}):`, errorDetails);
            if (error.response?.status === 429 && attempt < maxRetries) {
                const retryAfter = (error.response.data.retry_after * 1000) || 1000;
                console.log(`Rate limited, retrying after ${retryAfter}ms`);
                await new Promise(resolve => setTimeout(resolve, retryAfter));
                continue;
            }
            if (error.response?.status === 401) {
                console.error('❌ Invalid DISCORD_TOKEN');
            } else if (error.response?.status === 403) {
                console.error(`❌ Bot lacks permissions to send messages to channel ${channelId}`);
            }
            return false;
        }
    }
    return false;
}

// Queue processing
async function processDiscordQueue() {
    if (isProcessingQueue || discordQueue.length === 0) {
        console.log(`Queue processing skipped: isProcessing=${isProcessingQueue}, queueLength=${discordQueue.length}`);
        return;
    }

    isProcessingQueue = true;
    console.log(`Processing Discord queue: ${discordQueue.length} items`);

    while (discordQueue.length > 0) {
        const postData = discordQueue.shift();
        console.log(`Processing queue item: [${postData.tag}] ${postData.topic || postData.description}`);
        try {
            const success = await sendToDiscordChannel(postData);
            if (!success) {
                console.error(`Failed to send post to Discord: [${postData.tag}] ${postData.topic || postData.description}`);
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            console.error('Error processing Discord queue item:', error.message);
        }
    }

    isProcessingQueue = false;
    console.log('Discord queue processing completed');
}

// Load messages on startup
loadMessages();

// API Routes
app.get('/api/messages', async (req, res) => {
    console.log(`GET /api/messages: Returning ${messages.length} messages`);
    await loadMessages();
    res.json(messages);
});

app.post('/api/upload', async (req, res) => {
    try {
        const { topic, description, message, link, tag, source } = req.body;
        console.log('POST /api/upload received:', { topic, description, message, link, tag, source });

        if (!tag || (!description && !message)) {
            console.error('Invalid request: Tag and description/message are required');
            return res.status(400).json({ error: 'Tag and description/message are required' });
        }

        const newPost = {
            topic: topic || '',
            description: description || message || '',
            message: message || description || '',
            link: link || '',
            tag: tag,
            source: source || 'discord',
            timestamp: new Date().toISOString(),
            id: Date.now() + Math.random()
        };

        messages.unshift(newPost);
        if (messages.length > 100) {
            messages = messages.slice(0, 100);
        }

        await saveMessage(newPost);
        
        const logMessage = topic ? `[${tag}] ${topic}` : `[${tag}] ${description || message}`;
        console.log(`New post added: ${logMessage}`);

        if (source === 'website') {
            console.log(`Adding website post to Discord queue: ${logMessage}`);
            discordQueue.push(newPost);
            setImmediate(() => processDiscordQueue());
        } else {
            console.log(`Skipping Discord queue for source: ${source}`);
        }
        
        res.json({ success: true, message: 'Post uploaded successfully' });
    } catch (error) {
        console.error('Error uploading post:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/', (req, res) => {
    console.log('Serving index.html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.delete('/api/delete/:postId', async (req, res) => {
    try {
        const postId = req.params.postId;
        console.log(`DELETE /api/delete/${postId} requested`);
        
        const postToDelete = messages.find(post => post.id == postId);
        
        if (!postToDelete) {
            console.error(`Post not found: ${postId}`);
            return res.status(404).json({ error: 'Post not found' });
        }

        messages = messages.filter(post => post.id != postId);
        if (pool) {
            try {
                await pool.query('DELETE FROM posts WHERE id = $1', [postId]);
                console.log(`Deleted post from PostgreSQL: [${postToDelete.tag}] ${postToDelete.topic || postToDelete.description}`);
            } catch (error) {
                console.error('Error deleting post from PostgreSQL:', error.message);
            }
        }

        console.log(`Post deleted: [${postToDelete.tag}] ${postToDelete.topic || postToDelete.description}`);
        res.json({ success: true, message: 'Post deleted successfully' });
    } catch (error) {
        console.error('Error deleting post:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/health', (req, res) => {
    console.log('Health check requested');
    res.json({ status: 'OK', messages: messages.length });
});

// Export for Vercel serverless
module.exports = app;
