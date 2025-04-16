const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const MAPPINGS_FILE = path.join(__dirname, 'discordMappings.json');

const initializeMappingsFile = async () => {
  try {
    await fs.access(MAPPINGS_FILE);
  } catch (error) {
    await fs.writeFile(MAPPINGS_FILE, JSON.stringify({}));
  }
};

const loadMappings = async () => {
  try {
    const data = await fs.readFile(MAPPINGS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading mappings:', error);
    return {};
  }
};

const saveMappings = async (mappings) => {
  try {
    await fs.writeFile(MAPPINGS_FILE, JSON.stringify(mappings, null, 2));
  } catch (error) {
    console.error('Error saving mappings:', error);
    throw new Error('Failed to save mappings');
  }
};

initializeMappingsFile();

const CLIENT_ID = process.env.DISCORD_CLIENT_ID || 'YOUR_CLIENT_ID';
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || 'YOUR_CLIENT_SECRET';
const REDIRECT_URI = 'https://treasure-hunt-backend-93cc.onrender.com/discord/callback';

let messages = [];

app.get('/discord/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) {
    console.log('Missing code or state in Discord callback:', { code, state });
    return res.status(400).send({ error: 'Missing code or state' });
  }

  try {
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
      console.log('Failed to obtain access token from Discord:', tokenResponse.data);
      return res.status(400).send({ error: 'Failed to obtain access token' });
    }

    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const discordId = userResponse.data.global_name || userResponse.data.username;
    if (!discordId) {
      console.log('No username or global_name found in Discord response:', userResponse.data);
      return res.status(400).send({ error: 'Failed to retrieve Discord username' });
    }

    const address = state;
    const mappings = await loadMappings();

    // Check if the Discord ID is already linked to another address
    const existingAddress = Object.keys(mappings).find(
      addr => mappings[addr] === discordId && addr.toLowerCase() !== address.toLowerCase()
    );
    if (existingAddress) {
      console.log(`Discord ID ${discordId} is already linked to address ${existingAddress}. Cannot link to ${address}.`);
      return res.status(409).send({ 
        error: 'Discord ID already linked to another address',
        existingAddress: existingAddress
      });
    }

    mappings[address.toLowerCase()] = discordId;
    await saveMappings(mappings);
    console.log(`Successfully saved Discord ID for address ${address}: ${discordId}`);

    res.redirect('https://treasure-hunt-frontend-livid.vercel.app');
  } catch (error) {
    console.error('Error in Discord callback:', error.response?.data || error.message);
    res.status(500).send({ error: 'Failed to link Discord' });
  }
});

app.get('/discord/:address', async (req, res) => {
  const { address } = req.params;
  console.log(`Fetching Discord ID for address: ${address}`);
  const mappings = await loadMappings();
  const discordId = mappings[address.toLowerCase()];
  if (discordId) {
    console.log(`Found Discord ID for address ${address}: ${discordId}`);
    res.json({ discordId });
  } else {
    console.log(`No Discord ID found for address: ${address}`);
    res.status(404).send({ error: 'Discord ID not found for this address' });
  }
});

app.post('/discord/forgive', async (req, res) => {
  const { address } = req.body;
  if (!address) {
    return res.status(400).send({ error: 'Address is required' });
  }

  const mappings = await loadMappings();
  if (mappings[address.toLowerCase()]) {
    delete mappings[address.toLowerCase()];
    await saveMappings(mappings);
    console.log(`Successfully removed Discord ID for address: ${address}`);
    res.status(200).send({ message: 'User forgiven' });
  } else {
    res.status(404).send({ error: 'No Discord ID found for this address' });
  }
});

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
