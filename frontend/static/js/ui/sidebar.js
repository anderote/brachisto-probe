/** Right Panel with tabs for Structures, Research, and Transfers */
class Sidebar {
    constructor() {
        this.panel = document.getElementById('right-panel');
        this.panelContainer = document.getElementById('right-panel-container');
        this.toggleBtn = document.getElementById('right-panel-toggle');
        this.toggleIcon = document.getElementById('right-panel-toggle-icon');
        this.tabButtons = document.querySelectorAll('.right-tab-btn');
        this.tabContents = document.querySelectorAll('.right-tab-content');
        this.isOpen = true;
        this.activeTab = 'structures';
        this.init();
    }

    init() {
        // Load saved state
        const savedState = localStorage.getItem('rightPanelState');
        if (savedState) {
            const state = JSON.parse(savedState);
            this.isOpen = state.isOpen !== false; // Default to open
            this.activeTab = state.activeTab || 'structures';
        }

        // Set initial state
        this.updatePanelState();
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
        this.updatePanelState();
        this.saveState();
    }

    updatePanelState() {
        if (this.panelContainer) {
            if (this.isOpen) {
                this.panelContainer.classList.remove('hidden');
                if (this.toggleIcon) {
                    this.toggleIcon.textContent = '◀';
                }
            } else {
                this.panelContainer.classList.add('hidden');
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
            if (content.id === `right-tab-${tabName}`) {
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
        return document.getElementById(`right-tab-${tabName}`);
    }

    saveState() {
        localStorage.setItem('rightPanelState', JSON.stringify({
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

