# Majestic - AI-Driven Health App MVP

## Overview
Majestic is an AI-driven health application MVP that helps users track their health across 13 body systems using unified AI analysis. It processes lab reports and visual studies (X-rays, MRIs, CT scans, eye studies), provides personalized daily health plans, and presents comprehensive health data through an intuitive dashboard interface with an Apple Health + Calm aesthetic. The application is deployment-ready, focusing on delivering personalized health insights and proactive health management.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Backend Architecture
The application uses a **Node.js/Express** backend with a **modular API design**. It features a **RESTful API structure**, a **PostgreSQL database** for persistent data, and a **Bull/Redis queue system** for asynchronous processing of uploads and AI tasks. **JWT-based authentication** with Google OAuth is integrated, and request handling uses a **middleware-based approach** for authentication and CORS.

### Frontend Architecture
The frontend is a **vanilla JavaScript SPA** served as static files. It utilizes **Bootstrap 5** for responsive UI components, **Plotly.js** for data visualization, and employs **client-side routing** via tabs and dynamic content loading. **Token-based authentication** persists through localStorage. The UI/UX design is characterized by a modern, flat, Apple Health + Calm aesthetic with soft gradients, ensuring high contrast and clear visibility.

### AI Integration
**OpenAI GPT-4o** powers the core AI functionality. This includes **PDF and Image processing** for extracting information from lab reports and visual studies using the Chat Completions API and Files API. The AI performs **health metric parsing** and categorization across 13 body systems, **daily plan generation** with personalized recommendations, and outputs **structured JSON** for consistent data handling.

### Core System Features
Majestic organizes health data into **13 body systems** (e.g., Cardiovascular, Nervous/Brain, Respiratory) each with key metrics, recency thresholds, and automatic metric categorization. The application includes a **unified ingestion pipeline** for both lab reports and visual studies, supporting various study types and generating thumbnails. It also features **inline custom metric creation**, an **admin review workflow** for user-created metrics, and **cost-optimized AI insights refresh** with smart recomputation and batched processing. The system provides a comprehensive dashboard with dynamic tile coloring (Green/Yellow/Red/Gray) based on health data, and detailed drill-down views with inline editing capabilities.

## External Dependencies

### Required Services
- **OpenAI API**: For AI processing (GPT-4o).
- **Google OAuth**: For user authentication.
- **PostgreSQL**: Primary relational database.
- **Redis**: Queue backend (optional, with local fallback).

### Node.js Dependencies
- **Express**: Web application framework.
- **Bull**: Job queue management.
- **OpenAI**: AI API client.
- **pg (PostgreSQL)**: Database driver.
- **google-auth-library**: Google OAuth integration.
- **Multer**: File upload handling.
- **jsonwebtoken**: JWT token authentication.
- **cors**: Cross-origin resource sharing middleware.