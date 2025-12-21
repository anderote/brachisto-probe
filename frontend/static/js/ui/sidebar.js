/** Sidebar with tabs for Build, Research, and Probes */
class Sidebar {
    constructor() {
        this.sidebar = document.getElementById('game-sidebar');
        this.toggleBtn = document.getElementById('sidebar-toggle');
        this.toggleIcon = document.getElementById('sidebar-toggle-icon');
        this.tabButtons = document.querySelectorAll('.tab-btn');
        this.tabContents = document.querySelectorAll('.tab-content');
        this.isOpen = true;
        this.activeTab = 'build';
        this.init();
    }

    init() {
        // Load saved state
        const savedState = localStorage.getItem('sidebarState');
        if (savedState) {
            const state = JSON.parse(savedState);
            this.isOpen = state.isOpen !== false; // Default to open
            this.activeTab = state.activeTab || 'build';
        }

        // Set initial state
        this.updateSidebarState();
        this.switchTab(this.activeTab);

        // Toggle button
        if (this.toggleBtn) {
            this.toggleBtn.addEventListener('click', () => this.toggle());
        }

        // Tab buttons
        this.tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this.switchTab(tab);
            });
        });
    }

    toggle() {
        this.isOpen = !this.isOpen;
        this.updateSidebarState();
        this.saveState();
    }

    updateSidebarState() {
        if (this.sidebar) {
            if (this.isOpen) {
                this.sidebar.classList.remove('collapsed');
                if (this.toggleIcon) {
                    this.toggleIcon.textContent = '◀';
                }
            } else {
                this.sidebar.classList.add('collapsed');
                if (this.toggleIcon) {
                    this.toggleIcon.textContent = '▶';
                }
            }
        }
    }

    switchTab(tabName) {
        this.activeTab = tabName;

        // Update tab buttons
        this.tabButtons.forEach(btn => {
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update tab contents
        this.tabContents.forEach(content => {
            if (content.id === `tab-${tabName}`) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });

        this.saveState();
    }

    getActiveTab() {
        return this.activeTab;
    }

    getTabContainer(tabName) {
        return document.getElementById(`tab-${tabName}`);
    }

    saveState() {
        localStorage.setItem('sidebarState', JSON.stringify({
            isOpen: this.isOpen,
            activeTab: this.activeTab
        }));
    }
}

// Global instance
let sidebar = null;
document.addEventListener('DOMContentLoaded', () => {
    sidebar = new Sidebar();
    window.sidebar = sidebar;
});

