# Google OAuth Setup Guide

## Required Environment Variables

Create a `.env` file in the root directory with:

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# JWT Secret for token signing
JWT_SECRET=your_jwt_secret_key_here

# Admin emails (comma-separated, lowercase)
ADMIN_EMAILS=admin@example.com,anotheradmin@example.com

# Database
DATABASE_URL=postgresql://username:password@localhost:5432/health_app

# Demo user for testing
DEMO_USER_ID=1
DEMO_EMAIL=demo@example.com

# Server configuration
PORT=5000
NODE_ENV=development
```

## Google OAuth Setup Steps

### 1. Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API

### 2. Create OAuth 2.0 Credentials
1. Go to "APIs & Credentials" → "Credentials"
2. Click "Create Credentials" → "OAuth 2.0 Client IDs"
3. Configure OAuth consent screen if prompted
4. Choose "Web application"
5. Add authorized origins:
   - `http://localhost:5000` (for development)
   - Your production domain (e.g., `https://yourapp.com`)
6. Add redirect URIs:
   - `http://localhost:5000/auth/google/callback` (for development)
   - Your production callback URL

### 3. Configure Environment Variables
- Replace `your_google_client_id_here` with your actual Client ID
- Replace `your_google_client_secret_here` with your actual Client Secret
- Generate a secure `JWT_SECRET` (use `openssl rand -hex 32`)

### 4. Test Configuration
```bash
# Install dependencies
npm install

# Start server
npm run start

# Test endpoints
curl http://localhost:5000/api/auth/config
curl http://localhost:5000/api/auth/check
```

### 5. Frontend Integration
The frontend will automatically:
- Load Google Sign-In script
- Configure with your Client ID
- Handle authentication flow

## Troubleshooting

### CORS Issues
If you get CORS errors:
1. Ensure your domain is added to "Authorized JavaScript origins"
2. The server allows `google.com` domains in CORS configuration
3. Check that `credentials: true` is set in CORS options

### Token Verification Issues
1. Ensure `GOOGLE_CLIENT_ID` matches your Google Console configuration
2. Check that the token audience matches your Client ID
3. Verify JWT_SECRET is set and secure

### FedCM Errors
1. Ensure HTTPS in production (FedCM requires secure context)
2. Add all necessary Google domains to CORS origins
3. Check browser compatibility for FedCM

## Security Notes

- Never commit `.env` files to version control
- Use strong, unique JWT secrets
- Regularly rotate API keys and secrets
- Monitor authentication logs for suspicious activity
