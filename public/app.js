// AI Health Dashboard Frontend Application
class HealthDashboard {
    constructor() {
        this.apiBase = '/api';
        this.token = localStorage.getItem('authToken');
        this.user = null;
        this.dashboard = null;
        this.systemsData = new Map();
        
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
                <div class="col-md-8">
                    <!-- Key Metrics -->
                    <div class="card mb-4">
                        <div class="card-header" style="background: #007AFF; color: #FFFFFF;">
                            <h6 class="mb-0" style="color: #FFFFFF;">
                                <i class="fas fa-star me-2"></i>Key Metrics
                            </h6>
                        </div>
                        <div class="card-body">
                            ${systemData.keyMetrics.length > 0 ? 
                                this.renderMetricsTable(systemData.keyMetrics) :
                                '<p style="color: #EBEBF5;">No key metrics available</p>'
                            }
                        </div>
                    </div>

                    <!-- Non-Key Metrics -->
                    <div class="card mb-4">
                        <div class="card-header">
                            <h6 class="mb-0" style="color: #FFFFFF;">
                                <i class="fas fa-list me-2"></i>Additional Metrics
                            </h6>
                        </div>
                        <div class="card-body">
                            ${systemData.nonKeyMetrics.length > 0 ? 
                                this.renderMetricsTable(systemData.nonKeyMetrics) :
                                '<p style="color: #EBEBF5;">No additional metrics available</p>'
                            }
                        </div>
                    </div>
                </div>

                <div class="col-md-4">
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
                </div>
            </div>
        `;

        new bootstrap.Modal(modal).show();
    }

    renderMetricsTable(metrics) {
        return `
            <div class="table-responsive">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th style="color: #FFFFFF; background-color: #2C2C2E;">Metric</th>
                            <th style="color: #FFFFFF; background-color: #2C2C2E;">Value</th>
                            <th style="color: #FFFFFF; background-color: #2C2C2E;">Unit</th>
                            <th style="color: #FFFFFF; background-color: #2C2C2E;">Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${metrics.map(metric => `
                            <tr>
                                <td style="color: #FFFFFF; font-weight: 600;">${metric.metric_name}</td>
                                <td style="color: #FFFFFF;">${metric.metric_value || '-'}</td>
                                <td style="color: #EBEBF5;">${metric.metric_unit || '-'}</td>
                                <td style="color: #EBEBF5;">${metric.test_date ? new Date(metric.test_date).toLocaleDateString() : '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderSystemInsights(insights) {
        return `
            <div class="mb-3">
                <span class="badge bg-${insights.overall_status === 'excellent' ? 'success' : 
                    insights.overall_status === 'good' ? 'primary' :
                    insights.overall_status === 'fair' ? 'warning' : 'danger'}">${insights.overall_status}</span>
            </div>
            
            ${insights.key_findings && insights.key_findings.length > 0 ? `
                <div class="mb-3">
                    <h6 style="color: #FFFFFF;">Key Findings:</h6>
                    <ul class="list-unstyled">
                        ${insights.key_findings.map(finding => `
                            <li class="mb-1" style="color: #FFFFFF;">
                                <i class="fas fa-check-circle text-info me-2"></i>
                                ${finding}
                            </li>
                        `).join('')}
                    </ul>
                </div>
            ` : ''}

            ${insights.recommendations && insights.recommendations.length > 0 ? `
                <div class="mb-3">
                    <h6 style="color: #FFFFFF;">Recommendations:</h6>
                    <ul class="list-unstyled">
                        ${insights.recommendations.slice(0, 3).map(rec => `
                            <li class="mb-2">
                                <div style="color: #FFFFFF; font-weight: 600;">${rec.action}</div>
                                <small style="color: #EBEBF5;">${rec.rationale}</small>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            ` : ''}

            <small style="color: #ABABAB;">
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
});
