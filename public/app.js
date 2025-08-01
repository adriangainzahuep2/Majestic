// AI Health Dashboard Frontend Application
class HealthDashboard {
    constructor() {
        this.apiBase = '/api';
        this.token = localStorage.getItem('authToken');
        this.user = null;
        this.dashboard = null;
        this.systemsData = new Map();
        this.isRefreshingInsights = false;
        this.insightsPollingInterval = null;
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        
        if (this.token) {
            try {
                await this.loadUserProfile();
                this.showApp();
            } catch (error) {
                console.error('Failed to load user profile:', error);
                this.logout();
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
        
        // Tab navigation
        document.getElementById('dashboard-tab').addEventListener('click', () => this.loadDashboard());
        document.getElementById('daily-plan-tab').addEventListener('click', () => this.loadDailyPlan());
        document.getElementById('uploads-tab').addEventListener('click', () => this.loadUploads());
        document.getElementById('trends-tab').addEventListener('click', () => this.loadTrends());
        
        // Dashboard actions
        document.getElementById('refreshDashboard').addEventListener('click', () => this.loadDashboard());
        document.getElementById('regeneratePlan').addEventListener('click', () => this.regenerateDailyPlan());
        
        // File upload
        document.getElementById('fileUpload').addEventListener('change', (e) => this.handleFileSelect(e));
        document.getElementById('uploadBtn').addEventListener('click', () => this.uploadFiles());
    }

    // Authentication Methods
    async demoLogin() {
        this.showLoading(true);
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
            } else {
                throw new Error(data.message || 'Login failed');
            }
        } catch (error) {
            console.error('Demo login error:', error);
            this.showToast('error', 'Login Failed', error.message);
        } finally {
            this.showLoading(false);
        }
    }

    async googleLogin() {
        this.showToast('info', 'Google Login', 'Google OAuth integration would be implemented here with proper client ID');
        // In a real implementation, this would use Google OAuth
        // For now, fallback to demo login
        await this.demoLogin();
    }

    logout() {
        this.token = null;
        this.user = null;
        this.dashboard = null;
        this.systemsData.clear();
        localStorage.removeItem('authToken');
        this.showLogin();
        this.showToast('info', 'Logged Out', 'You have been logged out successfully');
    }

    async loadUserProfile() {
        const response = await this.apiCall('/auth/me', 'GET');
        if (response.user) {
            this.user = response.user;
            document.getElementById('userName').textContent = this.user.name || this.user.email;
        }
    }

    // UI State Management
    showLogin() {
        document.getElementById('loginSection').classList.remove('d-none');
        document.getElementById('appSection').classList.add('d-none');
        document.getElementById('userSection').classList.add('d-none');
        document.getElementById('loginBtn').classList.remove('d-none');
    }

    showApp() {
        document.getElementById('loginSection').classList.add('d-none');
        document.getElementById('appSection').classList.remove('d-none');
        document.getElementById('userSection').classList.remove('d-none');
        document.getElementById('loginBtn').classList.add('d-none');
        this.loadDashboard();
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
        this.showLoading(true);
        try {
            const data = await this.apiCall('/dashboard', 'GET');
            this.dashboard = data;
            this.renderDashboard();
        } catch (error) {
            console.error('Failed to load dashboard:', error);
            this.showToast('error', 'Dashboard Error', 'Failed to load dashboard data');
        } finally {
            this.showLoading(false);
        }
    }

    renderDashboard() {
        if (!this.dashboard) return;

        // Update summary stats
        const summary = this.dashboard.summary;
        document.getElementById('totalMetrics').textContent = summary.recent_metrics;
        document.getElementById('systemsWithData').textContent = summary.systems_with_data;
        document.getElementById('recentUploads').textContent = summary.recent_uploads;
        document.getElementById('aiInsights').textContent = 
            summary.green_systems + summary.yellow_systems + summary.red_systems;

        // Render system tiles
        const tilesContainer = document.getElementById('systemTiles');
        tilesContainer.innerHTML = '';

        this.dashboard.dashboard.forEach(system => {
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

        col.innerHTML = `
            <div class="system-tile status-${statusClass}" data-system-id="${system.id}">
                <div class="d-flex justify-content-between align-items-start mb-3">
                    <div class="system-title">${system.name}</div>
                    <div class="system-status status-${statusClass}"></div>
                </div>
                <div class="system-metrics">
                    ${system.keyMetricsCount} key metrics • ${system.totalMetricsCount} total
                </div>
                ${system.lastUpdated ? `
                    <div class="system-updated">
                        Updated ${new Date(system.lastUpdated).toLocaleDateString()}
                    </div>
                ` : '<div class="system-updated">No recent data</div>'}
            </div>
        `;

        // Add click handler for drill-down
        col.querySelector('.system-tile').addEventListener('click', () => {
            this.showSystemDetails(system.id);
        });

        return col;
    }

    async showSystemDetails(systemId) {
        this.showLoading(true);
        try {
            const data = await this.apiCall(`/metrics/system/${systemId}`, 'GET');
            this.renderSystemModal(data);
        } catch (error) {
            console.error('Failed to load system details:', error);
            this.showToast('error', 'System Details', 'Failed to load system details');
        } finally {
            this.showLoading(false);
        }
    }

    renderSystemModal(systemData) {
        const modal = document.getElementById('systemModal');
        const title = document.getElementById('systemModalTitle');
        const body = document.getElementById('systemModalBody');

        title.textContent = `${systemData.system.name} System`;

        const colorClass = {
            'green': 'success',
            'yellow': 'warning', 
            'red': 'danger',
            'gray': 'secondary'
        }[systemData.color] || 'secondary';

        body.innerHTML = `
            <div class="row">
                <div class="col-lg-8">
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
                        <div class="card-header">
                            <h6 class="mb-0" style="color: #FFFFFF;">
                                <i class="fas fa-list me-2"></i>Additional Metrics
                            </h6>
                        </div>
                        <div class="card-body">
                            ${this.renderCombinedAdditionalMetrics(systemData)}
                        </div>
                    </div>
                </div>

                <div class="col-lg-4">
                    <!-- AI Insights -->
                    <div class="card mb-4 insights-panel">
                        <div class="card-header">
                            <h6 class="mb-0" style="color: #FFFFFF;">
                                <div class="ai-insights-icon" style="display: inline-block; width: 20px; height: 20px; margin-right: 8px; font-size: 10px;"></div>AI Insights
                            </h6>
                        </div>
                        <div class="card-body">
                            ${systemData.insights ? 
                                this.renderSystemInsights(systemData.insights) :
                                '<p style="color: #EBEBF5;">No insights available yet. Upload health data to generate AI insights.</p>'
                            }
                        </div>
                    </div>

                    <!-- Upload History -->
                    <div class="card mb-4">
                        <div class="card-header">
                            <h6 class="mb-0" style="color: #FFFFFF;">
                                <i class="fas fa-history me-2"></i>Recent Uploads
                            </h6>
                        </div>
                        <div class="card-body">
                            <p style="color: #EBEBF5; font-size: 13px;">Upload history for this system will appear here.</p>
                        </div>
                    </div>

                    <!-- Trends Preview -->
                    <div class="card mb-4">
                        <div class="card-header">
                            <h6 class="mb-0" style="color: #FFFFFF;">
                                <i class="fas fa-chart-line me-2"></i>Trends
                            </h6>
                        </div>
                        <div class="card-body">
                            <p style="color: #EBEBF5; font-size: 13px;">Trend graphs for key metrics will appear here.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modalInstance = new bootstrap.Modal(modal);
        modalInstance.show();
        
        // Initialize tooltips after modal is shown
        modal.addEventListener('shown.bs.modal', () => {
            const tooltipTriggerList = modal.querySelectorAll('[data-bs-toggle="tooltip"]');
            const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
        });
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
        const metricMatch = window.metricUtils ? window.metricUtils.findMetricMatch(metric.metric_name) : null;
        const needsReview = !metricMatch || metric.needs_review;
        
        let rangeBlock = '';
        if (metricMatch) {
            const status = window.metricUtils.calculateStatus(metric.metric_value, metricMatch.normalRangeMin, metricMatch.normalRangeMax);
            const statusClass = status.toLowerCase().replace(' ', '-');
            const rangeBar = window.metricUtils.generateMicroRangeBar(metric.metric_value, metricMatch.normalRangeMin, metricMatch.normalRangeMax);
            
            rangeBlock = `
                <div class="metric-range-block">
                    <div class="metric-status-chip ${statusClass}">${status}</div>
                    ${rangeBar}
                    <div class="normal-range-caption">
                        Normal range: ${metricMatch.normalRangeMin}–${metricMatch.normalRangeMax}${metricMatch.units ? ` ${metricMatch.units}` : ''}
                        <span class="info-icon" data-metric="${metric.metric_name}" data-bs-toggle="tooltip" 
                              title="${this.generateTooltipTitle(metricMatch, metric.metric_name)}">i</span>
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
                        <input type="date" class="form-control" id="edit-date-${metric.id}" value="${metric.test_date || ''}">
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
            </div>
        `;

        return `
            <tr id="metric-row-${metric.id}" data-metric-id="${metric.id}" data-test-date="${metric.test_date}">
                <td style="color: #FFFFFF; font-weight: 600;">
                    <span class="metric-name">${metric.metric_name}</span>
                    ${needsReview ? '<span class="needs-review-indicator">NEEDS REVIEW</span>' : ''}
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
                            <th style="color: #FFFFFF; background-color: #2C2C2E;">Status</th>
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
        const isInRange = this.isCustomMetricInRange(metric);
        const statusBadge = this.getCustomMetricStatusBadge(metric, isInRange);
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
                <td>${statusBadge}</td>
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
                                       style="background-color: #2C2C2E; border-color: #48484A; color: #FFFFFF;">
                            </div>
                            <div class="mb-3">
                                <label class="form-label" style="color: #FFFFFF;">Units</label>
                                <select class="form-select" id="inlineMetricUnits" required 
                                        style="background-color: #2C2C2E; border-color: #48484A; color: #FFFFFF;">
                                    <option value="">Select units</option>
                                    <option value="mg/dL">mg/dL</option>
                                    <option value="mmHg">mmHg</option>
                                    <option value="g/dL">g/dL</option>
                                    <option value="%">%</option>
                                    <option value="U/L">U/L</option>
                                    <option value="ng/mL">ng/mL</option>
                                    <option value="pg/mL">pg/mL</option>
                                    <option value="μg/L">μg/L</option>
                                    <option value="IU/mL">IU/mL</option>
                                    <option value="beats/min">beats/min</option>
                                    <option value="L/min">L/min</option>
                                    <option value="mg/L">mg/L</option>
                                    <option value="μmol/L">μmol/L</option>
                                    <option value="nmol/L">nmol/L</option>
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

            if (!metricName || !units) {
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

            // Step 2: Update metric dropdown selection
            const selectElement = document.getElementById(`edit-metric-${metricId}`);
            selectElement.value = metricName;

            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('inlineCustomMetricModal')).hide();

            this.showToast('success', 'Custom Metric Type', 'New metric type created and ready to use');

        } catch (error) {
            console.error('Failed to create inline custom metric:', error);
            this.showToast('error', 'Creation Failed', error.message);
        } finally {
            this.showLoading(false);
        }
    }

    generateUnitsOptions() {
        const units = [
            'g', 'mg', 'µg', 'ng', 'pg', 'mol/L', 'mmol/L', 'µmol/L',
            'mg/dL', 'g/dL', 'µg/dL', 'ng/dL', 'mg/L', 'µg/L', 'ng/mL',
            'L', 'mL', 'µL', 'mmHg', 'bpm', 'breaths/min', '°C', '°F',
            '×10⁹/L', '×10¹²/L', '#/µL', '%', 'ratio', 'sec', 'min', 'hr',
            'IU/L', 'mEq/L', 'U/L', 'g/24h', 'Osm/kg', 'Osm/L',
            'kg', 'cm', 'mmol/mol', 'Other'
        ];
        
        return units.map(unit => `<option value="${unit}">${unit}</option>`).join('');
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
                const response = await this.apiCall('/api/dashboard');
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
        const metricMatch = window.metricUtils ? window.metricUtils.findMetricMatch(updatedMetric.metric_name) : null;
        const needsReview = !metricMatch || updatedMetric.needs_review;

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

        // Update the range indicator using existing metric utilities
        const rangeCell = metricRow.querySelector('.range-indicator');
        if (rangeCell && window.metricUtils && metricMatch) {
            if (updatedMetric.metric_value) {
                const status = window.metricUtils.calculateStatus(
                    updatedMetric.metric_value, 
                    metricMatch.normalRangeMin, 
                    metricMatch.normalRangeMax
                );
                const statusClass = status.toLowerCase().replace(' ', '-');
                const rangeBar = window.metricUtils.generateMicroRangeBar(
                    updatedMetric.metric_value, 
                    metricMatch.normalRangeMin, 
                    metricMatch.normalRangeMax
                );
                
                rangeCell.innerHTML = `
                    <div class="metric-range-block">
                        <div class="metric-status-chip ${statusClass}">${status}</div>
                        ${rangeBar}
                        <div class="normal-range-caption">
                            Normal range: ${metricMatch.normalRangeMin}–${metricMatch.normalRangeMax}${metricMatch.units ? ` ${metricMatch.units}` : ''}
                            <span class="info-icon" data-metric="${updatedMetric.metric_name}" data-bs-toggle="tooltip" 
                                  title="${this.generateTooltipTitle(metricMatch, updatedMetric.metric_name)}">i</span>
                        </div>
                    </div>
                `;
            }
        } else if (rangeCell) {
            // No range data available
            rangeCell.innerHTML = `
                <div class="metric-range-block">
                    <div class="metric-status-chip no-data">No data</div>
                    <div style="color: #8E8E93; font-size: 11px; margin-top: 4px;">Reference range not available</div>
                </div>
            `;
        }
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
                }
            }
        }
        
        editRow.classList.remove('d-none');
        editForm.classList.remove('d-none');
    }

    cancelMetricEdit(metricId) {
        const editRow = document.getElementById(`edit-row-${metricId}`);
        const editForm = document.getElementById(`edit-form-${metricId}`);
        
        editRow.classList.add('d-none');
        editForm.classList.add('d-none');
    }

    async saveMetricEdit(metricId) {
        try {
            const metricName = document.getElementById(`edit-metric-${metricId}`).value;
            const metricValue = document.getElementById(`edit-value-${metricId}`).value;
            const metricUnit = document.getElementById(`edit-unit-${metricId}`).value;
            const testDate = document.getElementById(`edit-date-${metricId}`).value;

            const response = await this.apiCall(`/metrics/${metricId}`, 'PUT', {
                metric_name: metricName,
                metric_value: parseFloat(metricValue),
                metric_unit: metricUnit,
                test_date: testDate,
                source: 'User Edited'
            });

            if (response.success) {
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
            const data = await this.apiCall('/dashboard/daily-plan', 'GET');
            this.renderDailyPlan(data.daily_plan);
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
                <div class="card">
                    <div class="card-body text-center py-5">
                        <i class="fas fa-calendar-plus fa-3x text-muted mb-3"></i>
                        <h4>No Daily Plan Available</h4>
                        <p class="text-muted mb-4">Upload some health data to generate your personalized daily plan</p>
                        <button class="btn btn-primary" onclick="document.getElementById('uploads-tab').click()">
                            <i class="fas fa-upload me-2"></i>Upload Health Data
                        </button>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <div class="d-flex justify-content-between align-items-center">
                        <h5 class="mb-0">
                            <i class="fas fa-calendar-day me-2"></i>
                            Daily Plan for ${dailyPlan.plan_date ? new Date(dailyPlan.plan_date).toLocaleDateString() : 'Today'}
                        </h5>
                        <small class="text-muted">
                            Generated: ${dailyPlan.generated_at ? new Date(dailyPlan.generated_at).toLocaleString() : 'Recently'}
                        </small>
                    </div>
                </div>
                <div class="card-body">
                    ${dailyPlan.key_focus_areas && dailyPlan.key_focus_areas.length > 0 ? `
                        <div class="mb-4">
                            <h6 class="text-muted mb-2">Focus Areas:</h6>
                            <div class="d-flex flex-wrap gap-2">
                                ${dailyPlan.key_focus_areas.map(area => `
                                    <span class="badge bg-primary">${area}</span>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    ${dailyPlan.recommendations && dailyPlan.recommendations.length > 0 ? `
                        <div class="mb-4">
                            <h6 class="text-muted mb-3">Recommendations:</h6>
                            <div class="row">
                                ${dailyPlan.recommendations.map((rec, index) => `
                                    <div class="col-md-6 mb-3">
                                        <div class="card h-100 border-${rec.priority === 'high' ? 'danger' : rec.priority === 'medium' ? 'warning' : 'success'}">
                                            <div class="card-body">
                                                <div class="d-flex justify-content-between align-items-start mb-2">
                                                    <span class="badge bg-secondary">${rec.category}</span>
                                                    <span class="badge bg-${rec.priority === 'high' ? 'danger' : rec.priority === 'medium' ? 'warning' : 'success'}">${rec.priority}</span>
                                                </div>
                                                <h6 class="card-title">${rec.action}</h6>
                                                <p class="card-text text-muted small">${rec.reason}</p>
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
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

    // Upload Methods
    handleFileSelect(event) {
        const files = event.target.files;
        const uploadBtn = document.getElementById('uploadBtn');
        
        if (files.length > 0) {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = `<i class="fas fa-upload me-2"></i>Upload ${files.length} File(s)`;
        } else {
            uploadBtn.disabled = true;
            uploadBtn.innerHTML = '<i class="fas fa-upload me-2"></i>Upload Files';
        }
    }

    async uploadFiles() {
        const fileInput = document.getElementById('fileUpload');
        const files = fileInput.files;
        
        if (files.length === 0) return;

        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }

        this.showLoading(true);
        try {
            const response = await fetch(`${this.apiBase}/uploads`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                },
                body: formData
            });

            const data = await response.json();
            
            if (data.success) {
                this.showToast('success', 'Upload Complete', `${data.uploads.length} file(s) uploaded successfully`);
                fileInput.value = '';
                document.getElementById('uploadBtn').disabled = true;
                this.loadUploads();
            } else {
                throw new Error(data.message || 'Upload failed');
            }
        } catch (error) {
            console.error('Upload error:', error);
            this.showToast('error', 'Upload Failed', error.message);
        } finally {
            this.showLoading(false);
        }
    }

    async loadUploads() {
        this.showLoading(true);
        try {
            const data = await this.apiCall('/uploads', 'GET');
            this.renderUploadsList(data.uploads);
        } catch (error) {
            console.error('Failed to load uploads:', error);
            this.showToast('error', 'Uploads', 'Failed to load upload history');
        } finally {
            this.showLoading(false);
        }
    }

    renderUploadsList(uploads) {
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

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th style="color: #FFFFFF; background-color: #2C2C2E;">Filename</th>
                            <th style="color: #FFFFFF; background-color: #2C2C2E;">Type</th>
                            <th style="color: #FFFFFF; background-color: #2C2C2E;">Status</th>
                            <th style="color: #FFFFFF; background-color: #2C2C2E;">Upload Date</th>
                            <th style="color: #FFFFFF; background-color: #2C2C2E;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${uploads.map(upload => `
                            <tr>
                                <td style="color: #FFFFFF;">
                                    <i class="fas fa-file me-2" style="color: #ABABAB;"></i>
                                    ${upload.filename}
                                </td>
                                <td>
                                    <span class="badge bg-secondary">${upload.upload_type}</span>
                                </td>
                                <td>
                                    <span class="badge bg-${this.getStatusColor(upload.processing_status)}">
                                        ${upload.processing_status}
                                    </span>
                                </td>
                                <td style="color: #EBEBF5;">
                                    ${new Date(upload.created_at).toLocaleString()}
                                </td>
                                <td>
                                    <div class="btn-group btn-group-sm">
                                        <button class="btn btn-outline-primary" onclick="app.viewUploadDetails(${upload.id})" style="color: #007AFF; border-color: #007AFF;">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        ${upload.processing_status === 'failed' ? `
                                            <button class="btn btn-outline-warning" onclick="app.retryUpload(${upload.id})">
                                                <i class="fas fa-redo"></i>
                                            </button>
                                        ` : ''}
                                        <button class="btn btn-outline-danger" onclick="app.deleteUpload(${upload.id})">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
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
    async loadTrends() {
        this.showLoading(true);
        try {
            const trendMetrics = ['LDL,LDL-C', 'ApoB', 'CRP,hs-CRP', 'IL-6'];
            const promises = trendMetrics.map(metrics => 
                this.apiCall(`/metrics/trends?metrics=${metrics}`, 'GET').catch(() => null)
            );
            
            const results = await Promise.all(promises);
            this.renderTrendCharts(results);
        } catch (error) {
            console.error('Failed to load trends:', error);
            this.showToast('error', 'Trends', 'Failed to load trend data');
        } finally {
            this.showLoading(false);
        }
    }

    renderTrendCharts(trendsData) {
        // LDL Chart
        this.renderChart('ldlChart', trendsData[0], 'LDL Cholesterol', 'mg/dL');
        
        // ApoB Chart
        this.renderChart('apoBChart', trendsData[1], 'ApoB', 'mg/dL');
        
        // CRP Chart
        this.renderChart('crpChart', trendsData[2], 'CRP', 'mg/L');
        
        // IL-6 Chart
        this.renderChart('il6Chart', trendsData[3], 'IL-6', 'pg/mL');
    }

    renderChart(containerId, trendData, title, unit) {
        const container = document.getElementById(containerId);
        
        if (!trendData || !trendData.trends || Object.keys(trendData.trends).length === 0) {
            container.innerHTML = `
                <div class="d-flex align-items-center justify-content-center h-100">
                    <div class="text-center">
                        <i class="fas fa-chart-line fa-2x text-muted mb-2"></i>
                        <p class="text-muted">No data available</p>
                    </div>
                </div>
            `;
            return;
        }

        const traces = [];
        const colors = ['#007bff', '#28a745', '#ffc107', '#dc3545'];
        let colorIndex = 0;

        for (const [metricName, dataPoints] of Object.entries(trendData.trends)) {
            if (dataPoints.length > 0) {
                traces.push({
                    x: dataPoints.map(p => p.date),
                    y: dataPoints.map(p => p.value),
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: metricName,
                    line: { color: colors[colorIndex % colors.length] },
                    marker: { size: 6 }
                });
                colorIndex++;
            }
        }

        if (traces.length === 0) {
            container.innerHTML = `
                <div class="d-flex align-items-center justify-content-center h-100">
                    <div class="text-center">
                        <i class="fas fa-chart-line fa-2x text-muted mb-2"></i>
                        <p class="text-muted">No data points</p>
                    </div>
                </div>
            `;
            return;
        }

        const layout = {
            title: false,
            xaxis: { 
                title: 'Date',
                type: 'date'
            },
            yaxis: { 
                title: `${title} (${unit})`
            },
            margin: { t: 20, r: 20, b: 40, l: 60 },
            showlegend: traces.length > 1
        };

        const config = {
            responsive: true,
            displayModeBar: false
        };

        Plotly.newPlot(containerId, traces, layout, config);
    }

    // Utility Methods
    async apiCall(endpoint, method = 'GET', data = null) {
        const headers = {
            'Content-Type': 'application/json'
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const config = {
            method,
            headers
        };

        if (data && method !== 'GET') {
            config.body = JSON.stringify(data);
        }

        const response = await fetch(`${this.apiBase}${endpoint}`, config);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }

        return await response.json();
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
