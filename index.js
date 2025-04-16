const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// File to store Discord-to-address mappings
const MAPPINGS_FILE = path.join(__dirname, 'discordMappings.json');

// Initialize the mappings file if it doesn't exist
const initializeMappingsFile = async () => {
  try {
    await fs.access(MAPPINGS_FILE);
  } catch (error) {
    await fs.writeFile(MAPPINGS_FILE, JSON.stringify({}));
  }
};

// Load mappings from the file
const loadMappings = async () => {
  try {
    const data = await fs.readFile(MAPPINGS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading mappings:', error);
    return {};
  }
};

// Save mappings to the file
const saveMappings = async (mappings) => {
  try {
    await fs.writeFile(MAPPINGS_FILE, JSON.stringify(mappings, null, 2));
  } catch (error) {
    console.error('Error saving mappings:', error);
  }
};

// Initialize the mappings file on startup
initializeMappingsFile();

// Discord OAuth configuration
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || 'YOUR_CLIENT_ID';
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || 'YOUR_CLIENT_SECRET';
const REDIRECT_URI = 'https://treasure-hunt-frontend-livid.vercel.app/discord/callback';

// In-memory chat messages (for the chat feature, unchanged)
let messages = [];

// Discord OAuth callback
app.get('/discord/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) {
    return res.status(400).send({ error: 'Missing code or state' });
  }

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token } = tokenResponse.data;
    if (!access_token) {
      return res.status(400).send({ error: 'Failed to obtain access token' });
    }

    // Get user info from Discord
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const discordId = userResponse.data.username;
    const address = state; // The state parameter is the user's wallet address

    // Load existing mappings
    const mappings = await loadMappings();
    
    // Save the Discord-to-address mapping
    mappings[address.toLowerCase()] = discordId;
    await saveMappings(mappings);

    // Redirect back to the frontend
    res.redirect('https://treasure-hunt-frontend-livid.vercel.app');
  } catch (error) {
    console.error('Error in Discord callback:', error.response?.data || error.message);
    res.status(500).send({ error: 'Failed to link Discord' });
  }
});

// Endpoint to get Discord ID for an address
app.get('/discord/:address', async (req, res) => {
  const { address } = req.params;
  const mappings = await loadMappings();
  const discordId = mappings[address.toLowerCase()];
  
  if (discordId) {
    res.json({ discordId });
  } else {
    res.status(404).send({ error: 'Discord ID not found for this address' });
  }
});

// Endpoint for admin to forgive (unlink) a user
app.post('/discord/forgive', async (req, res) => {
  const { address } = req.body;
  if (!address) {
    return res.status(400).send({ error: 'Address is required' });
  }

  const mappings = await loadMappings();
  if (mappings[address.toLowerCase()]) {
    delete mappings[address.toLowerCase()];
    await saveMappings(mappings);
    res.status(200).send({ message: 'User forgiven' });
  } else {
    res.status(404).send({ error: 'No Discord ID found for this address' });
  }
});

// Chat endpoints (unchanged, included for completeness)
app.get('/api/chat', (req, res) => {
  res.json(messages);
});

app.post('/api/chat', (req, res) => {
  const { user, text } = req.body;
  if (!user || !text) {
    return res.status(400).send({ error: 'User and text are required' });
  }
  const message = { user, text, timestamp: new Date().toISOString() };
  messages.push(message);
  res.status(201).json(message);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
