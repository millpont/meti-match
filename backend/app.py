"""METI Open Match — Flask API + SPA host.

Serves the built React app (frontend/dist) and a JSON API under /api, with Auth0 login.
One container, one port — deployed to AWS App Runner via Copilot, same as METI.
"""
import os
import logging
from datetime import timedelta

from flask import Flask, session, jsonify, send_from_directory, request
from flask_session import Session
from flask_wtf.csrf import CSRFProtect, generate_csrf

from config import config
from auth import auth_bp, init_auth
from match_routes import match_bp
from onboarding_routes import onboarding_bp
from offers_routes import offers_bp
from offer_documents_routes import offer_documents_bp
from account_documents_routes import account_documents_bp
from directory_routes import directory_bp
from bids_routes import bids_bp
from responses_routes import responses_bp
from requirements_routes import requirements_bp
from enrollments_routes import enrollments_bp
from matching_routes import matching_bp
from contracts_routes import contracts_bp
from production_data_routes import production_data_bp
from production_data_documents_routes import production_data_documents_bp
from admin_routes import admin_bp
from taxonomy_routes import taxonomy_bp
from notifications_routes import notifications_bp
from representations_routes import representations_bp
from company_routes import company_bp
from attribute_requests_routes import attribute_requests_bp
from counties_routes import counties_bp
from inventory_routes import inventory_bp
from profile_routes import profile_bp
from service_requests_routes import service_requests_bp

logging.basicConfig(level=logging.INFO)

# Static files = the Vite build output.
DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")


def create_app():
    app = Flask(__name__, static_folder=None)
    app.secret_key = config.SECRET_KEY
    app.config.update(
        SESSION_COOKIE_HTTPONLY=config.SESSION_COOKIE_HTTPONLY,
        SESSION_COOKIE_SECURE=config.SESSION_COOKIE_SECURE,
        SESSION_COOKIE_SAMESITE=config.SESSION_COOKIE_SAMESITE,
        SESSION_COOKIE_NAME=config.SESSION_COOKIE_NAME,
        SESSION_COOKIE_PATH=config.SESSION_COOKIE_PATH,
        PERMANENT_SESSION_LIFETIME=timedelta(hours=24),
        SESSION_TYPE="filesystem",
        SESSION_FILE_DIR=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".flask_session"),
        SESSION_PERMANENT=True,
        WTF_CSRF_TIME_LIMIT=3600,
    )

    Session(app)
    csrf = CSRFProtect(app)
    init_auth(app)

    app.register_blueprint(auth_bp)
    app.register_blueprint(match_bp)
    app.register_blueprint(onboarding_bp)
    app.register_blueprint(offers_bp)
    app.register_blueprint(offer_documents_bp)
    app.register_blueprint(account_documents_bp)
    app.register_blueprint(directory_bp)
    app.register_blueprint(bids_bp)
    app.register_blueprint(responses_bp)
    app.register_blueprint(requirements_bp)
    app.register_blueprint(enrollments_bp)
    app.register_blueprint(matching_bp)
    app.register_blueprint(contracts_bp)
    app.register_blueprint(production_data_bp)
    app.register_blueprint(production_data_documents_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(taxonomy_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(representations_bp)
    app.register_blueprint(company_bp)
    app.register_blueprint(attribute_requests_bp)
    app.register_blueprint(counties_bp)
    app.register_blueprint(inventory_bp)
    app.register_blueprint(profile_bp)
    app.register_blueprint(service_requests_bp)

    # Make the CSRF token available to the SPA and refresh it on every response.
    @app.after_request
    def set_csrf_cookie(resp):
        resp.set_cookie(
            "csrf_token", generate_csrf(),
            path=config.SESSION_COOKIE_PATH,
            secure=config.SESSION_COOKIE_SECURE, samesite="Lax", httponly=False,
        )
        return resp

    @app.route("/health")
    def health():
        return jsonify({"status": "healthy"})

    # SPA: serve built assets, fall back to index.html for client-side routes.
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def spa(path):
        if path.startswith("api/"):
            return jsonify({"error": "not found"}), 404
        full = os.path.join(DIST, path)
        if path and os.path.isfile(full):
            return send_from_directory(DIST, path)
        if os.path.isfile(os.path.join(DIST, "index.html")):
            return send_from_directory(DIST, "index.html")
        # Frontend not built yet (dev).
        return jsonify({"status": "backend up; frontend not built"}), 200

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)
