"""Scripting API endpoints."""
from flask import Blueprint, request, jsonify
from backend.auth import login_required
from backend.scripting import ScriptExecutor

scripts_bp = Blueprint('scripts', __name__)

@scripts_bp.route('/execute', methods=['POST'])
@login_required
def execute_script():
    """Execute a Python-like DSL script."""
    data = request.get_json()
    
    if not data or not data.get('script'):
        return jsonify({'error': 'Missing script'}), 400
    
    script = data['script']
    session_id = data.get('session_id')
    
    if not session_id:
        return jsonify({'error': 'Missing session_id'}), 400
    
    try:
        executor = ScriptExecutor(session_id)
        result = executor.execute(script)
        
        return jsonify({
            'success': True,
            'result': result
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@scripts_bp.route('/validate', methods=['POST'])
def validate_script():
    """Validate script syntax."""
    data = request.get_json()
    
    if not data or not data.get('script'):
        return jsonify({'error': 'Missing script'}), 400
    
    script = data['script']
    
    try:
        executor = ScriptExecutor(None)  # No session needed for validation
        executor.validate(script)
        
        return jsonify({
            'valid': True
        })
    except Exception as e:
        return jsonify({
            'valid': False,
            'error': str(e)
        }), 400

