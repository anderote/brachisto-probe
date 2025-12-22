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
    DYSON_SPHERE_TARGET_MASS = 5e24  # kg, base value (can be reduced by research)
    INITIAL_PROBES = 1
    INITIAL_METAL = 1000  # kg
    INITIAL_ENERGY = 0  # watts - energy cannot be stored, use constant supply
    CONSTANT_ENERGY_SUPPLY = 100000  # watts (100kW) - constant power supply
    TICKS_PER_SECOND = 60
    
    # Time system: fundamental unit is 1 day
    # At 60 fps and time speed 1: 1 day per second (86400 seconds per day)
    # At 100x speed: 100 days per second
    SECONDS_PER_DAY = 86400  # seconds in one day
    
    # Base skill values (starting values before research)
    # Propulsion: specific impulse in seconds
    BASE_PROPULSION_ISP = 500  # seconds (starting specific impulse)
    
    # Dyson sphere energy production constants
    DYSON_POWER_PER_SQ_M = 5000  # watts per square meter (5 kW/m²)
    DYSON_MASS_PER_SQ_M = 1.0  # kg per square meter
    DYSON_POWER_PER_KG = 5000  # watts per kg (5 kW/kg = 5 kW/m² / 1 kg/m²)
    
    # Base probe stats (single probe type)
    # All rates are per-day (fundamental time unit)
    PROBE_MASS = 100  # kg per probe
    PROBE_BASE_MINING_RATE = 100.0  # kg/day per probe (base mining rate - mines 100kg mass per day)
    PROBE_BASE_BUILD_RATE = 10.0  # kg/day per probe (base build power - 1 probe takes 10 days to build a 100kg probe)
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
