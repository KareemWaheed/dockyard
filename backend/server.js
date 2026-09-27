const express = require('express');
const cors = require('cors');
const http = require('http');
const { allowedOrigins, rejectCrossSiteWrites } = require('./services/origin');

// Refuse to start without a valid ENCRYPTION_KEY: secrets can't be read or written without it,
// and a first-run config migration would otherwise fail half-way and leave an empty database.
try {
  require('./encryption').assertEncryptionKey();
} catch (err) {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
}

// Must be first — initializes SQLite and runs migration if needed
require('./db');
const { hydrateQueue } = require('./services/build-manager');
hydrateQueue();

const app = express();
app.use(cors({ origin: allowedOrigins() }));
app.use(rejectCrossSiteWrites);
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
app.use('/api/maintenance', require('./routes/maintenance'));
app.use('/api/deploy-suggestions', require('./routes/suggestions'));

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

const server = http.createServer(app);
require('./routes/logs')(server);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
