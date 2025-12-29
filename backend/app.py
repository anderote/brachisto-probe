"""Flask application entry point."""
from flask import Flask
from flask_cors import CORS
from flask_migrate import Migrate
import os

from backend.config import config
from backend.models import db, bcrypt
from backend.game_data_loader import get_game_data_loader

def create_app(config_name=None):
    """Create and configure Flask application."""
    # Set up paths
    base_dir = os.path.dirname(os.path.dirname(__file__))
    static_folder = os.path.join(base_dir, 'frontend', 'static')
    template_folder = os.path.join(base_dir, 'frontend', 'templates')
    
    app = Flask(__name__, 
                static_folder=static_folder,
                static_url_path='/static',
                template_folder=template_folder)
    
    # Load configuration
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'development')
    app.config.from_object(config[config_name])
    
    # Initialize extensions
    db.init_app(app)
    bcrypt.init_app(app)
    CORS(app)
    Migrate(app, db)
    
    # Initialize game data loader
    with app.app_context():
        data_loader = get_game_data_loader()
        errors = data_loader.validate_data()
        if errors:
            app.logger.warning(f"Game data validation warnings: {errors}")
    
    # Register blueprints
    from backend.api import auth_bp, game_bp, scores_bp, scripts_bp, watch_bp, trajectory_bp
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(game_bp, url_prefix='/api/game')
    app.register_blueprint(scores_bp, url_prefix='/api/scores')
    app.register_blueprint(scripts_bp, url_prefix='/api/scripts')
    app.register_blueprint(watch_bp, url_prefix='/api/watch')
    app.register_blueprint(trajectory_bp, url_prefix='/api/trajectory')
    
    # Serve game data files
    @app.route('/game_data/<path:filename>')
    def serve_game_data(filename):
        """Serve game data JSON files."""
        from flask import send_from_directory
        game_data_dir = os.path.join(base_dir, 'game_data')
        return send_from_directory(game_data_dir, filename)
    
    # Serve frontend templates (index.html)
    @app.route('/')
    def index():
        """Serve the main HTML file."""
        from flask import render_template
        return render_template('index.html')
    
    # Error handlers
    @app.errorhandler(404)
    def not_found(error):
        return {'error': 'Not found'}, 404
    
    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        return {'error': 'Internal server error'}, 500
    
    return app

if __name__ == '__main__':
    import os
    app = create_app()
    port = int(os.environ.get('PORT', 5001))
    app.run(debug=True, host='0.0.0.0', port=port)

