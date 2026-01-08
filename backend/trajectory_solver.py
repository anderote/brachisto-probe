"""
Trajectory Solver using poliastro

Computes accurate interplanetary transfer trajectories using Lambert's problem.
Supports direct Hohmann-like transfers and multi-leg gravity assist trajectories.
"""

import numpy as np
from typing import List, Tuple, Optional, Dict, Any
import math

try:
    from astropy import units as u
    from astropy.time import Time
    from poliastro.iod import izzo
    from poliastro.bodies import Sun
    POLIASTRO_AVAILABLE = True
except ImportError:
    POLIASTRO_AVAILABLE = False
    print("Warning: poliastro not available. Using fallback trajectory calculation.")


# Physical constants
AU_M = 149597870700  # Astronomical unit in meters
SUN_MU = 1.32712440018e20  # Sun's gravitational parameter (m³/s²)


class TrajectorySolver:
    """
    Solves Lambert's problem for interplanetary transfers.
    
    Given departure and arrival positions (or orbital radii) and a time-of-flight,
    computes the transfer trajectory and returns a series of points for visualization.
    """
    
    def __init__(self, orbital_zones: Optional[Dict] = None):
        """
        Initialize the trajectory solver.
        
        Args:
            orbital_zones: Dictionary of orbital zone data from orbital_mechanics.json
        """
        self.orbital_zones = orbital_zones or {}
        self.use_poliastro = POLIASTRO_AVAILABLE
    
    def get_zone_radius_au(self, zone_id: str) -> float:
        """Get orbital radius in AU for a zone."""
        if zone_id in self.orbital_zones:
            return self.orbital_zones[zone_id].get('radius_au', 1.0)
        
        # Fallback default radii
        default_radii = {
            'dyson_sphere': 0.29,
            'mercury': 0.39,
            'venus': 0.72,
            'earth': 1.0,
            'mars': 1.52,
            'asteroid_belt': 2.7,
            'jupiter': 5.2,
            'saturn': 9.5,
            'uranus': 19.2,
            'neptune': 30.1,
            'kuiper': 40.0,
            'oort_cloud': 140.0
        }
        return default_radii.get(zone_id, 1.0)
    
    def get_zone_mass_kg(self, zone_id: str) -> float:
        """Get mass in kg for a zone (for gravity assist calculations)."""
        if zone_id in self.orbital_zones:
            return self.orbital_zones[zone_id].get('total_mass_kg', 0)
        return 0

    def is_moon_zone(self, zone_id: str) -> bool:
        """Check if a zone is a moon."""
        if zone_id in self.orbital_zones:
            return self.orbital_zones[zone_id].get('is_moon', False)
        return False

    def get_moon_delta_v(self, zone_id: str) -> float:
        """Get delta-v to enter/exit a moon's orbit from its parent planet."""
        if zone_id in self.orbital_zones:
            zone = self.orbital_zones[zone_id]
            # delta_v_to_parent_km_s includes both capture and escape
            return zone.get('delta_v_to_parent_km_s', 0)
        return 0

    def get_parent_zone(self, zone_id: str) -> Optional[str]:
        """Get parent zone ID for a moon zone."""
        if zone_id in self.orbital_zones:
            return self.orbital_zones[zone_id].get('parent_zone')
        return None
    
    def get_planet_position(self, radius_au: float, game_time_days: float, 
                           initial_angle: float = 0) -> Tuple[float, float]:
        """
        Calculate planet position at a given game time.
        
        Uses Kepler's third law: T² ∝ a³
        
        Args:
            radius_au: Orbital radius in AU
            game_time_days: Game time in days since epoch
            initial_angle: Initial angular position in radians
            
        Returns:
            (x, y) position in AU
        """
        # Orbital period in days: T = 365.25 * a^(3/2)
        period_days = 365.25 * (radius_au ** 1.5)
        
        # Angular position
        theta = initial_angle + 2 * math.pi * (game_time_days / period_days)
        
        x = radius_au * math.cos(theta)
        y = radius_au * math.sin(theta)
        
        return (x, y)
    
    def solve_lambert(self, r1_au: Tuple[float, float], r2_au: Tuple[float, float],
                      tof_days: float, prograde: bool = True) -> Optional[Dict[str, Any]]:
        """
        Solve Lambert's problem for a transfer between two positions.
        
        Args:
            r1_au: Departure position (x, y) in AU
            r2_au: Arrival position (x, y) in AU
            tof_days: Time of flight in days
            prograde: Whether to use prograde (short way) solution
            
        Returns:
            Dictionary with trajectory data or None if no solution
        """
        if self.use_poliastro:
            return self._solve_lambert_poliastro(r1_au, r2_au, tof_days, prograde)
        else:
            return self._solve_lambert_fallback(r1_au, r2_au, tof_days, prograde)
    
    def _solve_lambert_poliastro(self, r1_au: Tuple[float, float], 
                                  r2_au: Tuple[float, float],
                                  tof_days: float, prograde: bool) -> Optional[Dict[str, Any]]:
        """Solve Lambert's problem using poliastro."""
        try:
            # Convert to meters with units
            r1 = np.array([r1_au[0] * AU_M, r1_au[1] * AU_M, 0]) * u.m
            r2 = np.array([r2_au[0] * AU_M, r2_au[1] * AU_M, 0]) * u.m
            tof = tof_days * 24 * 3600 * u.s
            
            # Gravitational parameter
            k = SUN_MU * u.m**3 / u.s**2
            
            # Solve Lambert's problem (Izzo algorithm)
            # Modern poliastro uses M= for number of complete revolutions (0 for direct transfer)
            v1, v2 = izzo.lambert(k, r1, r2, tof, M=0)
            
            # izzo.lambert returns arrays of solutions when M=0, take the first (short-way)
            if hasattr(v1, '__len__') and len(v1) > 0:
                # Take short way solution if prograde, or long way if retrograde
                idx = 0 if prograde else -1 if len(v1) > 1 else 0
                v1 = v1[idx]
                v2 = v2[idx]
            
            # Extract velocity values (m/s)
            v1_ms = v1.to(u.m / u.s).value
            v2_ms = v2.to(u.m / u.s).value
            
            # Calculate delta-v from circular orbits
            r1_m = np.linalg.norm(r1.value)
            r2_m = np.linalg.norm(r2.value)
            
            # Circular orbital velocities
            v_circ_1 = math.sqrt(SUN_MU / r1_m)
            v_circ_2 = math.sqrt(SUN_MU / r2_m)
            
            # Direction of circular velocity (perpendicular to radius, prograde)
            r1_norm = r1.value / r1_m
            v_circ_1_vec = np.array([-r1_norm[1], r1_norm[0], 0]) * v_circ_1
            
            r2_norm = r2.value / r2_m
            v_circ_2_vec = np.array([-r2_norm[1], r2_norm[0], 0]) * v_circ_2
            
            # Delta-v at departure and arrival
            dv1 = np.linalg.norm(v1_ms - v_circ_1_vec)
            dv2 = np.linalg.norm(v_circ_2_vec - v2_ms)
            
            return {
                'v1': v1_ms.tolist(),  # Departure velocity (m/s)
                'v2': v2_ms.tolist(),  # Arrival velocity (m/s)
                'dv1_ms': float(dv1),  # Departure delta-v (m/s)
                'dv2_ms': float(dv2),  # Arrival delta-v (m/s)
                'total_dv_ms': float(dv1 + dv2),
                'total_dv_km_s': float((dv1 + dv2) / 1000),
                'r1_au': list(r1_au),
                'r2_au': list(r2_au),
                'tof_days': tof_days
            }
            
        except Exception as e:
            print(f"Lambert solver error: {e}")
            return None
    
    def _solve_lambert_fallback(self, r1_au: Tuple[float, float], 
                                 r2_au: Tuple[float, float],
                                 tof_days: float, prograde: bool) -> Optional[Dict[str, Any]]:
        """
        Fallback Lambert solver using simplified ellipse calculation.
        Less accurate but works without poliastro.
        """
        r1_m = math.sqrt(r1_au[0]**2 + r1_au[1]**2) * AU_M
        r2_m = math.sqrt(r2_au[0]**2 + r2_au[1]**2) * AU_M
        
        # Semi-major axis of transfer ellipse (assuming Hohmann-like)
        a = (r1_m + r2_m) / 2
        
        # Hohmann delta-v calculation
        dv1 = math.sqrt(SUN_MU / r1_m) * (math.sqrt(2 * r2_m / (r1_m + r2_m)) - 1)
        dv2 = math.sqrt(SUN_MU / r2_m) * (1 - math.sqrt(2 * r1_m / (r1_m + r2_m)))
        
        return {
            'v1': [0, 0, 0],  # Placeholder
            'v2': [0, 0, 0],
            'dv1_ms': abs(dv1),
            'dv2_ms': abs(dv2),
            'total_dv_ms': abs(dv1) + abs(dv2),
            'total_dv_km_s': (abs(dv1) + abs(dv2)) / 1000,
            'r1_au': list(r1_au),
            'r2_au': list(r2_au),
            'tof_days': tof_days
        }
    
    def generate_trajectory_points(self, r1_au: Tuple[float, float], 
                                    r2_au: Tuple[float, float],
                                    tof_days: float, 
                                    num_points: int = 50) -> List[Tuple[float, float]]:
        """
        Generate trajectory points for visualization.
        
        Uses a conic section approximation to generate points along the transfer orbit.
        
        Args:
            r1_au: Departure position (x, y) in AU
            r2_au: Arrival position (x, y) in AU
            tof_days: Time of flight in days
            num_points: Number of points to generate
            
        Returns:
            List of (x, y) positions in AU
        """
        r1 = np.array(r1_au)
        r2 = np.array(r2_au)
        
        r1_mag = np.linalg.norm(r1)
        r2_mag = np.linalg.norm(r2)
        
        # Calculate the transfer angle
        cos_theta = np.dot(r1, r2) / (r1_mag * r2_mag)
        cos_theta = np.clip(cos_theta, -1, 1)
        transfer_angle = np.arccos(cos_theta)
        
        # Determine if this is a short or long way transfer
        cross = r1[0] * r2[1] - r1[1] * r2[0]
        if cross < 0:
            transfer_angle = 2 * np.pi - transfer_angle
        
        # Semi-major axis of transfer ellipse
        a = (r1_mag + r2_mag) / 2
        
        # Eccentricity (approximate for Hohmann-like transfer)
        e = abs(r2_mag - r1_mag) / (r1_mag + r2_mag)
        
        # Generate points along the transfer ellipse
        points = []
        
        # Starting angle (from r1 position)
        theta1 = np.arctan2(r1[1], r1[0])
        
        for i in range(num_points):
            # Parametric angle along transfer (0 to transfer_angle)
            t = i / (num_points - 1)
            theta = theta1 + t * transfer_angle
            
            # Interpolate radius (approximate conic section)
            # Use a smooth interpolation that accounts for the ellipse shape
            r1_frac = 1 - t
            r2_frac = t
            
            # For a more accurate conic, use the vis-viva-like interpolation
            # r = a * (1 - e²) / (1 + e * cos(true_anomaly))
            # Simplified: interpolate with acceleration toward/away from sun
            
            # Quadratic interpolation gives better ellipse approximation
            # Minimum distance at midpoint for inner transfers
            if r1_mag > r2_mag:
                # Inbound transfer - trajectory dips inward
                r_min = r2_mag
                r_max = r1_mag
                # Parabolic interpolation
                r = r_max - (r_max - r_min) * (4 * t * (1 - t) + t)
            else:
                # Outbound transfer - trajectory goes outward
                r_min = r1_mag
                r_max = r2_mag
                # Parabolic interpolation
                r = r_min + (r_max - r_min) * t
            
            # For more realistic Hohmann shape, use ellipse equation
            # The transfer ellipse has perihelion at min(r1, r2) and aphelion at max(r1, r2)
            # True anomaly changes from 0° at perihelion to 180° at aphelion
            
            # Calculate position
            x = r * np.cos(theta)
            y = r * np.sin(theta)
            
            points.append((float(x), float(y)))
        
        return points
    
    def compute_transfer(self, from_zone: str, to_zone: str,
                         game_time_days: float = 0,
                         num_points: int = 50,
                         planet_positions: Optional[Dict[str, Tuple[float, float]]] = None) -> Dict[str, Any]:
        """
        Compute a complete transfer trajectory between two zones.
        
        This is the main entry point for computing transfers.
        
        Args:
            from_zone: Departure zone ID
            to_zone: Arrival zone ID
            game_time_days: Current game time (for planet positions)
            num_points: Number of trajectory points to generate
            planet_positions: Optional dict of actual planet positions from frontend
                              e.g. {"earth": [1.0, 0.0], "mars": [0.5, 1.4]}
            
        Returns:
            Dictionary with trajectory data and visualization points
        """
        # Get orbital radii
        r1_au = self.get_zone_radius_au(from_zone)
        r2_au = self.get_zone_radius_au(to_zone)
        
        # Calculate Hohmann transfer time (as initial estimate)
        a = (r1_au + r2_au) / 2  # Semi-major axis in AU
        tof_days = 0.5 * 365.25 * (a ** 1.5)  # Half orbital period
        
        # Get source position - use provided position if available
        if planet_positions and from_zone in planet_positions:
            r1_pos = tuple(planet_positions[from_zone])
        else:
            r1_pos = self.get_planet_position(r1_au, game_time_days)
        
        # For time-dependent trajectory calculation:
        # We know where the source is NOW, but we need to compute where the 
        # destination will be at ARRIVAL time (which depends on transfer time)
        # This is solved iteratively
        
        if planet_positions and to_zone in planet_positions:
            # Get destination's current position to determine its current orbital angle and radius
            r2_current = tuple(planet_positions[to_zone])
            r2_current_mag = math.sqrt(r2_current[0]**2 + r2_current[1]**2)
            theta2_now = math.atan2(r2_current[1], r2_current[0])
            
            print(f"[TrajectorySolver] Using provided destination position for {to_zone}: "
                  f"current=[{r2_current[0]:.4f}, {r2_current[1]:.4f}] AU, "
                  f"radius={r2_current_mag:.4f} AU, angle={math.degrees(theta2_now):.1f}°")
            
            # Use the actual current radius for orbital period calculation
            # This ensures we're using the real position, not the zone's nominal radius
            r2_actual_au = r2_current_mag
            
            # Iterate to find where destination will be at arrival
            # Start with Hohmann TOF as initial guess
            best_tof = tof_days
            best_r2_pos = None
            best_dv = float('inf')
            
            # Try different transfer times to find a reasonable solution
            # Range from 0.3x to 2.5x Hohmann TOF
            for tof_factor in [0.3, 0.5, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.5, 1.7, 2.0, 2.5]:
                test_tof = tof_days * tof_factor
                
                # Destination's orbital period based on actual current radius
                period_days = 365.25 * (r2_actual_au ** 1.5)
                
                # Destination's angle at arrival time
                theta2_arrival = theta2_now + 2 * math.pi * (test_tof / period_days)
                
                # Destination position at arrival - use actual radius, not zone radius
                test_r2_pos = (r2_actual_au * math.cos(theta2_arrival), 
                               r2_actual_au * math.sin(theta2_arrival))
                
                # Solve Lambert for this configuration
                test_result = self.solve_lambert(r1_pos, test_r2_pos, test_tof)
                
                if test_result and test_result['total_dv_km_s'] < best_dv:
                    best_dv = test_result['total_dv_km_s']
                    best_tof = test_tof
                    best_r2_pos = test_r2_pos
            
            tof_days = best_tof
            r2_pos = best_r2_pos if best_r2_pos else r2_current
        else:
            # Fall back to optimal Hohmann (180° opposition)
            theta1 = math.atan2(r1_pos[1], r1_pos[0])
            theta2 = theta1 + math.pi  # 180° away
            r2_pos = (r2_au * math.cos(theta2), r2_au * math.sin(theta2))
        
        arrival_time = game_time_days + tof_days
        
        # Solve Lambert's problem
        lambert_result = self.solve_lambert(r1_pos, r2_pos, tof_days)
        
        # Generate trajectory points
        trajectory_points = self.generate_trajectory_points(
            r1_pos, r2_pos, tof_days, num_points
        )

        # Calculate base interplanetary delta-v
        base_dv = lambert_result['total_dv_km_s'] if lambert_result else None

        # Calculate additional moon delta-v requirements
        departure_moon_dv = 0.0
        arrival_moon_dv = 0.0

        if self.is_moon_zone(from_zone):
            # Departing from a moon - need to escape moon's gravity first
            departure_moon_dv = self.get_moon_delta_v(from_zone)

        if self.is_moon_zone(to_zone):
            # Arriving at a moon - need additional delta-v to capture into moon orbit
            arrival_moon_dv = self.get_moon_delta_v(to_zone)

        # Total delta-v includes interplanetary + moon escape/capture
        total_dv = base_dv
        if total_dv is not None:
            total_dv = total_dv + departure_moon_dv + arrival_moon_dv

        return {
            'from_zone': from_zone,
            'to_zone': to_zone,
            'departure_time_days': game_time_days,
            'arrival_time_days': arrival_time,
            'transfer_time_days': tof_days,
            'departure_position_au': list(r1_pos),
            'arrival_position_au': list(r2_pos),
            'trajectory_points_au': trajectory_points,
            'lambert_solution': lambert_result,
            'base_delta_v_km_s': base_dv,
            'departure_moon_delta_v_km_s': departure_moon_dv,
            'arrival_moon_delta_v_km_s': arrival_moon_dv,
            'delta_v_km_s': total_dv,
            'used_actual_positions': planet_positions is not None,
            'from_is_moon': self.is_moon_zone(from_zone),
            'to_is_moon': self.is_moon_zone(to_zone)
        }
    
    def compute_gravity_assist_transfer(self, from_zone: str, to_zone: str,
                                         via_zone: str,
                                         game_time_days: float = 0,
                                         num_points: int = 50,
                                         planet_positions: Optional[Dict[str, Tuple[float, float]]] = None) -> Dict[str, Any]:
        """
        Compute a transfer trajectory using a gravity assist.
        
        Args:
            from_zone: Departure zone ID
            to_zone: Final destination zone ID
            via_zone: Intermediate zone for gravity assist
            game_time_days: Current game time
            num_points: Number of trajectory points per leg
            planet_positions: Optional dict of actual planet positions from frontend
            
        Returns:
            Dictionary with multi-leg trajectory data
        """
        # Compute first leg (departure to flyby)
        leg1 = self.compute_transfer(from_zone, via_zone, game_time_days, num_points // 2, planet_positions)
        
        # Compute second leg (flyby to destination)
        flyby_time = leg1['arrival_time_days']
        leg2 = self.compute_transfer(via_zone, to_zone, flyby_time, num_points // 2, planet_positions)
        
        # Get flyby body mass for gravity assist calculation
        flyby_mass = self.get_zone_mass_kg(via_zone)
        
        # Calculate approximate delta-v savings from gravity assist
        # This is a simplified model - real gravity assists depend on geometry
        if flyby_mass > 0:
            # Gravity assist can provide up to 2 * v_escape * sin(delta/2)
            # where delta is the turn angle
            mu_flyby = 6.674e-11 * flyby_mass  # G * M
            r_flyby = 1e9  # Assume 1000km periapsis (simplified)
            v_escape_flyby = math.sqrt(2 * mu_flyby / r_flyby) / 1000  # km/s
            
            # Estimate delta-v savings (simplified)
            assist_bonus_km_s = min(v_escape_flyby * 0.5, 5.0)  # Cap at 5 km/s
        else:
            assist_bonus_km_s = 0
        
        # Combine trajectory points
        all_points = leg1['trajectory_points_au'] + leg2['trajectory_points_au']
        
        # Total delta-v (with gravity assist benefit)
        total_dv = 0
        if leg1['lambert_solution']:
            total_dv += leg1['lambert_solution']['total_dv_km_s']
        if leg2['lambert_solution']:
            total_dv += leg2['lambert_solution']['total_dv_km_s']
        total_dv = max(0, total_dv - assist_bonus_km_s)
        
        return {
            'from_zone': from_zone,
            'to_zone': to_zone,
            'via_zone': via_zone,
            'departure_time_days': game_time_days,
            'flyby_time_days': flyby_time,
            'arrival_time_days': leg2['arrival_time_days'],
            'total_transfer_time_days': leg2['arrival_time_days'] - game_time_days,
            'trajectory_points_au': all_points,
            'leg1': leg1,
            'leg2': leg2,
            'gravity_assist_bonus_km_s': assist_bonus_km_s,
            'total_delta_v_km_s': total_dv,
            'is_gravity_assist': True
        }


# Singleton instance
_solver_instance: Optional[TrajectorySolver] = None


def get_trajectory_solver(orbital_zones: Optional[Dict] = None) -> TrajectorySolver:
    """Get or create the trajectory solver singleton."""
    global _solver_instance
    if _solver_instance is None or orbital_zones is not None:
        _solver_instance = TrajectorySolver(orbital_zones)
    return _solver_instance

