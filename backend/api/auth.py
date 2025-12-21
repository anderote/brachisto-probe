"""Authentication API endpoints."""
from flask import Blueprint, request, jsonify
from backend.models import db, User
from backend.auth import generate_token, login_required, get_current_user

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    """Register a new user."""
    data = request.get_json()
    
    if not data or not data.get('username') or not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Missing required fields'}), 400
    
    # Check if user exists
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'error': 'Username already exists'}), 400
    
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email already exists'}), 400
    
    # Create new user
    user = User(
        username=data['username'],
        email=data['email']
    )
    user.set_password(data['password'])
    
    db.session.add(user)
    db.session.commit()
    
    token = generate_token(user)
    
    return jsonify({
        'token': token,
        'user': user.to_dict()
    }), 201

@auth_bp.route('/login', methods=['POST'])
def login():
    """Login user and return token."""
    data = request.get_json()
    
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'error': 'Missing username or password'}), 400
    
    user = User.query.filter_by(username=data['username']).first()
    
    if not user or not user.check_password(data['password']):
        return jsonify({'error': 'Invalid credentials'}), 401
    
    token = generate_token(user)
    
    return jsonify({
        'token': token,
        'user': user.to_dict()
    })

@auth_bp.route('/logout', methods=['POST'])
@login_required
def logout():
    """Logout user (token invalidation handled client-side)."""
    return jsonify({'message': 'Logged out successfully'})

@auth_bp.route('/me', methods=['GET'])
@login_required
def get_current_user_info():
    """Get current user information."""
    from flask import g
    return jsonify({'user': g.current_user.to_dict()})

