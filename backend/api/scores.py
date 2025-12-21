"""Scores and leaderboard API endpoints."""
from flask import Blueprint, request, jsonify
from backend.models import db, Score, GameSession, BuildSequence
from backend.auth import login_required

scores_bp = Blueprint('scores', __name__)

@scores_bp.route('/leaderboard', methods=['GET'])
def get_leaderboard():
    """Get leaderboard of top scores."""
    limit = request.args.get('limit', 10, type=int)
    offset = request.args.get('offset', 0, type=int)
    
    scores = Score.query.order_by(Score.score_value.desc()).offset(offset).limit(limit).all()
    
    return jsonify({
        'scores': [score.to_dict() for score in scores],
        'total': Score.query.count()
    })

@scores_bp.route('/user/<int:user_id>', methods=['GET'])
def get_user_scores(user_id):
    """Get all scores for a user."""
    limit = request.args.get('limit', 10, type=int)
    offset = request.args.get('offset', 0, type=int)
    
    scores = Score.query.filter_by(user_id=user_id).order_by(Score.score_value.desc()).offset(offset).limit(limit).all()
    
    return jsonify({
        'scores': [score.to_dict() for score in scores],
        'total': Score.query.filter_by(user_id=user_id).count()
    })

@scores_bp.route('/session/<int:session_id>', methods=['GET'])
@login_required
def get_session_score(session_id):
    """Get score for a specific session."""
    score = Score.query.filter_by(session_id=session_id).first_or_404()
    
    return jsonify({'score': score.to_dict()})

@scores_bp.route('/build/<int:session_id>', methods=['GET'])
def get_build_sequence(session_id):
    """Get build sequence for a session."""
    session = GameSession.query.get_or_404(session_id)
    
    build_sequence = BuildSequence.query.filter_by(session_id=session_id).order_by(BuildSequence.tick_number).all()
    
    return jsonify({
        'session': session.to_dict(),
        'build_sequence': [seq.to_dict() for seq in build_sequence]
    })

