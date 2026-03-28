const express = require('express');
const cors = require('cors');
const http = require('http');

// Must be first — initializes SQLite and runs migration if needed
require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/servers', require('./routes/servers'));
app.use('/api/containers', require('./routes/containers'));
app.use('/api/builds', require('./routes/builds'));
app.use('/api/services', require('./routes/services'));
app.use('/api/awssg', require('./routes/awssg'));
app.use('/api/history', require('./routes/history'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/flyway', require('./routes/flyway'));

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

const server = http.createServer(app);
require('./routes/logs')(server);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
