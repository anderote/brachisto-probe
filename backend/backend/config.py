"""Configuration settings for the Flask application."""
import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Base configuration."""
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
        os.environ.get('SQLALCHEMY_DATABASE_URI') or \
        'postgresql://localhost/brachisto_probe'
    
    # Game configuration
    DYSON_SPHERE_TARGET_MASS = 1e23  # kg, scaled realistic value
    INITIAL_PROBES = 1
    INITIAL_METAL = 1000  # kg
    INITIAL_ENERGY = 500  # watts
    TICKS_PER_SECOND = 60

class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True

class ProductionConfig(Config):
    """Production configuration."""
    DEBUG = False

class TestingConfig(Config):
    """Testing configuration."""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}
