"""API blueprints for Brachisto-Probe."""
from backend.api.auth import auth_bp
from backend.api.game import game_bp
from backend.api.scores import scores_bp
from backend.api.scripts import scripts_bp
from backend.api.trajectory import trajectory_bp
from backend.api.watch import watch_bp

__all__ = ['auth_bp', 'game_bp', 'scores_bp', 'scripts_bp', 'trajectory_bp', 'watch_bp']
