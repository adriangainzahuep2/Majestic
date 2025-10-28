// AI Health Dashboard Frontend Application
class HealthDashboard {
    constructor() {
        // Resolve API base via helper for each environment
        this.apiBase = this.getApiBaseUrl();
        this.jwtToken = null;
        this.token = null; // legacy compatibility
        this.userProfile = null;
        this.googleClientId = null;

        this.systemsData = new Map();
        this.isRefreshingInsights = false;
        this.insightsPollingInterval = null;
        this.currentProfile = null; // holds last loaded normalized profile
        this.trendsChartManager = null; // Will be initialized when needed

        this.init();
    }

    // Frontend logging helper for structured, privacy-safe logs
    logClient(event, data = {}, level = 'INFO') {
        const logEntry = {
            ts: new Date().toISOString(),
            level,
            event,
            ...data
        };
        console.log('[client]', JSON.stringify(logEntry));
    }

    // Generate correlation ID for request tracing
    generateCorrelationId() {
        return crypto.randomUUID?.() || `cli-${Math.random().toString(36).slice(2, 10)}`;
    }

    // Create privacy-safe summary of profile data for logging
    createClientProfileSummary(profileData) {
        const summary = {};

        if (profileData) {
            // Count changed fields
            summary.field_count = Object.keys(profileData).length;

            // Boolean flags for presence of key data (safe to log)
            summary.has_height = profileData.height_in !== null && profileData.height_in !== undefined;
            summary.has_weight = profileData.weight_lb !== null && profileData.weight_lb !== undefined;
            summary.has_dob = !!profileData.date_of_birth;
            summary.has_sex = !!profileData.sex;
            summary.has_ethnicity = !!profileData.ethnicity;
            summary.has_country = !!profileData.country_of_residence;
            summary.unit_system = profileData.preferred_unit_system || null;

            // Lifestyle flags (safe to log as they're not directly identifiable)
            summary.smoker = profileData.smoker;
            summary.pregnant = profileData.pregnant;
            summary.has_alcohol_data = profileData.alcohol_drinks_per_week !== null && profileData.alcohol_drinks_per_week !== undefined;

            // Count arrays without exposing content
            summary.allergies_count = Array.isArray(profileData.allergies) ? profileData.allergies.length : 0;
            summary.chronic_conditions_count = Array.isArray(profileData.chronicConditions) ? profileData.chronicConditions.length : 0;
        }

        return summary;
    }

    // Helper function to determine error kind for logging
    getErrorKind(error) {
        if (!error.status) return 'network';
        if (error.status >= 400 && error.status < 500) return '4xx';
        if (error.status >= 500) return '5xx';
        return 'unknown';
    }

    async init() {
        console.log('[INIT] Initializing Health Dashboard application...');

        // Setup UI event listeners
        this.setupEventListeners();

        if (this.token) {
            console.log('[INIT] Found token, attempting to load user profile...');
            try {
                await this.loadUserProfile();
                await this.showApp();
            } catch (error) {
                console.error('Failed to load user profile on init:', error);
                localStorage.removeItem('jwtToken');
                localStorage.removeItem('authToken');
                this.jwtToken = null;
                this.token = null;
                this.showLogin();
            }
        } else {
            this.showLogin();
        }
    }

    setupEventListeners() {
        // Auth buttons
        document.getElementById('demoLoginBtn').addEventListener('click', () => this.demoLogin());
        document.getElementById('googleLoginBtn').addEventListener('click', () => this.googleLogin());
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());

        // Profile navigation
        document.getElementById('profileLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.showProfile();
        });
        document.getElementById('backToApp').addEventListener('click', () => this.showApp());
        document.getElementById('cancelProfile').addEventListener('click', () => this.showApp());

        // Tab navigation
        document.getElementById('dashboard-tab').addEventListener('click', () => this.loadDashboard());
        document.getElementById('daily-plan-tab').addEventListener('click', () => this.loadDailyPlan());
        document.getElementById('uploads-tab').addEventListener('click', () => this.loadUploads());


        // Dashboard actions
        document.getElementById('refreshDashboard').addEventListener('click', () => this.loadDashboard());
        document.getElementById('regeneratePlan').addEventListener('click', () => this.regenerateDailyPlan());

        // Phase 1 Unified Ingestion Pipeline
        document.getElementById('fileUpload').addEventListener('change', (e) => this.handleFileSelect(e));
        document.getElementById('uploadBtn').addEventListener('click', () => this.uploadFilesToUnifiedPipeline());
        document.getElementById('chooseFilesBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('fileUpload').click();
        });

        // Profile form
        document.getElementById('profileForm').addEventListener('submit', (e) => this.saveProfile(e));

        // Profile field interactions
        document.getElementById('dateOfBirth').addEventListener('change', this.calculateAge);
        document.getElementById('heightFeet').addEventListener('input', this.convertHeight);
        document.getElementById('heightInches').addEventListener('input', this.convertHeight);
        document.getElementById('heightCm').addEventListener('input', this.convertHeight);
        document.getElementById('weightLbs').addEventListener('input', this.convertWeight);
        document.getElementById('weightKg').addEventListener('input', this.convertWeight);
        document.getElementById('sex').addEventListener('change', this.toggleReproductiveSection);
        document.getElementById('smoker').addEventListener('change', this.toggleSmokingFields);
        document.getElementById('pregnant').addEventListener('change', this.togglePregnancyFields);
        document.getElementById('pregnancyStartDate').addEventListener('change', this.calculateTrimester);

        // Setup drag and drop
        this.setupDragAndDrop();
    }

    // Authentication Methods
    async demoLogin() {
        console.log('Attempting demo login...');
        this.showLoading('Logging in as Demo User...');
        try {
            const response = await fetch(`${this.apiBase}/auth/demo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const data = await response.json();

            if (data.success) {
                this.token = data.token;
                this.user = data.user;
                localStorage.setItem('authToken', this.token);
                this.showApp();
                this.showToast('success', 'Welcome!', 'Successfully logged in with demo account');
                // Optionally trigger background checks
                this.checkPendingMetricSuggestions().catch(()=>{});
            } else {
                throw new Error(response.message || 'Login failed');
            }
        } catch (error) {
            console.error('Demo login error:', error);
            this.showToast('error', 'Demo Login Failed', error.message || 'Could not sign in as demo');
        } finally {
            this.showLoading(false);
        }
    }

    async googleLogin() {
        console.log('[DEBUG] googleLogin() called');
        console.log('[DEBUG] googleClientId:', this.googleClientId ? 'SET' : 'NOT SET');
        
        if (!this.googleClientId) {
            console.log('[DEBUG] No Google Client ID, showing error');
            this.showToast('error', 'Configuration Error', 'Google OAuth not configured. Please contact support.');
            return;
        }

        try {
            // Get Google Client ID from backend
            const configResponse = await fetch(`${this.apiBase}/auth/config`);
            const config = await configResponse.json();

            if (!config.googleClientId) {
                this.showToast('error', 'Configuration Error', 'Google OAuth not configured. Please contact support.');
                return;
            }

            console.log('[DEBUG] Triggering Google Sign-In popup...');
            // Use simple OAuth2 flow instead of GSI
            this.openGoogleOAuth(this.googleClientId);
        } catch (error) {
            console.error('Google Sign-In prompt error:', error);
            this.showToast('error', 'Google Auth Error', 'Google Sign-In prompt blocked. Please allow popups for this site.');
        }
    }

    async initializeGoogleSignIn(config) {
        if (!config || !config.hasGoogleAuth) {
            const googleLoginBtn = document.getElementById('googleLoginBtn');
            if (googleLoginBtn) googleLoginBtn.style.display = 'none';
            return;
        }

        // Wait for the GSI library to be loaded
        if (typeof window.google === 'undefined' || typeof window.google.accounts === 'undefined') {
            await new Promise(resolve => {
                const interval = setInterval(() => {
                    if (typeof window.google !== 'undefined' && typeof window.google.accounts !== 'undefined') {
                        clearInterval(interval);
                        resolve();
                    }
                }, 100);
            });
        }
        
        // Initialize Google Sign-In
        window.google.accounts.id.initialize({
            client_id: config.googleClientId,
            callback: this.handleGoogleSignIn.bind(this),
            use_fedcm_for_prompt: false
        });

        // Prompt the user to sign in
        // google.accounts.id.prompt(); 
    }

    showGoogleSignInPopup(clientId) {
        try {
            window.google.accounts.id.initialize({
                client_id: clientId,
                callback: this.handleGoogleSignIn.bind(this),
                use_fedcm_for_prompt: false,
            });

            // Create a temporary button and click it to trigger popup
            const tempDiv = document.createElement('div');
            tempDiv.style.display = 'none';
            document.body.appendChild(tempDiv);

            window.google.accounts.id.renderButton(tempDiv, {
                theme: 'outline',
                size: 'large',
                type: 'standard'
            });

            // Auto-click the button
            setTimeout(() => {
                const button = tempDiv.querySelector('div[role="button"]');
                if (button) {
                    button.click();
                } else {
                    this.showToast('error', 'Google OAuth Error', 'Unable to create Google Sign-In popup. Please check domain configuration.');
                }
                document.body.removeChild(tempDiv);
            }, 100);
        } catch (error) {
            console.error('Google popup error:', error);
            this.showToast('error', 'Google OAuth Error', `Popup failed: ${error.message}`);
        }
    }
    
    openGoogleOAuth(clientId) {
        console.log('[DEBUG] openGoogleOAuth called');
        
        // Use current origin as-is (browser knows the correct URL)
        const origin = window.location.origin;
        const redirectUri = `${origin}/api/auth/google/callback`;
        
        console.log('[DEBUG] Current origin:', origin);
        console.log('[DEBUG] Using redirect_uri:', redirectUri);
        
        // Create OAuth2 authorization URL (correct endpoint)
        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', 'openid email profile');
        authUrl.searchParams.set('access_type', 'online');
        authUrl.searchParams.set('prompt', 'select_account');
        authUrl.searchParams.set('state', `google_oauth|${btoa(redirectUri)}`);
        
        console.log('[DEBUG] Redirecting to:', authUrl.toString());
        
        // Redirect to Google OAuth
        window.location.href = authUrl.toString();
    }
    
    async checkForOAuthCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        
        if (code && state === 'google_oauth') {
            console.log('[DEBUG] Found OAuth callback, processing code...');
            
            try {
                this.showLoading(true);
                
                const response = await fetch(`${this.apiBase}/auth/google-code`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ code: code })
                });
                
                const data = await response.json();
                console.log('[DEBUG] OAuth backend response:', data);
                
                if (response.ok && data.token) {
                    localStorage.removeItem('authToken');
                    localStorage.removeItem('jwtToken');
                    localStorage.setItem('authToken', data.token);
                    localStorage.setItem('jwtToken', data.token);
                    this.jwtToken = data.token;
                    this.token = data.token;
                    this.isAuthenticated = true;
                    this.currentUser = data.user;
                    
                    // Clean up URL
                    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
                    window.history.replaceState({}, '', newUrl);
                    
                    this.showToast('success', 'Welcome!', `Hello ${data.user.email}!`);
                    
                    // Load user profile and show app immediately
                    await this.loadUserProfile();
                    await this.showApp();
                    
                    return; // Exit early
                } else {
                    throw new Error(data.error || 'Authentication failed');
                }
            } catch (error) {
                console.error('OAuth callback error:', error);
                this.showToast('error', 'Authentication Error', error.message);
                
                // Clean up URL even on error
                const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
                window.history.replaceState({}, '', newUrl);
            } finally {
                this.showLoading(false);
            }
        }
    }

    async handleGoogleSignIn(response) {
        try {
            console.log('[DEBUG] handleGoogleSignIn called with:', response);
            this.showLoading(true);

            if (!response.credential) {
                console.error('[DEBUG] No credential in response:', response);
                throw new Error('No credential received from Google');
            }

            // Send the Google ID token to our backend
            console.log('[DEBUG] Sending token to backend:', `${this.apiBase}/auth/google`);
            const authResponse = await fetch(`${this.apiBase}/auth/google`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    token: response.credential
                })
            });

            console.log('[DEBUG] Backend response status:', authResponse.status);
            const data = await authResponse.json();

            if (data.success) {
                this.token = data.token;
                this.user = data.user;
                localStorage.removeItem('authToken');
                localStorage.removeItem('jwtToken');
                localStorage.setItem('authToken', this.jwtToken);
                localStorage.setItem('jwtToken', this.jwtToken);
                this.showApp();
                this.showToast('success', 'Google OAuth Success!', `Authenticated as ${this.user.name}`);
            } else {
                throw new Error(data.message || 'Backend authentication failed');
            }
        } catch (error) {
            console.error('Google sign-in error:', error);
            // Show specific error message without fallback
            if (error.message.includes('origin')) {
                this.showToast('error', 'Domain Configuration Error', 'Your Google OAuth app needs to be configured for this domain. Please update your Google Cloud Console settings.');
            } else {
                this.showToast('error', 'Google OAuth Failed', `Authentication error: ${error.message}`);
            }
        } finally {
            this.showLoading(false);
        }
    }

    logout() {
        this.token = null;
        this.user = null;
        this.dashboard = null;
        this.systemsData.clear();
        localStorage.removeItem('authToken');
        localStorage.removeItem('jwtToken');
        this.showLogin();
        this.showToast('info', 'Logged Out', 'You have been logged out successfully');
    }

    async loadUserProfile() {
        if (!this.jwtToken) return null;
        try {
            const profile = await this.apiCall('/auth/me');
            this.userProfile = profile;
            if (typeof this.updateUserUI === 'function') {
                this.updateUserUI(profile);
            }
        } catch (error) {
            console.error('Failed to load user profile:', error);
            this.showToast('error', 'Profile Load Failed', error.message);
        }
    }

    // UI State Management
    showLogin() {
        const initialLoader = document.getElementById('initialLoader');
        if (initialLoader) initialLoader.classList.add('d-none');
        
        document.getElementById('loginSection').classList.remove('d-none');
        document.getElementById('appSection').classList.add('d-none');
        document.getElementById('userSection').classList.add('d-none');
        document.getElementById('loginBtn').classList.remove('d-none');
    }

    showApp() {
        const initialLoader = document.getElementById('initialLoader');
        if (initialLoader) initialLoader.classList.add('d-none');
        
        document.getElementById('loginSection').classList.add('d-none');
        document.getElementById('appSection').classList.remove('d-none');
        document.getElementById('profileSection').classList.add('d-none');
        document.getElementById('userSection').classList.remove('d-none');
        document.getElementById('loginBtn').classList.add('d-none');

        // Update user avatar
        if (this.user) {
            this.updateUserAvatar();
        }

        this.loadDashboard();
    }

    showProfile() {
        document.getElementById('appSection').classList.add('d-none');
        document.getElementById('profileSection').classList.remove('d-none');
        this.loadProfileData();
        this.loadCountries();
        this.setupUnitSystemToggle();
    }

    updateUserAvatar() {
        const userInitials = document.getElementById('userInitials');
        if (userInitials && this.user) {
            const name = this.user.name || this.user.email;
            const initials = name.split(' ').map(part => part.charAt(0)).join('').substring(0, 2).toUpperCase();
            userInitials.textContent = initials;
        }
    }

    showLoading(show) {
        const spinner = document.getElementById('loadingSpinner');
        if (show) {
            spinner.classList.remove('d-none');
        } else {
            spinner.classList.add('d-none');
        }
    }

    // Dashboard Methods
    async loadDashboard() {
        try {
            const data = await this.apiCall('/dashboard');
            const systems = Array.isArray(data.systems) ? data.systems : (Array.isArray(data.dashboard) ? data.dashboard : []);
            this.renderDashboard(systems);
            this.systemsData = new Map(systems.map(s => [s.id, s]));
        } catch (error) {
            console.error('Failed to load dashboard:', error);
            this.showToast('error', 'Dashboard', error.message || 'Failed to load dashboard');
        }
    }

    renderDashboard(systems) {
        if (!systems) return;

        // Update summary stats
        const summary = {
            recent_metrics: systems.reduce((sum, system) => sum + system.keyMetricsCount, 0),
            systems_with_data: systems.length,
            recent_uploads: systems.reduce((sum, system) => sum + system.recentUploads, 0),
            green_systems: systems.filter(system => system.color === 'green').length,
            yellow_systems: systems.filter(system => system.color === 'yellow').length,
            red_systems: systems.filter(system => system.color === 'red').length
        };
        document.getElementById('totalMetrics').textContent = summary.recent_metrics;
        document.getElementById('systemsWithData').textContent = summary.systems_with_data;
        document.getElementById('recentUploads').textContent = summary.recent_uploads;
        document.getElementById('aiInsights').textContent = 
            summary.green_systems + summary.yellow_systems + summary.red_systems;

        // Render system tiles
        const tilesContainer = document.getElementById('systemTiles');
        tilesContainer.innerHTML = '';

        systems.forEach(system => {
            const tile = this.createSystemTile(system);
            tilesContainer.appendChild(tile);
        });
    }

    createSystemTile(system) {
        const col = document.createElement('div');
        col.className = 'col-lg-3 col-md-4 col-sm-6 mb-4';

        const statusClass = {
            'green': 'success',
            'yellow': 'warning', 
            'red': 'danger',
            'gray': 'neutral'
        }[system.color] || 'neutral';

        const gradientClass = {
            'green': 'var(--gradient-green)',
            'yellow': 'var(--gradient-yellow)',
            'red': 'var(--gradient-pink)',
            'gray': 'var(--gradient-purple)'
        }[system.color] || 'var(--gradient-purple)';

        col.innerHTML = `
            <div class="system-tile status-${statusClass}" data-system-id="${system.id}" style="background: ${gradientClass}; color: ${system.color === 'yellow' ? '#1D1D1F' : 'white'};">
                <div class="d-flex justify-content-between align-items-start mb-3">
                    <div class="system-title" style="font-weight: 600; font-size: 16px;">${system.name}</div>
                    <div class="system-status">
                        <i class="fas fa-circle" style="font-size: 8px; opacity: 0.8;"></i>
                    </div>
                </div>
                <div class="system-metrics" style="font-size: 14px; opacity: 0.9; margin-bottom: 12px;">
                    <i class="fas fa-chart-bar me-2"></i>
                    ${system.keyMetricsCount} key metrics • ${system.totalMetricsCount} total
                </div>
                ${system.lastUpdated ? `
                    <div class="system-updated" style="font-size: 12px; opacity: 0.7;">
                        <i class="fas fa-clock me-1"></i>
                        Updated ${new Date(system.lastUpdated).toLocaleDateString()}
                    </div>
                ` : '<div class="system-updated" style="font-size: 12px; opacity: 0.7;"><i class="fas fa-exclamation-circle me-1"></i>No recent data</div>'}
            </div>
        `;

        // Add click handler for drill-down
        col.querySelector('.system-tile').addEventListener('click', () => {
            console.log('[DEBUG] System tile clicked:', {
                systemId: system.id,
                systemName: system.name,
                clickedAt: new Date().toISOString()
            });
            this.showSystemDetails(system.id);
        });

        return col;
    }

    async showSystemDetails(systemId) {
        console.log('[DEBUG] showSystemDetails called with systemId:', systemId);
        this.showLoading(true);
        try {
            const [metrics, studies, insights] = await Promise.all([
                this.apiCall(`/metrics/system/${systemId}`),
                this.apiCall(`/imaging-studies/system/${systemId}`),
                this.apiCall(`/dashboard/insights/${systemId}`)
            ]);

            // Combine data
            const combinedData = {
                ...metrics,
                studies: studies.studies || [],
                insights: insights.insights || []
            };

            // Store current system data for range analysis
            this.currentSystemData = combinedData;
            console.log('[DEBUG] Combined system data:', {
                systemId: systemId,
                systemName: combinedData.system?.name,
                keyMetricsCount: combinedData.keyMetrics?.length,
                hasStudies: combinedData.studies?.length > 0
            });
            this.renderSystemModal(combinedData);
        } catch (error) {
            console.error('Failed to load system details:', error);
            this.showToast('error', 'System Details', 'Failed to load system details');
        } finally {
            this.showLoading(false);
        }
    }

    recreateSystemModal() {
        // Remove existing modal if it exists
        const existingModal = document.getElementById('systemModal');
        if (existingModal) {
            // Destroy any Bootstrap modal instance
            const modalInstance = bootstrap.Modal.getInstance(existingModal);
            if (modalInstance) {
                modalInstance.dispose();
            }
            existingModal.remove();
        }

        // Create completely new modal DOM
        const newModal = document.createElement('div');
        newModal.className = 'modal fade system-drill-down';
        newModal.id = 'systemModal';
        newModal.setAttribute('tabindex', '-1');
        newModal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="systemModalTitle">System Details</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close">✕</button>
                    </div>
                    <div class="modal-body" id="systemModalBody">
                        <!-- System details will be loaded here -->
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(newModal);

        return newModal;
    }

    renderSystemModal(systemData) {
        // Always recreate the modal to avoid state persistence
        const modal = this.recreateSystemModal();
        const title = document.getElementById('systemModalTitle');
        const body = document.getElementById('systemModalBody');

        title.textContent = `${systemData.system.name} System`;

        // Store studies data for rendering
        systemData.studies = systemData.studies || [];

        const colorClass = {
            'green': 'success',
            'yellow': 'warning', 
            'red': 'danger',
            'gray': 'secondary'
        }[systemData.color] || 'secondary';

        body.innerHTML = `
            <div class="row">
                <div class="col-lg-8">
                    <!-- Trends -->
                    <div id="trends-section" class="card mb-4" style="display: none;">
                        <div class="card-header system-section-header">
                            <h6 class="mb-0">
                                <i class="fas fa-chart-line me-2"></i>Trends
                            </h6>
                        </div>
                        <div class="card-body">
                            <div id="trends-container">
                                <div class="text-center py-3">
                                    <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                                    <span>Loading trend data...</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Key Metrics -->
                    <div class="card mb-4">
                        <div class="card-header" style="background: #007AFF; color: #FFFFFF;">
                            <h6 class="mb-0" style="color: #FFFFFF;">
                                <i class="fas fa-star me-2"></i>Key Metrics
                            </h6>
                        </div>
                        <div class="card-body">
                            ${systemData.keyMetrics.length > 0 ? 
                                this.renderMetricsTable(systemData.keyMetrics, systemData.system) :
                                '<p style="color: #EBEBF5;">No key metrics available</p>'
                            }
                        </div>
                    </div>

                    <!-- Additional Metrics (Non-Key + Custom) -->
                    <div class="card mb-4">
                        <div class="card-header system-section-header">
                            <h6 class="mb-0">
                                <i class="fas fa-list me-2"></i>Additional Metrics
                            </h6>
                        </div>
                        <div class="card-body">
                            ${this.renderCombinedAdditionalMetrics(systemData)}
                        </div>
                    </div>

                    <!-- Studies & Imaging Section (Phase 1) -->
                    <div class="card mb-4">
                        <div class="card-header system-section-header">
                            <h6 class="mb-0">
                                <i class="fas fa-images me-2"></i>Studies & Imaging
                            </h6>
                        </div>
                        <div class="card-body">
                            ${this.renderStudiesSection(systemData.studies || [])}
                        </div>
                    </div>
                </div>

                <div class="col-lg-4">
                    <!-- AI Insights -->
                    <div class="card mb-4 insights-panel">
                        <div class="card-header system-section-header">
                            <h6 class="mb-0">
                                <div class="ai-insights-icon"></div>AI Insights
                            </h6>
                        </div>
                        <div class="card-body">
                            ${systemData.insights ? 
                                this.renderSystemInsights(systemData.insights) :
                                '<p style="color: #EBEBF5;">No insights available yet. Upload health data to generate AI insights.</p>'
                            }
                        </div>
                    </div>

                    <!-- System Status -->
                    <div class="card mb-4">
                        <div class="card-header system-section-header">
                            <h6 class="mb-0">
                                <i class="fas fa-heartbeat me-2"></i>System Status
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="d-flex align-items-center">
                                <div class="status-indicator status-${colorClass} me-2"></div>
                                <span class="text-capitalize">${systemData.color}</span>
                            </div>
                            <small class="text-muted">
                                ${systemData.keyMetrics.length} key metrics • ${systemData.nonKeyMetrics ? systemData.nonKeyMetrics.length : 0} additional metrics
                            </small>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modalInstance = new bootstrap.Modal(modal);
        modalInstance.show();

        // Initialize trends chart manager and load trends after modal is shown
        modal.addEventListener('shown.bs.modal', async () => {
            const tooltipTriggerList = modal.querySelectorAll('[data-bs-toggle="tooltip"]');
            const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));

            // Initialize and use trends chart manager
            this.trendsChartManager = this.createTrendsChartManager();
            await this.trendsChartManager.render(systemData.system.id, this.apiCall.bind(this));
        });

        // Clean up trends chart manager when modal is hidden
        modal.addEventListener('hidden.bs.modal', () => {
            if (this.trendsChartManager) {
                this.trendsChartManager.destroy();
                this.trendsChartManager = null;
            }
        });
    }

    // TrendsChart class for managing chart lifecycle
    createTrendsChartManager() {
        return new (class TrendsChart {
            constructor() {
                this.activeCharts = new Map();
                this.containerId = 'trends-container';
                this.sectionId = 'trends-section';
            }

            async render(systemId, apiCallFn) {
                console.log('[DEBUG] TrendsChart.render called with systemId:', systemId);
                
                // Always clean up first
                this.destroy();

                try {
                    // Fetch trends data
                    const trendsData = await apiCallFn(`/metrics/system/${systemId}/trends`, 'GET');
                    console.log('[DEBUG] Trends API response:', {
                        systemId: systemId,
                        trendsCount: trendsData?.length || 0,
                        trendsMetrics: trendsData?.map(t => t.metric_name) || []
                    });

                    const container = document.getElementById(this.containerId);
                    const section = document.getElementById(this.sectionId);
                    
                    if (!container || !section) {
                        console.warn('Trends container or section not found');
                        return;
                    }

                    if (trendsData && trendsData.length > 0) {
                        this.renderCharts(trendsData);
                        section.style.display = 'block';
                    } else {
                        section.style.display = 'none';
                    }
                } catch (error) {
                    console.error('Error loading trends:', error);
                    const section = document.getElementById(this.sectionId);
                    if (section) {
                        section.style.display = 'none';
                    }
                }
            }

            renderCharts(trendsData) {
                const container = document.getElementById(this.containerId);
                if (!container) return;

                // Clear container completely
                container.innerHTML = '';

                trendsData.forEach((trend, index) => {
                    console.log('[DEBUG] Creating chart for metric:', {
                        index: index,
                        metricName: trend.metric_name,
                        metricId: trend.metric_id,
                        seriesLength: trend.series?.length || 0,
                        firstDataPoint: trend.series?.[0],
                        lastDataPoint: trend.series?.[trend.series?.length - 1]
                    });

                    const chartId = `trend-chart-${trend.metric_id}`;

                    // Create chart container
                    const chartDiv = document.createElement('div');
                    chartDiv.id = chartId;
                    chartDiv.className = 'trend-chart mb-4';
                    chartDiv.style.height = '300px';
                    container.appendChild(chartDiv);

                    // Register this chart for cleanup
                    this.activeCharts.set(chartId, true);

                    // Prepare data for Plotly
                    const xValues = trend.series.map(point => new Date(point.t));
                    const yValues = trend.series.map(point => point.v);

                    const traces = [{
                        x: xValues,
                        y: yValues,
                        type: 'scatter',
                        mode: 'lines+markers',
                        name: trend.metric_name,
                        line: {
                            color: '#007AFF',
                            width: 3
                        },
                        marker: {
                            color: '#007AFF',
                            size: 8,
                            symbol: 'circle'
                        }
                    }];

                    // Add reference range band if available
                    if (trend.range_band) {
                        traces.push({
                            x: [xValues[0], xValues[xValues.length - 1]],
                            y: [trend.range_band.min, trend.range_band.min],
                            type: 'scatter',
                            mode: 'lines',
                            name: 'Lower Normal',
                            line: {
                                color: '#34C759',
                                width: 1,
                                dash: 'dash'
                            },
                            showlegend: false,
                            hoverinfo: 'skip'
                        });

                        traces.push({
                            x: [xValues[0], xValues[xValues.length - 1]],
                            y: [trend.range_band.max, trend.range_band.max],
                            type: 'scatter',
                            mode: 'lines',
                            name: 'Upper Normal',
                            line: {
                                color: '#34C759',
                                width: 1,
                                dash: 'dash'
                            },
                            showlegend: false,
                            hoverinfo: 'skip'
                        });

                        // Add shaded area between normal range
                        traces.push({
                            x: [...xValues, ...xValues.slice().reverse()],
                            y: [...new Array(xValues.length).fill(trend.range_band.min), 
                                ...new Array(xValues.length).fill(trend.range_band.max).reverse()],
                            type: 'scatter',
                            mode: 'lines',
                            fill: 'tonexty',
                            fillcolor: 'rgba(52, 199, 89, 0.1)',
                            line: { color: 'transparent' },
                            name: 'Normal Range',
                            showlegend: true,
                            hoverinfo: 'skip'
                        });
                    }

                    const layout = {
                        title: {
                            text: `${trend.metric_name} Trend (${trend.points_count} data points)`,
                            font: { 
                                color: '#FFFFFF',
                                size: 16
                            }
                        },
                        xaxis: {
                            title: 'Date',
                            color: '#EBEBF5',
                            gridcolor: '#2C2C2E',
                            tickfont: { color: '#EBEBF5' },
                            titlefont: { color: '#EBEBF5' }
                        },
                        yaxis: {
                            title: 'Value',
                            color: '#EBEBF5',
                            gridcolor: '#2C2C2E',
                            tickfont: { color: '#EBEBF5' },
                            titlefont: { color: '#EBEBF5' }
                        },
                        plot_bgcolor: '#1C1C1E',
                        paper_bgcolor: '#1C1C1E',
                        font: { color: '#FFFFFF' },
                        margin: { l: 60, r: 40, t: 60, b: 60 },
                        legend: {
                            font: { color: '#EBEBF5' },
                            bgcolor: 'transparent'
                        }
                    };

                    const config = {
                        responsive: true,
                        displayModeBar: false,
                        displaylogo: false
                    };

                    // Render the chart
                    Plotly.newPlot(chartId, traces, layout, config);
                });
            }

            destroy() {
                console.log('[DEBUG] TrendsChart.destroy called, purging', this.activeCharts.size, 'charts');
                
                // Purge all active Plotly charts
                this.activeCharts.forEach((_, chartId) => {
                    const chartElement = document.getElementById(chartId);
                    if (chartElement) {
                        try {
                            Plotly.purge(chartId);
                            console.log('[DEBUG] Purged chart:', chartId);
                        } catch (error) {
                            console.warn('Error purging chart:', chartId, error);
                        }
                    }
                });

                // Clear the registry
                this.activeCharts.clear();

                // Clear container DOM
                const container = document.getElementById(this.containerId);
                if (container) {
                    container.innerHTML = '';
                }

                // Hide the section
                const section = document.getElementById(this.sectionId);
                if (section) {
                    section.style.display = 'none';
                }
            }

            reset() {
                this.destroy();
                const container = document.getElementById(this.containerId);
                if (container) {
                    container.innerHTML = `
                        <div class="text-center py-3">
                            <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                            <span>Loading trend data...</span>
                        </div>
                    `;
                }
            }
        })();
    }


    renderMetricsTable(metrics, systemData) {
        return `
            <div class="table-responsive">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th style="color: #FFFFFF; background-color: #2C2C2E;">Metric</th>
                            <th style="color: #FFFFFF; background-color: #2C2C2E;">Value</th>
                            <th style="color: #FFFFFF; background-color: #2C2C2E;">Unit</th>
                            <th style="color: #FFFFFF; background-color: #2C2C2E;">Date</th>
                            <th style="color: #FFFFFF; background-color: #2C2C2E;">Range Analysis</th>
                            <th style="color: #FFFFFF; background-color: #2C2C2E;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${metrics.map(metric => this.renderMetricRow(metric, systemData)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderMetricRow(metric, systemData) {
        // Check for custom reference range first (from database), then fall back to metricUtils
        let rangeBlock = '';
        let metricMatch = null;

        if (metric.reference_range) {
            // Use custom reference range from database metric
            const rangeMatch = metric.reference_range.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\s*(.+)?/);
            if (rangeMatch) {
                const [, minVal, maxVal, units] = rangeMatch;
                const normalRangeMin = parseFloat(minVal);
                const normalRangeMax = parseFloat(maxVal);
                const rangeUnits = units?.trim() || metric.metric_unit || '';

                const status = window.metricUtils ? 
                    window.metricUtils.calculateStatus(metric.metric_value, normalRangeMin, normalRangeMax) : 
                    (metric.metric_value >= normalRangeMin && metric.metric_value <= normalRangeMax ? 'Normal' : 'Out of Range');
                const statusClass = status.toLowerCase().replace(' ', '-');
                const rangeBar = window.metricUtils ? 
                    window.metricUtils.generateMicroRangeBar(metric.metric_value, normalRangeMin, normalRangeMax) : '';

                rangeBlock = `
                    <div class="metric-range-block">
                        <div class="metric-status-chip ${statusClass}">${statusText}</div>
                        ${rangeBar}
                        <div class="normal-range-caption" style="text-align: center; display: flex; flex-direction: column; align-items: center;">
                            <div>
                                Normal Range: ${displayMin}–${displayMax} ${displayUnits}
                                ${isAdjusted ? `<span class="info-icon" data-metric="${metric.metric_name}" data-bs-toggle="tooltip" title="Custom Range: ${customMin}–${customMax} ${customUnits}">i</span>` : ''}
                            </div>
                            ${isAdjusted ? '<div><span class="badge bg-warning text-dark mt-1">Adjusted Range</span></div>' : ''}
                        </div>
                    </div>
                `;
            }
        }

        // Fall back to metricUtils if no custom reference range
        if (!rangeBlock) {
            const customMetrics = systemData.customMetrics || [];
            metricMatch = window.metricUtils ? 
                window.metricUtils.findMetricMatch(metric.metric_name, systemData.system?.name || systemData.name, customMetrics) : null;

            if (metricMatch) {
                const statusText = window.metricUtils.calculateStatusSync(metric.metric_value, metricMatch.normalRangeMin, metricMatch.normalRangeMax);
                const statusClass = statusText.toLowerCase().replace(' ', '-');
                const rangeBar = window.metricUtils.generateMicroRangeBar(metric.metric_value, metricMatch.normalRangeMin, metricMatch.normalRangeMax);

                rangeBlock = `
                    <div class="metric-range-block">
                        <div class="metric-status-chip ${statusClass}">${statusText}</div>
                        ${rangeBar}
                        <div class="normal-range-caption" style="text-align: center; display: flex; flex-direction: column; align-items: center;">
                            <div>
                                Normal Range: ${metricMatch.normalRangeMin}–${metricMatch.normalRangeMax}${metricMatch.units ? ` ${metricMatch.units}` : ''}
                            </div>
                        </div>
                    </div>
                `;
            } else {
                rangeBlock = `
                    <div class="metric-range-block">
                        <div class="metric-status-chip no-data">No data</div>
                        <div style="color: #8E8E93; font-size: 11px; margin-top: 4px;">Reference range not available</div>
                    </div>
                `;
            }
        }

        const needsReview = !metricMatch && !metric.reference_range || metric.needs_review;

        const editForm = `
            <div class="metric-edit-form d-none" id="edit-form-${metric.id}">
                <div class="row">
                    <div class="col-md-4">
                        <label class="form-label" style="color: #FFFFFF; font-size: 12px;">Metric Name</label>
                        <div class="metric-name-dropdown-container">
                            <select class="form-select metric-name-searchable" id="edit-metric-${metric.id}" 
                                    data-system-id="${systemData.system?.id || systemData.id}" 
                                    data-metric-id="${metric.id}">
                                <option value="${metric.metric_name}" selected>${metric.metric_name}</option>
                            </select>
                        </div>
                    </div>
                    <div class="col-md-2">
                        <label class="form-label" style="color: #FFFFFF; font-size: 12px;">Value</label>
                        <input type="number" class="form-control" id="edit-value-${metric.id}" value="${metric.metric_value || ''}" step="0.01">
                    </div>
                    <div class="col-md-2">
                        <label class="form-label" style="color: #FFFFFF; font-size: 12px;">Unit</label>
                        <select class="form-select" id="edit-unit-${metric.id}">
                            ${this.generateUnitOptions(metricMatch, metric.metric_unit)}
                        </select>
                    </div>
                    <div class="col-md-2">
                        <label class="form-label" style="color: #FFFFFF; font-size: 12px;">Date</label>
                        <input type="date" class="form-control" id="edit-date-${metric.id}" value="${(metric.test_date && String(metric.test_date).length>10 ? String(metric.test_date).slice(0,10) : (metric.test_date || ''))}">
                    </div>
                    <div class="col-md-2">
                        <label class="form-label" style="color: #FFFFFF; font-size: 12px;">&nbsp;</label>
                        <div class="metric-edit-buttons">
                            <button class="btn btn-success btn-sm" onclick="healthDashboard.saveMetricEdit(${metric.id})">
                                <i class="fas fa-check"></i>
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="healthDashboard.cancelMetricEdit(${metric.id})">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="row mt-2">
                    <div class="col-md-12">
                        <div class="p-2" style="background:#2C2C2E;border-radius:8px;border:1px solid #3A3A3C;">
                            <div class="form-check form-switch d-flex align-items-center">
                                <input class="form-check-input" type="checkbox" id="inline-range-enable-${metric.id}">
                                <label class="form-check-label ms-2" for="inline-range-enable-${metric.id}" style="color:#EBEBF5;">Edit Reference Range</label>
                                
                                <span id="current-range-text-${metric.id}" class="text-muted small ms-2"></span>
                            </div>
                            <div id="inline-range-fields-${metric.id}" class="row mt-2 d-none">
                                <input type="hidden" id="inline-range-id-${metric.id}" value="">
                                <div class="col-md-2">
                                    <label class="form-label" style="color:#FFFFFF; font-size:12px;">Min</label>
                                    <input type="number" step="0.01" class="form-control" id="inline-min-${metric.id}" placeholder="Min">
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label" style="color:#FFFFFF; font-size:12px;">Max</label>
                                    <input type="number" step="0.01" class="form-control" id="inline-max-${metric.id}" placeholder="Max">
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label" style="color:#FFFFFF; font-size:12px;">Units</label>
                                    <select class="form-select" id="inline-units-${metric.id}">
                                        <option value="">Select unit</option>
                                        <option>mg/dL</option>
                                        <option>mmHg</option>
                                        <option>g/dL</option>
                                        <option>%</option>
                                        <option>U/L</option>
                                        <option>ng/mL</option>
                                        <option>pg/mL</option>
                                        <option>μg/L</option>
                                        <option>IU/mL</option>
                                        <option>nmol/L</option>
                                        <option>nmol/min/mL</option>
                                        <option>Angstrom</option>
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label" style="color:#FFFFFF; font-size:12px;">Medical Condition</label>
                                    <select class="form-select" id="inline-condition-${metric.id}">
                                        <option value="">Select condition...</option>
                                        <option value="pregnancy">Pregnancy</option>
                                        <option value="diabetes">Diabetes</option>
                                        <option value="hypertension">Hypertension</option>
                                        <option value="medication">Medication Effect</option>
                                        <option value="age_related">Age-Related</option>
                                        <option value="genetic_condition">Genetic Condition</option>
                                        <option value="chronic_disease">Chronic Disease</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                <div class="col-md-3" id="inline-condition-details-wrap-${metric.id}" style="display:none;">
                                    <label class="form-label" style="color:#FFFFFF; font-size:12px;">Specify Condition</label>
                                    <input type="text" class="form-control" id="inline-condition-details-${metric.id}" placeholder="Describe condition">
                                </div>
                                <div class="col-md-6 mt-2">
                                    <label class="form-label" style="color:#FFFFFF; font-size:12px;">Notes</label>
                                    <input type="text" class="form-control" id="inline-notes-${metric.id}" placeholder="Optional notes">
                                </div>
                                <div class="col-md-3 mt-2">
                                    <label class="form-label" style="color:#FFFFFF; font-size:12px;">Valid From</label>
                                    <input type="date" class="form-control" id="inline-valid-from-${metric.id}">
                                </div>
                                <div class="col-md-3 mt-2">
                                    <label class="form-label" style="color:#FFFFFF; font-size:12px;">Valid Until</label>
                                    <input type="date" class="form-control" id="inline-valid-until-${metric.id}">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="row mt-2">
                    <div class="col-md-6">
                        <div class="form-check form-switch d-flex align-items-center">
                            <input class="form-check-input" type="checkbox" id="inline-exclude-${metric.id}" ${metric.exclude_from_analysis ? 'checked' : ''}>
                            <label class="form-check-label ms-2" for="inline-exclude-${metric.id}" style="color:#EBEBF5;">Exclude from analysis</label>
                        </div>
                    </div>
                    <div class="col-md-6" id="inline-exclude-reason-wrap-${metric.id}" style="display:${metric.exclude_from_analysis ? 'block' : 'none'};">
                        <input type="text" class="form-control" id="inline-exclude-reason-${metric.id}" placeholder="Reason (optional)" value="${metric.review_reason || ''}">
                    </div>
                </div>
            </div>
        `;

        const reviewTag = metric.exclude_from_analysis ? '<span class="badge bg-warning text-dark ms-2 badge-review">Review Value</span>' : '';

        return `
            <tr id="metric-row-${metric.id}" data-metric-id="${metric.id}" data-test-date="${metric.test_date}">
                <td style="color: #FFFFFF; font-weight: 600;">
                    <div class="d-flex align-items-center">
                        <span class="metric-name">${metric.metric_name}</span>${reviewTag}
                        <span class="metric-info-icon" title="${this.getBiomarkerInfo(metric.metric_name)}" data-bs-toggle="tooltip">i</span>
                        ${needsReview ? '<span class="needs-review-indicator">NEEDS REVIEW</span>' : ''}
                    </div>
                </td>
                <td style="color: #FFFFFF;" class="metric-value">${metric.metric_value || '-'}${metric.metric_unit ? ` ${metric.metric_unit}` : ''}</td>
                <td style="color: #EBEBF5;">${metric.metric_unit || '-'}</td>
                <td style="color: #EBEBF5;" class="metric-date">${metric.test_date ? new Date(metric.test_date).toLocaleDateString() : '-'}</td>
                <td class="range-indicator">${rangeBlock}</td>
                <td>
                    <i class="fas fa-edit metric-edit-icon" onclick="healthDashboard.editMetric(${metric.id})" title="Edit metric"></i>
                </td>
            </tr>
            <tr id="edit-row-${metric.id}" class="d-none">
                <td colspan="6">
                    ${editForm}
                </td>
            </tr>
        `;
    }

    // Get biomarker information for tooltips
    getBiomarkerInfo(metricName) {
        const biomarkerInfo = {
            'LDL Cholesterol': 'LDL (Low-Density Lipoprotein) - "Bad" cholesterol. High levels increase risk of heart disease and stroke.',
            'LDL-C': 'LDL Cholesterol - Low-Density Lipoprotein cholesterol. Target: <100 mg/dL (optimal).',
            'HDL Cholesterol': 'HDL (High-Density Lipoprotein) - "Good" cholesterol. Higher levels are protective against heart disease.',
            'HDL-C': 'HDL Cholesterol - High-Density Lipoprotein cholesterol. Target: >40 mg/dL (men), >50 mg/dL (women).',
            'Total Cholesterol': 'Total Cholesterol - Combined measure of all cholesterol types. Target: <200 mg/dL.',
            'Triglycerides': 'Triglycerides - Blood fats that store energy. High levels increase heart disease risk. Target: <150 mg/dL.',
            'ApoB': 'Apolipoprotein B - Protein component of LDL particles. More accurate heart disease risk marker than LDL alone.',
            'Apolipoprotein B': 'Apolipoprotein B - Main protein in LDL cholesterol. Indicates number of atherogenic particles.',
            'CRP': 'C-Reactive Protein - Inflammation marker. High levels indicate inflammation in the body.',
            'hs-CRP': 'High-Sensitivity C-Reactive Protein - Measures low-level inflammation. <1.0 mg/L = low risk, 1.0-3.0 = moderate, >3.0 = high.',
            'IL-6': 'Interleukin-6 - Pro-inflammatory cytokine. Elevated in chronic inflammation and autoimmune conditions.',
            'Glucose': 'Blood Glucose - Sugar levels in blood. Fasting target: 70-100 mg/dL. High levels may indicate diabetes.',
            'HbA1c': 'Hemoglobin A1c - Average blood sugar over 2-3 months. Target: <5.7%. Diabetes: >6.5%.',
            'Insulin': 'Insulin - Hormone that regulates blood sugar. High levels may indicate insulin resistance.',
            'Homocysteine': 'Homocysteine - Amino acid. High levels associated with increased cardiovascular disease risk.',
            'Vitamin D': 'Vitamin D - Essential for bone health and immune function. Target: 30-100 ng/mL.',
            'Vitamin B12': 'Vitamin B12 - Essential for nerve function and red blood cell formation. Target: 200-900 pg/mL.',
            'Folate': 'Folate (Folic Acid) - B vitamin essential for DNA synthesis and red blood cell formation.',
            'Thyroid TSH': 'Thyroid Stimulating Hormone - Primary thyroid function test. Target: 0.4-4.0 mIU/L.',
            'T3 (Triiodothyronine)': 'T3 - Active thyroid hormone. Works with T4 to regulate metabolism.',
            'T4 (Thyroxine)': 'T4 - Main thyroid hormone produced by thyroid gland. Controls metabolism.',
            'Cortisol': 'Cortisol - Primary stress hormone. Follows daily rhythm - highest in morning, lowest at night.',
            'Testosterone': 'Testosterone - Male sex hormone. Important for muscle mass, bone density, and mood.',
            'Estradiol': 'Estradiol - Primary female sex hormone. Important for reproductive health and bone density.',
            'Progesterone': 'Progesterone - Female sex hormone. Prepares uterus for pregnancy and maintains pregnancy.',
            'Ferritin': 'Ferritin - Iron storage protein. Low levels indicate iron deficiency. Target: 12-300 ng/mL (men), 12-150 ng/mL (women).',
            'Iron': 'Serum Iron - Amount of iron circulating in blood. Part of iron studies panel.',
            'TIBC': 'Total Iron-Binding Capacity - Measures blood\'s capacity to bind iron. High TIBC suggests iron deficiency.',
            'TIBC Saturation': 'Transferrin Saturation - Percentage of iron-binding sites occupied. Target: 20-50%.',
            'Creatinine': 'Creatinine - Waste product from muscle metabolism. Used to assess kidney function.',
            'BUN': 'Blood Urea Nitrogen - Measures kidney function. Target: 7-20 mg/dL.',
            'eGFR': 'Estimated Glomerular Filtration Rate - Measure of kidney function. >60 mL/min/1.73m² is normal.',
            'ALT': 'Alanine Aminotransferase - Liver enzyme. Elevated levels indicate liver inflammation or damage.',
            'AST': 'Aspartate Aminotransferase - Liver enzyme. Elevated with liver damage or muscle injury.',
            'ALP': 'Alkaline Phosphatase - Enzyme found in liver, bone, and other tissues. Elevated with liver/bone disease.',
            'GGT': 'Gamma-Glutamyl Transferase - Liver enzyme. Sensitive indicator of liver disease and alcohol use.',
            'Bilirubin': 'Bilirubin - Waste product from red blood cell breakdown. Elevated with liver disease.',
            'Albumin': 'Albumin - Main protein produced by liver. Low levels may indicate liver or kidney disease.',
            'Protein': 'Total Protein - Sum of all proteins in blood. Includes albumin and globulins.',
            'Sodium': 'Sodium - Electrolyte essential for fluid balance and nerve function. Target: 135-145 mEq/L.',
            'Potassium': 'Potassium - Electrolyte crucial for heart and muscle function. Target: 3.5-5.0 mEq/L.',
            'Chloride': 'Chloride - Electrolyte that works with sodium to maintain fluid balance.',
            'CO2': 'Carbon Dioxide/Bicarbonate - Measures acid-base balance and kidney function.',
            'Calcium': 'Calcium - Essential mineral for bone health and muscle/nerve function. Target: 8.5-10.5 mg/dL.',
            'Phosphorus': 'Phosphorus - Mineral essential for bone health and energy metabolism.',
            'Magnesium': 'Magnesium - Mineral involved in over 300 enzymatic reactions. Important for muscle/nerve function.',
            'White Blood Cell Count': 'WBC - Measures immune system cells. Target: 4,000-11,000 cells/μL.',
            'Red Blood Cell Count': 'RBC - Measures oxygen-carrying cells. Target: 4.7-6.1 million cells/μL (men), 4.2-5.4 (women).',
            'Hemoglobin': 'Hemoglobin - Protein in red blood cells that carries oxygen. Target: 14-18 g/dL (men), 12-16 (women).',
            'Hematocrit': 'Hematocrit - Percentage of blood made up of red blood cells. Target: 41-53% (men), 36-46% (women).',
            'MCV': 'Mean Corpuscular Volume - Average size of red blood cells. Helps classify types of anemia.',
            'MCH': 'Mean Corpuscular Hemoglobin - Amount of hemoglobin in average red blood cell.',
            'MCHC': 'Mean Corpuscular Hemoglobin Concentration - Concentration of hemoglobin in red blood cells.',
            'RDW': 'Red Cell Distribution Width - Measures variation in red blood cell size. High with some anemias.',
            'Platelet Count': 'Platelets - Blood cells involved in clotting. Target: 150,000-450,000/μL.',
            'Neutrophils': 'Neutrophils - Most common white blood cell. First responder to bacterial infections.',
            'Lymphocytes': 'Lymphocytes - White blood cells important for immune response and antibody production.',
            'Monocytes': 'Monocytes - White blood cells that become macrophages to clean up debris and pathogens.',
            'Eosinophils': 'Eosinophils - White blood cells involved in allergic reactions and parasitic infections.',
            'Basophils': 'Basophils - White blood cells involved in allergic responses and inflammation.',
            'LDL Particle Size': 'LDL Particle Size - Smaller, denser LDL particles are more atherogenic than larger particles.',
            'Small LDL-P': 'Small LDL Particle Number - Number of small, dense LDL particles. Higher counts increase cardiovascular risk.',
            'Medium LDL-P': 'Medium LDL Particle Number - Medium-sized LDL particles. Part of comprehensive lipid analysis.',
            'LDL Particle Number': 'LDL Particle Number - Total number of LDL particles. Better predictor of risk than LDL cholesterol alone.'
        };

        // Clean up metric name for lookup
        const cleanName = metricName.trim().toLowerCase();
        
        // Find exact match first
        for (const [key, info] of Object.entries(biomarkerInfo)) {
            if (metricName.toLowerCase() === key.toLowerCase()) {
                return info;
            }
        }
        
        // Find partial match
        for (const [key, info] of Object.entries(biomarkerInfo)) {
            if (cleanName.includes(key.toLowerCase()) || key.toLowerCase().includes(cleanName)) {
                return info;
            }
        }
        
        // Return generic information if no specific match found
        return `${metricName} - A health biomarker that helps assess various aspects of your health status. Contact your healthcare provider for interpretation of results.`;
    }

    renderCombinedAdditionalMetrics(systemData) {
        const nonKeyMetrics = systemData.nonKeyMetrics || [];
        const customMetrics = systemData.customMetrics || [];

        if (nonKeyMetrics.length === 0 && customMetrics.length === 0) {
            return '<p style="color: #EBEBF5;">No additional metrics available</p>';
        }

        let html = '';

        // Render non-key official metrics
        if (nonKeyMetrics.length > 0) {
            html += this.renderMetricsTable(nonKeyMetrics, systemData.system);
        }

        // Render custom metrics
        if (customMetrics.length > 0) {
            if (nonKeyMetrics.length > 0) {
                html += '<hr style="border-color: #48484A; margin: 20px 0;">';
                html += '<h6 style="color: #FFFFFF; margin-bottom: 15px;"><i class="fas fa-user-plus me-2"></i>Custom Metrics</h6>';
            }
            html += this.renderCustomMetricsTable(customMetrics, systemData.system);
        }

        return html;
    }

    renderCustomMetricsTable(customMetrics, systemData) {
        return `
            <div class="table-responsive">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th style="color: #FFFFFF; background-color: #2C2C2E;">Metric</th>
                            <th style="color: #FFFFFF; background-color: #2C2C2E;">Value</th>
                            <th style="color: #FFFFFF; background-color: #2C2C2E;">Unit</th>
                            <th style="color: #FFFFFF; background-color: #2C2C2E;">Date</th>
                            <th style="color: #FFFFFF; background-color: #2C2C2E;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${customMetrics.map(metric => this.renderCustomMetricRow(metric, systemData)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderCustomMetricRow(metric, systemData) {
        const sourceIcon = metric.source_type === 'official' ? 
            '<i class="fas fa-globe text-success" title="Global metric"></i>' : 
            '<i class="fas fa-user text-info" title="Personal metric"></i>';

        return `
            <tr>
                <td style="color: #FFFFFF; font-weight: 600;">
                    ${sourceIcon} ${metric.metric_name}
                </td>
                <td style="color: #FFFFFF;">${metric.value}</td>
                <td style="color: #EBEBF5;">${metric.units}</td>
                <td style="color: #EBEBF5;">${new Date(metric.created_at).toLocaleDateString()}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary btn-sm" onclick="app.editCustomMetric(${metric.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-outline-danger btn-sm" onclick="app.deleteCustomMetric(${metric.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    isCustomMetricInRange(metric) {
        if (!metric.normal_range_min || !metric.normal_range_max) return null;

        const value = parseFloat(metric.value);
        if (isNaN(value)) return null;

        return value >= metric.normal_range_min && value <= metric.normal_range_max;
    }

    getCustomMetricStatusBadge(metric, isInRange) {
        if (isInRange === null) {
            return '<span class="badge bg-secondary">-</span>';
        }

        if (isInRange) {
            return '<span class="badge bg-success">Normal</span>';
        } else {
            const value = parseFloat(metric.value);
            if (value < metric.normal_range_min) {
                return '<span class="badge bg-warning">Low</span>';
            } else {
                return '<span class="badge bg-danger">High</span>';
            }
        }
    }

    generateTooltipTitle(metricData, metricName) {
        let tooltip = metricName;
        if (metricData.description) {
            tooltip += `\n\n${metricData.description}`;
        }
        tooltip += `\n\nNormal range: ${metricData.normalRangeMin}–${metricData.normalRangeMax}${metricData.units ? ` ${metricData.units}` : ''}`;
        if (metricData.source) {
            tooltip += `\nSource: ${metricData.source}`;
        }
        return tooltip;
    }

    showInsightsRefreshing() {
        // Prevent multiple spinners by checking if already refreshing
        if (this.isRefreshingInsights) {
            return;
        }

        this.isRefreshingInsights = true;

        // Add refreshing indicator to insights panels
        const insightsPanels = document.querySelectorAll('.insights-panel .card-body');
        insightsPanels.forEach(panel => {
            // Remove any existing refreshing indicators first
            const existingRefreshing = panel.querySelector('.insights-refreshing');
            if (existingRefreshing) {
                existingRefreshing.remove();
            }

            const refreshingDiv = document.createElement('div');
            refreshingDiv.className = 'text-center py-3 insights-refreshing';
            refreshingDiv.innerHTML = `
                <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                <span style="color: #EBEBF5; font-size: 13px;">Refreshing insights...</span>
            `;
            panel.insertBefore(refreshingDiv, panel.firstChild);
        });
    }

    hideInsightsRefreshing() {
        // Reset the refreshing state
        this.isRefreshingInsights = false;

        // Remove refreshing indicators
        const refreshingDivs = document.querySelectorAll('.insights-refreshing');
        refreshingDivs.forEach(div => div.remove());
    }

    // Custom Metrics Methods
    showAddCustomMetricModal(systemId) {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'addCustomMetricModal';
        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" style="color: #FFFFFF;">Add Custom Metric</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="addCustomMetricForm">
                            <div class="mb-3">
                                <label class="form-label" style="color: #FFFFFF;">Metric Name</label>
                                <input type="text" class="form-control" id="customMetricName" required>
                            </div>
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="mb-3">
                                        <label class="form-label" style="color: #FFFFFF;">Value</label>
                                        <input type="text" class="form-control" id="customMetricValue" required>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="mb-3">
                                        <label class="form-label" style="color: #FFFFFF;">Units</label>
                                        <select class="form-select" id="customMetricUnits" required>
                                            ${this.generateUnitsOptions()}
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="mb-3">
                                        <label class="form-label" style="color: #FFFFFF;">Normal Range Min</label>
                                        <input type="number" class="form-control" id="customMetricRangeMin" step="0.01">
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="mb-3">
                                        <label class="form-label" style="color: #FFFFFF;">Normal Range Max</label>
                                        <input type="number" class="form-control" id="customMetricRangeMax" step="0.01">
                                    </div>
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label" style="color: #FFFFFF;">Gender Applicability</label>
                                <select class="form-select" id="customMetricGender">
                                    <option value="All">All</option>
                                    <option value="F">Female</option>
                                    <option value="M">Male</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="app.saveCustomMetric(${systemId})">Save Metric</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        const modalInstance = new bootstrap.Modal(modal);
        modalInstance.show();

        // Clean up modal after hiding
        modal.addEventListener('hidden.bs.modal', () => {
            document.body.removeChild(modal);
        });
    }

    // NEW: Inline custom metric modal during edit flow
    showInlineCustomMetricModal(systemId, metricId) {
        // Get current metric name and units for pre-population
        const currentMetricSelect = document.getElementById(`edit-metric-${metricId}`);
        const currentMetricName = currentMetricSelect.options[0].text; // First option is current metric
        const currentUnitsElement = document.getElementById(`edit-unit-${metricId}`);
        const currentUnits = currentUnitsElement ? currentUnitsElement.value : '';

        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'inlineCustomMetricModal';
        modal.innerHTML = `
            <div class="modal-dialog modal-sm">
                <div class="modal-content" style="background-color: #1C1C1E;">
                    <div class="modal-header" style="border-color: #48484A;">
                        <h5 class="modal-title" style="color: #FFFFFF;">Create New Metric Type</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="inlineCustomMetricForm">
                            <div class="mb-3">
                                <label class="form-label" style="color: #FFFFFF;">Metric Name</label>
                                <input type="text" class="form-control" id="inlineMetricName" required 
                                       value="${currentMetricName}"
                                       style="background-color: #2C2C2E; border-color: #48484A; color: #FFFFFF;">
                            </div>
                            <div class="mb-3">
                                <label class="form-label" style="color: #FFFFFF;">Units</label>
                                <select class="form-select" id="inlineMetricUnits" required 
                                        style="background-color: #2C2C2E; border-color: #48484A; color: #FFFFFF;">
                                    <option value="">Select units</option>
                                    ${this.generateUnitsOptionsWithSelected(currentUnits)}
                                </select>
                            </div>
                            <div class="row">
                                <div class="col-6">
                                    <div class="mb-3">
                                        <label class="form-label" style="color: #FFFFFF;">Range Min</label>
                                        <input type="number" class="form-control" id="inlineRangeMin" step="0.01"
                                               style="background-color: #2C2C2E; border-color: #48484A; color: #FFFFFF;">
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="mb-3">
                                        <label class="form-label" style="color: #FFFFFF;">Range Max</label>
                                        <input type="number" class="form-control" id="inlineRangeMax" step="0.01"
                                               style="background-color: #2C2C2E; border-color: #48484A; color: #FFFFFF;">
                                    </div>
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label" style="color: #FFFFFF;">Gender Applicability</label>
                                <select class="form-select" id="inlineGender" 
                                        style="background-color: #2C2C2E; border-color: #48484A; color: #FFFFFF;">
                                    <option value="All">All</option>
                                    <option value="F">Female</option>
                                    <option value="M">Male</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer" style="border-color: #48484A;">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="app.saveInlineCustomMetric(${systemId}, ${metricId})">Create & Use</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        const modalInstance = new bootstrap.Modal(modal);
        modalInstance.show();

        // Clean up modal after hiding
        modal.addEventListener('hidden.bs.modal', () => {
            document.body.removeChild(modal);
            // Reset dropdown selection
            const selectElement = document.getElementById(`edit-metric-${metricId}`);
            const originalValue = selectElement.querySelector('option:first-child').value;
            selectElement.value = originalValue;
        });
    }

    async saveInlineCustomMetric(systemId, metricId) {
        try {
            const metricName = document.getElementById('inlineMetricName').value;
            const units = document.getElementById('inlineMetricUnits').value;
            const rangeMin = parseFloat(document.getElementById('inlineRangeMin').value) || null;
            const rangeMax = parseFloat(document.getElementById('inlineRangeMax').value) || null;
            const gender = document.getElementById('inlineGender').value;

            console.log('DEBUG saveInlineCustomMetric:', { metricName, units, rangeMin, rangeMax, gender });

            if (!metricName || !units) {
                console.error('Validation failed:', { metricName, units });
                this.showToast('error', 'Validation Error', 'Metric name and units are required');
                return;
            }

            this.showLoading(true);

            // Step 1: Create custom metric type
            await this.apiCall('/metrics/create-custom-type', 'POST', {
                systemId: systemId,
                metricName: metricName,
                units: units,
                normalRangeMin: rangeMin,
                normalRangeMax: rangeMax,
                rangeApplicableTo: gender
            });

            // Step 2: Update metric with new name and preserve existing value
            const selectElement = document.getElementById(`edit-metric-${metricId}`);
            const currentValue = document.getElementById(`edit-value-${metricId}`).value;
            const currentUnit = document.getElementById(`edit-unit-${metricId}`).value;
            const currentDate = document.getElementById(`edit-date-${metricId}`).value;

            selectElement.value = metricName;

            // Step 3: Update the metric with custom type and reference range
            const referenceRange = (rangeMin !== null || rangeMax !== null) ? 
                `${rangeMin || 0}-${rangeMax || ''} ${units}`.trim() : '';

            console.log('DEBUG updating metric:', { metricId, metricName, currentValue, units, referenceRange, rangeMin, rangeMax });

            await this.apiCall(`/metrics/${metricId}`, 'PUT', {
                metric_name: metricName,
                metric_value: parseFloat(currentValue),
                metric_unit: units, // Use the custom metric units
                reference_range: referenceRange,
                test_date: currentDate,
                source: 'User Edited - Custom Type'
            });

            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('inlineCustomMetricModal')).hide();

            this.showToast('success', 'Custom Metric Type', 'New metric type created and metric updated successfully');

            // Cancel edit mode first, then refresh
            this.cancelMetricEdit(metricId);

            // Refresh the system details to show updated data
            if (this.currentSystemData && this.currentSystemData.system) {
                this.showSystemDetails(this.currentSystemData.system.id);
            }

        } catch (error) {
            console.error('Failed to create inline custom metric:', error);
            this.showToast('error', 'Creation Failed', error.message);
        } finally {
            this.showLoading(false);
        }
    }

    generateUnitsOptions() {
        const units = [
            'g', 'mg', 'µg', 'ng', 'pg', 'mol/L', 'mmol/L', 'µmol/L', 'nmol/L',
            'mg/dL', 'g/dL', 'µg/dL', 'ng/dL', 'mg/L', 'µg/L', 'ng/mL',
            'L', 'mL', 'µL', 'mmHg', 'bpm', 'breaths/min', '°C', '°F',
            '×10⁹/L', '×10¹²/L', '#/µL', '%', 'ratio', 'sec', 'min', 'hr',
            'IU/L', 'mEq/L', 'U/L', 'g/24h', 'Osm/kg', 'Osm/L',
            'kg', 'cm', 'mmol/mol', 'Angstrom', 'Other'
        ];

        return units.map(unit => `<option value="${unit}">${unit}</option>`).join('');
    }

    generateUnitsOptionsWithSelected(selectedUnit) {
        const units = [
            'g', 'mg', 'µg', 'ng', 'pg', 'mol/L', 'mmol/L', 'µmol/L', 'nmol/L',
            'mg/dL', 'g/dL', 'µg/dL', 'ng/dL', 'mg/L', 'µg/L', 'ng/mL',
            'L', 'mL', 'µL', 'mmHg', 'bpm', 'breaths/min', '°C', '°F',
            '×10⁹/L', '×10¹²/L', '#/µL', '%', 'ratio', 'sec', 'min', 'hr',
            'IU/L', 'mEq/L', 'U/L', 'g/24h', 'Osm/kg', 'Osm/L',
            'kg', 'cm', 'mmol/mol', 'Angstrom', 'Other'
        ];

        return units.map(unit => {
            const selected = unit === selectedUnit ? 'selected' : '';
            return `<option value="${unit}" ${selected}>${unit}</option>`;
        }).join('');
    }

    async saveCustomMetric(systemId) {
        try {
            const formData = {
                systemId: systemId,
                metricName: document.getElementById('customMetricName').value,
                value: document.getElementById('customMetricValue').value,
                units: document.getElementById('customMetricUnits').value,
                normalRangeMin: parseFloat(document.getElementById('customMetricRangeMin').value) || null,
                normalRangeMax: parseFloat(document.getElementById('customMetricRangeMax').value) || null,
                rangeApplicableTo: document.getElementById('customMetricGender').value
            };

            // Validate required fields
            if (!formData.metricName || !formData.value || !formData.units) {
                this.showToast('error', 'Validation Error', 'Please fill in all required fields');
                return;
            }

            this.showLoading(true);
            await this.apiCall('/metrics/custom', 'POST', formData);

            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('addCustomMetricModal')).hide();

            // Refresh system details
            this.showSystemDetails(systemId);

            this.showToast('success', 'Custom Metric', 'Custom metric added successfully');

        } catch (error) {
            console.error('Failed to save custom metric:', error);
            this.showToast('error', 'Save Failed', error.message);
        } finally {
            this.showLoading(false);
        }
    }

    async editCustomMetric(metricId) {
        // Implementation for editing custom metrics
        this.showToast('info', 'Edit Metric', 'Edit functionality will be implemented');
    }

    async deleteCustomMetric(metricId) {
        if (!confirm('Are you sure you want to delete this custom metric?')) return;

        try {
            this.showLoading(true);
            await this.apiCall(`/metrics/custom/${metricId}`, 'DELETE');

            // Refresh current system view
            this.refreshCurrentSystemView();

            this.showToast('success', 'Custom Metric', 'Custom metric deleted successfully');

        } catch (error) {
            console.error('Failed to delete custom metric:', error);
            this.showToast('error', 'Delete Failed', error.message);
        } finally {
            this.showLoading(false);
        }
    }

    // Start polling for updated insights after metric changes
    startInsightsPolling(userId) {
        if (this.insightsPollingInterval) {
            clearInterval(this.insightsPollingInterval);
        }

        let pollCount = 0;
        const maxPolls = 8; // Poll for up to 2 minutes (15s intervals)

        this.insightsPollingInterval = setInterval(async () => {
            pollCount++;

            try {
                // Check if new insights are available
                const response = await this.apiCall('/dashboard');
                if (response.success && response.data) {
                    // Update system insights if they're different
                    this.hideInsightsRefreshing();

                    // Refresh current system view if modal is open
                    const modal = document.getElementById('systemModal');
                    if (modal && modal.classList.contains('show')) {
                        this.refreshCurrentSystemView();
                    }

                    this.showToast('success', 'Insights Updated', 'AI insights have been refreshed with your latest data.');
                    clearInterval(this.insightsPollingInterval);
                    return;
                }
            } catch (error) {
                console.warn('Insights polling error:', error);
            }

            // Stop polling after max attempts
            if (pollCount >= maxPolls) {
                this.hideInsightsRefreshing();
                clearInterval(this.insightsPollingInterval);
            }
        }, 15000); // Poll every 15 seconds
    }

    updateMetricRowInTable(metricId, updatedMetric) {
        // Find the metric row and update it with new values
        const metricRow = document.querySelector(`[data-metric-id="${metricId}"]`);
        if (!metricRow) return;

        // Check if this metric has a valid canonical match to remove "Needs Review"
        const metricMatchOld = window.metricUtils ? window.metricUtils.findMetricMatch(updatedMetric.metric_name) : null;
        const needsReview = !metricMatchOld || updatedMetric.needs_review;

        // Update the metric name cell and remove "Needs Review" badge if metric is now valid
        const nameCell = metricRow.querySelector('td:first-child');
        if (nameCell) {
            const metricNameSpan = nameCell.querySelector('.metric-name');
            if (metricNameSpan) {
                metricNameSpan.textContent = updatedMetric.metric_name;
            }

            // Remove existing "Needs Review" indicator
            const existingIndicator = nameCell.querySelector('.needs-review-indicator');
            if (existingIndicator) {
                existingIndicator.remove();
            }

            // Add "Needs Review" indicator only if still needed
            if (needsReview) {
                const indicator = document.createElement('span');
                indicator.className = 'needs-review-indicator';
                indicator.textContent = 'NEEDS REVIEW';
                nameCell.appendChild(indicator);
            }
        }

        // Update the value cell (show value with unit)
        const valueCell = metricRow.querySelector('.metric-value');
        if (valueCell) {
            const valueText = updatedMetric.metric_value || '-';
            const unitText = updatedMetric.metric_unit ? ` ${updatedMetric.metric_unit}` : '';
            valueCell.textContent = `${valueText}${unitText}`;
        }

        // Update the unit cell
        const unitCells = metricRow.querySelectorAll('td');
        if (unitCells.length > 2) {
            unitCells[2].textContent = updatedMetric.metric_unit || '—';
        }

        // Update the date cell
        const dateCell = metricRow.querySelector('.metric-date');
        if (dateCell && updatedMetric.test_date) {
            const testDate = new Date(updatedMetric.test_date);
            dateCell.textContent = testDate.toLocaleDateString();
        }

        // Update the data attributes for future edits
        metricRow.dataset.testDate = updatedMetric.test_date;

        // Update the range indicator preferring metric.reference_range
        const rangeCell = metricRow.querySelector('.range-indicator');

        // Get custom metrics for range analysis
        const systemData = this.currentSystemData || {};
        const customMetrics = systemData.customMetrics || [];
        const metricMatch = window.metricUtils ? 
            window.metricUtils.findMetricMatch(updatedMetric.metric_name, systemData.system?.name || systemData.name, customMetrics) : null;

        if (rangeCell && window.metricUtils && metricMatch) {
            if (updatedMetric.metric_value) {
                const status = window.metricUtils.calculateStatus(
                    updatedMetric.metric_value, 
                    metricMatch.normalRangeMin, 
                    metricMatch.normalRangeMax
                );
                const statusClass = statusText.toLowerCase().replace(' ', '-');
                const rangeBar = window.metricUtils.generateMicroRangeBar(
                    updatedMetric.metric_value,
                    metricMatch.normalRangeMin,
                    metricMatch.normalRangeMax
                );

                rangeCell.innerHTML = `
                    <div class="metric-range-block">
                        <div class="metric-status-chip ${statusClass}">${statusText}</div>
                        ${rangeBar}
                        <div class="normal-range-caption" style="text-align: center; display: flex; flex-direction: column; align-items: center;">
                            <div>
                                Normal Range: ${metricMatch.normalRangeMin}–${metricMatch.normalRangeMax}${metricMatch.units ? ` ${metricMatch.units}` : ''}
                            <span class="info-icon" data-metric="${updatedMetric.metric_name}" data-bs-toggle="tooltip" 
                                  title="${this.generateTooltipTitle(metricMatch, updatedMetric.metric_name)}">i</span>
                            </div>
                        </div>
                    </div>
                `;
            } else if (rangeCell) {
                rangeCell.innerHTML = `
                    <div class="metric-range-block">
                        <div class="metric-status-chip no-data">No data</div>
                        <div style="color: #8E8E93; font-size: 11px; margin-top: 4px;">Reference range not available</div>
                    </div>
                `;
            }
        }

        // Badge for extreme values excluded from analysis
        const nameCell2 = metricRow.querySelector('td:first-child');
        if (nameCell2) {
            let badge = nameCell2.querySelector('.badge-review');
            let shouldBadge = !!updatedMetric.exclude_from_analysis;

            // Fallback auto-detect if not flagged by backend
            if (!shouldBadge && window.metricUtils && updatedMetric.metric_value != null) {
                const systemData2 = this.currentSystemData || {};
                const customMetrics2 = systemData2.customMetrics || [];
                const metricMatch = window.metricUtils ?
                    window.metricUtils.findMetricMatch(updatedMetric.metric_name, systemData2.system?.name || systemData2.name, customMetrics2) : null;
                const v = parseFloat(updatedMetric.metric_value);
                const bMin = metricMatch && typeof metricMatch.normalRangeMin === 'number' ? metricMatch.normalRangeMin : null;
                const bMax = metricMatch && typeof metricMatch.normalRangeMax === 'number' ? metricMatch.normalRangeMax : null;
                if (bMax && v > bMax * 50) shouldBadge = true;
                if (bMin && bMin > 0 && v < bMin / 50) shouldBadge = true;

                // If extreme detected, persist exclusion silently
                if (shouldBadge) {
                    try {
                        this.apiCall(`/metrics/${metricId}`, 'PUT', { exclude_from_analysis: true, review_reason: 'Auto-flagged on render' });
                        updatedMetric.exclude_from_analysis = true;
                    } catch(_) {}
                }
            }
            if (shouldBadge && !badge) {
                badge = document.createElement('span');
                badge.className = 'badge bg-warning text-dark ms-2 badge-review';
                badge.textContent = 'Review Value';
                nameCell2.appendChild(badge);
            } else if (!shouldBadge && badge) {
                badge.remove();
            }
        }
    }

    renderStudiesSection(studies) {
        if (!studies || studies.length === 0) {
            return `
                <div class="text-center py-4">
                    <i class="fas fa-images fa-3x text-muted mb-3"></i>
                    <p style="color: #EBEBF5;">No visual studies available for this system yet.</p>
                    <p style="color: #8E8E93; font-size: 13px;">Upload imaging studies like X-rays, MRIs, or eye scans to see them here.</p>
                </div>
            `;
        }

        const studiesList = studies.map(study => {
            const testDate = study.test_date ? new Date(study.test_date).toLocaleDateString() : 'Unknown date';
            const keyMetricsText = this.formatStudyKeyMetrics(study.metrics_json);

            return `
                <div class="study-item mb-3 p-3" style="background: #2C2C2E; border-radius: 8px; border: 1px solid #3A3A3C;">
                    <div class="row align-items-center">
                        <div class="col-md-2">
                            ${this.renderStudyThumbnail(study)}
                        </div>
                        <div class="col-md-10">
                            <div class="row">
                                <div class="col-md-8">
                                    <h6 style="color: #FFFFFF; margin-bottom: 8px;">
                                        ${this.formatStudyType(study.study_type)}
                                    </h6>
                                    <p style="color: #8E8E93; font-size: 13px; margin-bottom: 4px;">
                                        <i class="fas fa-calendar me-1"></i>${testDate}
                                    </p>
                                    ${keyMetricsText ? `
                                        <p style="color: #EBEBF5; font-size: 13px; margin-bottom: 0;">
                                            <i class="fas fa-chart-line me-1"></i>${keyMetricsText}
                                        </p>
                                    ` : ''}
                                </div>
                                <div class="col-md-4 text-end">
                                    <button class="btn btn-sm btn-outline-primary" onclick="app.showStudyDetails(${study.id})">
                                        <i class="fas fa-eye me-1"></i>View Details
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="studies-list">
                ${studiesList}
                <div class="text-center mt-3">
                    <p style="color: #8E8E93; font-size: 12px;">
                        ${studies.length} visual ${studies.length === 1 ? 'study' : 'studies'} found for this system
                    </p>
                </div>
            </div>
        `;
    }

    renderStudyThumbnail(study) {
        if (study.thumbnail_url) {
            return `
                <img src="${study.thumbnail_url}" 
                     alt="Study thumbnail" 
                     class="img-fluid rounded" 
                     style="max-height: 80px; object-fit: cover;">
            `;
        } else {
            // Placeholder based on study type
            const icon = this.getStudyTypeIcon(study.study_type);
            return `
                <div class="study-placeholder d-flex align-items-center justify-content-center rounded" 
                     style="height: 80px; background: #3A3A3C; color: #8E8E93;">
                    <i class="${icon} fa-2x"></i>
                </div>
            `;
        }
    }

    formatStudyType(studyType) {
        const typeMap = {
            'eye_topography': 'Eye Topography',
            'oct': 'OCT Scan',
            'fundus': 'Fundus Photography',
            'mri': 'MRI Scan',
            'ct': 'CT Scan',
            'xray': 'X-Ray',
            'dexa': 'DEXA Scan',
            'ecg': 'ECG',
            'eeg': 'EEG',
            'unknown': 'Unknown Study'
        };
        return typeMap[studyType] || studyType.replace('_', ' ').toUpperCase();
    }

    getStudyTypeIcon(studyType) {
        const iconMap = {
            'eye_topography': 'fas fa-eye',
            'oct': 'fas fa-eye',
            'fundus': 'fas fa-eye',
            'mri': 'fas fa-brain',
            'ct': 'fas fa-brain',
            'xray': 'fas fa-bone',
            'dexa': 'fas fa-bone',
            'ecg': 'fas fa-heartbeat',
            'eeg': 'fas fa-brain',
            'unknown': 'fas fa-file-medical'
        };
        return iconMap[studyType] || 'fas fa-file-medical';
    }

    formatStudyKeyMetrics(metricsJson) {
        if (!metricsJson || !Array.isArray(metricsJson) || metricsJson.length === 0) {
            return '';
        }

        // Show first 2-3 key metrics
        const keyMetrics = metricsJson.slice(0, 3);
        return keyMetrics.map(metric => 
            `${metric.name}: ${metric.value}${metric.units ? ` ${metric.units}` : ''}`
        ).join(', ');
    }

    async showStudyDetails(studyId) {
        try {
            this.showLoading(true);
            const study = await this.apiCall(`/imaging-studies/${studyId}`, 'GET');
            this.renderStudyDetailsModal(study);
        } catch (error) {
            console.error('Failed to load study details:', error);
            this.showToast('error', 'Study Details', 'Failed to load study details');
        } finally {
            this.showLoading(false);
        }
    }

    renderStudyDetailsModal(study) {
        // Create and show a modal with full study details
        const modalHtml = `
            <div class="modal fade" id="studyDetailsModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content" style="background: #1C1C1E; border: 1px solid #3A3A3C;">
                        <div class="modal-header" style="border-bottom: 1px solid #3A3A3C;">
                            <h5 class="modal-title" style="color: #FFFFFF;">
                                ${this.formatStudyType(study.study_type)} - ${new Date(study.test_date).toLocaleDateString()}
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <h6 style="color: #FFFFFF;">AI Summary</h6>
                                    <p style="color: #EBEBF5; font-size: 14px;">${study.ai_summary || 'No summary available'}</p>

                                    ${study.comparison_summary ? `
                                        <h6 style="color: #FFFFFF; margin-top: 20px;">Comparison Analysis</h6>
                                        <p style="color: #EBEBF5; font-size: 14px;">${study.comparison_summary}</p>
                                    ` : ''}
                                </div>
                                <div class="col-md-6">
                                    <h6 style="color: #FFFFFF;">Measurements</h6>
                                    ${this.renderStudyMetricsTable(study.metrics_json)}

                                    ${study.metric_changes_json ? `
                                        <h6 style="color: #FFFFFF; margin-top: 20px;">Metric Changes</h6>
                                        ${this.renderMetricChangesTable(study.metric_changes_json)}
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer" style="border-top: 1px solid #3A3A3C;">
                            ${study.file_url ? `
                                <a href="${study.file_url}" target="_blank" class="btn btn-outline-primary">
                                    <i class="fas fa-download me-1"></i>Download Original
                                </a>
                            ` : ''}
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if present
        const existingModal = document.getElementById('studyDetailsModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add modal to DOM and show
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = new bootstrap.Modal(document.getElementById('studyDetailsModal'));
        modal.show();
    }

    renderStudyMetricsTable(metricsJson) {
        if (!metricsJson || !Array.isArray(metricsJson) || metricsJson.length === 0) {
            return '<p style="color: #8E8E93; font-size: 13px;">No measurements available</p>';
        }

        const rows = metricsJson.map(metric => `
            <tr>
                <td style="color: #EBEBF5; font-size: 13px;">${metric.name}</td>
                <td style="color: #FFFFFF; font-size: 13px;">${metric.value} ${metric.units || ''}</td>
            </tr>
        `).join('');

        return `
            <table class="table table-sm" style="color: #EBEBF5;">
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;
    }

    renderMetricChangesTable(metricChangesJson) {
        if (!metricChangesJson || !Array.isArray(metricChangesJson) || metricChangesJson.length === 0) {
            return '<p style="color: #8E8E93; font-size: 13px;">No changes to compare</p>';
        }

        const rows = metricChangesJson.map(change => {
            const trendClass = {
                'improved': 'text-success',
                'stable': 'text-info',
                'worsened': 'text-warning',
                'new_finding': 'text-primary'
            }[change.trend] || 'text-secondary';

            return `
                <tr>
                    <td style="color: #EBEBF5; font-size: 12px;">${change.metric}</td>
                    <td style="color: #8E8E93; font-size: 12px;">${change.previous.value} ${change.previous.units || ''}</td>
                    <td style="color: #FFFFFF; font-size: 12px;">${change.current.value} ${change.current.units || ''}</td>
                    <td class="${trendClass}" style="font-size: 12px;">${change.trend.replace('_', ' ')}</td>
                </tr>
            `;
        }).join('');

        return `
            <table class="table table-sm">
                <thead>
                    <tr style="color: #8E8E93; font-size: 11px;">
                        <th>Metric</th>
                        <th>Previous</th>
                        <th>Current</th>
                        <th>Trend</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;
    }

    refreshCurrentSystemView() {
        // Get current system from modal title
        const modalTitle = document.getElementById('systemModalTitle');
        if (modalTitle && modalTitle.textContent) {
            const systemMatch = modalTitle.textContent.match(/(\w+)\s+System/);
            if (systemMatch) {
                const systemName = systemMatch[1];

                // Find system ID from dashboard data
                if (this.dashboardData && this.dashboardData.systems) {
                    const system = this.dashboardData.systems.find(s => 
                        s.name.toLowerCase().includes(systemName.toLowerCase())
                    );
                    if (system) {
                        this.showSystemDetails(system.id);
                    }
                }
            }
        }
    }

    async populateMetricDropdown(selectElement, systemId, currentMetric) {
        try {
            // Fetch available metric types from new API endpoint
            const response = await this.apiCall(`/metrics/types?systemId=${systemId}`, 'GET');
            const { officialMetricNames, approvedCustomMetricNames, userPendingMetricNames } = response;

            // Clear existing options except current
            selectElement.innerHTML = `<option value="${currentMetric}" selected>${currentMetric}</option>`;

            // Add all available metric names
            const allMetricNames = [
                ...officialMetricNames,
                ...approvedCustomMetricNames,
                ...userPendingMetricNames
            ];

            // Remove duplicates and current metric
            const uniqueMetrics = [...new Set(allMetricNames)].filter(name => name !== currentMetric);

            uniqueMetrics.forEach(metricName => {
                const option = document.createElement('option');
                option.value = metricName;
                option.textContent = metricName;
                selectElement.appendChild(option);
            });

            // Add "+ Add New Metric" option
            const addOption = document.createElement('option');
            addOption.value = '__ADD_NEW__';
            addOption.textContent = '+ Add New Metric Type';
            addOption.style.fontStyle = 'italic';
            addOption.style.color = '#007AFF';
            selectElement.appendChild(addOption);

            return true;
        } catch (error) {
            console.error('Failed to populate metric dropdown:', error);
            return false;
        }
    }

    generateUnitOptions(metricMatch, currentUnit) {
        const commonUnits = ['mg/dL', 'mmHg', 'g/dL', '%', 'U/L', 'ng/mL', 'pg/mL', 'μg/L', 'IU/mL', 'beats/min', 'L/min'];

        let options = `<option value="${currentUnit || ''}">${currentUnit || 'Select unit'}</option>`;

        if (metricMatch && metricMatch.units && metricMatch.units !== currentUnit) {
            options += `<option value="${metricMatch.units}">${metricMatch.units} (recommended)</option>`;
        }

        commonUnits.forEach(unit => {
            if (unit !== currentUnit && (!metricMatch || unit !== metricMatch.units)) {
                options += `<option value="${unit}">${unit}</option>`;
            }
        });

        return options;
    }

    async editMetric(metricId) {
        try { console.log('[EDIT_METRIC] Click', { metricId }); } catch (_) {}
        const editRow = document.getElementById(`edit-row-${metricId}`);
        const editForm = document.getElementById(`edit-form-${metricId}`);
        const displayRow = document.getElementById(`metric-row-${metricId}`);

        // Show edit form and hide display row
        displayRow.classList.add('d-none');
        editRow.classList.remove('d-none');

        // Populate metric dropdown with available options
        const selectElement = document.getElementById(`edit-metric-${metricId}`);
        const systemId = selectElement.dataset.systemId;
        const currentMetric = selectElement.value;

        if (systemId) {
            await this.populateMetricDropdown(selectElement, systemId, currentMetric);

            // Add change handler for "+ Add New Metric" option
            selectElement.addEventListener('change', (e) => {
                if (e.target.value === '__ADD_NEW__') {
                    this.showInlineCustomMetricModal(systemId, metricId);
                } else {
                    // Update custom range status preview when metric changes
                    const dateVal = document.getElementById(`edit-date-${metricId}`)?.value || null;
                    this.updateCustomRangePreview(metricId, e.target.value, dateVal);
                    try { console.log('[EDIT_METRIC] Metric changed', { value: e.target.value, dateVal }); } catch (_) {}
                }
            });
        }

        // Pre-populate the date field with the existing metric date
        const metricRow = document.querySelector(`[data-metric-id="${metricId}"]`);
        if (metricRow) {
            const existingDate = metricRow.dataset.testDate;
            const dateInput = document.getElementById(`edit-date-${metricId}`);
            if (dateInput && existingDate) {
                // Convert date to YYYY-MM-DD format for HTML date input
                const dateObj = new Date(existingDate);
                if (!isNaN(dateObj.getTime())) {
                    const year = dateObj.getFullYear();
                    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const day = String(dateObj.getDate()).padStart(2, '0');
                    dateInput.value = `${year}-${month}-${day}`;
                    try { console.log('[EDIT_METRIC] Pre-populated date', { value: dateInput.value }); } catch (_) {}
                }
            }
            // Initial preview of custom range status and wire up inline range controls
            const currentName = selectElement.value;
            const dateVal = document.getElementById(`edit-date-${metricId}`)?.value || null;
            this.updateCustomRangePreview(metricId, currentName, dateVal);
            try { console.log('[EDIT_METRIC] Initial range preview', { currentName, dateVal }); } catch (_) {}

            // Toggle inline editor visibility
            const toggle = document.getElementById(`inline-range-enable-${metricId}`);
            const fields = document.getElementById(`inline-range-fields-${metricId}`);
            if (toggle && fields) {
                toggle.addEventListener('change', async (e) => {
                    fields.classList.toggle('d-none', !e.target.checked);
                    if (e.target.checked) {
                        await this.prefillInlineRange(metricId, currentName, dateVal);
                        try { console.log('[EDIT_METRIC] Inline range enabled and prefilled'); } catch (_) {}
                    }
                });

                // Change handler for condition 'other'
                const condSel = document.getElementById(`inline-condition-${metricId}`);
                const condWrap = document.getElementById(`inline-condition-details-wrap-${metricId}`);
                if (condSel && condWrap) {
                    condSel.addEventListener('change', (ev) => {
                        condWrap.style.display = ev.target.value === 'other' ? 'block' : 'none';
                        try { console.log('[EDIT_METRIC] Condition changed', { value: ev.target.value }); } catch (_) {}
                    });
                }

                // Wire exclude toggle
                const exToggle = document.getElementById(`inline-exclude-${metric.id}`);
                const exWrap = document.getElementById(`inline-exclude-reason-wrap-${metric.id}`);
                if (exToggle && exWrap) {
                    exToggle.addEventListener('change', (ev) => {
                        exWrap.style.display = ev.target.checked ? 'block' : 'none';
                        try { console.log('[EDIT_METRIC] Exclude toggled', { checked: ev.target.checked }); } catch (_) {}
                    });
                }
            }
        }

        editRow.classList.remove('d-none');
        editForm.classList.remove('d-none');
        editForm.style.display = 'block';
        try { console.log('[EDIT_METRIC] Form displayed'); } catch (_) {}
        try { editRow.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_) {}
    }

    async prefillInlineRange(metricId, metricName, testDate) {
        try {
            const res = await this.apiCall(`/custom-reference-ranges/metric/${encodeURIComponent(metricName)}${testDate ? `?testDate=${encodeURIComponent(testDate)}` : ''}`, 'GET');
            const r = res && res.custom_range;
            if (r) {
                document.getElementById(`inline-range-id-${metricId}`).value = r.id;
                document.getElementById(`inline-min-${metricId}`).value = r.min_value;
                document.getElementById(`inline-max-${metricId}`).value = r.max_value;
                document.getElementById(`inline-units-${metricId}`).value = r.units;
                document.getElementById(`inline-condition-${metricId}`).value = r.medical_condition || '';
                if (r.medical_condition === 'other') {
                    const wrap = document.getElementById(`inline-condition-details-wrap-${metricId}`);
                    if (wrap) wrap.style.display = 'block';
                    document.getElementById(`inline-condition-details-${metricId}`).value = r.condition_details || '';
                }
                document.getElementById(`inline-notes-${metricId}`).value = r.notes || '';
                if (r.valid_from) document.getElementById(`inline-valid-from-${metricId}`).value = this.toYMD(r.valid_from);
                if (r.valid_until) document.getElementById(`inline-valid-until-${metricId}`).value = this.toYMD(r.valid_until);
            } else {
                // Default prefill from catalog if available
                const match = window.metricUtils ? window.metricUtils.findMetricMatch(metricName) : null;
                if (match) {
                    document.getElementById(`inline-units-${metricId}`).value = match.units || '';
                    if (match.normalRangeMin != null) document.getElementById(`inline-min-${metricId}`).value = match.normalRangeMin;
                    if (match.normalRangeMax != null) document.getElementById(`inline-max-${metricId}`).value = match.normalRangeMax;
                }
                const defDate = this.toYMD(testDate || new Date());
                document.getElementById(`inline-valid-from-${metricId}`).value = defDate;
                document.getElementById(`inline-valid-until-${metricId}`).value = defDate;
            }
        } catch (_) {}
    }

    async updateCustomRangePreview(metricId, metricName, testDate) {
        try {
            const res = await this.apiCall(`/custom-reference-ranges/metric/${encodeURIComponent(metricName)}${testDate ? `?testDate=${encodeURIComponent(testDate)}` : ''}`, 'GET');
            const hasCustom = res && res.custom_range;
            const txt = document.getElementById(`current-range-text-${metricId}`);
            if (txt) {
                if (hasCustom) {
                    const r = res.custom_range;
                    txt.textContent = `Current: ${r.min_value} - ${r.max_value} ${r.units} (${r.medical_condition})`;
                } else {
                    txt.textContent = 'No custom range';
                }
            }
        } catch (e) {
            // Silent fail for preview
        }
    }

    openEditRangeFor(metricId) {
        const metricName = document.getElementById(`edit-metric-${metricId}`)?.value;
        if (!metricName) {
            this.showToast('warning', 'Select Metric', 'Please select a metric first');
            return;
        }
        // Store options for the modal
        this._customRangeModalOptions = {
            preselectMetricName: metricName,
            lockMetricSelection: true
        };
        this.showAddCustomRangeModal(null, this._customRangeModalOptions);
    }

    cancelMetricEdit(metricId) {
        const editRow = document.getElementById(`edit-row-${metricId}`);
        const editForm = document.getElementById(`edit-form-${metricId}`);
        const displayRow = document.getElementById(`metric-row-${metricId}`);

        // Hide edit form and show display row
        if (editRow) editRow.classList.add('d-none');
        if (editForm) editForm.classList.add('d-none');
        if (displayRow) displayRow.classList.remove('d-none');
    }

    async saveMetricEdit(metricId) {
        try {
            console.log('[SAVE_METRIC_EDIT] Submit', { metricId });
            const metricName = document.getElementById(`edit-metric-${metricId}`).value;
            const metricValue = document.getElementById(`edit-value-${metricId}`).value;
            const metricUnit = document.getElementById(`edit-unit-${metricId}`).value;
            const testDate = document.getElementById(`edit-date-${metricId}`).value;
            const rangeToggle = document.getElementById(`inline-range-enable-${metricId}`);
            const applyRange = !!(rangeToggle && rangeToggle.checked);

            // Build minimal update payload to avoid name validation when not changing name
            const displayRow = document.getElementById(`metric-row-${metricId}`);
            const originalName = displayRow?.querySelector('.metric-name')?.textContent || metricName;
            const updates = {
                metric_value: metricValue !== '' ? parseFloat(metricValue) : null,
                metric_unit: metricUnit,
                test_date: testDate || null
            };
            if (metricName && metricName !== originalName) {
                updates.metric_name = metricName;
            }
            if (applyRange) {
                const min = document.getElementById(`inline-min-${metricId}`).value;
                const max = document.getElementById(`inline-max-${metricId}`).value;
                const units = document.getElementById(`inline-units-${metricId}`).value;
                if (min && max && units) {
                    updates.reference_range = `${min}-${max} ${units}`;
                    updates.is_adjusted = true;
                }
            }

            // Auto-flag extreme outliers to be excluded from analysis (but still saved)
            try {
                const valNum = updates.metric_value;
                if (valNum != null) {
                    // Compute baseline range for rough sanity check
                    const systemData = this.currentSystemData || {};
                    const customMetrics = systemData.customMetrics || [];
                    const match = window.metricUtils ? window.metricUtils.findMetricMatch(metricName, systemData.system?.name || systemData.name, customMetrics) : null;
                    let bMin = null, bMax = null;
                    if (match) { bMin = match.normalRangeMin; bMax = match.normalRangeMax; }
                    // If known range and value is wildly out (e.g., > 50x max or < 1/50 min), flag
                    if (typeof bMax === 'number' && valNum > bMax * 50) {
                        updates.exclude_from_analysis = true;
                        updates.review_reason = 'Auto-flagged extreme high value';
                    } else if (typeof bMin === 'number' && bMin > 0 && valNum < bMin / 50) {
                        updates.exclude_from_analysis = true;
                        updates.review_reason = 'Auto-flagged extreme low value';
                    }
                }
            } catch (_) {}

            // Manual exclude toggle
            const excludeToggle = document.getElementById(`inline-exclude-${metricId}`);
            if (excludeToggle) {
                updates.exclude_from_analysis = !!excludeToggle.checked;
                const reasonInput = document.getElementById(`inline-exclude-reason-${metricId}`);
                if (updates.exclude_from_analysis && reasonInput && reasonInput.value) {
                    updates.review_reason = reasonInput.value;
                } else if (!updates.exclude_from_analysis) {
                    updates.review_reason = null;
                }
            }

            console.log('[SAVE_METRIC_EDIT] Updates payload', updates);
            const response = await this.apiCall(`/metrics/${metricId}`, 'PUT', updates);
            console.log('[SAVE_METRIC_EDIT] Response', response);

            if (response.success) {
                // Ensure immediate UI reflects adjusted state when range was applied
                try {
                    if (applyRange && response.metric) {
                        response.metric.is_adjusted = true;
                    }
                } catch(_) {}
                // If range editing is enabled, persist custom range
                if (applyRange) {
                    const rangeId = document.getElementById(`inline-range-id-${metricId}`).value;
                    const payload = {
                        metric_name: metricName,
                        min_value: parseFloat(document.getElementById(`inline-min-${metricId}`).value),
                        max_value: parseFloat(document.getElementById(`inline-max-${metricId}`).value),
                        units: document.getElementById(`inline-units-${metricId}`).value,
                        medical_condition: document.getElementById(`inline-condition-${metricId}`).value || 'other',
                        condition_details: document.getElementById(`inline-condition-details-${metricId}`).value || null,
                        notes: document.getElementById(`inline-notes-${metricId}`).value || '',
                        valid_from: document.getElementById(`inline-valid-from-${metricId}`).value || new Date().toISOString().split('T')[0],
                        valid_until: document.getElementById(`inline-valid-until-${metricId}`).value || null
                    };

                    if (!payload.metric_name || !payload.min_value || !payload.max_value || !payload.units) {
                        this.showToast('warning', 'Validation', 'Please complete the reference range fields');
                    } else if (payload.min_value >= payload.max_value) {
                        this.showToast('warning', 'Validation', 'Min must be less than Max');
                    } else {
                        try {
                            const method = rangeId ? 'PUT' : 'POST';
                            const url = rangeId ? `/custom-reference-ranges/${rangeId}` : '/custom-reference-ranges';
                            await this.apiCall(url, method, payload);
                            this.showToast('success', 'Custom Range', rangeId ? 'Range updated' : 'Range created');
                        } catch (e) {
                            this.showToast('error', 'Custom Range', e.message || 'Failed to save range');
                        }
                    }
                }

                this.showToast('success', 'Metric Updated', 'Metric updated. AI insights and daily plan refreshed.');

                // Update the metric row in the table immediately
                this.updateMetricRowInTable(metricId, response.metric);

                // Hide edit form  
                this.cancelMetricEdit(metricId);

                // Show refreshing state for insights
                this.showInsightsRefreshing();

                // Start polling for updated insights
                this.startInsightsPolling(this.user?.id);

                // Refresh main dashboard to update tile colors immediately  
                setTimeout(() => {
                    this.loadDashboard();
                }, 1000);
            } else {
                throw new Error(response.message || 'Failed to update metric');
            }
        } catch (error) {
            console.error('Error updating metric:', error);
            this.showToast('error', 'Update Failed', error.message);
        }
    }

    renderSystemInsights(insights) {
        // Handle both old and new insight formats
        const systemStatus = insights.system_status || insights.overall_status;
        const summaryInsight = insights.summary_insight || insights.key_findings?.join('. ');
        const outOfRangeMetrics = insights.out_of_range_metrics || [];
        const recommendations = insights.recommendations || [];

        // Map status to badge color
        const statusColor = {
            'Optimal': 'success',
            'excellent': 'success',
            'Mild Concern': 'primary', 
            'good': 'primary',
            'At Risk': 'warning',
            'fair': 'warning',
            'High Risk': 'danger',
            'concerning': 'danger',
            'critical': 'danger'
        }[systemStatus] || 'secondary';

        return `
            <div class="mb-3">
                <span class="badge bg-${statusColor} mb-2" style="font-size: 0.9rem;">${systemStatus}</span>
                ${summaryInsight ? `<div style="color: #FFFFFF; margin-top: 8px; line-height: 1.4;">${summaryInsight}</div>` : ''}
            </div>

            ${outOfRangeMetrics && outOfRangeMetrics.length > 0 ? `
                <div class="mb-3">
                    <h6 style="color: #FFFFFF; font-size: 0.9rem; margin-bottom: 12px;">
                        <i class="fas fa-exclamation-triangle text-warning me-2"></i>Metrics Needing Attention:
                    </h6>
                    ${outOfRangeMetrics.map(metric => `
                        <div class="mb-3" style="background: rgba(255,193,7,0.1); padding: 12px; border-radius: 8px; border-left: 3px solid #ffc107;">
                            <div style="color: #FFFFFF; font-weight: 600; font-size: 0.9rem;">${metric.metric_name}</div>
                            <div style="color: #ffc107; font-size: 0.85rem; margin: 4px 0;">${metric.value_and_range}</div>
                            <div style="color: #EBEBF5; font-size: 0.8rem; line-height: 1.3;">
                                ${metric.definition} ${metric.implication}
                            </div>
                            ${metric.recommendations ? `
                                <div style="color: #FFFFFF; font-size: 0.8rem; margin-top: 6px; font-style: italic;">
                                    💡 ${metric.recommendations}
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            ` : ''}

            ${recommendations && recommendations.length > 0 ? `
                <div class="mb-3">
                    <h6 style="color: #FFFFFF; font-size: 0.9rem; margin-bottom: 12px;">
                        <i class="fas fa-lightbulb text-info me-2"></i>Recommendations:
                    </h6>
                    <ul class="list-unstyled">
                        ${recommendations.slice(0, 5).map(rec => `
                            <li class="mb-2" style="color: #FFFFFF; font-size: 0.85rem; line-height: 1.3;">
                                <i class="fas fa-arrow-right text-info me-2" style="font-size: 0.7rem;"></i>
                                ${typeof rec === 'string' ? rec : (rec.action || rec)}
                                ${typeof rec === 'object' && rec.rationale ? 
                                    `<div style="color: #ABABAB; font-size: 0.75rem; margin-left: 16px; margin-top: 2px;">${rec.rationale}</div>` : ''
                                }
                            </li>
                        `).join('')}
                    </ul>
                </div>
            ` : ''}

            <small style="color: #8E8E93; font-size: 0.75rem;">
                <i class="fas fa-clock me-1"></i>
                Generated: ${insights.generated_at ? new Date(insights.generated_at).toLocaleString() : 'Recently'}
            </small>
        `;
    }

    // Daily Plan Methods
    async loadDailyPlan() {
        this.showLoading(true);
        try {
            const data = await this.apiCall('/dashboard/daily-plan');
            const planList = document.getElementById('daily-plan-list');
            if (!planList) return;

            planList.innerHTML = '';

            data.daily_plan.forEach(plan => {
                const planItem = document.createElement('div');
                planItem.className = 'daily-plan-item mb-3';
                planItem.innerHTML = `
                    <div class="card">
                        <div class="card-body">
                            <h5 class="card-title">${plan.title}</h5>
                            <p class="card-text">${plan.description}</p>
                            <p class="card-text"><strong>Date:</strong> ${new Date(plan.date).toLocaleDateString()}</p>
                            <p class="card-text"><strong>Status:</strong> ${plan.status}</p>
                            <p class="card-text"><strong>Priority:</strong> ${plan.priority}</p>
                            <p class="card-text"><strong>Category:</strong> ${plan.category}</p>
                            <p class="card-text"><strong>Actions:</strong> ${plan.actions.join(', ')}</p>
                        </div>
                    </div>
                `;
                planList.appendChild(planItem);
            });
        } catch (error) {
            console.error('Failed to load daily plan:', error);
            this.showToast('error', 'Daily Plan', 'Failed to load daily plan');
        } finally {
            this.showLoading(false);
        }
    }

    renderDailyPlan(dailyPlan) {
        const container = document.getElementById('dailyPlanContent');

        if (!dailyPlan) {
            container.innerHTML = `
                <div class="card-vibrant">
                    <div class="card-body text-center py-5">
                        <i class="fas fa-calendar-plus fa-4x text-muted mb-4" style="color: var(--apple-blue)"></i>
                        <h4 class="mb-3">No Daily Plan Available</h4>
                        <p class="text-muted mb-4">Upload some health data to generate your personalized daily plan</p>
                        <button class="btn btn-gradient-primary" onclick="document.getElementById('uploads-tab').click()">
                            <i class="fas fa-upload me-2"></i>Upload Health Data
                        </button>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="card-vibrant">
                <div class="card-header" style="background: var(--gradient-blue);">
                    <div class="d-flex justify-content-between align-items-center">
                        <h5 class="mb-0 text-white">
                            <i class="fas fa-calendar-day me-2"></i>
                            Daily Plan for ${dailyPlan.plan_date ? new Date(dailyPlan.plan_date).toLocaleDateString() : 'Today'}
                        </h5>
                        <small class="text-white-50">
                            Generated: ${dailyPlan.generated_at ? new Date(dailyPlan.generated_at).toLocaleString() : 'Recently'}
                        </small>
                    </div>
                </div>
                <div class="card-body">
                    ${dailyPlan.key_focus_areas && dailyPlan.key_focus_areas.length > 0 ? `
                        <div class="mb-4">
                            <h6 class="text-muted mb-3">
                                <i class="fas fa-bullseye me-2"></i>Focus Areas:
                            </h6>
                            <div class="d-flex flex-wrap gap-2">
                                ${dailyPlan.key_focus_areas.map((area, index) => `
                                    <span class="focus-area-badge">${area}</span>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    ${dailyPlan.recommendations && dailyPlan.recommendations.length > 0 ? `
                        <div class="mb-4">
                            <h6 class="text-muted mb-3">
                                <i class="fas fa-lightbulb me-2"></i>Recommendations:
                            </h6>
                            <div class="row">
                                ${dailyPlan.recommendations.map((rec, index) => {
                                    const priorityClass = rec.priority === 'high' ? 'recommendation-high' : 
                                                        rec.priority === 'medium' ? 'recommendation-medium' : 'recommendation-low';
                                    const priorityGradient = rec.priority === 'high' ? 'var(--gradient-pink)' : 
                                                            rec.priority === 'medium' ? 'var(--gradient-yellow)' : 'var(--gradient-green)';
                                    return `
                                        <div class="col-md-6 mb-3">
                                            <div class="daily-plan-card ${priorityClass}">
                                                <div class="card-header" style="background: ${priorityGradient};">
                                                    <div class="d-flex justify-content-between align-items-center">
                                                        <span class="badge bg-white text-dark">${rec.category}</span>
                                                        <span class="badge bg-white text-dark text-capitalize">${rec.priority}</span>
                                                    </div>
                                                </div>
                                                <div class="card-body">
                                                    <h6 class="card-title mb-2">
                                                        ${rec.action}
                                                        <span class="metric-info-icon" title="Click for more information about ${rec.action}">i</span>
                                                        <div class="metric-tooltip">
                                                            ${rec.reason}
                                                        </div>
                                                    </h6>
                                                    <p class="card-text text-muted small">${rec.reason}</p>
                                                </div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}

                    ${dailyPlan.estimated_compliance_time_minutes ? `
                        <div class="text-center">
                            <small class="text-muted">
                                <i class="fas fa-clock me-1"></i>
                                Estimated time: ${dailyPlan.estimated_compliance_time_minutes} minutes
                            </small>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    async regenerateDailyPlan() {
        this.showLoading(true);
        try {
            await this.apiCall('/dashboard/daily-plan/regenerate', 'POST');
            this.showToast('success', 'Daily Plan', 'Daily plan regeneration queued. Check back in a few minutes.');

            // Reload after a delay
            setTimeout(() => this.loadDailyPlan(), 30000);
        } catch (error) {
            console.error('Failed to regenerate daily plan:', error);
            this.showToast('error', 'Daily Plan', 'Failed to regenerate daily plan');
        } finally {
            this.showLoading(false);
        }
    }

    // Phase 1 Unified Pipeline Methods
    handleFileSelect(event) {
        const files = event.target.files;
        const uploadBtn = document.getElementById('uploadBtn');
        const dropZone = document.getElementById('dropZone');

        if (files.length > 0) {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = `<i class="fas fa-magic me-2"></i>Process ${files.length} File(s) with AI`;
            dropZone.style.borderColor = '#007AFF';
            dropZone.style.background = '#1a1a2e';
        } else {
            uploadBtn.disabled = true;
            uploadBtn.innerHTML = '<i class="fas fa-magic me-2"></i>Process with AI';
            dropZone.style.borderColor = '#3A3A3C';
            dropZone.style.background = '#2C2C2E';
        }
    }

    setupDragAndDrop() {
        const dropZone = document.getElementById('dropZone');
        if (!dropZone) return;

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#007AFF';
            dropZone.style.background = '#1a1a2e';
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#3A3A3C';
            dropZone.style.background = '#2C2C2E';
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#3A3A3C';
            dropZone.style.background = '#2C2C2E';

            const files = e.dataTransfer.files;
            const fileInput = document.getElementById('fileUpload');
            fileInput.files = files;

            // Trigger change event
            const event = new Event('change', { bubbles: true });
            fileInput.dispatchEvent(event);
        });

        dropZone.addEventListener('click', (e) => {
            // Only trigger file input if clicking on dropZone itself, not on child elements like the button
            if (e.target === dropZone || e.target.classList.contains('upload-icon') || e.target.classList.contains('fa-cloud-upload-alt')) {
                document.getElementById('fileUpload').click();
            }
        });
    }

    async uploadFilesToUnifiedPipeline() {
        const fileInput = document.getElementById('fileUpload');
        const files = fileInput.files;
        const testDateInput = document.getElementById('testDate');

        if (files.length === 0) return;

        this.showUploadProgress(true);
        const results = [];

        try {
            // Process files one by one through unified pipeline
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                console.log(`[UPLOAD] Processing file ${i + 1}/${files.length}: ${file.name}`);

                // Update progress
                const progress = ((i / files.length) * 100).toFixed(0);
                document.querySelector('#uploadProgress .progress-bar').style.width = `${progress}%`;

                const formData = new FormData();
                formData.append('file', file);
                if (testDateInput.value) {
                    formData.append('testDate', testDateInput.value);
                }

                const response = await fetch(`${this.apiBase}/ingestFile`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`
                    },
                    body: formData
                });

                const result = await response.json();
                results.push({ fileName: file.name, result });

                if (!response.ok) {
                    throw new Error(result.message || `Failed to process ${file.name}`);
                }
            }

            // Complete progress
            document.querySelector('#uploadProgress .progress-bar').style.width = '100%';

            // Show results
            this.showUploadResults(results);

            // Clean up
            fileInput.value = '';
            testDateInput.value = '';
            document.getElementById('uploadBtn').disabled = true;

            // Refresh dashboard to show new data
            setTimeout(() => {
                this.loadDashboard();
            }, 2000);

        } catch (error) {
            console.error('Upload pipeline error:', error);
            this.showUploadError(error.message);
        } finally {
            this.showUploadProgress(false);
        }
    }

    showUploadProgress(show) {
        const progressDiv = document.getElementById('uploadProgress');
        if (show) {
            progressDiv.style.display = 'block';
            document.querySelector('#uploadProgress .progress-bar').style.width = '0%';
        } else {
            setTimeout(() => {
                progressDiv.style.display = 'none';
            }, 3000);
        }
    }

    showUploadResults(results) {
        const resultDiv = document.getElementById('uploadResult');

        const successCount = results.filter(r => r.result.success).length;
        const totalCount = results.length;

        let html = `
            <div class="alert alert-success" style="background: #1e3a3a; border: 1px solid #28a745; color: #FFFFFF;">
                <h6><i class="fas fa-check-circle me-2"></i>Processing Complete</h6>
                <p class="mb-2">${successCount}/${totalCount} files processed successfully</p>
        `;

        results.forEach(({ fileName, result }) => {
            if (result.success) {
                const dataType = result.dataType || 'unknown';
                const icon = dataType === 'lab' ? 'fas fa-vials' : 
                           dataType === 'visual' ? 'fas fa-images' : 
                           'fas fa-file-medical';

                html += `
                    <div class="mb-2 p-2" style="background: #2C2C2E; border-radius: 4px;">
                        <strong><i class="${icon} me-1"></i>${fileName}</strong>
                        <div style="font-size: 13px; color: #8E8E93;">
                            Type: ${dataType} | ${result.message || 'Processed successfully'}
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="mb-2 p-2" style="background: #3a1e1e; border-radius: 4px;">
                        <strong><i class="fas fa-exclamation-triangle me-1"></i>${fileName}</strong>
                        <div style="font-size: 13px; color: #dc3545;">Error: ${result.error || 'Processing failed'}</div>
                    </div>
                `;
            }
        });

        html += '</div>';

        resultDiv.innerHTML = html;
        resultDiv.style.display = 'block';

        // Auto-hide after 10 seconds
        setTimeout(() => {
            resultDiv.style.display = 'none';
        }, 10000);
    }

    showUploadError(message) {
        const resultDiv = document.getElementById('uploadResult');
        resultDiv.innerHTML = `
            <div class="alert alert-danger" style="background: #3a1e1e; border: 1px solid #dc3545; color: #FFFFFF;">
                <h6><i class="fas fa-exclamation-triangle me-2"></i>Processing Failed</h6>
                <p>${message}</p>
            </div>
        `;
        resultDiv.style.display = 'block';
    }

    async loadUploads() {
        try {
            const resp = await this.apiCall('/uploads?limit=5');
            const uploads = Array.isArray(resp)
                ? resp
                : (resp.uploads || resp.data?.uploads || resp.rows || []);
            this.renderUploads(uploads);
        } catch (error) {
            console.error('Failed to load uploads:', error);
            this.showToast('error', 'Uploads', error.message || 'Failed to load uploads');
        } finally {
            this.showLoading(false);
        }
    }

    renderUploads(uploads) {
        const container = document.getElementById('uploadsList');

        if (uploads.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <i class="fas fa-cloud-arrow-up"></i>
                    </div>
                    <div class="empty-state-title">No uploads yet</div>
                    <div class="empty-state-text">Upload your first health document to get started</div>
                </div>
            `;
            return;
        }
        container.innerHTML = items.map(u => `
            <div class="upload-item">
                <div><strong>${u.filename || 'Untitled'}</strong></div>
                <div class="small text-muted">Status: ${u.processing_status || 'unknown'} | ${u.created_at ? new Date(u.created_at).toLocaleString() : ''}</div>
            </div>
        `).join('');
    }

    getStatusColor(status) {
        const colors = {
            'pending': 'warning',
            'processing': 'info',
            'completed': 'success',
            'failed': 'danger'
        };
        return colors[status] || 'secondary';
    }

    async viewUploadDetails(uploadId) {
        // Implementation for viewing upload details
        this.showToast('info', 'Upload Details', 'Upload details modal would be implemented here');
    }

    async retryUpload(uploadId) {
        this.showLoading(true);
        try {
            await this.apiCall(`/uploads/${uploadId}/retry`, 'POST');
            this.showToast('success', 'Upload Retry', 'Upload queued for retry');
            this.loadUploads();
        } catch (error) {
            console.error('Retry upload error:', error);
            this.showToast('error', 'Retry Failed', error.message);
        } finally {
            this.showLoading(false);
        }
    }

    async deleteUpload(uploadId) {
        if (!confirm('Are you sure you want to delete this upload?')) return;

        this.showLoading(true);
        try {
            await this.apiCall(`/uploads/${uploadId}`, 'DELETE');
            this.showToast('success', 'Upload Deleted', 'Upload deleted successfully');
            this.loadUploads();
        } catch (error) {
            console.error('Delete upload error:', error);
            this.showToast('error', 'Delete Failed', error.message);
        } finally {
            this.showLoading(false);
        }
    }

    // Trends Methods


    // Utility Methods
    async apiCall(endpoint, method = 'GET', data = null, customHeaders = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...customHeaders  // Merge custom headers
        };

        // Prefer fresh in-memory token, fallback to localStorage
        const bearer = this.jwtToken || this.token || localStorage.getItem('jwtToken') || localStorage.getItem('authToken');
        if (bearer) {
            headers['Authorization'] = `Bearer ${bearer}`;
        }

        const config = {
            method,
            headers
        };

        if (data && method !== 'GET') {
            // Allow FormData
            if (data instanceof FormData) {
                delete headers['Content-Type'];
                config.body = data;
            } else {
                config.body = JSON.stringify(data);
            }
        }

        const response = await fetch(`${this.apiBase}${endpoint}`, config);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));

            // Handle 401 specifically for session expiry
            if (response.status === 401) {
                this.handleSessionExpiry();
                throw new Error(errorData.message || 'Session expired - please sign in again');
            }

            const error = new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
            error.status = response.status;
            throw error;
        }

        return await response.json();
    }

    handleSessionExpiry() {
        // Clear stored token
        localStorage.removeItem('authToken');
        this.token = null;
        this.user = null;

        // Show sign-in prompt
        this.showToast('warning', 'Session Expired', 'Please sign in again to continue');

        // Redirect to login after a short delay
        setTimeout(() => {
            this.showLogin();
        }, 2000);
    }

    showToast(type, title, message) {
        const toast = document.getElementById('alertToast');
        const icon = document.getElementById('toastIcon');
        const titleEl = document.getElementById('toastTitle');
        const messageEl = document.getElementById('toastMessage');

        // Set icon and color based on type
        const config = {
            success: { icon: 'fas fa-check-circle text-success', title: title },
            error: { icon: 'fas fa-exclamation-circle text-danger', title: title },
            warning: { icon: 'fas fa-exclamation-triangle text-warning', title: title },
            info: { icon: 'fas fa-info-circle text-info', title: title }
        };

        const toastConfig = config[type] || config.info;
        icon.className = toastConfig.icon;
        titleEl.textContent = toastConfig.title;
        messageEl.textContent = message;

        new bootstrap.Toast(toast).show();
    }

    // Helper function to normalize profile response with null safety
    normalizeProfileResponse(p = {}) {
        return {
            sex: p.sex ?? null,
            dateOfBirth: p.date_of_birth ?? null,
            heightIn: p.height_in ?? null,
            weightLb: p.weight_lb ?? null,
            preferredUnitSystem: p.preferred_unit_system ?? 'US',
            countryOfResidence: p.country_of_residence ?? null,
            ethnicity: p.ethnicity ?? null,
            smoker: (p.smoker === true ? true : p.smoker === false ? false : null),
            packsPerWeek: p.packs_per_week ?? null,
            alcoholDrinksPerWeek: p.alcohol_drinks_per_week ?? null,
            pregnant: (p.pregnant === true ? true : p.pregnant === false ? false : null),
            pregnancyStartDate: p.pregnancy_start_date ?? null,
            cyclePhase: p.cycle_phase ?? null
        };
    }

    // Helper function to build profile payload in snake_case
    buildProfilePayload(state) {
        return {
            sex: state.sex ?? null,
            date_of_birth: state.dateOfBirth ?? null,
            height_in: state.heightIn ? Number(state.heightIn) : null,
            weight_lb: state.weightLb ? Number(state.weightLb) : null,
            preferred_unit_system: state.preferredUnitSystem ?? 'US',
            country_of_residence: state.countryOfResidence ?? null,
            ethnicity: state.ethnicity ?? null,
            smoker: (state.smoker === true ? true : state.smoker === false ? false : null),
            packs_per_week: state.packsPerWeek === '' ? null : Number(state.packsPerWeek),
            alcohol_drinks_per_week: state.alcoholDrinksPerWeek === '' ? null : Number(state.alcoholDrinksPerWeek),
            pregnant: (state.pregnant === true ? true : state.pregnant === false ? false : null),
            pregnancy_start_date: state.pregnancyStartDate ?? null,
            cycle_phase: state.cyclePhase ?? null
        };
    }

    // Profile Methods
    async loadProfileData() {
        const startTime = performance.now();
        const correlationId = this.generateCorrelationId();

        this.logClient('PROFILE_LOAD_REQUESTED', {
            correlation_id: correlationId,
            url: '/api/profile',
            method: 'GET'
        });

        try {
            const response = await this.apiCall('/profile', 'GET', null, {
                'X-Request-ID': correlationId
            });

            const duration = performance.now() - startTime;

            // Handle both flat response and wrapped response for backwards compatibility
            const profileData = response.profile || response;
            const normalizedProfile = this.normalizeProfileResponse(profileData);
            this.currentProfile = normalizedProfile;

            // Create privacy-safe summary for logging
            const profileSummary = this.createClientProfileSummary(profileData);

            this.logClient('PROFILE_LOAD_SUCCESS', {
                correlation_id: correlationId,
                status: 200,
                duration_ms: Math.round(duration),
                summary: profileSummary
            });

            this.populateProfileForm(normalizedProfile, profileData.allergies || []);
            this.expandProfileSections(normalizedProfile);

        } catch (error) {
            const duration = performance.now() - startTime;

            this.logClient('PROFILE_LOAD_FAILED', {
                correlation_id: correlationId,
                status: error.status || 0,
                error_kind: this.getErrorKind(error),
                server_message: error.message || 'Unknown error',
                duration_ms: Math.round(duration)
            }, 'ERROR');

            console.error('Failed to load profile:', {
                message: error.message,
                status: error.status,
                endpoint: '/profile'
            });

            // Don't show error toast for 401 (handled by handleSessionExpiry)
            if (!error.message.includes('Session expired')) {
                this.showToast('error', 'Profile Load Failed', 
                    error.message || 'Unable to load profile data. Please try again.');
            }
        }
    }

    populateProfileForm(profile, allergies = []) {
        if (!profile) return;

        // Set unit system preference
        const unitSystem = profile.preferredUnitSystem || 'US';
        document.getElementById(`unit${unitSystem}`).checked = true;
        this.toggleUnitSystem(unitSystem);

        // Demographics - use null-safe values
        document.getElementById('sex').value = profile.sex || '';
        // Convert ISO date to YYYY-MM-DD format for date input
        if (profile.dateOfBirth) {
            const dobDate = new Date(profile.dateOfBirth);
            document.getElementById('dateOfBirth').value = dobDate.toISOString().split('T')[0];
        } else {
            document.getElementById('dateOfBirth').value = '';
        }

        // Height and weight from canonical storage
        if (profile.heightIn !== null && profile.heightIn !== undefined) {
            if (unitSystem === 'US') {
                const feet = Math.floor(profile.heightIn / 12);
                const inches = profile.heightIn % 12;
                document.getElementById('heightFeet').value = feet;
                document.getElementById('heightInches').value = inches;
            } else {
                const cm = Math.round(profile.heightIn * 2.54);
                document.getElementById('heightCm').value = cm;
            }
        }

        if (profile.weightLb !== null && profile.weightLb !== undefined) {
            if (unitSystem === 'US') {
                document.getElementById('weightLbs').value = profile.weightLb;
            } else {
                const kg = (profile.weightLb / 2.2046226218).toFixed(1);
                document.getElementById('weightKg').value = parseFloat(kg);
            }
        }

        document.getElementById('ethnicity').value = profile.ethnicity || '';
        document.getElementById('countryOfResidence').value = profile.countryOfResidence || '';

        // Lifestyle - null-safe boolean handling
        if (profile.smoker === true || profile.smoker === false) {
            document.getElementById('smoker').value = profile.smoker.toString();
            if (profile.smoker && profile.packsPerWeek) {
                document.getElementById('packsPerWeek').value = profile.packsPerWeek;
                document.getElementById('packsPerWeekContainer').classList.remove('d-none');
            }
        } else {
            document.getElementById('smoker').value = '';
        }

        document.getElementById('alcoholDrinksPerWeek').value = profile.alcoholDrinksPerWeek || '';

        // Reproductive context - null-safe boolean handling
        if (profile.pregnant === true || profile.pregnant === false) {
            document.getElementById('pregnant').value = profile.pregnant.toString();
            if (profile.pregnant && profile.pregnancyStartDate) {
                // Convert ISO date to YYYY-MM-DD format for date input
                const pregnancyDate = new Date(profile.pregnancyStartDate);
                document.getElementById('pregnancyStartDate').value = pregnancyDate.toISOString().split('T')[0];
                document.getElementById('pregnancyDateContainer').classList.remove('d-none');
            }
        } else {
            document.getElementById('pregnant').value = '';
        }

        document.getElementById('cyclePhase').value = profile.cyclePhase || '';

        // Calculate age if DOB exists
        if (profile.dateOfBirth) {
            this.calculateAge();
        }

        // Show reproductive section if sex is female
        this.toggleReproductiveSection();

        // Allergies & intolerances: mark checkboxes based on stored records
        try {
            // Uncheck all first
            const allCbs = Array.from(document.querySelectorAll('#allergiesCollapse input[type="checkbox"]'));
            allCbs.forEach(cb => { cb.checked = false; });
            // Mark those present in DB response by matching type and value
            if (Array.isArray(allergies) && allergies.length > 0) {
                allergies.forEach(a => {
                    const type = (a.allergy_type || a.type || '').toString();
                    const name = (a.allergen_name || a.name || '').toString();
                    if (!type || !name) return;
                    const match = allCbs.find(cb => (cb.dataset.type || '') === type && (cb.value || '') === name);
                    if (match) match.checked = true;
                });
            }
        } catch (e) {
            console.warn('Allergies populate warning:', e);
        }
    }

    async loadCountries() {
        try {
            const response = await this.apiCall('/profile/countries', 'GET');
            const select = document.getElementById('countryOfResidence');
            select.innerHTML = '<option value="">Select country...</option>';

            response.countries.forEach(country => {
                const option = document.createElement('option');
                option.value = country.code;
                option.textContent = country.name;
                select.appendChild(option);
            });
            // Re-select previously loaded country if any
            if (this.currentProfile && this.currentProfile.countryOfResidence) {
                select.value = this.currentProfile.countryOfResidence;
            }
        } catch (error) {
            console.error('Failed to load countries:', error);
            document.getElementById('countryOfResidence').innerHTML = '<option value="">Error loading countries</option>';
        }
    }

    setupUnitSystemToggle() {
        const unitToggle = document.querySelectorAll('input[name="unitSystem"]');
        unitToggle.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.handleUnitSystemChange(e.target.value);
            });
        });
    }

    handleUnitSystemChange(newSystem) {
        const currentSystem = newSystem === 'US' ? 'SI' : 'US';

        // Get current values
        let currentHeight = null;
        let currentWeight = null;

        if (currentSystem === 'US') {
            const feet = parseInt(document.getElementById('heightFeet').value) || 0;
            const inches = parseInt(document.getElementById('heightInches').value) || 0;
            if (feet > 0 || inches > 0) {
                currentHeight = feet * 12 + inches; // total inches
            }
            currentWeight = parseFloat(document.getElementById('weightLbs').value) || null;
        } else {
            const cm = parseInt(document.getElementById('heightCm').value) || 0;
            if (cm > 0) {
                currentHeight = Math.round(cm / 2.54); // convert to inches for storage
            }
            const kg = parseFloat(document.getElementById('weightKg').value) || 0;
            if (kg > 0) {
                currentWeight = kg * 2.2046226218; // convert to lbs
            }
        }

        // Clear all inputs
        document.getElementById('heightFeet').value = '';
        document.getElementById('heightInches').value = '';
        document.getElementById('heightCm').value = '';
        document.getElementById('weightLbs').value = '';
        document.getElementById('weightKg').value = '';

        // Convert and populate in new system
        if (currentHeight !== null) {
            if (newSystem === 'US') {
                const feet = Math.floor(currentHeight / 12);
                const inches = currentHeight % 12;
                document.getElementById('heightFeet').value = feet;
                document.getElementById('heightInches').value = inches;
            } else {
                const cm = Math.round(currentHeight * 2.54);
                document.getElementById('heightCm').value = cm;
            }
        }

        if (currentWeight !== null) {
            if (newSystem === 'US') {
                document.getElementById('weightLbs').value = currentWeight.toFixed(1);
            } else {
                const kg = (currentWeight / 2.2046226218).toFixed(1);
                document.getElementById('weightKg').value = parseFloat(kg);
            }
        }

        // Toggle UI visibility
        this.toggleUnitSystem(newSystem);
    }

    toggleUnitSystem(system) {
        const heightUS = document.getElementById('heightUS');
        const heightSI = document.getElementById('heightSI');
        const weightUS = document.getElementById('weightUS');
        const weightSI = document.getElementById('weightSI');

        if (system === 'US') {
            heightUS.classList.remove('d-none');
            heightSI.classList.add('d-none');
            weightUS.classList.remove('d-none');
            weightSI.classList.add('d-none');

            // Disable validation for hidden metric inputs
            document.getElementById('heightCm').disabled = true;
            document.getElementById('weightKg').disabled = true;
            // Enable validation for visible US inputs
            document.getElementById('heightFeet').disabled = false;
            document.getElementById('heightInches').disabled = false;
            document.getElementById('weightLbs').disabled = false;
        } else {
            heightUS.classList.add('d-none');
            heightSI.classList.remove('d-none');
            weightUS.classList.add('d-none');
            weightSI.classList.remove('d-none');

            // Disable validation for hidden US inputs
            document.getElementById('heightFeet').disabled = true;
            document.getElementById('heightInches').disabled = true;
            document.getElementById('weightLbs').disabled = true;
            // Enable validation for visible metric inputs
            document.getElementById('heightCm').disabled = false;
            document.getElementById('weightKg').disabled = false;
        }
    }

    async saveProfile(e) {
        e.preventDefault();

        const startTime = performance.now();
        const correlationId = this.generateCorrelationId();

        // Show saving state
        const saveBtn = document.getElementById('saveProfileBtn');
        const saveText = document.getElementById('saveButtonText');
        const savingSpinner = document.getElementById('savingSpinner');

        saveBtn.disabled = true;
        saveText.classList.add('d-none');
        savingSpinner.classList.remove('d-none');

        // Get current unit system
        const unitSystem = document.querySelector('input[name="unitSystem"]:checked').value;

        // Convert to canonical US units
        let heightIn = null;
        let weightLb = null;

        if (unitSystem === 'US') {
            const feet = parseInt(document.getElementById('heightFeet').value) || 0;
            const inches = parseInt(document.getElementById('heightInches').value) || 0;
            if (feet > 0 || inches > 0) {
                heightIn = feet * 12 + inches;
            }
            weightLb = parseFloat(document.getElementById('weightLbs').value) || null;
        } else {
            const cm = parseInt(document.getElementById('heightCm').value) || 0;
            if (cm > 0) {
                heightIn = Math.round(cm / 2.54);
            }
            const kg = parseFloat(document.getElementById('weightKg').value) || 0;
            if (kg > 0) {
                weightLb = kg * 2.2046226218;
            }
        }

        // Validate height and weight bounds
        if (heightIn !== null && (heightIn < 48 || heightIn > 90)) {
            // Reset button state on validation error
            saveBtn.disabled = false;
            saveText.classList.remove('d-none');
            savingSpinner.classList.add('d-none');

            this.showToast('error', 'Validation Error', 'Height must be between 4\'0" and 7\'6" (48-90 inches)');
            return;
        }
        if (weightLb !== null && (weightLb < 66 || weightLb > 660)) {
            // Reset button state on validation error
            saveBtn.disabled = false;
            saveText.classList.remove('d-none');
            savingSpinner.classList.add('d-none');

            this.showToast('error', 'Validation Error', 'Weight must be between 66-660 lbs');
            return;
        }

        // Build profile state in camelCase for processing
        const profileState = {
            preferredUnitSystem: unitSystem,
            sex: document.getElementById('sex').value || null,
            dateOfBirth: document.getElementById('dateOfBirth').value 
            ? this.toYMD(new Date(document.getElementById('dateOfBirth').value))
            : null,
            heightIn: heightIn,
            weightLb: weightLb,
            ethnicity: document.getElementById('ethnicity').value || null,
            countryOfResidence: document.getElementById('countryOfResidence').value || null,
            smoker: document.getElementById('smoker').value ? (document.getElementById('smoker').value === 'true') : null,
            packsPerWeek: document.getElementById('packsPerWeek').value || null,
            alcoholDrinksPerWeek: document.getElementById('alcoholDrinksPerWeek').value || null,
            pregnant: document.getElementById('pregnant').value ? (document.getElementById('pregnant').value === 'true') : null,
            pregnancyStartDate: document.getElementById('pregnancyStartDate').value || null,
            cyclePhase: document.getElementById('cyclePhase').value || null
        };

        // Convert to snake_case payload for API
        const profileData = this.buildProfilePayload(profileState);

        // Collect allergies
        const allergies = [];
        document.querySelectorAll('#allergiesCollapse input[type="checkbox"]:checked').forEach(checkbox => {
            allergies.push({
                allergyType: checkbox.dataset.type,
                allergenName: checkbox.value
            });
        });

        // Collect chronic conditions
        const chronicConditions = [];
        document.querySelectorAll('#chronicConditionsList .chronic-condition-item').forEach(item => {
            const conditionSelect = item.querySelector('select:first-child');
            const statusSelect = item.querySelector('select:last-child');
            if (conditionSelect.value && statusSelect.value) {
                chronicConditions.push({
                    conditionName: conditionSelect.value,
                    status: statusSelect.value
                });
            }
        });

        // Create combined payload for logging
        const fullPayload = {
            ...profileData,
            allergies,
            chronicConditions
        };

        // Log profile save attempt 
        const payloadSummary = this.createClientProfileSummary(fullPayload);
        this.logClient('PROFILE_SAVE_CLICKED', {
            correlation_id: correlationId,
            field_count: Object.keys(profileData).length,
            summary: payloadSummary
        });

        // Data is already normalized by buildProfilePayload

        // Validate inches field if in US mode
        if (unitSystem === 'US') {
            const inches = parseInt(document.getElementById('heightInches').value) || 0;
            if (inches > 11) {
                // Reset button state on validation error
                saveBtn.disabled = false;
                saveText.classList.remove('d-none');
                savingSpinner.classList.add('d-none');

                this.showToast('error', 'Validation Error', 'Inches must be between 0-11');
                return;
            }
        }

        // Ensure numeric fields are properly validated
        if (profileData.packs_per_week !== null && profileData.packs_per_week < 0) {
            // Reset button state on validation error
            saveBtn.disabled = false;
            saveText.classList.remove('d-none');
            savingSpinner.classList.add('d-none');

            this.showToast('error', 'Validation Error', 'Packs per week cannot be negative');
            return;
        }
        if (profileData.alcohol_drinks_per_week !== null && profileData.alcohol_drinks_per_week < 0) {
            // Reset button state on validation error
            saveBtn.disabled = false;
            saveText.classList.remove('d-none');
            savingSpinner.classList.add('d-none');

            this.showToast('error', 'Validation Error', 'Drinks per week cannot be negative');
            return;
        }

        try {
            // Log request dispatch
            this.logClient('PROFILE_SAVE_REQUEST_DISPATCHED', {
                correlation_id: correlationId,
                url: '/api/profile',
                method: 'PUT',
                payload_summary: payloadSummary
            });

            console.log('Sending profile data:', JSON.stringify({...profileData, allergies, chronicConditions}, null, 2));

            const response = await this.apiCall('/profile', 'PUT', {
                ...profileData,
                allergies,
                chronicConditions
            }, {
                'X-Request-ID': correlationId
            });

            const duration = performance.now() - startTime;

            // Reset button state on success
            saveBtn.disabled = false;
            saveText.classList.remove('d-none');
            savingSpinner.classList.add('d-none');

            // Log successful save
            this.logClient('PROFILE_SAVE_SUCCESS', {
                correlation_id: correlationId,
                status: 200,
                duration_ms: Math.round(duration)
            });

            console.log('Profile save response:', response);
            this.showToast('success', 'Profile Saved', 'Your profile has been updated successfully');

            // Auto-dismiss success toast after 3 seconds
            setTimeout(() => {
                const toastElement = document.getElementById('alertToast');
                const toast = bootstrap.Toast.getInstance(toastElement);
                if (toast) toast.hide();
            }, 3000);

            // Keep unit system toggle highlight by not navigating away

        } catch (error) {
            const duration = performance.now() - startTime;

            // Log failed save
            this.logClient('PROFILE_SAVE_FAILED', {
                correlation_id: correlationId,
                status: error.status || 0,
                error_kind: this.getErrorKind(error),
                server_message: error.message || 'Unknown error',
                duration_ms: Math.round(duration)
            }, 'ERROR');

            console.error('Failed to save profile:', error);

            // Reset button state on error
            saveBtn.disabled = false;
            saveText.classList.remove('d-none');
            savingSpinner.classList.add('d-none');

            let errorMessage = 'Failed to save profile. Please try again.';

            // Try to extract specific error details
            if (error && error.response) {
                try {
                    const errorData = typeof error.response === 'string' ? JSON.parse(error.response) : error.response;
                    if (errorData.message) {
                        errorMessage = `Save failed: ${errorData.message}`;
                    } else if (errorData.error) {
                        errorMessage = `Save failed: ${errorData.error}`;
                    }
                } catch (e) {
                    // If JSON parsing fails, use the original response
                    errorMessage = `Save failed: ${error.response}`;
                }
            } else if (error && error.message) {
                errorMessage = `Save failed: ${error.message}`;
            } else if (error && error.error) {
                errorMessage = `Save failed: ${error.error}`;
            }

            this.showToast('error', 'Save Failed', errorMessage);
        }
    }

    calculateAge() {
        const dob = document.getElementById('dateOfBirth').value;
        const ageSpan = document.getElementById('calculatedAge');

        if (dob) {
            const birthDate = new Date(dob);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();

            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }

            ageSpan.textContent = `${age} years old`;
        } else {
            ageSpan.textContent = '-';
        }
    }

    convertHeight() {
        const feet = parseInt(document.getElementById('heightFeet').value) || 0;
        const inches = parseInt(document.getElementById('heightInches').value) || 0;
        const cm = parseInt(document.getElementById('heightCm').value) || 0;

        if ((feet || inches) && !cm) {
            // Convert ft/in to cm
            const totalInches = feet * 12 + inches;
            const convertedCm = Math.round(totalInches * 2.54);
            document.getElementById('heightCm').value = convertedCm;
        } else if (cm && !feet && !inches) {
            // Convert cm to ft/in
            const totalInches = Math.round(cm / 2.54);
            const convertedFeet = Math.floor(totalInches / 12);
            const convertedInches = totalInches % 12;
            document.getElementById('heightFeet').value = convertedFeet;
            document.getElementById('heightInches').value = convertedInches;
        }
    }

    convertWeight() {
        const lbs = parseFloat(document.getElementById('weightLbs').value) || 0;
        const kg = parseFloat(document.getElementById('weightKg').value) || 0;

        if (lbs && !kg) {
            // Convert lbs to kg
            const convertedKg = (lbs * 0.453592).toFixed(1);
            document.getElementById('weightKg').value = convertedKg;
        } else if (kg && !lbs) {
            // Convert kg to lbs
            const convertedLbs = (kg * 2.20462).toFixed(1);
            document.getElementById('weightLbs').value = convertedLbs;
        }
    }

    toggleReproductiveSection() {
        const sex = document.getElementById('sex').value;
        const reproductiveSection = document.getElementById('reproductiveSection');

        if (sex === 'Female') {
            reproductiveSection.style.display = 'block';
        } else {
            reproductiveSection.style.display = 'none';
        }
    }

    toggleSmokingFields() {
        const smoker = document.getElementById('smoker').value;
        const container = document.getElementById('packsPerWeekContainer');

        if (smoker === 'true') {
            container.classList.remove('d-none');
        } else {
            container.classList.add('d-none');
            document.getElementById('packsPerWeek').value = '';
        }
    }

    togglePregnancyFields() {
        const pregnant = document.getElementById('pregnant').value;
        const container = document.getElementById('pregnancyDateContainer');

        if (pregnant === 'true') {
            container.classList.remove('d-none');
        } else {
            container.classList.add('d-none');
            document.getElementById('pregnancyStartDate').value = '';
        }
    }

    calculateTrimester() {
        const startDate = document.getElementById('pregnancyStartDate').value;
        const trimesterSpan = document.getElementById('calculatedTrimester');

        if (startDate) {
            const start = new Date(startDate);
            const today = new Date();
            const weeks = Math.floor((today - start) / (7 * 24 * 60 * 60 * 1000));

            let trimester;
            if (weeks <= 13) {
                trimester = '1st Trimester';
            } else if (weeks <= 26) {
                trimester = '2nd Trimester';
            } else if (weeks <= 40) {
                trimester = '3rd Trimester';
            } else {
                trimester = 'Full Term+';
            }

            trimesterSpan.textContent = `${trimester} (${weeks} weeks)`;
        } else {
            trimesterSpan.textContent = '-';
        }
    }

    // Expand collapsible sections if we have any pre-existing profile data
    expandProfileSections(profile) {
        try {
            const hasDemo = !!(profile.sex || profile.dateOfBirth || profile.ethnicity || profile.countryOfResidence);
            if (hasDemo) {
                const demo = document.getElementById('demographicsCollapse');
                if (demo && !demo.classList.contains('show')) demo.classList.add('show');
            }
            // Expand lifestyle if any field present
            const hasLifestyle = (profile.smoker !== null) || (profile.alcoholDrinksPerWeek !== null);
            if (hasLifestyle) {
                const life = document.getElementById('lifestyleCollapse');
                if (life && !life.classList.contains('show')) life.classList.add('show');
            }
            // Expand reproductive for female/pregnant data
            const hasRepro = (profile.pregnant !== null) || (profile.pregnancyStartDate !== null) || (profile.cyclePhase);
            if (hasRepro) {
                const rep = document.getElementById('reproductiveCollapse');
                if (rep && !rep.classList.contains('show')) rep.classList.add('show');
            }
            // Expand allergies/conditions if lists will be marked separately
            const cond = document.getElementById('conditionsCollapse');
            if (cond && !cond.classList.contains('show')) cond.classList.add('show');
            const allg = document.getElementById('allergiesCollapse');
            if (allg && !allg.classList.contains('show')) allg.classList.add('show');
        } catch (e) {
            console.warn('expandProfileSections warning:', e);
        }
    }
}

// Global functions for chronic conditions
function addChronicCondition() {
    const container = document.getElementById('chronicConditionsList');
    const newItem = document.createElement('div');
    newItem.className = 'chronic-condition-item mb-3';
    newItem.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <select class="form-select">
                    <option value="">Select condition (list updating soon)</option>
                </select>
            </div>
            <div class="col-md-4">
                <select class="form-select">
                    <option value="">Status</option>
                    <option value="Active">Active</option>
                    <option value="In Remission">In Remission</option>
                </select>
            </div>
            <div class="col-md-2">
                <button type="button" class="btn btn-outline-danger btn-sm w-100" onclick="removeChronicCondition(this)">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
    container.appendChild(newItem);
}

function removeChronicCondition(button) {
    button.closest('.chronic-condition-item').remove();
}

// Utility Functions
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        app.showToast('success', 'Copied', 'Email address copied to clipboard');
    }).catch(() => {
        app.showToast('error', 'Copy Failed', 'Failed to copy to clipboard');
    });
}

// Initialize app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new HealthDashboard();
    window.healthDashboard = app; // Make globally accessible
});
