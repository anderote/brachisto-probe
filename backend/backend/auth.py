"""Authentication utilities."""
from functools import wraps
from flask import jsonify, request, g
from backend.models import db, User
import jwt

def generate_token(user):
    """Generate JWT token for user."""
    from backend.config import Config
    payload = {
        'user_id': user.id,
        'username': user.username
    }
    return jwt.encode(payload, Config.SECRET_KEY, algorithm='HS256')

def verify_token(token):
    """Verify JWT token and return user."""
    from backend.config import Config
    try:
        payload = jwt.decode(token, Config.SECRET_KEY, algorithms=['HS256'])
        user_id = payload.get('user_id')
        if user_id:
            return User.query.get(user_id)
    except jwt.InvalidTokenError:
        return None
    return None

def get_current_user():
    """Get current user from request token."""
    auth_header = request.headers.get('Authorization')
    if auth_header:
        try:
            token = auth_header.split(' ')[1]  # Bearer <token>
            return verify_token(token)
        except IndexError:
            return None
    return None

def login_required(f):
    """Decorator to require authentication."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        g.current_user = user
        return f(*args, **kwargs)
    return decorated_function
