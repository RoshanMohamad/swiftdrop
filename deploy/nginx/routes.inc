  location = /healthz {
    access_log off;
    default_type application/json;
    return 200 '{"status":"ok"}';
  }

  # Public API, API docs and the merchant OAuth token endpoint -> core-api (:3000).
  # The core-api INTERNAL listener (:3001) is never routed here.
  location /api/ {
    set $core http://core-api:3000;
    proxy_pass $core;
    include /etc/nginx/swiftdrop/proxy.inc;
  }
  location /oauth/ {
    set $core http://core-api:3000;
    proxy_pass $core;
    include /etc/nginx/swiftdrop/proxy.inc;
  }

  # Real-time tracking (Socket.IO, WebSocket upgrade).
  location /socket.io/ {
    set $core http://core-api:3000;
    proxy_pass $core;
    include /etc/nginx/swiftdrop/proxy.inc;
    proxy_read_timeout 120s;
  }

  # MCP server for the AI assistant. It only forwards the caller's own JWT to the REST API.
  location /mcp {
    set $assistant http://ai-assistant:5000;
    proxy_pass $assistant;
    include /etc/nginx/swiftdrop/proxy.inc;
  }

  # Everything else is the single-page app.
  location / {
    set $web http://web:8080;
    proxy_pass $web;
    include /etc/nginx/swiftdrop/proxy.inc;
  }
