const { google } = require('googleapis');
const crypto = require('crypto');
const { pool } = require('../database/schema');

class GoogleOAuthService {
  constructor() {
    this.oauth2Client = null;
    this.initializeClient();
  }

  initializeClient() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://your-app-url.com/auth/google/callback';

    if (!clientId || !clientSecret) {
      console.warn('⚠️ Google OAuth credentials not configured');
      return;
    }

    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    console.log('✅ Google OAuth client initialized');
  }

  async getAuthorizationUrl(userId = null) {
    if (!this.oauth2Client) {
      throw new Error('OAuth client not initialized');
    }

    const stateToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await pool.query(
      'INSERT INTO oauth_state_tokens (state_token, user_id, redirect_uri, expires_at) VALUES ($1, $2, $3, $4)',
      [stateToken, userId, this.oauth2Client.redirectUri, expiresAt]
    );

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'openid',
      ],
      state: stateToken,
      prompt: 'consent',
    });

    return { authUrl, stateToken };
  }

  async verifyStateToken(stateToken) {
    const result = await pool.query(
      'SELECT * FROM oauth_state_tokens WHERE state_token = $1 AND expires_at > NOW()',
      [stateToken]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid or expired state token');
    }

    await pool.query('DELETE FROM oauth_state_tokens WHERE state_token = $1', [stateToken]);
    return result.rows[0];
  }

  async handleCallback(code, state) {
    if (!this.oauth2Client) {
      throw new Error('OAuth client not initialized');
    }

    await this.verifyStateToken(state);
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
    const userInfoResponse = await oauth2.userinfo.get();
    const userInfo = userInfoResponse.data;

    let user = await this.findOrCreateUser(userInfo);
    await this.saveOAuthSession(user.id, tokens);

    return { user, tokens };
  }

  async findOrCreateUser(userInfo) {
    const client = await pool.connect();
    try {
      let result = await client.query('SELECT * FROM users WHERE google_id = $1', [userInfo.id]);

      if (result.rows.length > 0) {
        result = await client.query(
          'UPDATE users SET name = $1, avatar_url = $2, updated_at = NOW() WHERE google_id = $3 RETURNING *',
          [userInfo.name, userInfo.picture, userInfo.id]
        );
        return result.rows[0];
      }

      result = await client.query('SELECT * FROM users WHERE email = $1', [userInfo.email]);

      if (result.rows.length > 0) {
        result = await client.query(
          'UPDATE users SET google_id = $1, name = $2, avatar_url = $3, updated_at = NOW() WHERE email = $4 RETURNING *',
          [userInfo.id, userInfo.name, userInfo.picture, userInfo.email]
        );
        return result.rows[0];
      }

      result = await client.query(
        'INSERT INTO users (email, google_id, name, avatar_url) VALUES ($1, $2, $3, $4) RETURNING *',
        [userInfo.email, userInfo.id, userInfo.name, userInfo.picture]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async saveOAuthSession(userId, tokens) {
    const tokenExpiry = new Date(tokens.expiry_date || Date.now() + 3600 * 1000);

    await pool.query(
      `INSERT INTO oauth_sessions (user_id, access_token, refresh_token, token_expiry, scope)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_sessions.refresh_token),
         token_expiry = EXCLUDED.token_expiry,
         scope = EXCLUDED.scope,
         updated_at = NOW()`,
      [userId, tokens.access_token, tokens.refresh_token, tokenExpiry, tokens.scope]
    );
  }

  async getOAuthSession(userId) {
    const result = await pool.query('SELECT * FROM oauth_sessions WHERE user_id = $1', [userId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async refreshAccessToken(userId) {
    if (!this.oauth2Client) {
      throw new Error('OAuth client not initialized');
    }

    const session = await this.getOAuthSession(userId);
    if (!session || !session.refresh_token) {
      throw new Error('No refresh token available');
    }

    this.oauth2Client.setCredentials({ refresh_token: session.refresh_token });
    const { credentials } = await this.oauth2Client.refreshAccessToken();
    await this.saveOAuthSession(userId, credentials);
    return credentials;
  }

  async getValidAccessToken(userId) {
    const session = await this.getOAuthSession(userId);
    if (!session) {
      throw new Error('No OAuth session found');
    }

    if (new Date(session.token_expiry) <= new Date()) {
      console.log('🔄 Refreshing expired access token...');
      const newTokens = await this.refreshAccessToken(userId);
      return newTokens.access_token;
    }

    return session.access_token;
  }

  requireAuth() {
    return async (req, res, next) => {
      try {
        const userId = req.user?.id || req.session?.userId;
        if (!userId) {
          return res.status(401).json({ error: 'Authentication required' });
        }
        req.googleAccessToken = await this.getValidAccessToken(userId);
        req.userId = userId;
        next();
      } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(401).json({ error: 'Invalid or expired session' });
      }
    };
  }
}

const googleOAuthService = new GoogleOAuthService();
module.exports = { googleOAuthService };
