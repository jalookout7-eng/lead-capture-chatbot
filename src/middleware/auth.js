const { timingSafeEqual } = require('crypto');

function requireAuth(req, res, next) {
  const adminToken = process.env.ADMIN_TOKEN;

  // Fail closed — if ADMIN_TOKEN is not configured, deny all access
  if (!adminToken) {
    return res.status(503).json({ error: 'Auth not configured' });
  }

  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

  // Use constant-time comparison to prevent timing attacks
  const tokensMatch =
    token.length === adminToken.length &&
    timingSafeEqual(Buffer.from(token), Buffer.from(adminToken));

  if (!token || !tokensMatch) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  next();
}

module.exports = { requireAuth };
