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
        'sqlite:///brachisto_probe.db'  # Use SQLite for development
    
    # Game configuration
    DYSON_SPHERE_TARGET_MASS = 5e21  # kg, scaled realistic value
    INITIAL_PROBES = 1
    INITIAL_METAL = 1000  # kg
    INITIAL_ENERGY = 0  # watts - energy cannot be stored, use constant supply
    CONSTANT_ENERGY_SUPPLY = 1000000  # watts (1MW) - constant power supply
    TICKS_PER_SECOND = 60
    
    # Base probe stats (single probe type)
    PROBE_MASS = 10  # kg per probe
    PROBE_BASE_MINING_RATE = 0.5  # kg/s per probe
    PROBE_BASE_BUILD_RATE = 0.1  # kg/s per probe (base build speed)
    PROBE_BASE_MOVEMENT_SPEED = 30.0  # km/s - for transfer calculations
    PROBE_BASE_MOVEMENT_EFFICIENCY = 1.0  # multiplier - for transfer energy cost reduction
    PROBE_BASE_POWER_CONSUMPTION = 100000  # watts (100kW) per probe
    
    # Legacy aliases for backward compatibility
    PROBE_HARVEST_RATE = PROBE_BASE_MINING_RATE
    PROBE_BUILD_RATE = PROBE_BASE_BUILD_RATE
    PROBE_ENERGY_CONSUMPTION = PROBE_BASE_POWER_CONSUMPTION

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
