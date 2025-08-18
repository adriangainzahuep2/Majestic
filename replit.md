# Majestic - AI-Driven Health App MVP

## Overview
Majestic is an AI-driven health application MVP that helps users track their health across 13 body systems using unified AI analysis of lab reports and visual studies (X-rays, MRIs, CT scans, eye studies). It provides personalized daily health plans and presents comprehensive health data through an intuitive dashboard with a modern Apple Health + Calm aesthetic. The application aims to offer deep, actionable health insights, helping users understand and manage their well-being proactively.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Design Principles
Majestic employs a modular, API-driven architecture designed for scalability and maintainability. The system supports a unified ingestion pipeline for various health data types, AI-powered health insights, and a responsive user interface.

### Backend Architecture
The backend is built with **Node.js/Express**, featuring a **RESTful API structure** and **PostgreSQL** for data persistence. **Bull/Redis** manages asynchronous processing for uploads and AI tasks. **JWT-based authentication** is integrated with **Google OAuth**. Middleware handles authentication and CORS.

### Frontend Architecture
The frontend is a **vanilla JavaScript SPA** leveraging **Bootstrap 5** for responsive UI and **Plotly.js** for data visualization. Client-side routing provides a smooth user experience.

### AI Integration
**OpenAI GPT-4o** is central to the AI functionality, processing PDFs and images for lab report extraction, generating daily personalized health plans, and categorizing health metrics across 13 body systems. It produces structured JSON outputs for consistent data handling. The AI also integrates visual study data with lab metrics for comprehensive system-level analysis.

### Data Organization
Health data is organized across **13 body systems**: Cardiovascular, Nervous/Brain, Respiratory, Muscular, Skeletal, Digestive, Endocrine, Urinary, Reproductive, Integumentary, Immune/Inflammation, Sensory, and Biological Age. Each system features key metrics for dashboard visualization, recency thresholds, and automatic metric categorization.

### Key Features
- **Unified Ingestion Pipeline**: Processes both lab reports and visual studies, classifying file types and extracting relevant metrics using AI. Includes thumbnail generation and AI-powered study comparison.
- **Personalized Daily Plans**: AI-generated health recommendations based on aggregated user metrics.
- **Dashboard Visualization**: Intuitive dashboard presenting health data with color-coded system tiles (Green/Yellow/Red/Gray) based on key metric analysis and data recency.
- **Inline Editing & Custom Metrics**: Users can edit metrics and create custom metric types within the application, with an admin review workflow for broader availability.
- **Robust Authentication**: Secure user login via Google OAuth and JWT.
- **Asynchronous Processing**: Utilizes a job queue for background tasks, ensuring responsive user experience.
- **Cost-Optimized AI**: Smart recomputation system triggers AI calls only when necessary, with batching to prevent excessive API calls.
- **UI/UX**: Features a high-contrast, modern design with a minimalist aesthetic, consistent branding ("Majestic"), and a "Rising Sun over Horizon" icon.

## Database Architecture

### Migration System
The application now uses **Drizzle ORM** for robust database migration handling:
- **Schema Definition**: `database/drizzle-schema.js` - Type-safe schema definitions
- **Migrations**: Auto-generated SQL migrations in `database/migrations/`
- **Production Reset**: One-time reset script for clean Drizzle tracking setup
- **Deployment Safe**: Detects existing tables and preserves data during deployments
- **Column-Level Tracking**: Full schema change tracking at the column level
- **Version Tracking**: Proper migration history with rollback capabilities

### Legacy Compatibility
- Maintains backward compatibility with existing PostgreSQL queries
- Both `req.db` (raw pool) and `req.drizzle` (ORM) available in routes
- Gradual migration path from raw SQL to Drizzle ORM

## External Dependencies

### Required Services
- **OpenAI API**: Core AI processing via GPT-4o.
- **Google OAuth**: User authentication.
- **PostgreSQL**: Primary database for all application data.
- **Redis**: Queue backend for asynchronous job processing (optional, with local fallback).

### Node.js Libraries
- **Express**: Web framework.
- **Bull**: Job queue management.
- **OpenAI**: Client for OpenAI API.
- **pg**: PostgreSQL database driver.
- **Drizzle ORM**: Type-safe database toolkit with migrations.
- **google-auth-library**: Google OAuth integration.
- **Multer**: File upload handling.
- **jsonwebtoken**: JWT token authentication.
- **cors**: Cross-origin resource sharing.