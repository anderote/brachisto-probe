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
    DYSON_SPHERE_TARGET_MASS = 20e22  # kg, base value (can be reduced by research)
    INITIAL_PROBES = 10  # Default starting probes (overridden by difficulty config)
    INITIAL_METAL = 100  # kg
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
    # FALLBACK values - primary source is game_data/economic_rules.json
    # All rates are per-day (fundamental time unit)
    PROBE_MASS = 100  # kg per probe
    PROBE_BASE_MINING_RATE = 100.0  # kg/day per probe (base mining rate)
    PROBE_BASE_BUILD_RATE = 20.0  # kg/day per probe (base build power)
    PROBE_BASE_MOVEMENT_SPEED = 30.0  # km/s - for transfer calculations
    PROBE_BASE_MOVEMENT_EFFICIENCY = 1.0  # multiplier - for transfer energy cost reduction
    
    # Probe energy values - FALLBACKS (see economic_rules.json probe section)
    PROBE_BASE_ENERGY_PRODUCTION = 100000  # 100 kW per probe (base generation)
    PROBE_BASE_ENERGY_COST_MINING = 500000  # 500 kW per mining probe
    PROBE_BASE_ENERGY_COST_RECYCLE_SLAG = 300000  # 300 kW per recycling probe
    
    # Structure energy values - FALLBACKS (see economic_rules.json structures section)
    STRUCTURE_BASE_ENERGY_COST = 250000  # 250 kW base for structure energy multipliers
    
    # Legacy aliases for backward compatibility
    PROBE_HARVEST_RATE = PROBE_BASE_MINING_RATE
    PROBE_BUILD_RATE = PROBE_BASE_BUILD_RATE
    PROBE_ENERGY_CONSUMPTION = STRUCTURE_BASE_ENERGY_COST  # Legacy: used for structure energy calculations

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
