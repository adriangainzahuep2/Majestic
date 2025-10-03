const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const authService = require('../services/auth');
const authMiddleware = require('../middleware/auth'); // Added missing import

const router = express.Router();

// Initialize Google OAuth client
const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID || 'your-google-client-id',
  process.env.GOOGLE_CLIENT_SECRET || undefined
);

// Google OAuth login
router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Debug logging
    console.log('[AUTH] Google OAuth attempt from origin:', req.headers.origin);
    console.log('[AUTH] Google Client ID configured:', !!process.env.GOOGLE_CLIENT_ID);
    console.log('[AUTH] Token length:', token.length);

    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const googleUserData = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture
    };

    // Find or create user
    const user = await authService.findOrCreateUser(googleUserData);

    // Generate JWT token
    const authToken = authService.generateToken(user);

    res.json({
      success: true,
      token: authToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url
      }
    });

  } catch (error) {
    console.error('Google auth error:', error);
    res.status(401).json({ 
      error: 'Authentication failed',
      message: error.message 
    });
  }
});

// Google OAuth code exchange
router.post('/google-code', async (req, res) => {
  console.log('[AUTH] Google OAuth code exchange request');
  
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code required' });
    }
    
    // Construct redirect_uri to match what frontend uses
    // Use x-forwarded-proto and x-forwarded-host if behind proxy (Replit case)
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const redirectUri = `${protocol}://${host}/api/auth/google/callback`;
    
    console.log('[AUTH] Using redirect_uri:', redirectUri);
    
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });
    
    const tokenData = await tokenResponse.json();
    
    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', tokenData);
      return res.status(400).json({ error: 'Token exchange failed', details: tokenData });
    }
    
    // Get user info from Google
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });
    
    const googleUser = await userResponse.json();
    
    if (!userResponse.ok) {
      console.error('User info fetch failed:', googleUser);
      return res.status(400).json({ error: 'Failed to get user info' });
    }
    
    // Find or create user in database
    const user = await authService.findOrCreateUser({
      id: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      avatar_url: googleUser.picture
    });
    
    // Generate JWT token
    const authToken = authService.generateToken(user);
    
    console.log(`[AUTH] OAuth successful for user: ${user.email}`);
    
    res.json({
      token: authToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url
      }
    });

  } catch (error) {
    console.error('Google OAuth code exchange error:', error);
    res.status(401).json({ 
      error: 'Authentication failed',
      message: error.message 
    });
  }
});

// Demo login (for testing without Google OAuth)
router.post('/demo', async (req, res) => {
  try {
    const demoUserIdEnv = process.env.DEMO_USER_ID;
    const demoEmailEnv = process.env.DEMO_EMAIL;
    const fallbackEmail = 'demo@example.com';
    const displayName = 'Demo User';
    const defaultAvatar = 'https://i.pravatar.cc/150?u=demo@example.com';

    let userRow = null;

    // 1) Prefer explicit numeric DEMO_USER_ID if provided
    if (demoUserIdEnv && /^\d+$/.test(demoUserIdEnv)) {
      const byId = await req.db.query('SELECT * FROM users WHERE id = $1', [parseInt(demoUserIdEnv, 10)]);
      if (byId.rows.length > 0) {
        userRow = byId.rows[0];
      }
    }

    // 2) Else try DEMO_EMAIL if provided
    if (!userRow && demoEmailEnv) {
      const byEmail = await req.db.query('SELECT * FROM users WHERE email = $1', [demoEmailEnv]);
      if (byEmail.rows.length > 0) {
        userRow = byEmail.rows[0];
      }
    }

    // 3) Else try fallback email commonly used
    if (!userRow) {
      const byEmail = await req.db.query('SELECT * FROM users WHERE email = $1', [fallbackEmail]);
      if (byEmail.rows.length > 0) {
        userRow = byEmail.rows[0];
      }
    }

    // 4) If still not found, create or upsert a demo user (without data)
    if (!userRow) {
      const inserted = await req.db.query(
        `INSERT INTO users (google_id, email, name, avatar_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url
         RETURNING *`,
        ['DEMO', demoEmailEnv || fallbackEmail, displayName, defaultAvatar]
      );
      userRow = inserted.rows[0];
    }

    const authToken = authService.generateToken({
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      is_demo: true,
    });

    res.json({
      success: true,
      token: authToken,
      user: {
        id: userRow.id,
        email: userRow.email,
        name: userRow.name,
        avatar_url: userRow.avatar_url || defaultAvatar,
      }
    });
  } catch (error) {
    console.error('Demo login error (DB unavailable), falling back to token-only demo:', error.message);
    // Fallback: allow demo login even without DB connection
    const demoEmailEnv = process.env.DEMO_EMAIL;
    const fallbackEmail = 'demo@example.com';
    const displayName = 'Demo User';
    const defaultAvatar = 'https://i.pravatar.cc/150?u=demo@example.com';

    try {
      const authToken = authService.generateToken({
        id: 'DEMO',
        email: demoEmailEnv || fallbackEmail,
        name: displayName,
        is_demo: true,
      });

      return res.json({
        success: true,
        token: authToken,
        user: {
          id: 'DEMO',
          email: demoEmailEnv || fallbackEmail,
          name: displayName,
          avatar_url: defaultAvatar,
        }
      });
    } catch (e) {
      return res.status(500).json({ 
        error: 'Demo login failed',
        message: e.message 
      });
    }
  }
});

// Get current user profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Always load from DB so demo users get real DB-backed data
    const user = await authService.getUserById(req.user.userId);
    if (!user && req.user.is_demo) {
      // Fallback synthetic profile for demo if DB has no row
      return res.json({ user: {
        id: 'DEMO',
        email: process.env.DEMO_EMAIL || 'demo@example.com',
        name: 'Demo User',
        avatar_url: 'https://i.pravatar.cc/150?u=demo@example.com'
      }});
    }
    return res.json({ user });
  } catch (error) {
    console.error('Get user profile error:', error);
    // Fallback synthetic profile for demo when DB is unavailable
    if (req.user?.is_demo) {
      return res.json({ user: {
        id: 'DEMO',
        email: process.env.DEMO_EMAIL || 'demo@example.com',
        name: 'Demo User',
        avatar_url: 'https://i.pravatar.cc/150?u=demo@example.com'
      }});
    }
    return res.status(404).json({ error: 'User not found' });
  }
});

// Update user profile
router.put('/profile', async (req, res) => {
  try {
    const updates = req.body;
    const user = await authService.updateUserProfile(req.user.userId, updates);
    res.json({ user });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(400).json({ 
      error: 'Failed to update profile',
      message: error.message 
    });
  }
});

// Delete user account
router.delete('/account', async (req, res) => {
  try {
    await authService.deleteUser(req.user.userId);
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ 
      error: 'Failed to delete account',
      message: error.message 
    });
  }
});

// Get auth configuration (Google Client ID for frontend)
router.get('/config', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    hasGoogleAuth: !!process.env.GOOGLE_CLIENT_ID
  });
});

// Auth status endpoint for debugging
router.get('/check', (req, res) => {
  res.json({
    status: 'ok',
    googleClientId: process.env.GOOGLE_CLIENT_ID ? 'configured' : 'not configured',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// FedCM test endpoint
router.get('/fedcm-test', (req, res) => {
  res.json({
    status: 'fedcm_test',
    message: 'FedCM test endpoint',
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    timestamp: new Date().toISOString()
  });
});

// Logout (client-side token removal)
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  
  console.log('[AUTH] Google callback received with code:', code ? 'YES' : 'NO');
  console.log('[AUTH] State parameter:', state);
  
  if (!code) {
    console.error('[AUTH] No code received in callback');
    return res.redirect('/?error=no_code');
  }
  
  try {
    // Extract redirect_uri from state parameter (passed from frontend)
    let redirectUri;
    if (state && state.includes('|')) {
      const [, encodedUri] = state.split('|');
      try {
        redirectUri = Buffer.from(encodedUri, 'base64').toString('utf-8');
        console.log('[AUTH] Using redirect_uri from state:', redirectUri);
      } catch (e) {
        console.error('[AUTH] Failed to decode redirect_uri from state:', e);
      }
    }
    
    // Fallback: construct from request
    if (!redirectUri) {
      const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const host = req.get('host');
      redirectUri = `${protocol}://${host}/api/auth/google/callback`;
      console.log('[AUTH] Fallback redirect_uri constructed:', redirectUri);
    }
    
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });
    
    const tokenData = await tokenResponse.json();
    
    if (!tokenResponse.ok) {
      console.error('[AUTH] Token exchange failed:', tokenData);
      return res.redirect('/?error=token_exchange_failed');
    }
    
    // Get user info from Google
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });
    
    const googleUser = await userResponse.json();
    
    if (!userResponse.ok) {
      console.error('[AUTH] Failed to get user info:', googleUser);
      return res.redirect('/?error=user_info_failed');
    }
    
    // Find or create user
    const googleUserData = {
      id: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture
    };
    
    const user = await authService.findOrCreateUser(googleUserData);
    
    // Generate JWT token
    const authToken = authService.generateToken(user);
    
    console.log(`[AUTH] OAuth successful for user: ${user.email}`);
    
    // Serve HTML that saves token and redirects
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Signing in…</title>
<style>
  body { margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui, -apple-system, sans-serif; background: #f5f5f5; }
  .loader { text-align: center; }
  .spinner { border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 20px; }
  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
</style>
</head><body>
<div class="loader">
  <div class="spinner"></div>
  <p>Signing in...</p>
</div>
<script>
  localStorage.setItem('authToken', '${authToken}');
  localStorage.setItem('jwtToken', '${authToken}');
  // Small delay to ensure token is saved
  setTimeout(() => window.location.replace('/'), 100);
</script>
</body></html>`);
    
  } catch (error) {
    console.error('[AUTH] OAuth callback error:', error);
    return res.redirect('/?error=oauth_failed');
  }
});

module.exports = router;
