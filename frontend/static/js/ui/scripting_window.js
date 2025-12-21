/** Scripting window UI component */
class ScriptingWindow {
    constructor() {
        this.scriptInput = document.getElementById('script-input');
        this.scriptOutput = document.getElementById('script-output');
        this.executeBtn = document.getElementById('script-execute');
        this.toggleBtn = document.getElementById('scripting-toggle');
        this.window = document.getElementById('scripting-window');
        // Start collapsed by default
        this.isCollapsed = this.window ? this.window.classList.contains('collapsed') : true;
        this.init();
    }

    init() {
        if (this.executeBtn) {
            this.executeBtn.addEventListener('click', () => this.executeScript());
        }

        if (this.toggleBtn) {
            this.toggleBtn.addEventListener('click', () => this.toggle());
        }

        if (this.scriptInput) {
            // Allow Ctrl+Enter to execute
            this.scriptInput.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 'Enter') {
                    this.executeScript();
                }
            });
        }
    }

    async executeScript() {
        if (!this.scriptInput) return;

        const code = this.scriptInput.value.trim();
        if (!code) return;

        this.appendOutput('> Executing script...\n');

        try {
            const response = await api.executeScript(code);
            if (response.success) {
                this.appendOutput(response.output || 'Script executed successfully\n');
            } else {
                this.appendOutput(`Error: ${response.error}\n`);
            }
        } catch (error) {
            this.appendOutput(`Error: ${error.message}\n`);
        }
    }

    appendOutput(text) {
        if (!this.scriptOutput) return;
        this.scriptOutput.textContent += text;
        this.scriptOutput.scrollTop = this.scriptOutput.scrollHeight;
    }

    clearOutput() {
        if (this.scriptOutput) {
            this.scriptOutput.textContent = '';
        }
    }

    toggle() {
        this.isCollapsed = !this.isCollapsed;
        if (this.window) {
            if (this.isCollapsed) {
                this.window.classList.add('collapsed');
                if (this.toggleBtn) {
                    this.toggleBtn.textContent = 'Show';
                }
            } else {
                this.window.classList.remove('collapsed');
                if (this.toggleBtn) {
                    this.toggleBtn.textContent = 'Hide';
                }
            }
        }
    }
}

