# Majestic - AI-Driven Health App MVP

## Overview

Majestic is an AI-driven health application MVP that helps users track their health across 13 body systems using AI-powered insights. The system processes lab reports through OCR, provides personalized daily health plans, and presents health data through an intuitive dashboard interface with a modern Apple Health + Calm aesthetic.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Backend Architecture
The application uses a **Node.js/Express** backend with a **modular API design**:
- **RESTful API structure** with route-based organization (`/api/auth`, `/api/uploads`, `/api/metrics`, `/api/dashboard`)
- **PostgreSQL database** for persistent data storage
- **Bull/Redis queue system** for asynchronous processing of uploads and AI tasks
- **JWT-based authentication** with Google OAuth integration
- **Middleware-based request handling** for authentication and CORS

### Frontend Architecture
The frontend is a **vanilla JavaScript SPA** served as static files:
- **Bootstrap 5** for responsive UI components
- **Plotly.js** for data visualization and trend charts
- **Client-side routing** through tabs and dynamic content loading
- **Token-based authentication** with localStorage persistence

### AI Integration
**OpenAI GPT-4o** powers the core AI functionality:
- **PDF and Image processing** for lab report extraction using Chat Completions API
- **Files API integration** for PDF document processing
- **Health metric parsing** and categorization across 13 body systems
- **Daily plan generation** with personalized health recommendations
- **Structured JSON outputs** for consistent data handling

### Recent Changes (August 1, 2025)
- **✓ PHASE 1 UNIFIED INGESTION PIPELINE** - Complete implementation of visual studies processing alongside lab reports
- **✓ New imaging_studies database table** - Stores visual studies with AI analysis, metrics, and comparison data
- **✓ Unified file classification** - AI automatically detects lab, visual, or mixed file types
- **✓ Visual study processing** - Extracts metrics and findings from X-rays, MRIs, CT scans, eye studies using GPT-4o
- **✓ Thumbnail generation** - Sharp library integration for image thumbnails and PDF placeholders
- **✓ Study comparison system** - AI-powered trend analysis comparing current vs previous studies
- **✓ System integration** - Visual studies automatically linked to appropriate body systems (1-13)
- **✓ New API endpoints** - `/api/ingestFile` and `/api/imaging-studies` for unified pipeline access
- **✓ Enhanced system drill-down** - Studies & Imaging section added to system detail modals
- **✓ DICOM support** - Phase 1 stores DICOM files without processing (future phases will add analysis)
- **✓ Multi-page/multi-image support** - Processes complex documents with multiple images
- **✓ Frontend pipeline UI** - Drag-and-drop interface with real-time progress and detailed result feedback
- **✓ Text-based custom metric names feature** - Implemented inline custom metric type creation during edit flow
- **✓ Enhanced metric validation** - Three-tier validation (official → approved custom → user pending) for metric names
- **✓ New API endpoint** - `GET /metrics/types?systemId=X` provides merged dropdown data for official and custom metrics
- **✓ Inline custom metric modal** - Create new metric types directly within edit flow with proper UI contrast fixes
- **✓ Admin review workflow** - CSV export/import system for approving user-created custom metric types
- **✓ Removed standalone Add Metric** - Users can only create custom metrics through edit flow, preventing duplicate entries
- **✓ Database integrity preserved** - No schema changes, text-based approach maintains backward compatibility
- **✓ User permission system** - Custom metrics visible to creator until admin approval makes them globally available
- **✓ Fixed Range Analysis column** - Now prioritizes custom reference_range from database over metricUtils fallback data
- **✓ Added "Angstrom" unit support** - Extended frontend dropdowns and database constraints to include Angstrom unit for specialized metrics

### Previous Changes (July 30, 2025)
- **✓ Enhanced AI insights system** - Updated OpenAI prompts with structured medical analysis format for better clinical assessments
- **✓ Fixed database schema** - Added missing 'updated_at' column to ai_outputs_log table for proper cache management
- **✓ Improved drill-down UX** - Fixed multiple spinner stacking and "Needs Review" badge clearing after edits
- **✓ Complete inline editing** - Real-time table updates with proper date handling and immediate UI feedback
- **✓ Cost-optimized AI insights refresh** - Smart recomputation system triggers GPT calls only when necessary (key metrics vs non-key)
- **✓ Batched processing** - 60-second batching window prevents excessive API calls from rapid edits
- **✓ Asynchronous refresh system** - "Refreshing insights..." indicators with automatic panel updates
- **✓ Enhanced drill-down interface** - Full-width modals with two-column layout and inline metric editing
- **✓ Updated clinical metrics database** - Processed v4 Excel file with 126 clinical metrics across 12 body systems
- **✓ Public API endpoint** - `/api/metrics/reference` serves clinical reference data without authentication
- **✓ Comprehensive system coverage** - Cardiovascular (29), Urinary/Renal (14), Endocrine/Hormonal (13), and 9 other systems

### Previous Changes (July 29, 2025)
- **✓ Fixed all contrast issues** - White text clearly visible in dark mode, proper navbar contrast
- **✓ Updated branding to "Majestic"** - Replaced "Health" with "Majestic" throughout the app
- **✓ New minimalist "Rising Sun over Horizon" icon** - Clean circle above horizontal line with warm orange/gold gradients
- **✓ Navbar contrast fixes** - Dark text on light background, white text on dark background
- **✓ AI icon alignment fixed** - Centered "AI" text in orange circle using absolute positioning
- **✓ Premium icon design** - Modern, flat, Apple Health + Calm aesthetic with soft gradients

### Previous Changes (July 28, 2025)
- **✓ Fixed Redis connection issues** with graceful fallback to direct processing
- **✓ Implemented PDF support** using OpenAI Files API and Chat Completions
- **✓ Added immediate upload processing** when queue service unavailable
- **✓ Successfully tested** lab report extraction (20 metrics from PDF)
- **✓ Database schema initialization** working properly

## Key Components

### Health Systems Framework
The application organizes health data into **13 body systems**:
1. Cardiovascular
2. Nervous/Brain
3. Respiratory
4. Muscular
5. Skeletal
6. Digestive
7. Endocrine
8. Urinary
9. Reproductive
10. Integumentary
11. Immune/Inflammation
12. Sensory
13. Biological Age

Each system has:
- **Key metrics** that determine dashboard tile colors (Green/Yellow/Red/Gray)
- **Recency thresholds** for data freshness evaluation
- **Automatic metric categorization** based on lab report content

### Core Services

**Authentication Service** (`services/auth.js`):
- Google OAuth integration using `google-auth-library`
- JWT token generation and verification
- User profile management with PostgreSQL storage

**Health Systems Service** (`services/healthSystems.js`):
- Dashboard tile color logic based on metric values and recency
- Metric-to-system mapping and categorization
- Key metric identification for prioritized health insights

**OpenAI Service** (`services/openai.js`):
- Lab report OCR processing with structured JSON extraction
- Daily health plan generation with system-specific recommendations
- Error handling and retry logic for API reliability

**Queue Service** (`services/queue.js`):
- Bull/Redis-based background job processing
- File upload processing pipeline
- Scheduled daily plan generation
- Scalable worker configuration

### Database Schema
**PostgreSQL tables** for structured data storage:
- `users` - User profiles and authentication data
- `health_systems` - System definitions and metadata
- `metrics` - Individual health measurements with system associations
- `uploads` - File processing tracking and metadata
- `ai_outputs_log` - AI response logging for debugging and audit
- `imaging_studies` - Visual studies with AI analysis, metrics, and comparison data (Phase 1)

## Data Flow

### Upload Processing Pipeline
1. **File Upload** → Multer middleware validates and stores files
2. **Queue Job** → Bull queue schedules background processing
3. **AI Processing** → OpenAI Vision API extracts metrics from images
4. **Data Storage** → Parsed metrics saved to PostgreSQL with system associations
5. **Dashboard Update** → Real-time dashboard refresh with new data

### Dashboard Generation
1. **System Analysis** → Health Systems Service evaluates metrics per system
2. **Tile Color Logic** → Green (good)/Yellow (attention)/Red (concern)/Gray (no data)
3. **Recency Check** → Data freshness evaluation against system-specific thresholds
4. **Aggregation** → Summary statistics and trend calculations
5. **Client Response** → Structured JSON with dashboard state

### Daily Plan Generation
1. **Scheduled Trigger** → Bull queue runs daily plan job
2. **Data Aggregation** → Collect recent metrics across all systems
3. **AI Analysis** → GPT-4o generates personalized recommendations
4. **Structured Output** → JSON format with system-specific actions
5. **Storage** → Plan saved to database for retrieval

## External Dependencies

### Required Services
- **OpenAI API** - GPT-4o for AI processing (requires `OPENAI_API_KEY`)
- **Google OAuth** - Authentication service (requires `GOOGLE_CLIENT_ID`)
- **PostgreSQL** - Primary database (`DATABASE_URL`)
- **Redis** - Queue backend (`REDIS_URL`, optional with local fallback)

### Node.js Dependencies
- **Express 5.1.0** - Web framework
- **Bull 4.16.5** - Job queue management
- **OpenAI 5.10.2** - AI API client
- **PostgreSQL (pg) 8.16.3** - Database driver
- **Google Auth Library 10.2.0** - OAuth integration
- **Multer 2.0.2** - File upload handling
- **JWT 9.0.2** - Token authentication
- **CORS 2.8.5** - Cross-origin request handling

## Deployment Strategy

### Environment Configuration
The application expects these environment variables:
- `PORT` - Server port (defaults to 8000)
- `DATABASE_URL` - PostgreSQL connection string
- `OPENAI_API_KEY` - OpenAI API access key
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `JWT_SECRET` - JWT signing secret
- `REDIS_URL` - Redis connection (optional)
- `NODE_ENV` - Environment mode (affects SSL settings)

### Production Considerations
- **SSL/TLS** enabled automatically in production mode
- **File upload limits** set to 10MB with 5 files per request
- **Rate limiting** implemented for upload endpoints (5 uploads per hour per user)
- **Error logging** throughout the application for debugging
- **Database connection pooling** for scalability
- **Static file serving** through Express for single-server deployment

### Scaling Strategy
The modular architecture supports horizontal scaling:
- **Stateless API design** allows multiple server instances
- **Queue-based processing** enables worker scaling
- **Database pooling** handles concurrent connections
- **CDN-ready static assets** for frontend distribution