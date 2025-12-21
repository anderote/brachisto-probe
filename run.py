#!/usr/bin/env python3
"""Run script for Brachisto-Probe game."""
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(__file__))

from backend.app import create_app

if __name__ == '__main__':
    app = create_app('development')
    
    # Initialize database
    with app.app_context():
        from backend.models import db
        db.create_all()
        print("Database initialized.")
    
    port = int(os.environ.get('PORT', 5001))
    print("Starting Brachisto-Probe game server...")
    print(f"Open http://localhost:{port} in your browser")
    app.run(debug=True, host='0.0.0.0', port=port)

