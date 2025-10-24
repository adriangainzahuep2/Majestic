# Deployment Guide - Majestic Health Dashboard

## Prerequisites

- Node.js 18+ installed
- PostgreSQL database (local or RDS)
- Google OAuth credentials
- OpenAI API key
- AWS account (for production deployment)

## Local Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

Required environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `GOOGLE_CLIENT_ID` - From Google Cloud Console
- `OPENAI_API_KEY` - From OpenAI platform
- `JWT_SECRET` - Random secure string

### 3. Initialize Database

```bash
# Run migrations
node database/schema.js
```

### 4. Start Development Server

```bash
npm run dev
```

Server will start on http://localhost:5000

## Production Deployment

### Option 1: AWS EC2 with RDS

#### Automated Deployment Script

```bash
./deploy_aws_complete.sh
```

This script will:
1. Create EC2 instance
2. Set up RDS PostgreSQL database
3. Configure networking and security groups
4. Deploy application
5. Set up health checks
6. Configure auto-scaling

#### Manual EC2 Deployment

1. **Launch EC2 Instance**
   - AMI: Ubuntu 22.04 LTS
   - Instance type: t3.medium (minimum)
   - Security group: Allow ports 22, 80, 443, 5000

2. **SSH into Instance**
   ```bash
   ssh -i your-key.pem ubuntu@your-ec2-ip
   ```

3. **Install Node.js**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

4. **Clone and Setup Application**
   ```bash
   git clone https://github.com/your-repo/majestic.git
   cd majestic
   npm install
   cp .env.example .env
   # Edit .env with production values
   ```

5. **Set up PM2 (Process Manager)**
   ```bash
   sudo npm install -g pm2
   pm2 start server.js --name majestic-health
   pm2 startup
   pm2 save
   ```

6. **Configure Nginx (Reverse Proxy)**
   ```bash
   sudo apt-get install nginx
   sudo nano /etc/nginx/sites-available/majestic
   ```

   Nginx configuration:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

   Enable site:
   ```bash
   sudo ln -s /etc/nginx/sites-available/majestic /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

7. **Set up SSL with Let's Encrypt**
   ```bash
   sudo apt-get install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

### Option 2: Docker Deployment

#### Build Docker Image

```bash
docker build -t majestic-health .
```

#### Run Container

```bash
docker run -d \
  --name majestic-health \
  -p 5000:5000 \
  --env-file .env \
  majestic-health
```

#### Docker Compose

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - db
  
  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=health_app
      - POSTGRES_USER=majestic
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

Run with:
```bash
docker-compose up -d
```

### Option 3: Heroku Deployment

1. **Install Heroku CLI**
   ```bash
   npm install -g heroku
   ```

2. **Create Heroku App**
   ```bash
   heroku create majestic-health
   ```

3. **Add PostgreSQL**
   ```bash
   heroku addons:create heroku-postgresql:hobby-dev
   ```

4. **Set Environment Variables**
   ```bash
   heroku config:set GOOGLE_CLIENT_ID=your-client-id
   heroku config:set OPENAI_API_KEY=your-api-key
   heroku config:set JWT_SECRET=your-jwt-secret
   ```

5. **Deploy**
   ```bash
   git push heroku main
   ```

6. **Run Migrations**
   ```bash
   heroku run node database/schema.js
   ```

## Database Setup

### RDS PostgreSQL Setup

1. **Create RDS Instance**
   - Engine: PostgreSQL 15+
   - Instance class: db.t3.micro (minimum)
   - Storage: 20GB
   - Enable automatic backups
   - Public accessibility: No (use VPC)

2. **Configure Security Group**
   - Inbound rule: PostgreSQL (5432) from EC2 security group

3. **Get Connection String**
   ```
   postgresql://username:password@endpoint:5432/dbname
   ```

4. **Initialize Schema**
   ```bash
   node database/schema.js
   ```

### Database Migrations

Run schema initialization:
```bash
npm run migrate
```

## Health Checks

### Application Health
```bash
curl http://your-domain.com/health
```

### Detailed Health Check
```bash
curl http://your-domain.com/api/health
```

## Monitoring

### PM2 Monitoring

```bash
# View logs
pm2 logs majestic-health

# Monitor resources
pm2 monit

# View status
pm2 status
```

### Application Logs

Logs are written to:
- `/var/log/majestic/app.log` (if configured)
- stdout/stderr (captured by PM2)

## Backup & Recovery

### Database Backup

```bash
# Automated backup (RDS)
# Configured in RDS console

# Manual backup
pg_dump -h your-rds-endpoint -U username -d health_app > backup.sql
```

### Restore from Backup

```bash
psql -h your-rds-endpoint -U username -d health_app < backup.sql
```

### Application Backup

```bash
# Backup uploads directory
tar -czf uploads-backup.tar.gz uploads/

# Backup configuration
cp .env .env.backup
```

## Scaling

### Horizontal Scaling

1. Set up load balancer (ALB)
2. Create Auto Scaling group
3. Deploy to multiple EC2 instances
4. Use RDS read replicas for database

### Vertical Scaling

1. Increase EC2 instance size
2. Upgrade RDS instance class
3. Increase storage capacity

## Troubleshooting

### Application Won't Start

1. Check environment variables
   ```bash
   pm2 logs
   ```

2. Verify database connection
   ```bash
   psql $DATABASE_URL -c "SELECT 1"
   ```

3. Check port availability
   ```bash
   netstat -tuln | grep 5000
   ```

### High CPU Usage

1. Check PM2 metrics
   ```bash
   pm2 monit
   ```

2. Review slow queries in database
3. Enable query logging in PostgreSQL

### Database Connection Issues

1. Verify security group rules
2. Check RDS status in AWS Console
3. Test connection manually:
   ```bash
   psql $DATABASE_URL
   ```

## Security Checklist

- [ ] Environment variables properly set
- [ ] Database password is strong
- [ ] JWT secret is random and secure
- [ ] SSL/TLS enabled (HTTPS)
- [ ] Security groups properly configured
- [ ] Admin emails configured
- [ ] Rate limiting enabled
- [ ] CORS properly configured
- [ ] Regular security updates applied
- [ ] Backup strategy in place

## Post-Deployment

1. **Verify Deployment**
   ```bash
   curl https://your-domain.com/api/health
   ```

2. **Test Authentication**
   - Try Google OAuth login
   - Verify JWT token generation

3. **Upload Test File**
   - Upload a sample lab report
   - Verify processing completes

4. **Check Logs**
   ```bash
   pm2 logs majestic-health
   ```

5. **Monitor Performance**
   - Response times
   - Error rates
   - Database connections

## Maintenance

### Update Application

```bash
cd /path/to/majestic
git pull origin main
npm install
pm2 restart majestic-health
```

### Update Dependencies

```bash
npm update
npm audit fix
```

### Database Maintenance

```bash
# Vacuum database
psql $DATABASE_URL -c "VACUUM ANALYZE"

# Check database size
psql $DATABASE_URL -c "SELECT pg_size_pretty(pg_database_size('health_app'))"
```

## Support

For deployment issues:
1. Check application logs: `pm2 logs`
2. Check system logs: `journalctl -u nginx`
3. Review AWS CloudWatch (if using AWS)
4. Contact development team

---

**Last Updated**: October 2025  
**Version**: 2.0.0
