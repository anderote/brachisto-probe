/**
 * Toast Notification System
 * Shows non-blocking messages that fade away automatically
 * Replaces browser alert() dialogs for a better UX
 */
class ToastManager {
    constructor() {
        this.container = null;
        this.toasts = [];
        this.defaultDuration = 3000; // 3 seconds
        this.init();
    }

    init() {
        // Create container for toasts
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
            max-width: 400px;
        `;
        document.body.appendChild(this.container);
    }

    /**
     * Show a toast message
     * @param {string} message - The message to display
     * @param {Object} options - Options for the toast
     * @param {string} options.type - 'info', 'success', 'warning', 'error'
     * @param {number} options.duration - Duration in ms (0 for persistent)
     * @param {HTMLElement} options.nearElement - Optional element to position near
     */
    show(message, options = {}) {
        const {
            type = 'info',
            duration = this.defaultDuration,
            nearElement = null
        } = options;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        // Color schemes for different types
        const colors = {
            info: { bg: 'rgba(30, 144, 255, 0.95)', border: '#1e90ff' },
            success: { bg: 'rgba(46, 139, 87, 0.95)', border: '#2e8b57' },
            warning: { bg: 'rgba(255, 165, 0, 0.95)', border: '#ffa500' },
            error: { bg: 'rgba(220, 53, 69, 0.95)', border: '#dc3545' }
        };
        const color = colors[type] || colors.info;

        toast.style.cssText = `
            background: ${color.bg};
            border: 1px solid ${color.border};
            border-radius: 8px;
            padding: 12px 16px;
            color: white;
            font-size: 14px;
            font-family: 'Courier New', monospace;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
            pointer-events: auto;
            cursor: pointer;
            max-width: 100%;
            word-wrap: break-word;
        `;

        toast.textContent = message;

        // Click to dismiss
        toast.addEventListener('click', () => this.dismiss(toast));

        // Position near element if specified
        if (nearElement) {
            const rect = nearElement.getBoundingClientRect();
            toast.style.position = 'fixed';
            toast.style.top = `${rect.top}px`;
            toast.style.left = `${rect.right + 10}px`;
            toast.style.transform = 'translateX(0)';
            document.body.appendChild(toast);
        } else {
            this.container.appendChild(toast);
        }

        // Animate in
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        });

        // Auto-dismiss
        if (duration > 0) {
            setTimeout(() => this.dismiss(toast), duration);
        }

        this.toasts.push(toast);
        return toast;
    }

    dismiss(toast) {
        if (!toast || !toast.parentNode) return;

        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';

        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            const idx = this.toasts.indexOf(toast);
            if (idx > -1) this.toasts.splice(idx, 1);
        }, 300);
    }

    // Convenience methods
    info(message, duration) {
        return this.show(message, { type: 'info', duration });
    }

    success(message, duration) {
        return this.show(message, { type: 'success', duration });
    }

    warning(message, duration) {
        return this.show(message, { type: 'warning', duration });
    }

    error(message, duration) {
        return this.show(message, { type: 'error', duration: duration || 5000 });
    }

    /**
     * Show a message near a specific element (e.g., a building)
     * @param {HTMLElement} element - Element to position near
     * @param {string} message - Message to show
     * @param {string} type - Toast type
     */
    showNear(element, message, type = 'warning') {
        return this.show(message, { type, nearElement: element, duration: 2500 });
    }
}

// Create global instance
window.toast = new ToastManager();

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ToastManager;
}
