"""Database models for the game."""
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt

db = SQLAlchemy()
bcrypt = Bcrypt()

class User(db.Model):
    """User model for authentication and profile."""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    sessions = db.relationship('GameSession', backref='user', lazy=True, cascade='all, delete-orphan')
    scores = db.relationship('Score', backref='user', lazy=True, cascade='all, delete-orphan')
    
    def set_password(self, password):
        """Hash and set password."""
        self.password_hash = bcrypt.generate_password_hash(password).decode('utf-8')
    
    def check_password(self, password):
        """Check password against hash."""
        return bcrypt.check_password_hash(self.password_hash, password)
    
    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'created_at': self.created_at.isoformat()
        }

class GameSession(db.Model):
    """Game session model."""
    __tablename__ = 'game_sessions'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, index=True)  # Allow guest sessions
    started_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    completed_at = db.Column(db.DateTime, nullable=True)
    final_time = db.Column(db.Float, nullable=True)  # seconds
    remaining_metal = db.Column(db.Float, nullable=True)  # kg
    game_config = db.Column(db.JSON, default=dict)  # Difficulty settings, etc.
    game_state = db.Column(db.JSON, default=dict)  # Full game state snapshot
    
    # Relationships
    build_sequence = db.relationship('BuildSequence', backref='session', lazy=True, cascade='all, delete-orphan', order_by='BuildSequence.tick_number')
    score = db.relationship('Score', backref='session', uselist=False, cascade='all, delete-orphan')
    
    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'started_at': self.started_at.isoformat(),
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'final_time': self.final_time,
            'remaining_metal': self.remaining_metal,
            'game_config': self.game_config,
            'game_state': self.game_state
        }

class BuildSequence(db.Model):
    """Build sequence model for recording game actions."""
    __tablename__ = 'build_sequences'
    
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('game_sessions.id'), nullable=False, index=True)
    action_type = db.Column(db.String(50), nullable=False)  # purchase, research, script_execution, probe_allocation
    action_data = db.Column(db.JSON, nullable=False)
    timestamp = db.Column(db.Float, nullable=False)  # seconds relative to session start
    tick_number = db.Column(db.Integer, nullable=False, index=True)
    
    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'session_id': self.session_id,
            'action_type': self.action_type,
            'action_data': self.action_data,
            'timestamp': self.timestamp,
            'tick_number': self.tick_number
        }

class Score(db.Model):
    """Score model for leaderboards."""
    __tablename__ = 'scores'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    session_id = db.Column(db.Integer, db.ForeignKey('game_sessions.id'), unique=True, nullable=False, index=True)
    completion_time = db.Column(db.Float, nullable=False)  # seconds
    remaining_metal = db.Column(db.Float, nullable=False)  # kg
    score_value = db.Column(db.Float, nullable=False, index=True)  # Computed score
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    def calculate_score_value(self):
        """Calculate score value based on time and remaining metal."""
        # Lower time is better, more metal is better
        # Score = remaining_metal / (completion_time + 1) * 1000
        # Higher score is better
        self.score_value = (self.remaining_metal / (self.completion_time + 1)) * 1000
        return self.score_value
    
    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'username': self.user.username,
            'session_id': self.session_id,
            'completion_time': self.completion_time,
            'remaining_metal': self.remaining_metal,
            'score_value': self.score_value,
            'created_at': self.created_at.isoformat()
        }
