"""Game API endpoints."""
from flask import Blueprint, request, jsonify, g
from backend.models import db, GameSession, BuildSequence
from backend.auth import login_required
from backend.game_engine import GameEngine

game_bp = Blueprint('game', __name__)

@game_bp.route('/start', methods=['POST'])
def start_game():
    """Start a new game session (guest mode allowed).
    
    NOTE: Python GameEngine is used ONLY for initialization to generate the initial game state.
    All runtime game logic (ticks, production, building, etc.) runs locally in JavaScript.
    After initialization, the backend only stores and retrieves game state snapshots.
    """
    data = request.get_json() or {}
    config = data.get('config', {})
    
    # Get user ID if authenticated, otherwise use None for guest
    user_id = None
    if hasattr(g, 'current_user') and g.current_user:
        user_id = g.current_user.id
    
    # Create game session
    session = GameSession(
        user_id=user_id,
        game_config=config
    )
    db.session.add(session)
    db.session.commit()
    
    # Initialize game engine (INITIALIZATION ONLY - not for runtime logic)
    # This generates the initial game state with starting resources, probes, etc.
    engine = GameEngine(session.id, config)
    game_state = engine.get_state()
    
    # Save initial state
    session.game_state = game_state
    db.session.commit()
    
    return jsonify({
        'session_id': session.id,
        'game_state': game_state
    }), 201

@game_bp.route('/state/<int:session_id>', methods=['GET'])
def get_game_state(session_id):
    """Get current game state (guest mode allowed).
    
    NOTE: This endpoint returns the saved game state directly from the database.
    It does NOT execute any game logic - all game logic runs locally in JavaScript.
    """
    session = GameSession.query.get_or_404(session_id)
    
    # Verify ownership if authenticated
    if hasattr(g, 'current_user') and g.current_user:
        if session.user_id and session.user_id != g.current_user.id:
            return jsonify({'error': 'Unauthorized'}), 403
    
    # Return saved game state directly (no game logic execution)
    return jsonify({'game_state': session.game_state or {}})

@game_bp.route('/save', methods=['POST'])
def save_game():
    """Save game state to backend (optional, for cloud sync)."""
    data = request.get_json()
    
    if not data or not data.get('session_id'):
        return jsonify({'error': 'Missing session_id'}), 400
    
    session = GameSession.query.get_or_404(data['session_id'])
    
    # Verify ownership if authenticated
    if hasattr(g, 'current_user') and g.current_user:
        if session.user_id and session.user_id != g.current_user.id:
            return jsonify({'error': 'Unauthorized'}), 403
    
    # Save game state from request
    game_state = data.get('game_state')
    if game_state:
        session.game_state = game_state
        db.session.commit()
        return jsonify({'success': True, 'message': 'Game state saved'})
    else:
        return jsonify({'error': 'Missing game_state'}), 400

@game_bp.route('/complete', methods=['POST'])
def complete_game():
    """Mark game session as complete and calculate score (guest mode allowed).
    
    NOTE: This endpoint calculates final stats from the saved game_state directly.
    It does NOT execute any game logic - all game logic runs locally in JavaScript.
    """
    data = request.get_json()
    
    if not data or not data.get('session_id'):
        return jsonify({'error': 'Missing session_id'}), 400
    
    session = GameSession.query.get_or_404(data['session_id'])
    
    # Verify ownership if authenticated
    if hasattr(g, 'current_user') and g.current_user:
        if session.user_id and session.user_id != g.current_user.id:
            return jsonify({'error': 'Unauthorized'}), 403
    
    # Calculate final stats from saved game state (no game logic execution)
    from datetime import datetime
    elapsed_time = (datetime.utcnow() - session.started_at).total_seconds()
    
    game_state = session.game_state or {}
    
    # Calculate total metal remaining from game state
    zone_metal_remaining = game_state.get('zone_metal_remaining', {})
    if isinstance(zone_metal_remaining, dict):
        total_metal_remaining = sum(zone_metal_remaining.values())
    else:
        total_metal_remaining = 0.0
    
    session.completed_at = datetime.utcnow()
    session.final_time = elapsed_time
    session.remaining_metal = total_metal_remaining

    score = None

    # Only create score for authenticated users (guests can play but don't appear on leaderboard)
    if session.user_id:
        from backend.models import Score
        score = Score(
            user_id=session.user_id,
            session_id=session.id,
            completion_time=elapsed_time,
            remaining_metal=total_metal_remaining
        )
        score.calculate_score_value()
        db.session.add(score)

    db.session.commit()

    return jsonify({
        'session': session.to_dict(),
        'score': score.to_dict() if score else None
    })

