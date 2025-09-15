// Import required dependencies for the server
const express = require('express'); // Web framework for Node.js
const path = require('path'); // Utility for handling file paths
const axios = require('axios'); // HTTP client for Discord webhook calls
const { Pool } = require('pg'); // PostgreSQL client for database storage

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000; // Vercel assigns PORT dynamically
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://your-vercel-app.vercel.app'; // Vercel domain for CORS

// Initialize PostgreSQL connection pool for persistent storage
const pool = process.env.DATABASE_URL ? new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Vercel/Render PostgreSQL
}) : null;

// Queue for Discord operations to handle rate limits and ensure reliable sending
const discordQueue = [];
let isProcessingQueue = false;

// Middleware setup
app.use(express.json()); // Parse JSON request bodies from client requests
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files (index.html, script.js, styles.css)

// CORS configuration to allow requests from the frontend
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN); // Restrict to Vercel domain
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200); // Handle CORS preflight requests
    }
    next();
});

// In-memory storage for messages, synced with PostgreSQL
let messages = [];

// Load messages from PostgreSQL on startup
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

// Save a single message to PostgreSQL
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

// Discord webhook configuration
// REPLACE THESE with the correct webhook URLs for each channel
// In Discord: Right-click each channel under category ID 1395377920557711421 > Edit Channel > Integrations > Create Webhook > Copy Webhook URL
// Webhooks don’t require bot permissions and avoid "Unknown Channel" errors
const CATEGORY_WEBHOOKS = {
    'Entertainment': 'https://discord.com/api/webhooks/1416999467474747513/dg40beMMiIyAeJvhFO9RX2DYRJx5jZP4e-SZw9O9i8-fblItE3-dBAWePIPLY3nKUv1h', // REPLACE with webhook URL for #entertainment
    'Education': 'https://discord.com/api/webhooks/1416999637600047265/UIk_k6BDxloVmEhsLs1J1sD8xC1RwopoFV5_iDhaLZ7JCgWArw3kSBeUoSkVC0kRe_0S', // REPLACE with webhook URL for #education
    'Website': 'https://discord.com/api/webhooks/1416999733922103306/ryc_9x6OuurOmiPCJkxFVb2ZbFKcgqkmD4hgMKMAt4Tl_9aGdBkHXwGxQ2gTC_M8e3SJ',   // REPLACE with webhook URL for #website
    'Hack': 'https://discord.com/api/webhooks/1416999741627170836/hAulCHY6EIbo2UF9pdIrubhYdWQiCqf09mA3AhrJ8jKxF_-GeD7eGN_KXlYaSyM4DA8f',      // REPLACE with webhook URL for #hack
    'Others': 'https://discord.com/api/webhooks/1416999742390665268/TYbwuxRX1u0c0dgCYyPMfnw1AoyVEjDE8KV4358OElytsMWlKhH78G8nCIgx22Bm96dN'     // REPLACE with webhook URL for #others
};

// Send post to Discord channel via webhook
async function sendToDiscordChannel(postData) {
    const { topic, description, link, tag } = postData;
    const webhookUrl = CATEGORY_WEBHOOKS[tag];
    
    // Validate webhook URL
    if (!webhookUrl) {
        console.error(`❌ No Discord webhook configured for category: ${tag}`);
        return false;
    }

    // Format message content for Discord
    let messageContent = `# ${topic}\n> ${description}`;
    if (link && link.trim()) {
        messageContent += `\n${link}`;
    }

    // Send message via webhook
    try {
        console.log(`Attempting to send post to Discord webhook for category ${tag}`);
        const response = await axios.post(
            webhookUrl,
            { content: messageContent },
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );
        console.log(`✅ Successfully sent post to Discord channel #${tag}: [${tag}] ${topic || description}`);
        return true;
    } catch (error) {
        const errorDetails = error.response?.data || error.message;
        console.error(`❌ Failed to send to Discord webhook for ${tag}:`, errorDetails);
        return false;
    }
}

// Process Discord queue to send posts
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
            await new Promise(resolve => setTimeout(resolve, 1000)); // Avoid rate limits
        } catch (error) {
            console.error('Error processing Discord queue item:', error.message);
        }
    }

    isProcessingQueue = false;
    console.log('Discord queue processing completed');
}

// Load messages on server startup
loadMessages();

// API Routes
// Get all messages for the frontend
app.get('/api/messages', async (req, res) => {
    console.log(`GET /api/messages: Returning ${messages.length} messages`);
    await loadMessages();
    res.json(messages);
});

// Handle new post submission (from Discord bot or website)
app.post('/api/upload', async (req, res) => {
    try {
        const { topic, description, message, link, tag, source } = req.body;
        console.log('POST /api/upload received:', { topic, description, message, link, tag, source });

        // Validate request
        if (!tag || (!description && !message)) {
            console.error('Invalid request: Tag and description/message are required');
            return res.status(400).json({ error: 'Tag and description/message are required' });
        }

        // Create new post object
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

        // Add to in-memory messages
        messages.unshift(newPost);
        if (messages.length > 100) {
            messages = messages.slice(0, 100); // Limit to 100 messages
        }

        // Save to PostgreSQL
        await saveMessage(newPost);
        
        const logMessage = topic ? `[${tag}] ${topic}` : `[${tag}] ${description || message}`;
        console.log(`New post added: ${logMessage}`);

        // Queue website posts for Discord via webhook
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

// Serve the frontend
app.get('/', (req, res) => {
    console.log('Serving index.html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Delete a post
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

// Health check endpoint for monitoring
app.get('/health', (req, res) => {
    console.log('Health check requested');
    res.json({ status: 'OK', messages: messages.length });
});

// Export for Vercel serverless functions
module.exports = app;
