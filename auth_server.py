"""
Lokaler HTTP-Server für Auth-Handshake mit Landingpage
Empfängt Tokens direkt vom Browser via HTTP POST
"""

import json
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import sys

# Globale Referenz auf die Bridge (wird beim Start gesetzt)
_bridge_instance = None
_widget_instance = None

def set_bridge_instance(bridge, widget):
    """Setzt die Bridge-Instanz für den Auth-Server"""
    global _bridge_instance, _widget_instance
    _bridge_instance = bridge
    _widget_instance = widget

class AuthRequestHandler(BaseHTTPRequestHandler):
    """HTTP Request Handler für Auth-Callbacks"""
    
    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age', '3600')
        self.end_headers()
    
    def do_POST(self):
        """Handle POST requests for auth callbacks"""
        global _bridge_instance, _widget_instance
        
        # Parse URL
        parsed_path = urlparse(self.path)
        
        # Handle /auth/callback endpoint
        if parsed_path.path == '/auth/callback':
            try:
                # Read request body
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length)
                
                # Parse JSON
                try:
                    data = json.loads(post_data.decode('utf-8'))
                except json.JSONDecodeError:
                    # Try URL-encoded format
                    data = parse_qs(post_data.decode('utf-8'))
                    # Convert list values to single values
                    data = {k: v[0] if isinstance(v, list) and len(v) > 0 else v 
                           for k, v in data.items()}
                
                token = data.get('token') or data.get('idToken')
                refresh_token = data.get('refreshToken', '')
                
                if not token:
                    self._send_error(400, 'Missing token in request')
                    return
                
                # Call authenticate on bridge
                if _bridge_instance:
                    print(f"🔐 Auth-Server: Empfange Token (Länge: {len(token)})")
                    result = _bridge_instance.authenticate(token, refresh_token)
                    result_data = json.loads(result)
                    
                    if result_data.get('success'):
                        print("✅ Auth-Server: Authentifizierung erfolgreich!")
                        
                        # Send success response
                        self._send_json_response({
                            'success': True,
                            'message': 'Authentifizierung erfolgreich'
                        })
                        
                        # Notify frontend via widget
                        if _widget_instance and _widget_instance.web_view:
                            payload = {
                                "type": "auth_success",
                                "message": "Authentifizierung erfolgreich"
                            }
                            _widget_instance.web_view.page().runJavaScript(
                                f"window.ankiReceive({json.dumps(payload)});"
                            )
                    else:
                        error_msg = result_data.get('error', 'Unbekannter Fehler')
                        print(f"❌ Auth-Server: Authentifizierung fehlgeschlagen: {error_msg}")
                        self._send_error(401, error_msg)
                else:
                    self._send_error(503, 'Auth server not initialized')
                    
            except Exception as e:
                import traceback
                error_msg = f"Error processing auth callback: {str(e)}"
                print(f"❌ Auth-Server: {error_msg}")
                print(traceback.format_exc())
                self._send_error(500, error_msg)
        else:
            self._send_error(404, 'Endpoint not found')
    
    def do_GET(self):
        """Handle GET requests - simple health check"""
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/health':
            self._send_json_response({
                'status': 'ok',
                'service': 'anki-auth-server'
            })
        else:
            self._send_error(404, 'Endpoint not found')
    
    def _send_json_response(self, data, status_code=200):
        """Send JSON response"""
        response = json.dumps(data).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(response)))
        self.end_headers()
        self.wfile.write(response)
    
    def _send_error(self, status_code, message):
        """Send error response"""
        self._send_json_response({
            'success': False,
            'error': message
        }, status_code)
    
    def log_message(self, format, *args):
        """Override to use print instead of stderr"""
        # Only log important messages
        if '/health' not in args[0] if args else True:
            print(f"🌐 Auth-Server: {format % args}")


class AuthServer:
    """Lokaler HTTP-Server für Auth-Handshake"""
    
    def __init__(self, port=8765, host='127.0.0.1'):
        self.port = port
        self.host = host
        self.server = None
        self.server_thread = None
        self.running = False
    
    def start(self, bridge, widget):
        """Startet den Auth-Server in einem separaten Thread"""
        if self.running:
            print("⚠️ Auth-Server läuft bereits")
            return
        
        try:
            # Set bridge instance
            set_bridge_instance(bridge, widget)
            
            # Create server
            self.server = HTTPServer((self.host, self.port), AuthRequestHandler)
            
            # Start server in background thread
            self.server_thread = threading.Thread(
                target=self._run_server,
                daemon=True,
                name="AuthServerThread"
            )
            self.server_thread.start()
            self.running = True
            
            print(f"✅ Auth-Server gestartet auf http://{self.host}:{self.port}")
            print(f"   Endpoint: http://{self.host}:{self.port}/auth/callback")
            
        except OSError as e:
            if e.errno == 48:  # Address already in use
                print(f"⚠️ Port {self.port} bereits belegt. Auth-Server nicht gestartet.")
            else:
                print(f"❌ Fehler beim Starten des Auth-Servers: {e}")
                import traceback
                traceback.print_exc()
        except Exception as e:
            print(f"❌ Unerwarteter Fehler beim Starten des Auth-Servers: {e}")
            import traceback
            traceback.print_exc()
    
    def _run_server(self):
        """Runs the HTTP server (blocking)"""
        try:
            self.server.serve_forever()
        except Exception as e:
            print(f"❌ Auth-Server Fehler: {e}")
            import traceback
            traceback.print_exc()
        finally:
            self.running = False
    
    def stop(self):
        """Stoppt den Auth-Server"""
        if self.server:
            try:
                self.server.shutdown()
                self.server.server_close()
                print("🛑 Auth-Server gestoppt")
            except Exception as e:
                print(f"⚠️ Fehler beim Stoppen des Auth-Servers: {e}")
            finally:
                self.running = False
                self.server = None

# Globale Server-Instanz
_auth_server = None

def get_auth_server():
    """Gibt die globale Auth-Server-Instanz zurück"""
    global _auth_server
    if _auth_server is None:
        _auth_server = AuthServer()
    return _auth_server

