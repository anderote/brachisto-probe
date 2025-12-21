"""Watch mode API endpoints."""
from flask import Blueprint, request, jsonify
from backend.models import db, GameSession, BuildSequence

watch_bp = Blueprint('watch', __name__)

@watch_bp.route('/start', methods=['POST'])
def start_watch_mode():
    """Start watch mode with a build sequence."""
    data = request.get_json()
    
    if not data or not data.get('session_id'):
        return jsonify({'error': 'Missing session_id'}), 400
    
    session_id = data['session_id']
    session = GameSession.query.get_or_404(session_id)
    
    # Get build sequence
    build_sequence = BuildSequence.query.filter_by(session_id=session_id).order_by(BuildSequence.tick_number).all()
    
    return jsonify({
        'session': session.to_dict(),
        'build_sequence': [seq.to_dict() for seq in build_sequence]
    })

@watch_bp.route('/state', methods=['GET'])
def get_watch_state():
    """Get current watch mode state."""
    # This would be managed client-side, but we can provide the session data
    session_id = request.args.get('session_id')
    
    if not session_id:
        return jsonify({'error': 'Missing session_id'}), 400
    
    session = GameSession.query.get_or_404(session_id)
    
    return jsonify({
        'session': session.to_dict(),
        'game_state': session.game_state
    })

