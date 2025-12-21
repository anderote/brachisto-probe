"""Game API endpoints."""
from flask import Blueprint, request, jsonify, g
from backend.models import db, GameSession, BuildSequence
from backend.auth import login_required
from backend.game_engine import GameEngine

game_bp = Blueprint('game', __name__)

@game_bp.route('/start', methods=['POST'])
def start_game():
    """Start a new game session (guest mode allowed)."""
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
    
    # Initialize game engine
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
    """Get current game state (guest mode allowed)."""
    session = GameSession.query.get_or_404(session_id)
    
    # Verify ownership if authenticated
    if hasattr(g, 'current_user') and g.current_user:
        if session.user_id and session.user_id != g.current_user.id:
            return jsonify({'error': 'Unauthorized'}), 403
    
    # Load engine and get state
    engine = GameEngine.load_from_session(session)
    game_state = engine.get_state()
    
    return jsonify({'game_state': game_state})

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

@game_bp.route('/action', methods=['POST'])
def game_action():
    """Perform a game action (DEPRECATED - actions now handled locally in JavaScript).
    
    This endpoint is kept for backward compatibility but is no longer used.
    Game actions are now performed locally in the browser.
    """
    return jsonify({
        'error': 'Deprecated',
        'message': 'This endpoint is deprecated. Game actions are now handled locally in JavaScript.'
    }), 410  # 410 Gone

@game_bp.route('/tick', methods=['POST'])
def tick_game():
    """Advance game simulation (DEPRECATED - ticks now handled locally in JavaScript).
    
    This endpoint is kept for backward compatibility but is no longer used.
    Game ticks are now performed locally in the browser at 60 ticks/second.
    """
    return jsonify({
        'error': 'Deprecated',
        'message': 'This endpoint is deprecated. Game ticks are now handled locally in JavaScript.'
    }), 410  # 410 Gone

@game_bp.route('/recycle_factory', methods=['POST'])
def recycle_factory():
    """Recycle a factory in a depleted zone (guest mode allowed)."""
    data = request.get_json()
    
    if not data or not data.get('session_id'):
        return jsonify({'error': 'Missing session_id'}), 400
    
    session = GameSession.query.get_or_404(data['session_id'])
    
    # Verify ownership if authenticated
    if session.user_id != g.current_user.id:
        return jsonify({'error': 'Unauthorized'}), 403
    
    # Load engine
    engine = GameEngine.load_from_session(session)
    
    factory_id = data.get('factory_id')
    zone_id = data.get('zone_id')
    
    try:
        result = engine.recycle_factory(factory_id, zone_id)
        
        # Record action
        build_seq = BuildSequence(
            session_id=session.id,
            action_type='recycle_factory',
            action_data={'factory_id': factory_id, 'zone_id': zone_id},
            timestamp=engine.get_time(),
            tick_number=engine.tick_count
        )
        db.session.add(build_seq)
        
        # Save game state
        session.game_state = engine.get_state()
        db.session.commit()
        
        return jsonify({
            'success': True,
            'game_state': engine.get_state(),
            'result': result
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@game_bp.route('/complete', methods=['POST'])
def complete_game():
    """Mark game session as complete and calculate score (guest mode allowed)."""
    data = request.get_json()
    
    if not data or not data.get('session_id'):
        return jsonify({'error': 'Missing session_id'}), 400
    
    session = GameSession.query.get_or_404(data['session_id'])
    
    # Verify ownership if authenticated
    if hasattr(g, 'current_user') and g.current_user:
        if session.user_id and session.user_id != g.current_user.id:
            return jsonify({'error': 'Unauthorized'}), 403
    
    # Load engine
    engine = GameEngine.load_from_session(session)
    
    # Calculate final stats
    from datetime import datetime
    elapsed_time = (datetime.utcnow() - session.started_at).total_seconds()
    
    session.completed_at = datetime.utcnow()
    session.final_time = elapsed_time
    session.remaining_metal = engine.get_total_metal_remaining()
    session.game_state = engine.get_state()
    
    # Create score
    from backend.models import Score
    score = Score(
        user_id=session.user_id,
        session_id=session.id,
        completion_time=elapsed_time,
        remaining_metal=session.remaining_metal
    )
    score.calculate_score_value()
    
    db.session.add(score)
    db.session.commit()
    
    return jsonify({
        'session': session.to_dict(),
        'score': score.to_dict()
    })

