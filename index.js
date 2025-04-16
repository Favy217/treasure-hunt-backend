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
    console.log('Initializing mappings file...');
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
    console.log('Mappings saved successfully');
  } catch (error) {
    console.error('Error saving mappings:', error);
    throw error;
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
    console.log('Missing code or state:', { code, state });
    return res.status(400).send({ error: 'Missing code or state' });
  }

  try {
    console.log('Exchanging code for access token...');
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
      console.log('No access token received:', tokenResponse.data);
      return res.status(400).send({ error: 'Failed to obtain access token' });
    }

    console.log('Access token obtained, fetching user info...');
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    console.log('User info received:', userResponse.data);
    // Use global_name if available, otherwise fall back to username
    const discordId = userResponse.data.global_name || userResponse.data.username;
    if (!discordId) {
      console.log('No discordId found in user data:', userResponse.data);
      return res.status(400).send({ error: 'Failed to retrieve Discord ID' });
    }

    const address = state; // The state parameter is the user's wallet address

    // Load existing mappings
    const mappings = await loadMappings();
    
    // Save the Discord-to-address mapping
    mappings[address.toLowerCase()] = discordId;
    await saveMappings(mappings);

    console.log(`Saved mapping for address ${address}: ${discordId}`);
    // Redirect back to the frontend with a success indicator
    res.redirect('https://treasure-hunt-frontend-livid.vercel.app?linked=true');
  } catch (error) {
    console.error('Error in Discord callback:', error.response?.data || error.message);
    res.redirect('https://treasure-hunt-frontend-livid.vercel.app?linked=false&error=' + encodeURIComponent(error.message));
  }
});

// Endpoint to get Discord ID for an address
app.get('/discord/:address', async (req, res) => {
  const { address } = req.params;
  console.log(`Fetching Discord ID for address: ${address}`);
  const mappings = await loadMappings();
  const discordId = mappings[address.toLowerCase()];
  
  if (discordId) {
    console.log(`Found Discord ID: ${discordId}`);
    res.json({ discordId });
  } else {
    console.log(`No Discord ID found for address: ${address}`);
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
