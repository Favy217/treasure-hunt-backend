const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

let messages = [];

app.get('/api/chat', (req, res) => {
  res.json(messages);
});

app.post('/api/chat', (req, res) => {
  const { user, text } = req.body;
  if (!user || !text) {
    res.status(400).json({ error: 'User and text are required' });
    return;
  }
  const newMessage = { user, text, timestamp: new Date().toISOString() };
  messages.push(newMessage);
  res.json(newMessage);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
