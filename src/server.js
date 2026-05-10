require('dotenv').config();
const express = require('express');
const path = require('path');
const { initDb } = require('./db/client');
const chatRoute = require('./routes/chat');
const leadsRoute = require('./routes/leads');
const notesRoute = require('./routes/notes');

const followupRoute = require('./routes/followup');
const marketRoute = require('./routes/market');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/chat', chatRoute);
app.use('/api/leads', leadsRoute);
app.use('/api', notesRoute);
app.use('/api/followup', followupRoute);
app.use('/api/market', marketRoute);

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  initDb()
    .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
    .catch(err => { console.error('DB init failed:', err); process.exit(1); });
}

module.exports = app;
