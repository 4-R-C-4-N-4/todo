"""
HDL Transport Layer Integration

Bridges the biological simulation (flora, creatures, conveyances) to the
hardware description layer (HDL) transport system.
"""

from typing import Optional, List, Dict, Any, Callable
from dataclasses import dataclass
import time

@dataclass
class TransportMessage:
    """Message passed between simulation and HDL layers."""
    source: str
    target: str
    payload: Dict[str, Any]
    timestamp: float
    priority: int = 0

class TransportLayer:
    """
    Transport layer that routes messages between:
    - Biological simulation components
    - HDL hardware description layer
    - External systems via MCP capabilities
    """
    
    def __init__(self):
        self.routes: Dict[str, List[Callable]] = {}
        self.handlers: Dict[str, Callable] = {}
        self.message_queue: List[TransportMessage] = []
        self.active = False
        
    def register_route(self, target: str, handler: Callable):
        """Register a route handler for a target component."""
        if target not in self.routes:
            self.routes[target] = []
        self.routes[target].append(handler)
        
    def send_message(self, msg: TransportMessage) -> Optional[Any]:
        """Send a message and return any response."""
        if not self.active:
            return None
            
        # Queue the message
        self.message_queue.append(msg)
        
        # Route to handlers
        responses = []
        for target in [msg.target, msg.source]:
            if target in self.routes:
                for handler in self.routes[target]:
                    try:
                        result = handler(msg)
                        if result is not None:
                            responses.append(result)
                    except Exception as e:
                        print(f"Route error: {e}")
                        
        return responses[0] if responses else None
        
    def register_handler(self, source: str, handler: Callable):
        """Register a message handler for a source."""
        self.handlers[source] = handler
        
    def process_queue(self, max_batch: int = 100):
        """Process queued messages."""
        batch = self.message_queue[:max_batch]
        self.message_queue = self.message_queue[max_batch:]
        
        for msg in batch:
            self._process_message(msg)
            
    def _process_message(self, msg: TransportMessage):
        """Process a single message."""
        # Call handler if available
        if msg.source in self.handlers:
            try:
                result = self.handlers[msg.source](msg)
                if result:
                    # Send response back
                    response = TransportMessage(
                        source=msg.source,
                        target=msg.target,
                        payload={"response": result},
                        timestamp=time.time(),
                        priority=msg.priority
                    )
                    self.send_message(response)
            except Exception as e:
                print(f"Handler error: {e}")
                
    def connect_to_hdl(self, hdl_endpoint: str):
        """Connect to HDL hardware description endpoint."""
        # Placeholder for HDL connection logic
        self.handlers[hdl_endpoint] = lambda msg: f"HDL connected: {hdl_endpoint}"
        
    def disconnect_hdl(self):
        """Disconnect from HDL endpoint."""
        self.handlers.clear()
        
    def start(self):
        """Start the transport layer."""
        self.active = True
        
    def stop(self):
        """Stop the transport layer."""
        self.active = False
        
    def get_status(self) -> Dict[str, Any]:
        """Get transport layer status."""
        return {
            "active": self.active,
            "routes": list(self.routes.keys()),
            "handlers": list(self.handlers.keys()),
            "pending_messages": len(self.message_queue)
        }

# ============================================================================
# EXAMPLE USAGE
# ============================================================================
if __name__ == "__main__":
    layer = TransportLayer()
    layer.start()
    
    # Register handlers
    def on_flora_message(msg: TransportMessage):
        return f"Flora handler received: {msg.payload}"
        
    layer.register_handler("flora", on_flora_message)
    
    # Send message
    msg = TransportMessage(
        source="flora",
        target="hdl",
        payload={"growth_event": "flowering"},
        timestamp=time.time(),
        priority=1
    )
    
    response = layer.send_message(msg)
    print(f"Response: {response}")
    
    layer.stop()